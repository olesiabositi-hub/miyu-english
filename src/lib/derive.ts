import { lessonList, getLesson, progressKey, modules, totalLessons } from './course';
import { buildSteps, type Step } from './lesson-model';
import { isFinished } from './scoring';
import type { PublicLesson, PublicTask, SectionType } from './contract';
import type { State, LessonProgress } from './progress';

export const taskFinished = (lp: LessonProgress | undefined, t: PublicTask) => {
  const a = lp?.answers[t.id];
  return isFinished(a?.status, a?.attempts ?? 0) || !!a?.revealed;
};

export function stepDone(lp: LessonProgress | undefined, step: Step): boolean {
  if (!lp) return false;
  return lp.visited.includes(step.id) && step.tasks.every((t) => taskFinished(lp, t));
}

export function stepsDone(lesson: PublicLesson, lp?: LessonProgress): number {
  return buildSteps(lesson).filter((s) => stepDone(lp, s)).length;
}

export interface ResumePoint { stepIndex: number; label: string }
export function resumePoint(lesson: PublicLesson, lp?: LessonProgress): ResumePoint {
  const steps = buildSteps(lesson);
  if (!lp) return { stepIndex: 0, label: steps[0].title };
  let idx = steps.findIndex((s) => !stepDone(lp, s));
  if (idx === -1) idx = steps.length - 1;
  const step = steps[idx];
  const open = step.tasks.findIndex((t) => !taskFinished(lp, t));
  return { stepIndex: idx, label: open >= 0 && step.tasks.length > 1 ? `${step.title}: Task ${open + 1}` : step.title };
}

export const lessonAllTasksDone = (lesson: PublicLesson, lp?: LessonProgress) => lesson.tasks.every((t) => taskFinished(lp, t));

export function courseProgress(s: State) {
  const done = lessonList().filter((l) => s.lessons[progressKey(l)]?.completedAt).length;
  return { done, total: totalLessons(), percent: Math.round((done / totalLessons()) * 100) };
}

export function nextLesson(s: State): PublicLesson | undefined {
  const cur = s.currentLesson ? getLesson(s.currentLesson) : undefined;
  if (cur && !s.lessons[progressKey(cur)]?.completedAt) return cur;
  return lessonList().find((l) => !s.lessons[progressKey(l)]?.completedAt);
}

export type SkillKey = 'Reading' | 'Listening' | 'Language' | 'Writing' | 'Speaking';
const SKILL_OF: Partial<Record<SectionType, SkillKey>> = {
  reading: 'Reading', listening: 'Listening', grammar: 'Language', vocabulary: 'Language', pronunciation: 'Speaking',
  speaking: 'Speaking', writing: 'Writing', mediation: 'Writing',
};
function skillOf(lesson: PublicLesson, t: PublicTask): SkillKey | null {
  if (t.responseType === 'audio_recording') return 'Speaking';
  const sec = lesson.sections.find((s) => s.id === t.sectionId);
  return (sec && SKILL_OF[sec.type]) ?? (t.responseType === 'long_text' ? 'Writing' : null);
}

/** Evidence from real attempts on published lessons only. Not a CEFR level. */
export function skillEvidence(s: State) {
  const acc: Record<SkillKey, { checked: number; firstTry: number; submitted: number }> = {
    Reading: { checked: 0, firstTry: 0, submitted: 0 }, Listening: { checked: 0, firstTry: 0, submitted: 0 }, Language: { checked: 0, firstTry: 0, submitted: 0 },
    Writing: { checked: 0, firstTry: 0, submitted: 0 }, Speaking: { checked: 0, firstTry: 0, submitted: 0 },
  };
  for (const lesson of lessonList()) {
    const lp = s.lessons[progressKey(lesson)];
    if (!lp) continue;
    for (const t of lesson.tasks) {
      const a = lp.answers[t.id];
      const k = skillOf(lesson, t);
      if (!a || !k) continue;
      if (a.firstStatus === 'correct' || a.firstStatus === 'incorrect') { acc[k].checked++; if (a.firstStatus === 'correct') acc[k].firstTry++; }
      else acc[k].submitted++;
    }
  }
  return acc;
}

export function currentFocus(s: State): string | null {
  const ev = Object.entries(skillEvidence(s)).filter(([, v]) => v.checked >= 2);
  if (!ev.length) return null;
  const [weakest, v] = ev.sort((a, b) => a[1].firstTry / a[1].checked - b[1].firstTry / b[1].checked)[0];
  if (v.firstTry === v.checked) return 'Your next step: keep the streak going — try the next lesson.';
  const map: Record<string, string> = {
    Reading: 'reading for the writer’s intention, not just the facts',
    Listening: 'catching the key detail on the first listen',
    Language: 'using new chunks accurately in context',
    Writing: 'adding one concrete detail to written answers',
    Speaking: 'making spoken answers more precise',
  };
  return `Your next step: ${map[weakest]}`;
}

export function moduleStatus(s: State) {
  const cur = nextLesson(s);
  return modules().map((m) => {
    const published = lessonList().filter((l) => l.moduleId === m.id);
    const done = published.length > 0 && m.lessons.length > 0 && m.lessons.every((ref) => { const l = published.find((p) => p.id === ref.id); return l && s.lessons[progressKey(l)]?.completedAt; });
    const current = !!cur && cur.moduleId === m.id;
    return { module: m, published, status: done ? 'done' : current ? 'current' : published.length ? 'open' : 'soon' } as const;
  });
}
