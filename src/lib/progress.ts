// All learner progress lives in this browser (docs/decisions/0001). No accounts, no server.
// Each course has its own independent store: localStorage "miyu:<courseId>:progress:v1".
// The learner's name is shared across courses: "miyu:profile:v1".
import type { TaskStatus, AnswerDetail, LearnerResponse } from './scoring';
import { activeCourse } from './course';

const keyFor = (courseId: string) => `miyu:${courseId}:progress:v1`;
const PROFILE_KEY = 'miyu:profile:v1';
const LEGACY_EN_KEY = 'miyu-english:v2';
const DAY = 86_400_000;

export interface Answer { response: LearnerResponse; status: TaskStatus; score: number | null; attempts: number; firstStatus: TaskStatus; revealed?: boolean; detail?: AnswerDetail; updatedAt: number }
export interface LessonProgress { stepIndex: number; visited: string[]; answers: Record<string, Answer>; drafts: Record<string, string>; taskState?: Record<string, Record<string, unknown>>; startedAt: number; updatedAt: number; completedAt?: number }
export interface ReviewItem { id: string; kind: 'chunk' | 'prompt'; front: string; lessonKey: string; box: number; due: number }
export interface State {
  version: 1;
  courseId: string;
  createdAt: number;
  lastVisit: number;
  previousVisit?: number;
  diagnostic: 'none' | 'skipped' | 'done';
  currentLesson?: string; // progress key
  lessons: Record<string, LessonProgress>;
  review: ReviewItem[];
  daily: Record<string, number>;
}

const fresh = (courseId: string): State => ({ version: 1, courseId, createdAt: Date.now(), lastVisit: Date.now(), diagnostic: 'none', lessons: {}, review: [], daily: {} });

const memory = new Map<string, State>();
let storageOk = true;
const cid = () => activeCourse().config.id;

/** Progress of the active course (or of a given course). */
export function load(courseId = cid()): State {
  const hit = memory.get(courseId);
  if (hit) return hit;
  let st: State;
  try {
    let raw = localStorage.getItem(keyFor(courseId));
    if (!raw && courseId === 'english') raw = localStorage.getItem(LEGACY_EN_KEY); // pre-platform builds
    st = raw ? { ...fresh(courseId), ...JSON.parse(raw), version: 1, courseId } : fresh(courseId);
  } catch {
    storageOk = false;
    st = fresh(courseId);
  }
  memory.set(courseId, st);
  return st;
}
export function save(courseId = cid()): void {
  const st = memory.get(courseId);
  if (!st) return;
  try { localStorage.setItem(keyFor(courseId), JSON.stringify(st)); storageOk = true; } catch { storageOk = false; }
}

/* ---- profile shared by all courses ---- */
export interface Profile { name?: string }
export function loadProfile(): Profile { try { return JSON.parse(localStorage.getItem(PROFILE_KEY) ?? '{}'); } catch { return {}; } }
export function saveProfile(p: Profile): void { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch { storageOk = false; } }
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

export function recordAnswer(key: string, taskId: string, response: LearnerResponse, status: TaskStatus, score: number | null, detail?: AnswerDetail): Answer {
  let out!: Answer;
  update((s) => {
    const lp = lessonProgress(s, key);
    const prev = lp.answers[taskId];
    out = { response, status, score, attempts: (prev?.attempts ?? 0) + 1, firstStatus: prev?.firstStatus ?? status, revealed: prev?.revealed, detail, updatedAt: Date.now() };
    lp.answers[taskId] = out;
    delete lp.drafts[taskId];
    lp.updatedAt = Date.now();
    if (!key.startsWith('demo:')) s.currentLesson = key;
  });
  return out;
}
/** Merge extra detail into a saved answer (e.g. the learner's self-rating). */
export function updateDetail(key: string, taskId: string, patch: Partial<AnswerDetail>) {
  update((s) => { const a = lessonProgress(s, key).answers[taskId]; if (a) a.detail = { ...a.detail, ...patch }; });
}
/** Task-level scratch state that survives reloads (e.g. which follow-up question was revealed, and when). */
export function saveTaskState(key: string, taskId: string, value: Record<string, unknown>) {
  update((s) => { const lp = lessonProgress(s, key); lp.taskState = { ...lp.taskState, [taskId]: { ...lp.taskState?.[taskId], ...value } }; });
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

/** Resets only the active course. */
export function reset(): void { memory.set(cid(), fresh(cid())); save(); }
export function exportJson(): string { return JSON.stringify({ profile: loadProfile(), progress: load() }, null, 2); }
export function __resetMemory(): void { memory.clear(); }
