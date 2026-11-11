// All learner progress lives in this browser (docs/decisions/0001). No accounts, no server.
import type { TaskStatus } from './scoring';
import type { Response } from './answer-key';

const KEY = 'miyu-english:v2';
const DAY = 86_400_000;

export interface Answer { response: Response; status: TaskStatus; score: number | null; attempts: number; firstStatus: TaskStatus; revealed?: boolean; updatedAt: number }
export interface LessonProgress { stepIndex: number; visited: string[]; answers: Record<string, Answer>; drafts: Record<string, string>; startedAt: number; updatedAt: number; completedAt?: number }
export interface ReviewItem { id: string; kind: 'chunk' | 'prompt'; front: string; lessonKey: string; box: number; due: number }
export interface State {
  version: 2;
  createdAt: number;
  lastVisit: number;
  previousVisit?: number;
  diagnostic: 'none' | 'skipped' | 'done';
  currentLesson?: string; // progress key
  lessons: Record<string, LessonProgress>;
  review: ReviewItem[];
  daily: Record<string, number>;
  name?: string;
}

const fresh = (): State => ({ version: 2, createdAt: Date.now(), lastVisit: Date.now(), diagnostic: 'none', lessons: {}, review: [], daily: {} });

let memory: State | null = null;
let storageOk = true;

export function load(): State {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(KEY);
    memory = raw ? { ...fresh(), ...JSON.parse(raw) } : fresh();
  } catch {
    storageOk = false;
    memory = fresh();
  }
  return memory!;
}
export function save(): void {
  if (!memory) return;
  try { localStorage.setItem(KEY, JSON.stringify(memory)); storageOk = true; } catch { storageOk = false; }
}
export const canPersist = () => storageOk;
export function update(fn: (s: State) => void): State { const s = load(); fn(s); save(); return s; }

export function touchVisit(): State {
  return update((s) => { if (Date.now() - s.lastVisit > 30 * 60_000) s.previousVisit = s.lastVisit; s.lastVisit = Date.now(); });
}
const realLessons = (s: State) => Object.keys(s.lessons).filter((k) => !k.startsWith('demo:'));
export const isAfterBreak = (s: State) => !!s.previousVisit && Date.now() - s.previousVisit > 3 * DAY && realLessons(s).length > 0;
export const isFirstVisit = (s: State) => realLessons(s).length === 0 && s.diagnostic === 'none';

export function lessonProgress(s: State, key: string): LessonProgress {
  s.lessons[key] ??= { stepIndex: 0, visited: [], answers: {}, drafts: {}, startedAt: Date.now(), updatedAt: Date.now() };
  return s.lessons[key];
}

export function recordAnswer(key: string, taskId: string, response: Response, status: TaskStatus, score: number | null): Answer {
  let out!: Answer;
  update((s) => {
    const lp = lessonProgress(s, key);
    const prev = lp.answers[taskId];
    out = { response, status, score, attempts: (prev?.attempts ?? 0) + 1, firstStatus: prev?.firstStatus ?? status, revealed: prev?.revealed, updatedAt: Date.now() };
    lp.answers[taskId] = out;
    delete lp.drafts[taskId];
    lp.updatedAt = Date.now();
    if (!key.startsWith('demo:')) s.currentLesson = key;
  });
  return out;
}
export function markRevealed(key: string, taskId: string) { update((s) => { const a = lessonProgress(s, key).answers[taskId]; if (a) a.revealed = true; }); }
export function saveDraft(key: string, taskId: string, text: string): void {
  update((s) => { const lp = lessonProgress(s, key); lp.drafts[taskId] = text; lp.updatedAt = Date.now(); });
}
export function visitStep(key: string, stepId: string, index: number) {
  update((s) => { const lp = lessonProgress(s, key); lp.stepIndex = index; if (!lp.visited.includes(stepId)) lp.visited.push(stepId); if (!key.startsWith('demo:')) s.currentLesson = key; });
}

export function addReviewItems(lessonKey: string, items: { kind: 'chunk' | 'prompt'; front: string }[]): void {
  update((s) => {
    for (const it of items) {
      const id = `${lessonKey}:${it.kind}:${it.front}`;
      if (!s.review.some((r) => r.id === id)) s.review.push({ id, ...it, lessonKey, box: 0, due: Date.now() });
    }
  });
}
const BOX_DAYS = [0, 1, 3, 7, 16, 35];
export function gradeReview(id: string, remembered: boolean): void {
  update((s) => {
    const r = s.review.find((x) => x.id === id);
    if (!r) return;
    r.box = remembered ? Math.min(r.box + 1, BOX_DAYS.length - 1) : 0;
    r.due = Date.now() + (remembered ? BOX_DAYS[r.box] * DAY : 10 * 60_000);
  });
}
export const dueReview = (s: State) => s.review.filter((r) => r.due <= Date.now());

export const today = () => new Date().toISOString().slice(0, 10);
export function logDaily(minutes: number): void { update((s) => { s.daily[today()] = (s.daily[today()] ?? 0) + minutes; }); }

export function reset(): void { memory = fresh(); save(); }
export function exportJson(): string { return JSON.stringify(load(), null, 2); }
export function __resetMemory(): void { memory = null; }
