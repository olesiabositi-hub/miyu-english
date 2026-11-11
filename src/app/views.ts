import { load, update, loadProfile, saveProfile, isFirstVisit, isAfterBreak, dueReview, gradeReview, reset, exportJson, canPersist, logDaily, today, type State } from '../lib/progress';
import { lessonList, progressKey, routeId, getLesson, demoLesson, modules, pad2, totalLessons, cfg, levelRange } from '../lib/course';
import { buildSteps } from '../lib/lesson-model';
import { courseProgress, nextLesson, resumePoint, stepsDone, currentFocus, moduleStatus, skillEvidence } from '../lib/derive';
import { esc, icon, feedback, pct } from './ui';
import { mountOpenResponse } from './open-response';

type Cleanup = (() => void) | void;
const IMG = '../images/';

function storageNote(): string {
  return canPersist() ? '' : feedback('err', 'This browser is blocking local storage, so progress will not be kept after you close the tab.');
}

/* ------------------------------------------------------------------ HOME */
export function renderHome(el: HTMLElement): Cleanup {
  const s = load();
  const demo = demoLesson();
  const first = isFirstVisit(s);
  const afterBreak = isAfterBreak(s);
  const lesson = nextLesson(s);
  const lp = lesson ? s.lessons[progressKey(lesson)] : undefined;
  const rp = lesson ? resumePoint(lesson, lp) : null;
  const cp = courseProgress(s);
  const due = dueReview(s).length;
  const focus = currentFocus(s);
  const started = !!lp && (Object.keys(lp.answers).length > 0 || lp.visited.length > 1);

  const welcome = first ? 'Welcome. Let’s begin together.' : afterBreak ? 'Good to have you back.' : 'Welcome back. Ready for your next step?';

  let hero: string;
  if (first) {
    hero = `<div class="resume__body">
      <span class="eyebrow">Entry diagnostic · 4 skills</span>
      <h2 class="display resume__title">Let’s find your starting point.</h2>
      <p class="resume__text">Reading, listening, writing and speaking — so your route through the ${totalLessons()} lessons fits you.</p>
      <div class="resume__actions">
        <a class="btn btn--lamp btn--lg" href="#/diagnostic">Begin Assessment</a>
        ${lesson ? `<a class="resume__link" href="#/lesson/${routeId(lesson)}">Skip for now — start Lesson ${lesson.sequence}</a>` : ''}
      </div></div>`;
  } else if (lesson && rp) {
    const steps = buildSteps(lesson);
    const done = stepsDone(lesson, lp);
    const segs = steps.map((_, i) => `<span class="${i < done ? 'on' : ''}"></span>`).join('');
    hero = `<div class="resume__body">
      <span class="eyebrow">Lesson ${lesson.sequence} of ${totalLessons()}${lesson.pilot ? ' · Pilot — not methodologically approved' : ''}</span>
      <h2 class="display resume__title">${esc(lesson.title)}</h2>
      <div class="resume__progress">
        <div class="resume__meta"><span>${done} of ${steps.length} steps completed</span><span>${canPersist() ? 'Saved' : ''}</span></div>
        <div class="segments" style="--n:${steps.length}" aria-hidden="true">${segs}</div>
        <p class="resume__text">${started ? `Your answers are saved. Pick up at <strong>${esc(rp.label)}</strong>.` : 'Ready when you are.'}</p>
      </div>
      ${afterBreak ? '<p class="resume__break">Want a quick refresher?</p>' : ''}
      <div class="resume__actions">
        <a class="btn btn--lamp btn--lg" href="#/lesson/${routeId(lesson)}">${started ? 'Continue Lesson' : 'Start Lesson'}</a>
        ${afterBreak ? '<a class="btn btn--ghost-dark btn--lg" href="#/review">Start a 15-minute review</a>' : ''}
      </div></div>`;
  } else if (!lessonList().length) {
    hero = `<div class="resume__body">
      <span class="eyebrow">Lessons are being prepared</span>
      <h2 class="display resume__title">Your first lesson is on its way.</h2>
      <p class="resume__text">Lessons appear here as soon as they pass editorial review.${demo ? ' Meanwhile, you can try the lesson interface.' : ''}</p>
      ${demo ? '<div class="resume__actions"><a class="btn btn--lamp btn--lg" href="#/lesson/demo">Try the interface demo</a></div>' : ''}</div>`;
  } else {
    hero = `<div class="resume__body">
      <span class="eyebrow">All published lessons completed</span>
      <h2 class="display resume__title">New lessons are on their way.</h2>
      <p class="resume__text">Keep the language fresh in Review Lab meanwhile.</p>
      <div class="resume__actions"><a class="btn btn--lamp btn--lg" href="#/review">Start Review</a></div></div>`;
  }

  const journey = moduleStatus(s).map((m, i, arr) => `
    <li class="journey__item journey__item--${m.status}">
      ${i < arr.length - 1 ? '<span class="journey__line" aria-hidden="true"></span>' : ''}
      <span class="journey__dot">${m.status === 'done' ? '✓' : m.module.number}</span>
      <span class="journey__name">${esc(m.module.title)}</span>
      <span class="sr-only">${m.status === 'soon' ? 'coming soon' : m.status}</span>
    </li>`).join('');

  el.innerHTML = `<div class="page">
    ${storageNote()}
    <div class="page__head">
      <p class="eyebrow">${first ? `Welcome to ${esc(cfg().title)}` : 'Your pace · your progress'}</p>
      <h1 class="display page__title">${welcome}</h1>
    </div>
    <div class="home-grid">
      <div class="home-grid__main">
        <section class="resume on-dark" aria-label="Continue learning">
          <img src="${IMG}castle-moon-960.webp" srcset="${IMG}castle-moon-960.webp 960w, ${IMG}castle-moon.webp 1672w" sizes="(min-width: 1100px) 800px, 100vw" alt="">
          <span class="resume__shade"></span>
          ${hero}
        </section>
        <section class="card course-card" aria-label="Course progress">
          <div class="course-card__left"><span class="muted-sm">Course progress</span><span class="display course-card__num">${cp.done} ${cp.done === 1 ? 'lesson' : 'lessons'} completed</span></div>
          <div class="course-card__right">
            <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${cp.percent}" aria-label="Course complete"><span style="width:${cp.percent}%"></span></div>
            <div class="course-card__meta"><span>${cp.percent}% of your course complete</span><a href="#/progress">Skills profile →</a></div>
          </div>
        </section>
      </div>
      <div class="home-grid__side">
        <a class="tile card lift" href="#/daily">
          <span class="tile__icon tile__icon--dark display">15</span>
          <span class="tile__text"><strong>Daily 15</strong><span>A little ${cfg().targetLanguage.name} still counts.</span></span>
          <span class="tile__go">Start →</span>
        </a>
        <a class="tile card lift" href="#/review">
          <span class="tile__icon">${icon.review}</span>
          <span class="tile__text"><strong>Review Lab</strong><span>${due ? `${due} ${due === 1 ? 'expression' : 'expressions'} ready for review` : 'You’re all caught up. Come back after your next lesson.'}</span></span>
          ${due ? '<span class="tile__go">Start Review →</span>' : ''}
        </a>
        <a class="tile tile--soon" href="#/practice">
          <span class="tile__icon tile__icon--muted">${icon.mic}</span>
          <span class="tile__text"><strong>Speaking Studio <span class="tag">Coming soon</span></strong><span>Meanwhile: try the quick challenge in Practice.</span></span>
        </a>
        <div class="focus on-dark">
          <span class="eyebrow">Current focus</span>
          <p class="display">${esc(focus ?? (first ? 'Your focus appears after the entry diagnostic.' : 'Your focus appears once you’ve answered a few questions.'))}</p>
        </div>
      </div>
    </div>
    <section class="card journey" aria-labelledby="journey-title">
      <div class="journey__head"><h2 class="display" id="journey-title">Your journey · ${modules().length} modules</h2><a class="link-arrow" href="#/lessons">View My Lessons →</a></div>
      <div class="journey__scroll"><ol class="journey__list">${journey}</ol></div>
    </section>
  </div>`;
}

