/**
 * Task card — one component for every contract-v1 task.
 * Input kinds: choice (± written justification), ordering, short text (exact or open), gap fill (whole or per blank),
 * matching (per pair), open writing / reflection, speaking. Feedback and model answers appear only after submission.
 */
import type { PublicLesson, PublicTask, ResponseType } from '../../lib/contract';
import { BLANK, type MatchRules } from '../../lib/answer-key';
import { evaluate, revealChoiceKey, canAutoCheck, isChoiceWithJustification, type LearnerResponse, type AnswerDetail } from '../../lib/scoring';
import { paletteHtml, wirePalette } from './char-palette';
import { load, recordAnswer, saveDraft, markRevealed, updateDetail, saveTaskState, type Answer } from '../../lib/progress';
import { taskFinished } from '../../lib/derive';
import { taskNumber } from '../../lib/lesson-model';
import { esc, icon, feedback } from '../ui';
import { richInline } from './rich-text';
import { mountSpeaking } from './speaking';
import { setTutorTask } from '../tutor';

export interface TaskEnv {
  lesson: PublicLesson;
  key: string; // progress key
  rules: MatchRules;
  lang: string;
  dir: 'ltr' | 'rtl';
  languageName: string;
  specialCharacters?: string[];
  /** listening task answered from the script because audio is pending */
  transcriptPractice(task: PublicTask): boolean;
  onSubmitted(task: PublicTask, answer: Answer): void;
  showEvidence(task: PublicTask): void;
  hasEvidence(task: PublicTask): boolean;
}

const TYPE_LABEL: Record<ResponseType, string> = {
  single_choice: 'Choose one', multiple_choice: 'Choose all that apply', short_text: 'Short answer', long_text: 'Write',
  audio_recording: 'Speak', ordering: 'Put in order', matching: 'Match', gap_fill: 'Fill the gaps', self_reflection: 'Reflect',
};

type Kind = 'choice' | 'ordering' | 'text-exact' | 'text-open' | 'gap' | 'matching' | 'matching-self' | 'speaking';
function kindOf(t: PublicTask): Kind {
  switch (t.responseType) {
    case 'single_choice': case 'multiple_choice': return 'choice';
    case 'ordering': return 'ordering';
    case 'gap_fill': return 'gap';
    case 'matching': return t.scoring.pairHashes?.length && t.matchItems?.length ? 'matching' : 'matching-self';
    case 'audio_recording': return 'speaking';
    case 'short_text': return t.scoring.mode === 'auto' && t.scoring.keyHashes?.length ? 'text-exact' : 'text-open';
    default: return 'text-open';
  }
}

