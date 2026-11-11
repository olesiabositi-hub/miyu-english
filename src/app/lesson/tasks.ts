import type { PublicLesson, PublicTask, ResponseType } from '../../lib/contract';
import { blankCount, BLANK, type Response } from '../../lib/answer-key';
import { evaluate, revealChoiceKey, canAutoCheck } from '../../lib/scoring';
import type { MatchRules } from '../../lib/answer-key';
import { paletteHtml, wirePalette } from './char-palette';
import { load, recordAnswer, saveDraft, markRevealed, type Answer } from '../../lib/progress';
import { taskFinished } from '../../lib/derive';
import { taskNumber } from '../../lib/lesson-model';
import { esc, icon, feedback } from '../ui';
import { mountOpenResponse } from '../open-response';
import { richInline } from './rich-text';
import { setTutorTask } from '../tutor';

export interface TaskEnv {
  lesson: PublicLesson;
  key: string; // progress key
  /** answer matching rules of the course (language, case, diacritics) */
  rules: MatchRules;
  /** BCP 47 code + direction of the learning content, for lang/dir attributes */
  lang: string;
  dir: 'ltr' | 'rtl';
  languageName: string;
  specialCharacters?: string[];
  onSubmitted(task: PublicTask, answer: Answer): void;
  showEvidence(task: PublicTask): void;
  hasEvidence(task: PublicTask): boolean;
}

const TYPE_LABEL: Record<ResponseType, string> = {
  single_choice: 'Choose one', multiple_choice: 'Choose all that apply', short_text: 'Short answer', long_text: 'Write',
  audio_recording: 'Speak', ordering: 'Put in order', matching: 'Match', gap_fill: 'Fill the gaps', self_reflection: 'Reflect',
};
const MODE_LABEL = { auto: 'Checked instantly', rubric: 'Self-check with criteria', manual: 'Reviewed later', formative: 'Practice' } as const;

