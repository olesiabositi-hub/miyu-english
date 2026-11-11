/**
 * Universal lesson workspace — renders ANY contract-v1 lesson (D001…D090) from JSON.
 * Layout: lesson bar · step rail · reading column · MIYU Tutor drawer.
 * See docs/lesson-renderer.md for the architecture.
 */
import { getLesson, progressKey, routeId, totalLessons, moduleOf, cfg, rules, courseHref } from '../lib/course';
import { buildSteps, SECTION_LABEL } from '../lib/lesson-model';
import { load, update, lessonProgress, visitStep, addReviewItems, canPersist } from '../lib/progress';
import { resumePoint, stepDone, taskFinished, lessonAllTasksDone } from '../lib/derive';
import type { PublicLesson, PublicTask } from '../lib/contract';
import { esc, icon, feedback } from './ui';
import { mountSection, type SectionCtl } from './lesson/sections';
import { mountTask, type TaskCtl } from './lesson/tasks';
import { richInline } from './lesson/rich-text';
import { mountSpeaking } from './lesson/speaking';
import { setTutorContext, setTutorSelection } from './tutor';

export function renderLesson(el: HTMLElement, id: string, stepParam?: string): () => void {
  const found = getLesson(id);
  if (!found) {
    el.innerHTML = `<div class="page page--narrow"><div class="empty card"><h1 class="display">This lesson isn’t published yet</h1><p>It will appear in My Lessons as soon as it’s ready.</p><a class="btn btn--ink" href="#/lessons">Back to My Lessons</a></div></div>`;
    return () => {};
  }
  const lesson: PublicLesson = found;
  const course = cfg();
  const key = progressKey(lesson);
  const rid = routeId(lesson);
  const steps = buildSteps(lesson);
  update((s) => { lessonProgress(s, key); });
  const fromUrl = Number(stepParam);
  const stepIndex = Number.isInteger(fromUrl) && fromUrl >= 1 && fromUrl <= steps.length ? fromUrl - 1 : resumePoint(lesson, load().lessons[key]).stepIndex;
  const step = steps[stepIndex];
  visitStep(key, step.id, stepIndex);
  setTutorContext({ lessonTitle: lesson.title, stepTitle: step.title });

  const sectionCtls = new Map<string, SectionCtl>();
  let pronCleanup: (() => void) | undefined;
  const taskCtls = new Map<string, TaskCtl>();
  const mod = moduleOf(lesson.moduleId);

  el.innerHTML = `
    <div class="lesson">
      <div class="lesson-bar">
        <a class="lesson-bar__back" href="#/lessons">${icon.back}<span>Back to Course</span></a>
        <span class="lesson-bar__sep" aria-hidden="true"></span>
        <span class="eyebrow lesson-bar__num">${lesson.demo ? 'Interface demo' : `Lesson ${lesson.sequence} / ${totalLessons()}`}</span>
        <span class="display lesson-bar__title">${esc(lesson.title)}</span>
        <span class="lesson-bar__saved" data-saved>${canPersist() ? icon.check + 'Saved' : 'Not saved in this browser'}</span>
      </div>
      <div class="lesson__grid">
        <nav class="rail" aria-label="Lesson steps"><ol data-rail></ol></nav>
        <div class="lesson__main"><div class="lesson__col" data-col></div></div>
      </div>
    </div>`;
  const rail = el.querySelector<HTMLOListElement>('[data-rail]')!;
  const col = el.querySelector<HTMLElement>('[data-col]')!;

  function drawRail() {
    const lp = load().lessons[key];
    rail.innerHTML = steps.map((st, i) => {
      const done = stepDone(lp, st);
      const cur = i === stepIndex;
      const open = st.tasks.filter((t) => !taskFinished(lp, t)).length;
      const state = done ? 'Completed'
        : cur ? 'In progress'
        : st.tasks.length && lp?.visited.includes(st.id) ? `${open} task${open === 1 ? '' : 's'} open`
        : st.tasks.length ? `${st.tasks.length} task${st.tasks.length === 1 ? '' : 's'}` : 'Not started';
      return `<li class="rail__item ${done ? 'is-done' : ''} ${cur ? 'is-current' : ''}">
        <a href="#/lesson/${rid}/${i + 1}" ${cur ? 'aria-current="step"' : ''}>
          <span class="rail__dot" aria-hidden="true">${done ? '✓' : i + 1}</span>
          <span class="rail__text"><span class="rail__name">${esc(st.title)}</span><span class="rail__state">${state}</span></span>
        </a></li>`;
    }).join('');
  }

  const q = lesson.quality;
  const banner = lesson.demo
    ? `<p class="sample-note">${icon.info}<span><strong>Interface demo.</strong> Built by the site team to test every task type in contract v1.0 — not MIYU course content.</span></p>`
    : lesson.pilot
      ? `<p class="pilot-note"><span class="pilot-tag">Pilot</span><span><strong>Pilot lesson — not methodologically approved.</strong> Status: ${esc(lesson.status)}. ${q.editorialApproved ? '' : 'Editorial review pending. '}${q.answerKeyVerified ? '' : 'Answer keys not yet verified. '}${q.audioReviewed ? '' : 'Audio not yet recorded. '}Feedback here is formative; nothing is an official assessment.</span></p>`
      : lesson.status !== 'approved' && lesson.status !== 'published'
        ? `<p class="sample-note">${icon.info}<span><strong>Preview · ${esc(lesson.status)}.</strong> Not yet approved for learners.</span></p>` : '';
  const sectionOf = (t: PublicTask) => lesson.sections.find((s) => s.id === t.sectionId);
  /** Listening task whose recording is not available: answered from the script, never counted as listening evidence. */
  const isTranscriptPractice = (t: PublicTask) => { const s = sectionOf(t); return !!s && s.type === 'listening' && !s.audio?.length; };
  const head = (eyebrow: string, title: string, lead = '') => `<header class="step-head"><span class="eyebrow">${eyebrow}</span><h1 class="display step-head__title" tabindex="-1">${esc(title)}</h1>${lead}</header>`;
  const stepEyebrow = `Step ${stepIndex + 1} of ${steps.length}`;
  const taskNo = (t: PublicTask) => lesson.tasks.indexOf(t) + 1;

  if (step.kind === 'overview') {
    col.innerHTML = `${banner}${head(`${lesson.demo ? 'Demo' : `Lesson ${lesson.sequence}`}${mod ? ' · ' + esc(mod.title) : ''}`, lesson.title)}
      <div class="overview">
        <div class="overview__facts"><span><strong>${lesson.level}</strong> level</span><span><strong>~${lesson.durationMinutes}</strong> min · split it across days if you like</span><span><strong>${lesson.tasks.length}</strong> tasks</span></div>
        <section class="card overview__card"><h2 class="eyebrow">By the end of this lesson you can</h2><ul class="outcomes">${lesson.outcomes.map((o) => `<li>${richInline(o)}</li>`).join('')}</ul></section>
        ${lesson.grammar.length ? `<section class="overview__grammar"><h2 class="eyebrow">Language focus</h2><p>${lesson.grammar.map(esc).join(' · ')}</p></section>` : ''}
      </div>`;
  } else if (step.kind === 'wrap-up') {
    const lp = load().lessons[key];
    const open = lesson.tasks.filter((t) => !taskFinished(lp, t));
    col.innerHTML = `${banner}${head(stepEyebrow, 'Wrap-up')}
      <section class="block"><h2 class="display block__h">Your ${lesson.lexicalChunks.length} chunks</h2><ul class="chunks" lang="${esc(course.targetLanguage.code)}">${lesson.lexicalChunks.map((c) => `<li>${esc(c)}</li>`).join('')}</ul><p class="muted-sm">They go to your Review Lab when you finish the lesson.</p></section>
      ${lesson.review.retrievalPrompts.length ? `<section class="block"><h2 class="display block__h">Quick recall</h2><ol class="recall">${lesson.review.retrievalPrompts.map((p) => `<li>${richInline(p)}</li>`).join('')}</ol><p class="muted-sm">Answer out loud or in your head — no need to type.</p></section>` : ''}
      ${lesson.review.delayedTransfer ? `<section class="transfer on-dark"><span class="eyebrow">In the next few days</span><p class="display">${richInline(lesson.review.delayedTransfer)}</p></section>` : ''}
      <div data-finish-area>${open.length ? feedback('info', `To finish the lesson, complete ${open.map((t) => { const si = steps.findIndex((s) => s.tasks.includes(t)); return `<a href="#/lesson/${rid}/${si + 1}">Task ${taskNo(t)}</a>`; }).join(', ')}.`) : ''}</div>`;
  } else {
    col.innerHTML = `${banner}${head(step.section ? `${stepEyebrow} · ${SECTION_LABEL[step.section.type]}` : stepEyebrow, step.title, step.section ? '' : '<p class="lead">Tasks for this lesson.</p>')}
      ${step.section ? '<section class="block block--section" data-section></section>' : ''}
      ${step.tasks.length ? `<div class="tasks">${step.tasks.map((t) => `<section class="task card" data-task="${esc(t.id)}" aria-label="Task ${taskNo(t)}"></section>`).join('')}</div>` : ''}`;
    if (step.section?.type === 'pronunciation') {
      col.querySelector('[data-section]')!.insertAdjacentHTML('afterend', '<section class="task card" data-pron aria-label="Pronunciation practice"><header class="task__head"><span class="task__num">Practice</span><span class="task__type">Record and compare</span><span class="task__mode">Not scored</span></header><div data-pron-rec></div></section>');
      pronCleanup = mountSpeaking(col.querySelector<HTMLElement>('[data-pron-rec]')!, {
        storeKey: `${lesson.courseId}:${key}:${step.section.id}:practice`, fileStem: `${lesson.id}-${step.section.id}`,
        segments: [{ label: 'First version' }, { label: 'Second version — with clearer pauses' }],
        state: {}, saveState: () => {}, submitted: false, practiceOnly: true, lang: course.targetLanguage.code,
      });
    }
    if (step.section) {
      const lp = load().lessons[key];
      sectionCtls.set(step.section.id, mountSection(col.querySelector<HTMLElement>('[data-section]')!, step.section, {
        transcriptUnlocked: step.tasks.some((t) => (lp?.answers[t.id]?.attempts ?? 0) > 0),
        lang: course.targetLanguage.code, dir: course.targetLanguage.dir,
      }));
    }
    for (const t of step.tasks) {
      const host = col.querySelector<HTMLElement>(`[data-task="${CSS.escape(t.id)}"]`)!;
      taskCtls.set(t.id, mountTask(host, t, {
        lesson, key,
        rules: rules(), lang: course.targetLanguage.code, languageName: course.targetLanguage.name, dir: course.targetLanguage.dir, specialCharacters: course.input?.specialCharacters,
        onSubmitted: (task) => {
          if (task.sectionId) sectionCtls.get(task.sectionId)?.unlockTranscript();
          for (const other of step.tasks) if (other.dependencies.includes(task.id)) taskCtls.get(other.id)?.redraw();
          refresh();
        },
        transcriptPractice: (task) => isTranscriptPractice(task),
        hasEvidence: (task) => !!task.scoring.evidenceSpanIds?.length,
        showEvidence,
      }));
    }
  }
  col.insertAdjacentHTML('beforeend', '<footer class="step-foot" data-foot></footer>');
  const foot = col.querySelector<HTMLElement>('[data-foot]')!;

  function showEvidence(task: PublicTask) {
    const ids = task.scoring.evidenceSpanIds ?? [];
    const sectionIds = new Set(ids.map((i) => lesson.sections.find((s) => s.evidenceSpans?.some((e) => e.id === i))?.id).filter(Boolean) as string[]);
    for (const sid of sectionIds) {
      const ctl = sectionCtls.get(sid);
      if (ctl) ctl.showEvidence(ids);
      else { const si = steps.findIndex((s) => s.id === sid); if (si >= 0) location.hash = courseHref(`/lesson/${rid}/${si + 1}`); }
    }
  }

  function drawFoot() {
    const isLast = stepIndex === steps.length - 1;
    const lp = load().lessons[key];
    const allDone = lessonAllTasksDone(lesson, lp);
    const prev = stepIndex > 0 ? `<a class="btn btn--ghost" href="#/lesson/${rid}/${stepIndex}">← Previous</a>` : '<span></span>';
    const next = isLast
      ? (lp?.completedAt ? '<a class="btn btn--lamp" href="#/review">Lesson complete · Review</a>' : `<button class="btn btn--ink" type="button" data-finish ${allDone ? '' : 'aria-disabled="true"'}>Finish lesson</button>`)
      : `<a class="btn btn--ink" href="#/lesson/${rid}/${stepIndex + 2}">${step.kind === 'overview' ? 'Start' : 'Next step'} →</a>`;
    const openHere = step.tasks.filter((t) => !taskFinished(lp, t)).length;
    foot.innerHTML = `<div class="step-foot__row">${prev}${next}</div>${!isLast && openHere ? `<p class="muted-sm step-foot__hint">${openHere} task${openHere === 1 ? '' : 's'} still open here — you can come back any time.</p>` : ''}`;
  }

  function refresh() {
    drawRail(); drawFoot();
    const s = el.querySelector<HTMLElement>('[data-saved]');
    if (s && canPersist()) { s.classList.remove('pulse'); void s.offsetWidth; s.classList.add('pulse'); }
  }

  const onFoot = (e: Event) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-finish]');
    if (!b) return;
    if (b.getAttribute('aria-disabled') === 'true') { col.querySelector<HTMLElement>('[data-finish-area] a')?.focus(); return; }
    update((s) => { lessonProgress(s, key).completedAt ??= Date.now(); });
    addReviewItems(key, [
      ...lesson.lexicalChunks.map((c) => ({ kind: 'chunk' as const, front: c })),
      ...lesson.review.retrievalPrompts.map((p) => ({ kind: 'prompt' as const, front: p })),
    ]);
    showComplete(col, lesson);
    drawRail();
  };
  foot.addEventListener('click', onFoot);

  const onSelect = () => {
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? '';
    if (text && text.length <= 400 && sel?.anchorNode && col.contains(sel.anchorNode)) setTutorSelection(text);
  };
  col.addEventListener('mouseup', onSelect);
  col.addEventListener('keyup', onSelect);

  refresh();
  return () => {
    pronCleanup?.();
    sectionCtls.forEach((c) => c.destroy());
    taskCtls.forEach((c) => c.destroy());
    col.removeEventListener('mouseup', onSelect);
    col.removeEventListener('keyup', onSelect);
  };
}

function showComplete(col: HTMLElement, lesson: PublicLesson) {
  col.innerHTML = `
    <div class="complete">
      <span class="eyebrow">${lesson.demo ? 'Demo' : `Lesson ${lesson.sequence}`} complete</span>
      <h1 class="display step-head__title" tabindex="-1">Well done.</h1>
      <p class="lead">Your ${lesson.lexicalChunks.length} chunks and recall questions are now in Review Lab.</p>
      ${lesson.review.delayedTransfer ? `<p class="transfer-inline">${richInline(lesson.review.delayedTransfer)}</p>` : ''}
      <div class="form__row"><a class="btn btn--lamp btn--lg" href="#/review">Start Review</a><a class="btn btn--ghost btn--lg" href="#/">Back to Home</a></div>
    </div>`;
  col.querySelector<HTMLElement>('h1')?.focus();
}
