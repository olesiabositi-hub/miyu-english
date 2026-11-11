import type { PublicLesson, PublicTask } from './contract';
import { canonical, hashInput, sha256Hex, type Response } from './answer-key';

/**
 * correct / incorrect  — auto-scored
 * submitted            — rubric: saved and shown with its rubric for self-check (AI/teacher scoring later)
 * pending_review       — manual: saved, waits for a human reviewer
 * done                 — formative: completion only
 */
export type TaskStatus = 'correct' | 'incorrect' | 'submitted' | 'pending_review' | 'done';
export interface Evaluation { status: TaskStatus; score: number | null; maxPoints: number }

export function canAutoCheck(t: PublicTask): boolean {
  return t.scoring.mode === 'auto' && !!t.scoring.keyHashes?.length;
}

export async function evaluate(lesson: PublicLesson, task: PublicTask, response: Response): Promise<Evaluation> {
  const max = task.scoring.maxPoints;
  switch (task.scoring.mode) {
    case 'auto': {
      if (!canAutoCheck(task)) return { status: 'submitted', score: null, maxPoints: max };
      const h = await sha256Hex(hashInput(lesson.id, task.id, canonical(task.responseType, response)));
      const ok = task.scoring.keyHashes!.includes(h);
      return { status: ok ? 'correct' : 'incorrect', score: ok ? max : 0, maxPoints: max };
    }
    case 'rubric': return { status: 'submitted', score: null, maxPoints: max };
    case 'manual': return { status: 'pending_review', score: null, maxPoints: max };
    default: return { status: 'done', score: null, maxPoints: max };
  }
}

/** After repeated misses on choice tasks the key can be derived locally by trying the options. */
export async function revealChoiceKey(lesson: PublicLesson, task: PublicTask): Promise<string[] | null> {
  const opts = (task.options ?? []).map((o) => o.id);
  const hashes = task.scoring.keyHashes ?? [];
  const test = async (r: Response) => hashes.includes(await sha256Hex(hashInput(lesson.id, task.id, canonical(task.responseType, r))));
  if (task.responseType === 'single_choice') { for (const o of opts) if (await test(o)) return [o]; return null; }
  if (task.responseType === 'multiple_choice' && opts.length <= 10) {
    for (let mask = 1; mask < 1 << opts.length; mask++) { const pick = opts.filter((_, i) => mask & (1 << i)); if (await test(pick)) return pick; }
    return null;
  }
  if (task.responseType === 'ordering' && opts.length <= 7) {
    const perms = (a: string[]): string[][] => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));
    for (const p of perms(opts)) if (await test(p)) return p;
  }
  return null;
}

/** A task counts as finished when it no longer needs the learner: right answer, submitted work, or two honest tries. */
export const isFinished = (status: TaskStatus | undefined, attempts: number) =>
  !!status && (status !== 'incorrect' || attempts >= 2);