/* --------------------------------------------------------------- LESSONS */
export function renderLessons(el: HTMLElement): Cleanup {
  const s = load();
  const demo = demoLesson();
  const items = moduleStatus(s).map(({ module: m, published, status }) => {
    const rows = published.map((L) => {
      const lp = s.lessons[progressKey(L)];
      const state = lp?.completedAt ? 'Completed' : lp ? `In progress · ${stepsDone(L, lp)}/${buildSteps(L).length} steps` : 'Not started';
      return `<li><a class="lesson-row" href="#/lesson/${routeId(L)}"><span class="lesson-row__num">${L.sequence}</span><span class="lesson-row__title">${esc(L.title)}${L.pilot ? ' <span class="tag tag--pilot">Pilot</span>' : L.status !== 'approved' && L.status !== 'published' ? ` <span class="tag">${esc(L.status)}</span>` : ''}</span><span class="lesson-row__state">${state}</span></a></li>`;
    }).join('');
    return `<details class="module card" ${status === 'current' ? 'open' : ''}>
      <summary><span class="module__num">${pad2(m.number)}</span><span class="display module__title">${esc(m.title)}</span>
      <span class="module__state">${status === 'done' ? 'Completed' : status === 'current' ? 'You are here' : status === 'soon' ? 'Coming soon' : ''}</span></summary>
      <ul class="module__lessons">${rows || '<li class="muted-sm module__empty">Lessons for this module will appear after editorial review.</li>'}</ul>
    </details>`;
  }).join('');
  el.innerHTML = `<div class="page page--narrow">
    <div class="page__head"><p class="eyebrow">${lessonList().length} of ${totalLessons()} lessons published</p><h1 class="display page__title">My Lessons</h1></div>
    ${demo && !lessonList().length ? `<a class="tile card lift" href="#/lesson/demo"><span class="tile__icon">${icon.spark}</span><span class="tile__text"><strong>Interface demo</strong><span>Try every task type while the first lessons are in review. Not course content.</span></span><span class="tile__go">Open →</span></a>` : ''}
    <div class="modules">${items}</div>
  </div>`;
}