/** Stable shuffle so ordering tasks never start in the stored (correct) order. */
function seededOrder(ids: string[], seed: string): string[] {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const out = [...ids];
  for (let i = out.length - 1; i > 0; i--) { h = Math.imul(h ^ (h >>> 13), 0x5bd1e995); const j = Math.abs(h) % (i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  if (out.join() === ids.join() && out.length > 1) out.push(out.shift()!);
  return out;
}
const words = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

export interface TaskCtl { redraw(): void; destroy(): void }
export function mountTask(host: HTMLElement, task: PublicTask, env: TaskEnv): TaskCtl {
  const { lesson, key, lang, dir } = env;
  const L = `lang="${esc(lang)}" dir="${dir}"`;
  const n = taskNumber(lesson, task.id);
  const uid = task.id.replace(/[^\w-]/g, '');
  const kind = kindOf(task);
  const justify = kind === 'choice' && isChoiceWithJustification(task);
  const practice = env.transcriptPractice(task);
  let order: string[] = [];
  let revealedKey: string[] | null = null;
  let speakCleanup: (() => void) | undefined;
  let draftTimer: number | undefined;
  let pendingDraft: string | null = null;
  let busy = false;

  const answer = () => load().lessons[key]?.answers[task.id];
  const draft = () => load().lessons[key]?.drafts[task.id];
  const blocked = () => {
    const lp = load().lessons[key];
    return task.dependencies.filter((d) => {
      const dep = lesson.tasks.find((t) => t.id === d);
      if (dep) return !taskFinished(lp, dep);
      return !lp?.visited.includes(d); // section dependency: the learner has opened that part
    });
  };

  const modeLabel = () => {
    if (practice) return 'Transcript practice · not a listening score';
    if (justify) return 'Choice checked · reasoning self-checked';
    if (kind === 'speaking') return task.scoring.mode === 'formative' ? 'Practice' : 'Self-check with criteria · not scored automatically';
    if (canAutoCheck(task) && kind !== 'text-open') return 'Checked in your browser';
    return { auto: 'Checked in your browser', rubric: 'Self-check with criteria', manual: 'Reviewed later', formative: 'Practice' }[task.scoring.mode];
  };

  /* ---------------- inputs ---------------- */
  function inputHtml(a: Answer | undefined, locked: boolean): string {
    const resp = a?.response;
    const opts = task.options ?? [];
    const parts = a?.detail?.parts;
    switch (kind) {
      case 'choice': {
        const multi = task.responseType === 'multiple_choice';
        const r = resp as Record<string, string> | string | string[] | undefined;
        const chosenVal = justify && r && typeof r === 'object' && !Array.isArray(r) ? r.choice : r;
        const chosen = new Set(Array.isArray(chosenVal) ? chosenVal : chosenVal ? [String(chosenVal)] : []);
        const good = new Set(revealedKey ?? []);
        const cc = a?.detail?.choiceCorrect;
        const choiceHtml = `<fieldset class="mc" ${locked ? 'disabled' : ''}><legend class="sr-only">${esc(task.prompt)}</legend>
          ${opts.map((o, i) => {
            const sel = chosen.has(o.id);
            const ok = a?.status === 'correct' || (justify && cc === true);
            const bad = a?.status === 'incorrect' || (justify && cc === false);
            const cls = sel && ok ? 'is-correct' : sel && bad ? 'is-wrong' : '';
            return `<label class="opt ${cls} ${good.has(o.id) ? 'is-key' : ''}"><input type="${multi ? 'checkbox' : 'radio'}" name="${uid}" value="${esc(o.id)}" ${sel ? 'checked' : ''}><span class="opt__badge" aria-hidden="true">${multi ? '' : esc(o.id.length <= 2 ? o.id : 'ABCDEFGHIJ'[i] ?? String(i + 1))}</span><span class="opt__text" ${L}>${richInline(o.text)}</span>${good.has(o.id) ? '<span class="sr-only">(correct answer)</span>' : ''}</label>`;
          }).join('')}</fieldset>`;
        if (!justify) return choiceHtml;
        const jText = typeof r === 'object' && r && !Array.isArray(r) ? r.text ?? '' : draft() ?? '';
        return `${choiceHtml}
          <label class="field-label" for="${uid}-why">${esc(task.ui?.justification?.label ?? 'Your supporting phrase or reason')}</label>
          <textarea class="text-area" id="${uid}-why" rows="3" ${L} spellcheck="false" data-why placeholder="Quote a short phrase from the text and say why it supports your choice…">${esc(jText)}</textarea>`;
      }
      case 'ordering': {
        if (!order.length) order = Array.isArray(resp) ? [...(resp as string[])] : seededOrder(opts.map((o) => o.id), task.id);
        const show = revealedKey ?? order;
        return `<ol class="order ${a?.status === 'correct' ? 'is-correct' : ''}" aria-label="Current order">${show.map((id, i) => {
          const o = opts.find((x) => x.id === id)!;
          return `<li class="order__item"><span class="order__n" aria-hidden="true">${i + 1}</span><span class="order__text" ${L}>${richInline(o.text)}</span>
            ${locked ? '' : `<span class="order__btns"><button type="button" class="icon-btn" data-move="${i}" data-dir="-1" aria-label="Move “${esc(o.text)}” up" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" class="icon-btn" data-move="${i}" data-dir="1" aria-label="Move “${esc(o.text)}” down" ${i === show.length - 1 ? 'disabled' : ''}>↓</button></span>`}</li>`;
        }).join('')}</ol>`;
      }
      case 'text-exact':
        return `${paletteHtml(env.specialCharacters, lang)}<label class="sr-only" for="${uid}-in">Your answer</label><input type="text" ${L} class="text-in ${a?.status === 'correct' ? 'is-correct' : a?.status === 'incorrect' ? 'is-wrong' : ''}" id="${uid}-in" data-text autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(typeof resp === 'string' ? resp : '')}" ${locked ? 'readonly' : ''}>`;
      case 'text-open': {
        const v = draft() ?? (typeof resp === 'string' ? resp : '');
        const rows = task.responseType === 'short_text' ? 4 : 7;
        return `${paletteHtml(env.specialCharacters, lang)}<label class="sr-only" for="${uid}-ta">Your answer</label>
          <textarea class="text-area" id="${uid}-ta" rows="${rows}" ${L} spellcheck="false" data-open placeholder="Write your answer in ${esc(env.languageName)}…">${esc(v)}</textarea>
          <span class="muted-sm" data-wc>${words(v)} words · draft saved automatically</span>`;
      }
      case 'gap': {
        const vals = Array.isArray(resp) ? (resp as string[]) : typeof resp === 'string' ? [resp] : [];
        let k = 0;
        const lines = task.prompt.split('\n');
        const html = lines.map((line) => {
          const segs = line.split(BLANK);
          return segs.map((p, i) => {
            if (i === segs.length - 1) return richInline(p);
            const idx = k++;
            const st = parts ? (parts[idx] ? 'is-correct' : 'is-wrong') : a?.status === 'correct' ? 'is-correct' : a?.status === 'incorrect' ? 'is-wrong' : '';
            return `${richInline(p)}<input type="text" class="gap ${st}" data-gap="${idx}" aria-label="Blank ${idx + 1}" autocomplete="off" autocapitalize="off" spellcheck="false" size="16" value="${esc(vals[idx] ?? '')}" ${locked || (parts && parts[idx]) ? 'readonly' : ''}>`;
          }).join('');
        }).join('<br>');
        return `${paletteHtml(env.specialCharacters, lang)}<p class="gap-text" ${L}>${html}</p>`;
      }
      case 'matching': {
        const map = (resp && typeof resp === 'object' && !Array.isArray(resp) ? resp : {}) as Record<string, string>;
        const items = task.matchItems!;
        return `<ul class="cards" ${L} aria-label="Cards">${opts.map((o) => `<li><span class="cards__id">${esc(o.id)}</span>${richInline(o.text)}</li>`).join('')}</ul>
          <ul class="match-rows">${items.map((it, i) => {
            const st = parts ? (parts[i] ? 'is-correct' : 'is-wrong') : '';
            const lockRow = locked || (parts && parts[i]);
            return `<li class="match-row ${st}"><label for="${uid}-m${it.key}"><span class="match-row__n">${esc(it.key)}</span><span ${L}>${esc(it.label)}</span></label>
              <select id="${uid}-m${it.key}" data-match="${esc(it.key)}" ${lockRow ? 'disabled' : ''}><option value="">Choose a card</option>${opts.map((o) => `<option value="${esc(o.id)}" ${map[it.key] === o.id ? 'selected' : ''}>${esc(o.id)}</option>`).join('')}</select>
              ${parts ? `<span class="sr-only">${parts[i] ? 'correct' : 'not correct'}</span>` : ''}</li>`;
          }).join('')}</ul>`;
      }
      case 'matching-self':
        return `<ul class="cards" ${L}>${opts.map((o) => `<li><span class="cards__id">${esc(o.id)}</span>${richInline(o.text)}</li>`).join('')}</ul><p class="muted-sm">Work through the pairs in your notes, then mark this as done.</p>`;
      default: return '';
    }
  }

  function readResponse(): LearnerResponse | null {
    switch (kind) {
      case 'choice': {
        const checked = [...host.querySelectorAll<HTMLInputElement>(`input[name="${uid}"]:checked`)].map((i) => i.value);
        if (!checked.length) return null;
        const choice = task.responseType === 'single_choice' ? checked[0] : checked;
        if (!justify) return choice;
        const why = host.querySelector<HTMLTextAreaElement>('[data-why]')?.value ?? '';
        return { choice: String(choice), text: why };
      }
      case 'ordering': return [...order];
      case 'text-exact': { const v = host.querySelector<HTMLInputElement>('[data-text]')?.value ?? ''; return v.trim() ? v : null; }
      case 'text-open': { const v = host.querySelector<HTMLTextAreaElement>('[data-open]')?.value ?? ''; return v.trim() ? v : null; }
      case 'gap': { const v = [...host.querySelectorAll<HTMLInputElement>('[data-gap]')].map((i) => i.value); return v.some((x) => !x.trim()) ? null : v.length === 1 ? v[0] : v; }
      case 'matching': {
        const map: Record<string, string> = {};
        host.querySelectorAll<HTMLSelectElement>('[data-match]').forEach((s) => { map[s.dataset.match!] = s.value; });
        return Object.values(map).some((v) => !v) ? null : map;
      }
      case 'matching-self': return 'done';
      default: return null;
    }
  }

  /* ---------------- results ---------------- */
  const selfRating = (a: Answer) => `<div class="self-rate" role="group" aria-label="How did it go against the criteria?"><span class="muted-sm">Your self-check:</span>
    ${([['met', 'I met the criteria'], ['partly', 'Partly'], ['not-yet', 'Not yet']] as const).map(([v, l]) => `<button type="button" class="chip" data-rate="${v}" aria-pressed="${a.detail?.selfRating === v}">${l}</button>`).join('')}</div>`;
  const models = (title = 'One possible answer — compare, don’t copy') => task.scoring.modelAnswers?.length
    ? `<div class="model"><span class="eyebrow">${title}</span>${task.scoring.modelAnswers.map((m) => `<p ${L}>${esc(kind === 'matching' ? m.replace('-', ' → ') : m)}</p>`).join('')}</div>` : '';
  const rubric = (title = 'Check your answer against these criteria') => task.scoring.rubric ? `<div class="rubric"><span class="eyebrow">${title}</span><p>${esc(task.scoring.rubric)}</p></div>` : '';
  const evidence = () => env.hasEvidence(task) ? `<button class="text-btn" type="button" data-evidence>Show where this is in the ${lesson.sections.find((s) => s.id === task.sectionId)?.type === 'listening' ? 'script' : 'text'}</button>` : '';
  const bank = () => task.type === 'surprise_recall' ? `<div class="model"><span class="eyebrow">Today’s chunk bank</span><ul class="chunks" ${L}>${lesson.lexicalChunks.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>` : '';
  const practiceTag = practice ? ' <span class="muted-sm">(transcript practice — not a listening score)</span>' : '';
  const fb = task.feedback ? ` ${esc(task.feedback)}` : '';

  function resultHtml(a: Answer): string {
    const parts = a.detail?.parts;
    const partLine = parts ? ` ${parts.filter(Boolean).length} of ${parts.length} correct.` : '';
    switch (a.status) {
      case 'correct': return feedback('ok', `<strong>Correct.</strong>${partLine}${fb}${practiceTag}`) + `<div class="task-after">${evidence()}</div>`;
      case 'incorrect': {
        const canReveal = a.attempts >= 2 && ['choice', 'ordering'].includes(kind) && !revealedKey && !!task.scoring.keyHashes?.length;
        return feedback('err', `<strong>${a.attempts >= 2 ? 'Not this time.' : 'Not quite — try again.'}</strong>${partLine}${a.attempts >= 2 ? fb : ''}${practiceTag}`)
          + (a.attempts >= 2 && (kind === 'gap' || kind === 'matching') ? models('Answers') : '')
          + `<div class="task-after">${canReveal ? '<button class="text-btn" type="button" data-reveal>Show the answer</button>' : ''}${evidence()}${a.attempts >= 2 ? '<span class="muted-sm">You can move on — this task counts as tried.</span>' : ''}</div>`;
      }
      case 'submitted': {
        const cc = a.detail?.choiceCorrect;
        const choiceLine = cc === true ? ' Your choice is the expected one.' : cc === false ? ' Your choice is not the expected one — compare with the feedback and the text.' : '';
        const viaText = a.detail?.via === 'text' ? ' Written version — not evidence of speaking.' : '';
        const timing = a.detail?.durations?.some((d) => d != null) ? ` Recorded: ${a.detail.durations.map((d, i) => (d != null ? `part ${i + 1} ${Math.floor(d / 60)}:${String(d % 60).padStart(2, '0')}` : '')).filter(Boolean).join(', ')}${a.detail.latencySec != null ? `; started after ${a.detail.latencySec} s` : ''}.` : '';
        return feedback('ok', `<strong>Submitted.</strong>${choiceLine}${viaText}${timing}${fb}${practiceTag}`)
          + rubric() + models() + bank() + `<div class="task-after">${evidence()}</div>` + selfRating(a);
      }
      case 'pending_review': return feedback('info', `<strong>Submitted for review.</strong> There is no reviewer in this pilot yet — use the criteria to check it yourself.${fb}`) + rubric('What a reviewer would look for') + models() + selfRating(a);
      default: return feedback('ok', `<strong>Done.</strong>${fb}`);
    }
  }

  /* ---------------- render ---------------- */
  function draw() {
    speakCleanup?.(); speakCleanup = undefined;
    const a = answer();
    const checkable = kind === 'choice' || kind === 'ordering' || kind === 'text-exact' || kind === 'gap' || kind === 'matching';
    const locked = !!revealedKey || (a?.status === 'correct' && checkable) || (kind === 'matching-self' && !!a);
    const deps = blocked();
    const head = `<header class="task__head"><span class="task__num">Task ${n}</span><span class="task__type">${TYPE_LABEL[task.responseType]}</span><span class="task__mode">${modeLabel()}${task.scoring.maxPoints && task.scoring.mode !== 'formative' && !practice ? ` · ${task.scoring.maxPoints} pt${task.scoring.maxPoints === 1 ? '' : 's'}` : ''}</span>
      <button class="task__ask" type="button" data-ask aria-label="Ask MIYU Tutor about task ${n}">${icon.spark}</button></header>`;
    const practiceNote = practice ? `<p class="practice-note">${icon.info}<span><strong>Audio pending.</strong> Answer from the script above. This is reading practice of the dialogue; it does not assess your listening.</span></p>` : '';
    if (deps.length) {
      const names = deps.map((d) => { const i = taskNumber(lesson, d); return i > 0 ? `Task ${i}` : `“${esc(lesson.sections.find((s) => s.id === d)?.title ?? d)}”`; });
      host.innerHTML = `${head}<p class="task-prompt task-prompt--muted" ${L}>${richInline(task.prompt)}</p>${feedback('info', `Complete ${names.join(' and ')} first.`)}`;
      host.classList.add('is-locked');
      return;
    }
    host.classList.remove('is-locked');
    const promptHtml = kind === 'gap'
      ? `<p class="sr-only" id="${uid}-p">${esc(task.prompt.replace(BLANK, 'blank'))}</p>${task.prompt.includes('\n') ? '' : ''}`
      : `<p class="task-prompt" id="${uid}-p" ${L}>${task.prompt.split('\n').map(richInline).join('<br>')}</p>`;
    const actionLabel = kind === 'matching-self' ? 'Mark as done'
      : justify ? (a ? 'Update answer' : 'Submit')
      : kind === 'text-open' ? (a ? 'Update answer' : 'Submit')
      : a ? 'Check again' : 'Check Answer';
    const showAction = kind !== 'speaking' && !locked;
    host.innerHTML = `${head}${practiceNote}${promptHtml}
      <div class="task__input" data-input>${kind === 'speaking' ? '' : inputHtml(a, locked)}</div>
      ${showAction ? `<div class="task-actions"><button class="btn btn--ink" type="button" data-check>${actionLabel}</button></div>` : ''}
      <div class="task__result" data-result>${a ? resultHtml(a) : ''}</div>`;
    if (kind === 'speaking') {
      const sp = task.ui?.speaking;
      const st = (load().lessons[key]?.taskState?.[task.id] ?? {}) as { question?: string; revealedAt?: number };
      speakCleanup = mountSpeaking(host.querySelector<HTMLElement>('[data-input]')!, {
        storeKey: `${lesson.courseId}:${key}:${task.id}`,
        fileStem: `${lesson.id}-${task.id.split('-').pop()}`,
        segments: sp?.segments?.length ? sp.segments : [{ label: 'Your recording' }],
        followUps: task.followUpQuestions,
        startWithinSeconds: sp?.startWithinSeconds,
        minSeconds: sp?.minSeconds,
        maxSeconds: sp?.maxSeconds,
        state: st,
        saveState: (v) => saveTaskState(key, task.id, v),
        submitted: !!a,
        lang,
        initialText: a?.detail?.via === 'text' && typeof a.response === 'string' ? a.response : '',
        onSubmit: (r) => void submit(r.via === 'text' ? r.text ?? '' : '[recordings kept on this device]', { via: r.via, durations: r.durations, latencySec: r.latencySec }),
      });
    }
  }

  async function submit(resp: LearnerResponse, extra?: AnswerDetail) {
    if (busy) return;
    busy = true;
    try {
      const forced = kind === 'matching-self' ? { ...task, scoring: { ...task.scoring, mode: 'formative' as const } } : task;
      const ev = await evaluate(lesson, forced, resp, env.rules);
      const detail: AnswerDetail = { ...ev.detail, ...extra, ...(practice ? { practiceMode: 'transcript' as const } : {}) };
      const a = recordAnswer(key, task.id, resp, ev.status, practice ? null : ev.score, Object.keys(detail).length ? detail : undefined);
      draw();
      const f = host.querySelector<HTMLElement>('[data-result] .feedback');
      f?.setAttribute('tabindex', '-1');
      f?.focus();
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
    const rate = t.closest<HTMLElement>('[data-rate]');
    if (rate) { updateDetail(key, task.id, { selfRating: rate.dataset.rate as AnswerDetail['selfRating'] }); host.querySelectorAll('[data-rate]').forEach((b) => b.setAttribute('aria-pressed', String(b === rate))); return; }
    if (t.closest('[data-check]')) {
      const r = readResponse();
      if (r === null) {
        const msg = kind === 'gap' ? 'Fill in every blank first.' : kind === 'matching' ? 'Choose a card for every item first.' : 'Give an answer first.';
        host.querySelector('[data-result]')!.insertAdjacentHTML('afterbegin', `<div data-hint>${feedback('info', msg)}</div>`);
        return;
      }
      if (kind === 'matching') {
        const used = Object.values(r as Record<string, string>);
        if (new Set(used).size !== used.length) { host.querySelector('[data-result]')!.insertAdjacentHTML('afterbegin', `<div data-hint>${feedback('info', 'Use each card only once.')}</div>`); return; }
      }
      if (justify && !(r as Record<string, string>).text.trim()) {
        host.querySelector('[data-result]')!.insertAdjacentHTML('afterbegin', `<div data-hint>${feedback('info', 'Add a short supporting phrase — the choice alone is not enough for this task.')}</div>`);
        host.querySelector<HTMLElement>('[data-why]')?.focus();
        return;
      }
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
  const onInput = (e: Event) => {
    const el = e.target as HTMLElement;
    host.querySelectorAll('[data-hint]').forEach((h) => h.remove());
    if (el.matches('[data-open], [data-why]')) {
      const v = (el as HTMLTextAreaElement).value;
      const wc = host.querySelector('[data-wc]');
      if (wc && el.matches('[data-open]')) wc.textContent = `${words(v)} words · draft saved automatically`;
      clearTimeout(draftTimer);
      pendingDraft = v;
      draftTimer = window.setTimeout(() => { saveDraft(key, task.id, v); pendingDraft = null; }, 400);
    }
  };
  host.addEventListener('click', onClick);
  host.addEventListener('keydown', onKey);
  host.addEventListener('input', onInput);
  host.addEventListener('change', onInput);
  host.addEventListener('focusin', () => setTutorTask({ number: n, prompt: task.prompt, attempted: !!answer() }));
  const unwire = wirePalette(host);
  draw();
  return {
    redraw: draw,
    destroy: () => { speakCleanup?.(); unwire(); clearTimeout(draftTimer); if (pendingDraft !== null) saveDraft(key, task.id, pendingDraft); host.removeEventListener('click', onClick); host.removeEventListener('keydown', onKey); host.removeEventListener('input', onInput); host.removeEventListener('change', onInput); },
  };
}
