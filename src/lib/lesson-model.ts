/**
 * Universal lesson view-model. Turns any contract-v1 lesson into ordered learner steps
 * WITHOUT changing the methodology: sections keep their order, tasks keep their order,
 * each task is shown inside the section it references (sectionId).
 *
 *   Overview  →  one step per section (+ its tasks)  →  [Further practice: tasks with no section]  →  Wrap-up
 */
import type { PublicLesson, PublicSection, PublicTask, SectionType } from './contract';

export type StepKind = 'overview' | SectionType | 'practice' | 'wrap-up';
export interface Step { id: string; kind: StepKind; title: string; section?: PublicSection; tasks: PublicTask[] }

export const SECTION_LABEL: Record<SectionType, string> = {
  intro: 'Introduction', reading: 'Reading', listening: 'Listening', grammar: 'Grammar', vocabulary: 'Vocabulary', pronunciation: 'Pronunciation',
  speaking: 'Speaking', writing: 'Writing', mediation: 'Mediation', reflection: 'Reflection', review: 'Review', other: 'Lesson',
};

const cache = new WeakMap<PublicLesson, Step[]>();
export function buildSteps(lesson: PublicLesson): Step[] {
  const hit = cache.get(lesson);
  if (hit) return hit;
  const sectionIds = new Set(lesson.sections.map((s) => s.id));
  const steps: Step[] = [{ id: '__overview', kind: 'overview', title: 'Overview', tasks: [] }];
  for (const s of lesson.sections) steps.push({ id: s.id, kind: s.type, title: s.title, section: s, tasks: lesson.tasks.filter((t) => t.sectionId === s.id) });
  const loose = lesson.tasks.filter((t) => !t.sectionId || !sectionIds.has(t.sectionId));
  if (loose.length) steps.push({ id: '__practice', kind: 'practice', title: 'Further practice', tasks: loose });
  steps.push({ id: '__wrap', kind: 'wrap-up', title: 'Wrap-up', tasks: [] });
  cache.set(lesson, steps);
  return steps;
}

export const taskNumber = (lesson: PublicLesson, taskId: string) => lesson.tasks.findIndex((t) => t.id === taskId) + 1;
export const findSpan = (lesson: PublicLesson, spanId: string) => {
  for (const s of lesson.sections) { const sp = s.evidenceSpans?.find((e) => e.id === spanId); if (sp) return { section: s, span: sp }; }
  return undefined;
};