/* ---------------------------------------------------------------- REVIEW */
function lessonName(key: string): string {
  const l = key.startsWith('demo:') ? demoLesson() : getLesson(key);
  return l ? (l.demo ? 'the demo' : `Lesson ${l.sequence}`) : 'a lesson';
}
export function renderReview(el: HTMLElement): Cleanup {
  let queue = dueReview(load()).map((r) => r.id);
  let shown = false;
  let reviewed = 0;
  const draw = () => {
    const s = load();
    const item = s.review.find((r) => r.id === queue[0]);
    let body: string;
    if (!s.review.length) body = `<div class="empty card">${icon.review}<h2 class="display">Nothing to review yet</h2><p>The chunks and recall questions from each lesson appear here when you finish it.</p><a class="btn btn--ink" href="#/lessons">Go to My Lessons</a></div>`;
    else if (!item) body = `<div class="empty card">${icon.check}<h2 class="display">You’re all caught up.</h2><p>${reviewed ? `${reviewed} reviewed — nice work. ` : ''}Come back after your next lesson.</p><a class="btn btn--ink" href="#/">Back to Home</a></div>`;
    else body = `<div class="flash card">
        <span class="muted-sm">${queue.length} left · ${item.kind === 'chunk' ? 'chunk' : 'recall question'} from ${esc(lessonName(item.lessonKey))}</span>
        <p class="display flash__phrase" lang="${esc(cfg().targetLanguage.code)}">${esc(item.front)}</p>
        ${shown ? `<p class="muted-sm">How did it go?</p>
          <div class="flash__actions"><button class="btn btn--ghost" type="button" data-grade="0">Again soon</button><button class="btn btn--ink" type="button" data-grade="1">Got it</button></div>`
        : `<p class="muted-sm">${item.kind === 'chunk' ? 'Say a sentence of your own with it, out loud.' : 'Answer out loud or in your head.'}</p><div class="flash__actions"><button class="btn btn--ink" type="button" data-show>Done</button></div>`}
      </div>`;
    el.innerHTML = `<div class="page page--narrow"><div class="page__head"><p class="eyebrow">Smart reviews</p><h1 class="display page__title">Review Lab</h1></div>${body}</div>`;
  };
  const onClick = (e: Event) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-show]')) { shown = true; draw(); el.querySelector<HTMLElement>('[data-grade="1"]')?.focus(); }
    const g = t.closest<HTMLElement>('[data-grade]');
    if (g) {
      const ok = g.dataset.grade === '1';
      const id = queue.shift()!;
      gradeReview(id, ok);
      if (!ok) queue.push(id);
      reviewed++; shown = false; draw();
      el.querySelector<HTMLElement>('[data-show]')?.focus();
    }
  };
  el.addEventListener('click', onClick);
  draw();
  return () => el.removeEventListener('click', onClick);
}

