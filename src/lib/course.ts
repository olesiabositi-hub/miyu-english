/**
 * Course registry for the learner app. Everything course-specific (programme, levels,
 * lesson count, theme, language, matching rules) comes from content/courses/<id>/course.json.
 * The router calls setActiveCourse() before rendering any view.
 */
import { site, courses, includesDrafts } from 'virtual:miyu-courses';
import type { PublicCourse, CourseConfig, PublicLesson } from './contract';
import type { MatchRules } from './answer-key';

const byId = new Map(courses.map((c) => [c.config.id, c]));
let active: PublicCourse = byId.get(site.defaultCourse) ?? courses[0];

export const defaultCourseId = site.defaultCourse;
export const isCourseId = (id: string | undefined): id is string => !!id && byId.has(id);
export const courseConfigs = () => courses.map((c) => c.config);
export const previewMode = includesDrafts;

export function setActiveCourse(id: string): PublicCourse {
  active = byId.get(id) ?? active;
  return active;
}
export const activeCourse = () => active;
/** Course-scoped hash link: courseHref('/lessons') → '#/english/lessons'. */
export const courseHref = (path = '/') => `#/${active.config.id}${path.startsWith('/') ? path : '/' + path}`;
export const cfg = (): PublicCourse['config'] => active.config;
export const rules = (): MatchRules => ({ lang: active.config.targetLanguage.code, ...active.config.answerMatching });
export const totalLessons = () => active.config.totalLessons;
export const modules = () => active.config.modules;
export const moduleOf = (moduleId: string) => active.config.modules.find((m) => m.id === moduleId);
export const levelRange = () => `${active.config.levels.from} → ${active.config.levels.to}`;
export const feature = (name: string) => active.config.features?.[name] ?? 'off';

/* ---- lessons of the active course ---- */
export const DEMO_ID = 'demo';
export const lessonList = (): PublicLesson[] => [...active.lessons].sort((a, b) => a.sequence - b.sequence);
export const demoLesson = () => active.demo;
export function getLesson(id: string): PublicLesson | undefined {
  if (id === DEMO_ID) return active.demo ?? undefined;
  return active.lessons.find((l) => l.id === id);
}
/** Demo progress is stored apart from real lessons, so it never counts toward course progress. */
export const progressKey = (l: PublicLesson) => (l.demo ? `demo:${l.id}` : l.id);
export const routeId = (l: PublicLesson) => (l.demo ? DEMO_ID : l.id);

export { pad2, esc } from './text';
export type { CourseConfig };
