import { lessons as built, demo as demoLesson, includesDrafts } from 'virtual:miyu-lessons';
import type { PublicLesson } from './contract';

export const DEMO_ID = 'demo';
export const lessonList: PublicLesson[] = [...built].sort((a, b) => a.sequence - b.sequence);
const byId = new Map(lessonList.map((l) => [l.id, l]));

/** Progress for the demo is stored under its own key so it never mixes with real D001. */
export const progressKey = (l: PublicLesson) => (l.demo ? `demo:${l.id}` : l.id);
export const routeId = (l: PublicLesson) => (l.demo ? DEMO_ID : l.id);
export function getLesson(id: string): PublicLesson | undefined {
  if (id === DEMO_ID) return demoLesson ?? undefined;
  return byId.get(id);
}
export const demo = demoLesson;
export const previewMode = includesDrafts;
