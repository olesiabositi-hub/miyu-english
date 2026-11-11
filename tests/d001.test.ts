// Integration tests against the real D001.json delivered by Codex (content/lessons/D001.json).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { adapt, readCourse, buildCourse, isReleased } from '../build/lessons-plugin';
import type { Lesson } from '../src/lib/contract';
import { evaluate, isChoiceWithJustification } from '../src/lib/scoring';
import { buildSteps } from '../src/lib/lesson-model';
import { speakerScript } from '../src/app/lesson/sections';

const root = new URL('..', import.meta.url).pathname;
const raw: Lesson = JSON.parse(readFileSync(root + 'content/lessons/D001.json', 'utf8'));
const course = readCourse(root, 'english');
const pub = adapt(raw, course, root);
const T = (n: number) => pub.tasks.find((t) => t.id === `D001-T${String(n).padStart(2, '0')}`)!;
const rules = { lang: 'en', ...course.answerMatching };

describe('D001 (real lesson) — contract and release', () => {
  it('is valid against the unchanged v1.0.0 schema', () => {
    const v = new Ajv2020({ strict: false }).compile(JSON.parse(readFileSync(root + 'schemas/lesson.schema.json', 'utf8')));
    expect(v(raw), JSON.stringify(v.errors)).toBe(true);
    expect(raw.tasks).toHaveLength(14);
  });
  it('is a draft released only as an owner-approved PILOT', () => {
    expect(raw.status).toBe('draft');
    expect(isReleased(raw, course)).toBe(true);
    expect(isReleased(raw, { ...course, pilotLessons: [] })).toBe(false);
    const built = buildCourse(root, 'english', false);
    expect(built.lessons.map((l) => [l.id, l.pilot])).toEqual([['D001', true]]);
  });
  it('ships no tutor rules or editorial notes; only the follow-up questions for T12', () => {
    const json = JSON.stringify(pub);
    expect(json).not.toMatch(/tutorRules|Private tutor guidance|correctOptionIds|acceptedAnswers/);
    expect(T(12).followUpQuestions).toHaveLength(3);
    expect(T(12).followUpQuestions![0]).toMatch(/^Which detail would you remove/);
  });
  it('maps every task into exactly one step, in file order', () => {
    const steps = buildSteps(pub);
    expect(steps.map((s) => s.id)).toEqual(['__overview', ...raw.sections.map((s) => s.id), '__wrap']);
    expect(steps.flatMap((s) => s.tasks.map((t) => t.id))).toEqual(raw.tasks.map((t) => t.id));
  });
});

describe('D001 task behaviour', () => {
  it('T01/T03: choice is checked, justification is kept for self-check', async () => {
    expect(isChoiceWithJustification(T(1))).toBe(true);
    expect(isChoiceWithJustification(T(3))).toBe(true);
    const ok = await evaluate(pub, T(1), { choice: 'B', text: 'limits of the evidence' }, rules);
    expect(ok).toMatchObject({ status: 'submitted', score: null, detail: { choiceCorrect: true } });
    const bad = await evaluate(pub, T(3), { choice: 'B', text: 'x' }, rules);
    expect(bad.detail?.choiceCorrect).toBe(false);
  });
  it('T04: listening choice is checkable (shown as transcript practice while audio is pending)', async () => {
    expect((await evaluate(pub, T(4), 'B', rules)).status).toBe('correct');
    expect(pub.sections.find((s) => s.id === 'listening-main')!.audio).toBeUndefined();
  });
  it('T02, T05–T08, T11, T14: open answers are self-checked with the rubric; model answers only where given', async () => {
    for (const n of [2, 5, 6, 7, 8, 11, 14]) expect((await evaluate(pub, T(n), 'anything', rules)).status).toBe('submitted');
    expect(T(2).scoring.modelAnswers).toHaveLength(2);
    expect(T(11).scoring.modelAnswers).toBeUndefined();
  });
  it('T09: matching is scored per pair (1–C, 2–A, 3–D; B unused)', async () => {
    expect(T(9).matchItems).toEqual([{ key: '1', label: 'what drives me' }, { key: '2', label: 'a turning point' }, { key: '3', label: 'in the long run' }]);
    const all = await evaluate(pub, T(9), { 1: 'C', 2: 'A', 3: 'D' }, rules);
    expect(all).toMatchObject({ status: 'correct', score: 3 });
    const two = await evaluate(pub, T(9), { 1: 'C', 2: 'B', 3: 'D' }, rules);
    expect(two).toMatchObject({ status: 'incorrect', score: 2, detail: { parts: [true, false, true] } });
  });
  it('T10: gap fill is checked per blank, case and punctuation tolerant, wording strict', async () => {
    expect(await evaluate(pub, T(10), ['What drives me', 'a turning point.', 'in the long run'], rules)).toMatchObject({ status: 'correct', score: 3 });
    expect(await evaluate(pub, T(10), ['what motivates me', 'a turning point', 'in the long run'], rules)).toMatchObject({ status: 'incorrect', score: 2, detail: { parts: [false, true, true] } });
  });
  it('T12/T13: speaking is never auto-scored', async () => {
    expect((await evaluate(pub, T(12), '[recordings kept on this device]', rules)).status).toBe('submitted');
    expect(T(13).ui?.speaking?.segments).toHaveLength(3);
  });
  it('script view hides production cues but keeps evidence text intact', () => {
    const { text, hidden } = speakerScript(raw.sections.find((s) => s.id === 'listening-main')!.transcript!);
    expect(hidden).toBeGreaterThan(5);
    expect(text).not.toMatch(/CLARIFY_01|stress queue|\[A,|\[B,/);
    expect(text).toContain('Ah, I made it sound as though everyone would have to stop at the door.');
  });
});