/* -------------------------------------------------------------- PRACTICE */
export function renderPractice(el: HTMLElement): Cleanup {
  const challenge = cfg().practice?.quickChallenges?.[0];
  if (!challenge) {
    el.innerHTML = `<div class="page page--narrow"><div class="page__head"><h1 class="display page__title">Practice</h1></div><div class="empty card"><h2 class="display">Practice is coming soon</h2><p>Quick challenges for this course are being prepared.</p></div></div>`;
    return;
  }
  el.innerHTML = `<div class="page page--narrow">
    <div class="page__head"><p class="eyebrow">Think in ${cfg().targetLanguage.name}</p><h1 class="display page__title">Practice</h1></div>
    <section class="card practice" aria-labelledby="qc">
      <span class="eyebrow">Quick challenge</span>
      <h2 class="display practice__q" id="qc" lang="${esc(cfg().targetLanguage.code)}">“${esc(challenge.prompt)}”</h2>
      <div data-or></div>
    </section>
    <div class="tile tile--soon">
      <span class="tile__icon tile__icon--muted">${icon.mic}</span>
      <span class="tile__text"><strong>Speaking Studio <span class="tag">Coming soon</span></strong><span>Conversations with feedback are planned. Until then, record yourself in lesson tasks and the quick challenge above.</span></span>
    </div>
  </div>`;
  const host = el.querySelector<HTMLElement>('[data-or]')!;
  return mountOpenResponse(host, {
    id: 'practice-quick', mode: 'speak', targetSeconds: challenge.seconds, allowSwitch: true, submitLabel: 'Done',
    lang: cfg().targetLanguage.code, languageName: cfg().targetLanguage.name, dir: cfg().targetLanguage.dir, specialCharacters: cfg().input?.specialCharacters,
    onSubmit: () => { host.insertAdjacentHTML('beforeend', feedback('ok', 'Nice. Try it once more with a different reason — then once more, faster.')); },
  });
}

/* -------------------------------------------------------------- PROGRESS */
export function renderProgress(el: HTMLElement): Cleanup {
  const s = load();
  const cp = courseProgress(s);
  const ev = skillEvidence(s);
  const days = Object.keys(s.daily).length;
  const rows = Object.entries(ev).map(([k, v]) => `<li class="skill">
      <span class="skill__name">${k}</span>
      <span class="progress" aria-hidden="true"><span style="width:${pct(v.firstTry, v.checked)}%;background:var(--brass-mid)"></span></span>
      <span class="skill__val">${v.checked ? `${v.firstTry}/${v.checked} right first time` : v.submitted ? '' : 'No evidence yet'}${v.submitted ? `${v.checked ? ' · ' : ''}${v.submitted} submitted` : ''}</span>
    </li>`).join('');
  el.innerHTML = `<div class="page page--narrow">
    <div class="page__head"><p class="eyebrow">${esc(levelRange())} course progress</p><h1 class="display page__title">My Progress</h1></div>
    <div class="stats">
      <div class="card stat"><span class="display stat__num">${cp.done}</span><span>lessons completed</span></div>
      <div class="card stat"><span class="display stat__num">${cp.percent}%</span><span>of the course</span></div>
      <div class="card stat"><span class="display stat__num">${days}</span><span>${days === 1 ? 'day' : 'days'} with Daily 15</span></div>
    </div>
    <section class="card skills" aria-labelledby="sp">
      <h2 class="display" id="sp">Skills profile</h2>
      <p class="muted-sm">Built only from your real answers. This is evidence for practice — not an official CEFR level.</p>
      <ul class="skills__list">${rows}</ul>
    </section>
    <p class="muted-sm">${esc(currentFocus(s) ?? 'Recommendations appear once you have answered a few questions.')}</p>
  </div>`;
}

