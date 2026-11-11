/**
 * Learner app shell + router. Routes are course-scoped:  #/<courseId>/<view>/<params>
 *   #/english/            Home            #/english/lesson/D001/3   lesson D001, step 3
 *   #/english/lessons     My Lessons      #/english/review …
 * Links inside views are written course-relative ("#/lessons"); the shell scopes them to the
 * active course, and unscoped URLs redirect to the default course (content/site.json).
 */
import { touchVisit } from '../lib/progress';
import { renderHome, renderLessons, renderReview, renderPractice, renderProgress, renderProfile, renderDiagnostic, renderDaily, renderMore, renderNotFound, setAvatar } from './views';
import { renderLesson } from './lesson';
import { initTutor, setTutorContext } from './tutor';
import { lessonList, demoLesson, routeId, isCourseId, defaultCourseId, setActiveCourse, cfg } from '../lib/course';
import { applyTheme } from '../themes';

const view = document.getElementById('view')!;
const titles: Record<string, string> = { home: 'Home', lessons: 'My Lessons', review: 'Review Lab', practice: 'Practice', progress: 'My Progress', profile: 'Profile', diagnostic: 'Entry Diagnostic', daily: 'Daily 15', more: 'More', lesson: 'Lesson' };
const VIEWS = new Set(Object.keys(titles).concat('sample'));

initTutor();

/** Rewrites course-relative links (#/lessons) to the active course (#/english/lessons). */
function scopeLinks(root: ParentNode) {
  const id = cfg().id;
  root.querySelectorAll<HTMLAnchorElement>('a[href^="#/"]').forEach((a) => {
    const seg = a.getAttribute('href')!.slice(2).split('/')[0];
    if (!isCourseId(seg)) a.setAttribute('href', `#/${id}/${a.getAttribute('href')!.slice(2)}`);
  });
}
new MutationObserver(() => scopeLinks(document)).observe(document.body, { childList: true, subtree: true });

let currentCourse = '';
function enterCourse(id: string) {
  if (id === currentCourse) return;
  currentCourse = id;
  const c = setActiveCourse(id).config;
  applyTheme(c.theme);
  document.documentElement.lang = c.uiLanguage;
  document.querySelectorAll<HTMLElement>('[data-course-label]').forEach((el) => (el.textContent = c.targetLanguage.name));
  touchVisit();
  setAvatar();
}

let cleanup: (() => void) | void;
function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (!isCourseId(parts[0])) {
    // unscoped or legacy URL → default course, keep the rest of the path
    const rest = parts[0] && !VIEWS.has(parts[0]) ? [] : parts;
    location.replace(`#/${defaultCourseId}/${rest.join('/')}`);
    return;
  }
  enterCourse(parts[0]);
  const [name = 'home', p1, p2] = parts.slice(1);
  if (name === 'sample') { // landing “See a Sample Lesson”: first published lesson, else the interface demo
    const target = lessonList()[0] ?? demoLesson();
    location.replace(target ? `#/${currentCourse}/lesson/${routeId(target)}` : `#/${currentCourse}/lessons`);
    return;
  }
  if (typeof cleanup === 'function') cleanup();
  cleanup = undefined;
  document.body.dataset.route = name;
  setTutorContext(null);
  switch (name) {
    case 'home': cleanup = renderHome(view); break;
    case 'lessons': cleanup = renderLessons(view); break;
    case 'lesson': cleanup = renderLesson(view, p1 ?? '', p2); break;
    case 'review': cleanup = renderReview(view); break;
    case 'practice': cleanup = renderPractice(view); break;
    case 'progress': cleanup = renderProgress(view); break;
    case 'profile': cleanup = renderProfile(view); break;
    case 'diagnostic': cleanup = renderDiagnostic(view); break;
    case 'daily': cleanup = renderDaily(view); break;
    case 'more': cleanup = renderMore(view); break;
    default: cleanup = renderNotFound(view);
  }
  scopeLinks(document);
  const navKey = name === 'lesson' ? 'lessons' : ['diagnostic', 'daily'].includes(name) ? 'home' : name;
  document.querySelectorAll<HTMLAnchorElement>('[data-nav]').forEach((a) => {
    const on = a.dataset.nav === navKey || (a.dataset.nav === 'more' && (navKey === 'progress' || navKey === 'profile'));
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.title = `${cfg().title} — ${titles[name] ?? 'Not found'}`;
  window.scrollTo(0, 0);
  view.focus({ preventScroll: true });
}
window.addEventListener('hashchange', route);
route();
