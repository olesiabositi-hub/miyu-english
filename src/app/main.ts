import { touchVisit } from '../lib/progress';
import { renderHome, renderLessons, renderReview, renderPractice, renderProgress, renderProfile, renderDiagnostic, renderDaily, renderMore, renderNotFound } from './views';
import { renderLesson } from './lesson';
import { initTutor, setTutorContext } from './tutor';
import { lessonList, demo, routeId } from '../lib/catalog';

const view = document.getElementById('view')!;
const titles: Record<string, string> = { home: 'Home', lessons: 'My Lessons', review: 'Review Lab', practice: 'Practice', progress: 'My Progress', profile: 'Profile', diagnostic: 'Entry Diagnostic', daily: 'Daily 15', more: 'More', lesson: 'Lesson' };

touchVisit();
initTutor();

let cleanup: (() => void) | void;
function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'sample') { // landing "See a Sample Lesson": first published lesson, else the interface demo
    const target = lessonList[0] ?? demo;
    location.replace(target ? `#/lesson/${routeId(target)}` : '#/lessons');
    return;
  }
  const name = parts[0] ?? 'home';
  if (typeof cleanup === 'function') cleanup();
  cleanup = undefined;
  document.body.dataset.route = name;
  setTutorContext(null);
  switch (name) {
    case 'home': cleanup = renderHome(view); break;
    case 'lessons': cleanup = renderLessons(view); break;
    case 'lesson': cleanup = renderLesson(view, parts[1] ?? '', parts[2]); break;
    case 'review': cleanup = renderReview(view); break;
    case 'practice': cleanup = renderPractice(view); break;
    case 'progress': cleanup = renderProgress(view); break;
    case 'profile': cleanup = renderProfile(view); break;
    case 'diagnostic': cleanup = renderDiagnostic(view); break;
    case 'daily': cleanup = renderDaily(view); break;
    case 'more': cleanup = renderMore(view); break;
    default: cleanup = renderNotFound(view);
  }
  const navKey = name === 'lesson' ? 'lessons' : ['diagnostic', 'daily'].includes(name) ? 'home' : name;
  document.querySelectorAll<HTMLAnchorElement>('[data-nav]').forEach((a) => {
    const on = a.dataset.nav === navKey || (a.dataset.nav === 'more' && (navKey === 'progress' || navKey === 'profile'));
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.title = `MIYU English — ${titles[name] ?? 'Not found'}`;
  window.scrollTo(0, 0);
  view.focus({ preventScroll: true });
}
window.addEventListener('hashchange', route);
route();
