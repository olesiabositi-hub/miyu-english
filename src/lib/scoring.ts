import type { PublicLesson, PublicTask } from './contract';
import { canonical, hashInput, sha256Hex, normalise, DEFAULT_RULES, type Response, type MatchRules } from './answer-key';

/**
 * correct / incorrect  — checked in the browser against the hashed key
 * submitted            — rubric: saved and shown with its rubric (and model answer) for self-check
 * pending_review       — manual: saved, waits for a human reviewer
 * done                 — formative: completion only
 */
export type TaskStatus = 'correct' | 'incorrect' | 'submitted' | 'pending_review' | 'done';
export interface AnswerDetail {
  /** choice part of a choice + justification task */
  choiceCorrect?: boolean;
  /** per blank / per pair correctness */
  parts?: boolean[];
  /** answered from the script while audio is pending — not listening evidence */
  practiceMode?: 'transcript';
  /** learner's own rating against the rubric */
  selfRating?: 'met' | 'partly' | 'not-yet';
  /** speaking: seconds from seeing the question to pressing Record */
  latencySec?: number;
  /** speaking: seconds per recorded segment */
  durations?: (number | null)[];
  via?: 'audio' | 'text';
}
export interface Evaluation { status: TaskStatus; score: number | null; maxPoints: number; detail?: AnswerDetail }

/** Learner response shapes: option id(s), text, per-blank texts, matching map, or choice + justification. */
export type LearnerResponse = Response | Record<string, string>;

export function canAutoCheck(t: PublicTask): boolean {
  return !!(t.scoring.keyHashes?.length || t.scoring.partHashes?.length || t.scoring.pairHashes?.length);
}
/** Choice tasks scored by rubric: the choice is checked, the written justification is self-checked. */
export const isChoiceWithJustification = (t: PublicTask) =>
  (t.responseType === 'single_choice' || t.responseType === 'multiple_choice') && t.scoring.mode !== 'auto' && !!t.scoring.keyHashes?.length;

const hashOf = (lesson: PublicLesson, task: PublicTask, canon: string) => sha256Hex(hashInput(lesson.courseId, lesson.id, task.id, canon));

export async function evaluate(lesson: PublicLesson, task: PublicTask, response: LearnerResponse, rules: MatchRules = DEFAULT_RULES): Promise<Evaluation> {
  const s = task.scoring;
  const max = s.maxPoints;

  if (s.pairHashes?.length && task.matchItems) {
    const map = response as Record<string, string>;
    const parts = await Promise.all(task.matchItems.map(async (it) =>
      !!map[it.key] && s.pairHashes!.includes(await hashOf(lesson, task, 'pair:' + normalise(`${it.key}-${map[it.key]}`, rules)))));
    return partsResult(parts, max);
  }
  if (s.partHashes?.length) {
    const vals = Array.isArray(response) ? response : [String(response)];
    const parts = await Promise.all(s.partHashes.map(async (hs, i) => hs.includes(await hashOf(lesson, task, `gap${i}:` + normalise(vals[i] ?? '', rules)))));
    return partsResult(parts, max);
  }
  if (isChoiceWithJustification(task)) {
    const r = response as Record<string, string>;
    const choice = typeof response === 'string' ? response : r.choice;
    const choiceCorrect = s.keyHashes!.includes(await hashOf(lesson, task, canonical(task.responseType, choice, rules)));
    return { status: s.mode === 'manual' ? 'pending_review' : 'submitted', score: null, maxPoints: max, detail: { choiceCorrect } };
  }
  switch (s.mode) {
    case 'auto': {
      if (!s.keyHashes?.length) return { status: 'submitted', score: null, maxPoints: max };
      const ok = s.keyHashes.includes(await hashOf(lesson, task, canonical(task.responseType, response as Response, rules)));
      return { status: ok ? 'correct' : 'incorrect', score: ok ? max : 0, maxPoints: max };
    }
    case 'rubric': {
      // deterministic tasks scored "by rubric" in the lesson file (e.g. ordering, single gap) are still checked
      if (s.keyHashes?.length && task.responseType !== 'short_text' && task.responseType !== 'long_text') {
        const ok = s.keyHashes.includes(await hashOf(lesson, task, canonical(task.responseType, response as Response, rules)));
        return { status: ok ? 'correct' : 'incorrect', score: ok ? max : 0, maxPoints: max };
      }
      return { status: 'submitted', score: null, maxPoints: max };
    }
    case 'manual': return { status: 'pending_review', score: null, maxPoints: max };
    default: return { status: 'done', score: null, maxPoints: max };
  }
}

function partsResult(parts: boolean[], max: number): Evaluation {
  const n = parts.filter(Boolean).length;
  const all = n === parts.length;
  return { status: all ? 'correct' : 'incorrect', score: Math.round(((max * n) / parts.length) * 100) / 100, maxPoints: max, detail: { parts } };
}

/** After repeated misses on choice tasks the key can be derived locally by trying the options. */
export async function revealChoiceKey(lesson: PublicLesson, task: PublicTask): Promise<string[] | null> {
  const opts = (task.options ?? []).map((o) => o.id);
  const hashes = task.scoring.keyHashes ?? [];
  const test = async (r: Response) => hashes.includes(await hashOf(lesson, task, canonical(task.responseType, r)));
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