/** Stable shuffle so ordering tasks never start in the stored (correct) order. */
function seededOrder(ids: string[], seed: string): string[] {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const out = [...ids];
  for (let i = out.length - 1; i > 0; i--) { h = Math.imul(h ^ (h >>> 13), 0x5bd1e995); const j = Math.abs(h) % (i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  if (out.join() === ids.join() && out.length > 1) out.push(out.shift()!);
  return out;
}

export interface TaskCtl { redraw(): void; destroy(): void }
export function mountTask(host: HTMLElement, task: PublicTask, env: TaskEnv): TaskCtl {
  const { lesson, key, lang, dir } = env;
  const L = `lang="${esc(lang)}" dir="${dir}"`;
  const n = taskNumber(lesson, task.id);
  const uid = task.id.replace(/[^\w-]/g, '');
  const isOpen = task.responseType === 'long_text' || task.responseType === 'self_reflection' || task.responseType === 'audio_recording';
  const isMatchingFallback = task.responseType === 'matching';
  let order: string[] = [];
  let revealedKey: string[] | null = null;
  let openCleanup: (() => void) | undefined;
  let busy = false;

  const answer = () => load().lessons[key]?.answers[task.id];
  const blocked = () => {
    const lp = load().lessons[key];
    return task.dependencies.filter((d) => {
      const dep = lesson.tasks.find((t) => t.id === d);
      if (dep) return !taskFinished(lp, dep);
      return !lp?.visited.includes(d); // section dependency
    });
  };

  /** Pronunciation: when the task's section has approved audio, offer it as the model to imitate. */
  function modelAudioHtml(): string {
    const sec = lesson.sections.find((s) => s.id === task.sectionId);
    if (!sec?.audio?.length) return sec && (sec.type === 'pronunciation' || sec.missingAssets) ? `<p class="muted-sm model-audio model-audio--missing">Model audio for this task is being prepared.</p>` : '';
    return `<div class="model-audio"><span class="eyebrow">Listen to the model, then record yourself and compare</span>${sec.audio.map((src) => `<audio controls preload="none" src="${esc(src)}"></audio>`).join('')}</div>`;
  }

  function inputHtml(a: Answer | undefined, locked: boolean): string {
    const resp = a?.response;
    const dis = locked ? 'disabled' : '';
    const opts = task.options ?? [];
    switch (task.responseType) {
      case 'single_choice':
      case 'multiple_choice': {
        const multi = task.responseType === 'multiple_choice';
        const chosen = new Set(Array.isArray(resp) ? resp : resp ? [resp] : []);
        const good = new Set(revealedKey ?? []);
        return `<fieldset class="mc" ${dis}><legend class="sr-only">${esc(task.prompt)}</legend>
          ${opts.map((o, i) => {
            const sel = chosen.has(o.id);
            const cls = a?.status === 'correct' && sel ? 'is-correct' : a?.status === 'incorrect' && sel ? 'is-wrong' : '';
            return `<label class="opt ${cls} ${good.has(o.id) ? 'is-key' : ''}"><input type="${multi ? 'checkbox' : 'radio'}" name="${uid}" value="${esc(o.id)}" ${sel ? 'checked' : ''}><span class="opt__badge" aria-hidden="true">${multi ? '' : 'ABCDEFGHIJ'[i] ?? i + 1}</span><span class="opt__text" ${L}>${richInline(o.text)}</span>${good.has(o.id) ? '<span class="sr-only">(correct answer)</span>' : ''}</label>`;
          }).join('')}</fieldset>`;
      }
      case 'ordering': {
        if (!order.length) order = Array.isArray(resp) ? [...resp] : seededOrder(opts.map((o) => o.id), task.id);
        const show = revealedKey ?? order;
        return `<ol class="order ${a?.status === 'correct' ? 'is-correct' : ''}" aria-label="Current order">${show.map((id, i) => {
          const o = opts.find((x) => x.id === id)!;
          return `<li class="order__item"><span class="order__n" aria-hidden="true">${i + 1}</span><span class="order__text" ${L}>${richInline(o.text)}</span>
            ${locked ? '' : `<span class="order__btns"><button type="button" class="icon-btn" data-move="${i}" data-dir="-1" aria-label="Move “${esc(o.text)}” up" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" class="icon-btn" data-move="${i}" data-dir="1" aria-label="Move “${esc(o.text)}” down" ${i === show.length - 1 ? 'disabled' : ''}>↓</button></span>`}</li>`;
        }).join('')}</ol>`;
      }
      case 'short_text':
        return `<label class="sr-only" for="${uid}-in">Your answer</label>${paletteHtml(env.specialCharacters, lang)}<input type="text" ${L} class="text-in ${a?.status === 'correct' ? 'is-correct' : a?.status === 'incorrect' ? 'is-wrong' : ''}" id="${uid}-in" data-text autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(typeof resp === 'string' ? resp : '')}" ${locked ? 'readonly' : ''}>`;
      case 'gap_fill': {
        const vals = Array.isArray(resp) ? resp : typeof resp === 'string' ? [resp] : [];
        let k = 0;
        const parts = task.prompt.split(BLANK);
        return `${paletteHtml(env.specialCharacters, lang)}<p class="gap-text" ${L}>${parts.map((p, i) => richInline(p) + (i < parts.length - 1 ? `<input type="text" class="gap ${a?.status === 'correct' ? 'is-correct' : a?.status === 'incorrect' ? 'is-wrong' : ''}" data-gap="${k}" aria-label="Gap ${++k}" autocomplete="off" autocapitalize="off" spellcheck="false" size="12" value="${esc(vals[k - 1] ?? '')}" ${locked ? 'readonly' : ''}>` : '')).join('')}</p>`;
      }
      case 'matching':
        return `<ul class="match-list" ${L}>${opts.map((o) => `<li>${richInline(o.text)}</li>`).join('')}</ul><p class="muted-sm">Work through the pairs in your head or notes, then mark this as done.</p>`;
      default: return '';
    }
  }

  function readResponse(): Response | null {
    switch (task.responseType) {
      case 'single_choice': return host.querySelector<HTMLInputElement>(`input[name="${uid}"]:checked`)?.value ?? null;
      case 'multiple_choice': { const v = [...host.querySelectorAll<HTMLInputElement>(`input[name="${uid}"]:checked`)].map((i) => i.value); return v.length ? v : null; }
      case 'ordering': return [...order];
      case 'short_text': { const v = host.querySelector<HTMLInputElement>('[data-text]')?.value ?? ''; return v.trim() ? v : null; }
      case 'gap_fill': { const v = [...host.querySelectorAll<HTMLInputElement>('[data-gap]')].map((i) => i.value); return v.some((x) => !x.trim()) ? null : v.length === 1 ? v[0] : v; }
      case 'matching': return 'done';
      default: return null;
    }
  }

  function resultHtml(a: Answer): string {
    const fb = task.feedback ? ` ${esc(task.feedback)}` : '';
    const evid = env.hasEvidence(task) ? `<button class="text-btn" type="button" data-evidence>Show where this is in the ${lesson.sections.find((s) => s.id === task.sectionId)?.type === 'listening' ? 'transcript' : 'text'}</button>` : '';
    switch (a.status) {
      case 'correct': return feedback('ok', `<strong>Correct.</strong>${fb}`) + evid;
      case 'incorrect': {
        const canReveal = a.attempts >= 2 && ['single_choice', 'multiple_choice', 'ordering'].includes(task.responseType) && !revealedKey;
        // feedback explains the key, so it is held back until the second attempt
        return feedback('err', `<strong>${a.attempts >= 2 ? 'Not this time.' : 'Not quite — try again.'}</strong>${a.attempts >= 2 ? fb : ''}`)
          + `<div class="task-after">${canReveal ? '<button class="text-btn" type="button" data-reveal>Show the answer</button>' : ''}${a.attempts >= 1 ? evid : ''}${a.attempts >= 2 ? '<span class="muted-sm">You can move on — this task counts as tried.</span>' : ''}</div>`;
      }
      case 'submitted': return feedback('ok', `<strong>Submitted.</strong>${fb}`) + (task.scoring.rubric ? `<div class="rubric"><span class="eyebrow">Check your answer against these criteria</span><p>${esc(task.scoring.rubric)}</p></div>` : '');
      case 'pending_review': return feedback('info', `<strong>Submitted for review.</strong> Feedback on this task will come from a reviewer later — you can keep going.${fb}`) + (task.scoring.rubric ? `<div class="rubric"><span class="eyebrow">What reviewers look for</span><p>${esc(task.scoring.rubric)}</p></div>` : '');
      default: return feedback('ok', `<strong>Done.</strong>${fb}`);
    }
  }

  function draw() {
    openCleanup?.(); openCleanup = undefined;
    const a = answer();
    const locked = a?.status === 'correct' || (!!a && !isOpen && a.status !== 'incorrect') || !!revealedKey;
    const deps = blocked();
    const head = `<header class="task__head"><span class="task__num">Task ${n}</span><span class="task__type">${TYPE_LABEL[task.responseType]}</span><span class="task__mode">${MODE_LABEL[isMatchingFallback ? 'formative' : task.scoring.mode]}${task.scoring.maxPoints && task.scoring.mode !== 'formative' ? ` · ${task.scoring.maxPoints} pt${task.scoring.maxPoints === 1 ? '' : 's'}` : ''}</span>
      <button class="task__ask" type="button" data-ask aria-label="Ask MIYU Tutor about task ${n}">${icon.spark}</button></header>`;
    if (deps.length) {
      const names = deps.map((d) => { const i = taskNumber(lesson, d); return i > 0 ? `Task ${i}` : 'the part above'; });
      host.innerHTML = `${head}<p class="task-prompt task-prompt--muted" ${L}>${richInline(task.prompt)}</p>${feedback('info', `Complete ${names.join(', ')} first.`)}`;
      host.classList.add('is-locked');
      return;
    }
    host.classList.remove('is-locked');
    const showPrompt = task.responseType !== 'gap_fill';
    host.innerHTML = `${head}
      ${showPrompt ? `<p class="task-prompt" id="${uid}-p" ${L}>${richInline(task.prompt)}</p>` : `<p class="sr-only" id="${uid}-p">${esc(task.prompt.replace(BLANK, 'blank'))}</p>`}
      ${task.responseType === 'gap_fill' && blankCount(task.prompt) === 0 ? feedback('err', 'This task has no gap marker yet.') : ''}
      ${task.responseType === 'audio_recording' ? modelAudioHtml() : ''}
      <div class="task__input" data-input>${isOpen ? '' : inputHtml(a, locked)}</div>
      ${!isOpen && !locked ? `<div class="task-actions"><button class="btn btn--ink" type="button" data-check>${isMatchingFallback ? 'Mark as done' : !canAutoCheck(task) ? 'Submit' : a ? 'Check again' : 'Check Answer'}</button></div>` : ''}
      <div class="task__result" data-result>${a ? resultHtml(a) : ''}</div>`;
    if (isOpen) {
      const lp = load().lessons[key];
      openCleanup = mountOpenResponse(host.querySelector<HTMLElement>('[data-input]')!, {
        id: task.id,
        mode: task.responseType === 'audio_recording' ? 'speak' : 'write',
        initialText: lp?.drafts[task.id] ?? (typeof a?.response === 'string' && !a.response.startsWith('[') ? a.response : ''),
        submitted: !!a,
        allowSwitch: true,
        submitLabel: 'Submit',
        onDraft: (t) => saveDraft(key, task.id, t),
        lang, dir, specialCharacters: env.specialCharacters, languageName: env.languageName,
        onSubmit: (value) => void submit(value),
      });
    }
  }

  async function submit(resp: Response) {
    if (busy) return;
    busy = true;
    try {
      const ev = await evaluate(lesson, isMatchingFallback ? { ...task, scoring: { ...task.scoring, mode: 'formative' } } : task, resp, env.rules);
      const a = recordAnswer(key, task.id, resp, ev.status, ev.score);
      draw();
      host.querySelector<HTMLElement>('[data-result] .feedback')?.setAttribute('tabindex', '-1');
      host.querySelector<HTMLElement>('[data-result] .feedback')?.focus();
      setTutorTask({ number: n, prompt: task.prompt, attempted: true });
      env.onSubmitted(task, a);
    } catch {
      host.querySelector('[data-result]')!.innerHTML = feedback('err', 'We couldn’t check this answer in this browser. Please reload the page and try again.');
    } finally { busy = false; }
  }

  const onClick = async (e: Event) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-ask]')) { setTutorTask({ number: n, prompt: task.prompt, attempted: !!answer() }, true); return; }
    const mv = t.closest<HTMLElement>('[data-move]');
    if (mv) {
      const i = Number(mv.dataset.move), d = Number(mv.dataset.dir);
      [order[i], order[i + d]] = [order[i + d], order[i]];
      host.querySelector('[data-input]')!.innerHTML = inputHtml(answer(), false);
      host.querySelector<HTMLElement>(`[data-move="${i + d}"][data-dir="${d}"]`)?.focus() ?? host.querySelector<HTMLElement>(`[data-move="${i + d}"]`)?.focus();
      return;
    }
    if (t.closest('[data-check]')) {
      const r = readResponse();
      if (r === null) { host.querySelector('[data-result]')!.innerHTML = feedback('info', task.responseType === 'gap_fill' ? 'Fill in every gap first.' : 'Give an answer first.'); return; }
      await submit(r);
      return;
    }
    if (t.closest('[data-reveal]')) {
      revealedKey = await revealChoiceKey(lesson, task);
      if (revealedKey) { markRevealed(key, task.id); if (task.responseType === 'ordering') order = [...revealedKey]; draw(); env.onSubmitted(task, answer()!); }
      return;
    }
    if (t.closest('[data-evidence]')) env.showEvidence(task);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.target as HTMLElement).matches('[data-gap],[data-text]')) { e.preventDefault(); host.querySelector<HTMLElement>('[data-check]')?.click(); }
  };
  const onInput = (e: Event) => { if ((e.target as HTMLElement).matches('input')) { const r = host.querySelector('[data-result] .feedback--info'); if (r) r.remove(); } };
  host.addEventListener('click', onClick);
  host.addEventListener('keydown', onKey);
  host.addEventListener('input', onInput);
  host.addEventListener('focusin', () => setTutorTask({ number: n, prompt: task.prompt, attempted: !!answer() }));
  const unwire = wirePalette(host);
  draw();
  return {
    redraw: draw,
    destroy: () => { openCleanup?.(); unwire(); host.removeEventListener('click', onClick); host.removeEventListener('keydown', onKey); host.removeEventListener('input', onInput); },
  };
}
