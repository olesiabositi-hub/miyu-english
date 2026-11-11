import curriculum from '../../content/curriculum.json';

export interface LessonRef { id: string; number: number; title: string }
export interface Module { id: string; number: number; title: string; days?: string; skills?: string[]; lessons: LessonRef[] }

export const modules = curriculum.modules as Module[];
export const TOTAL_LESSONS = curriculum.totalLessons as number;
export const pad2 = (n: number) => String(n).padStart(2, '0');

export const moduleOf = (moduleId: string): Module | undefined => modules.find((m) => m.id === moduleId);

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