/* --------------------------------------------------------------- PROFILE */
export function renderProfile(el: HTMLElement): Cleanup {
  const draw = (msg = '') => {
    el.innerHTML = `<div class="page page--narrow">
      <div class="page__head"><p class="eyebrow">Settings</p><h1 class="display page__title">Profile</h1></div>
      ${msg}
      <form class="card form" data-name-form>
        <label for="name">Your first name <span class="muted-sm">(optional, stays in this browser)</span></label>
        <div class="form__row"><input id="name" name="name" autocomplete="given-name" value="${esc(loadProfile().name ?? '')}" maxlength="40"><button class="btn btn--ink" type="submit">Save</button></div>
      </form>
      <section class="card form">
        <h2 class="display">Your data</h2>
        <p class="muted-sm">There are no accounts yet: your progress in ${esc(cfg().title)} is stored only in this browser on this device. Each course keeps its own progress. Clearing browser data removes it.</p>
        <div class="form__row">
          <button class="btn btn--ghost" type="button" data-export>Download my progress</button>
          <button class="btn btn--ghost danger" type="button" data-reset>Reset ${esc(cfg().title)} progress</button>
        </div>
        <div data-confirm hidden class="confirm">
          <p>Delete all saved answers and progress for ${esc(cfg().title)} in this browser? Other courses are not affected. This cannot be undone.</p>
          <div class="form__row"><button class="btn btn--ink" type="button" data-reset-yes>Yes, reset</button><button class="btn btn--ghost" type="button" data-reset-no>Cancel</button></div>
        </div>
      </section>
    </div>`;
  };
  const onSubmit = (e: Event) => {
    e.preventDefault();
    const v = (el.querySelector('#name') as HTMLInputElement).value.trim();
    saveProfile({ ...loadProfile(), name: v || undefined });
    setAvatar();
    draw(feedback('ok', 'Saved.'));
  };
  const onClick = (e: Event) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-export]')) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([exportJson()], { type: 'application/json' }));
      a.download = `miyu-english-progress-${today()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    if (t.closest('[data-reset]')) { el.querySelector<HTMLElement>('[data-confirm]')!.hidden = false; el.querySelector<HTMLElement>('[data-reset-no]')!.focus(); }
    if (t.closest('[data-reset-no]')) el.querySelector<HTMLElement>('[data-confirm]')!.hidden = true;
    if (t.closest('[data-reset-yes]')) { reset(); setAvatar(); draw(feedback('ok', 'Progress reset.')); }
  };
  el.addEventListener('submit', onSubmit);
  el.addEventListener('click', onClick);
  draw();
  return () => { el.removeEventListener('submit', onSubmit); el.removeEventListener('click', onClick); };
}

export function setAvatar() {
  // name is shared across courses (miyu:profile:v1)
  const n = loadProfile().name;
  const a = document.querySelector<HTMLElement>('[data-avatar]');
  if (a) a.textContent = n ? n[0].toUpperCase() : '·';
}

/* ------------------------------------------------------------ DIAGNOSTIC */
export function renderDiagnostic(el: HTMLElement): Cleanup {
  const first = lessonList()[0];
  const demo = demoLesson();
  el.innerHTML = `<div class="page page--narrow">
    <div class="page__head"><p class="eyebrow">Entry Diagnostic</p><h1 class="display page__title">Let’s find your starting point.</h1></div>
    <section class="card prose-card">
      <p>The diagnostic will check reading, listening, writing and speaking, and suggest your route through the course. It is separate from Lesson 1 and is not an official certification test.</p>
      ${feedback('info', 'The assessment is being prepared and is not available yet. You can start learning now — we’ll invite you to the diagnostic when it’s ready.')}
      <div class="form__row">
        ${first ? `<a class="btn btn--ink" href="#/lesson/${routeId(first)}" data-skip>Start Lesson ${first.sequence}</a>` : demo ? '<a class="btn btn--ink" href="#/lesson/demo">Try the interface demo</a>' : ''}
        <a class="btn btn--ghost" href="#/">Back to Home</a>
      </div>
    </section>
  </div>`;
  const onClick = (e: Event) => { if ((e.target as HTMLElement).closest('[data-skip]')) update((s: State) => { if (s.diagnostic === 'none') s.diagnostic = 'skipped'; }); };
  el.addEventListener('click', onClick);
  return () => el.removeEventListener('click', onClick);
}

/* ---------------------------------------------------------------- DAILY */
export function renderDaily(el: HTMLElement): Cleanup {
  const s = load();
  const due = dueReview(s).length;
  const doneToday = s.daily[today()] ?? 0;
  el.innerHTML = `<div class="page page--narrow">
    <div class="page__head"><p class="eyebrow">A daily habit, not a deadline</p><h1 class="display page__title">Daily 15</h1></div>
    <ol class="daily-list">
      <li class="card"><span class="daily-list__min">5 min</span><div><strong>Review</strong><p class="muted-sm">${due ? `${due} expressions are waiting.` : 'Nothing due right now.'}</p></div><a class="btn btn--ink" href="#/review">${due ? 'Start' : 'Open'}</a></li>
      <li class="card"><span class="daily-list__min">5 min</span><div><strong>Reading or listening</strong><p class="muted-sm">Daily sets will come with the lesson content. For now, re-read a text from your last lesson.</p></div><a class="btn btn--ghost" href="#/lessons">My Lessons</a></li>
      <li class="card"><span class="daily-list__min">5 min</span><div><strong>Speaking or writing</strong><p class="muted-sm">Try the quick challenge.</p></div><a class="btn btn--ghost" href="#/practice">Practice</a></li>
    </ol>
    <div class="form__row">${doneToday ? feedback('ok', `Logged today: ${doneToday} min. A little ${cfg().targetLanguage.name} still counts.`) : '<button class="btn btn--lamp" type="button" data-log>I did my 15 minutes today</button>'}</div>
    <p class="muted-sm">Daily 15 does not mark your main lesson as completed.</p>
  </div>`;
  const onClick = (e: Event) => { if ((e.target as HTMLElement).closest('[data-log]')) { logDaily(15); renderDaily(el); } };
  el.addEventListener('click', onClick);
  return () => el.removeEventListener('click', onClick);
}

/* ----------------------------------------------------------------- MORE */
export function renderMore(el: HTMLElement): Cleanup {
  el.innerHTML = `<div class="page page--narrow">
    <div class="page__head"><h1 class="display page__title">More</h1></div>
    <nav class="more-list" aria-label="More">
      <a class="card" href="#/progress"><strong>My Progress</strong><span class="muted-sm">Skills profile and course progress</span></a>
      <a class="card" href="#/profile"><strong>Profile</strong><span class="muted-sm">Name, your data, reset</span></a>
      <a class="card" href="#/daily"><strong>Daily 15</strong><span class="muted-sm">Your 15-minute habit</span></a>
      <a class="card" href="../"><strong>About the course</strong><span class="muted-sm">Back to the main page</span></a>
    </nav>
  </div>`;
}

export function renderNotFound(el: HTMLElement): Cleanup {
  el.innerHTML = `<div class="page page--narrow"><div class="empty card"><h1 class="display">Page not found</h1><p>Let’s get you back on track.</p><a class="btn btn--ink" href="#/">Back to Home</a></div></div>`;
}
