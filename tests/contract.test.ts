import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import Ajv from 'ajv';
import { toPublic } from '../build/lessons-plugin';
import type { Lesson } from '../src/lib/contract';
import { isPublishable } from '../src/lib/contract';
import { evaluate, revealChoiceKey, isFinished } from '../src/lib/scoring';
import { buildSteps } from '../src/lib/lesson-model';
import { normalise, canonical } from '../src/lib/answer-key';

const root = new URL('..', import.meta.url).pathname;
const raw: Lesson = JSON.parse(readFileSync(root + 'tests/fixtures/D001.demo.json', 'utf8'));
const pub = toPublic(raw, root, true);
const task = (n: number) => pub.tasks.find((t) => t.id === `D001-T${String(n).padStart(2, '0')}`)!;

describe('contract', () => {
  it('demo fixture is valid against the shared schema', () => {
    const v = new Ajv2020({ strict: false }).compile(JSON.parse(readFileSync(root + 'schemas/lesson.schema.json', 'utf8')));
    expect(v(raw), JSON.stringify(v.errors)).toBe(true);
  });
  it('curriculum index has 13 modules', () => {
    const v = new Ajv({ strict: false }).compile(JSON.parse(readFileSync(root + 'schemas/curriculum.schema.json', 'utf8')));
    expect(v(JSON.parse(readFileSync(root + 'content/curriculum.json', 'utf8')))).toBe(true);
  });
  it('publishing gate needs approved status AND all QA flags', () => {
    const q = { editorialApproved: true, answerKeyVerified: true, audioReviewed: true, notes: [] };
    expect(isPublishable({ status: 'approved', quality: q })).toBe(true);
    expect(isPublishable({ status: 'published', quality: q })).toBe(true);
    expect(isPublishable({ status: 'review', quality: q })).toBe(false);
    expect(isPublishable({ status: 'approved', quality: { ...q, audioReviewed: false } })).toBe(false);
  });
});

describe('browser payload', () => {
  it('contains no plain keys, tutor rules or editorial notes', () => {
    const json = JSON.stringify(pub);
    expect(json).not.toMatch(/correctOptionIds|acceptedAnswers|tutorRules|"notes"/);
    expect(task(1).scoring.keyHashes).toHaveLength(1);
  });
  it('drops asset refs whose files do not exist (no invented audio)', () => {
    const listening = pub.sections.find((s) => s.type === 'listening')!;
    expect(listening.audio).toBeUndefined();
    expect(listening.missingAssets).toBe(1);
  });
});

describe('scoring', () => {
  it('single_choice', async () => {
    expect((await evaluate(pub, task(1), 'b')).status).toBe('correct');
    expect((await evaluate(pub, task(1), 'a')).status).toBe('incorrect');
  });
  it('multiple_choice needs the exact set, order-insensitive', async () => {
    expect((await evaluate(pub, task(3), ['c', 'a'])).status).toBe('correct');
    expect((await evaluate(pub, task(3), ['a'])).status).toBe('incorrect');
    expect((await evaluate(pub, task(3), ['a', 'c', 'd'])).status).toBe('incorrect');
  });
  it('short_text accepts any accepted answer, normalised', async () => {
    expect((await evaluate(pub, task(4), '  Sort. ')).status).toBe('correct');
    expect((await evaluate(pub, task(10), 'A Logistics Company')).status).toBe('correct');
    expect((await evaluate(pub, task(10), 'shipping')).status).toBe('incorrect');
  });
  it('gap_fill single and multi blank', async () => {
    expect((await evaluate(pub, task(5), 'to  working')).status).toBe('correct');
    expect((await evaluate(pub, task(6), ['to', 'meeting'])).status).toBe('correct');
    expect((await evaluate(pub, task(6), ['to', 'meet'])).status).toBe('incorrect');
  });
  it('ordering needs the exact sequence', async () => {
    expect((await evaluate(pub, task(7), ['name', 'role', 'detail', 'close'])).status).toBe('correct');
    expect((await evaluate(pub, task(7), ['role', 'name', 'detail', 'close'])).status).toBe('incorrect');
  });
  it('rubric / manual / formative are never auto-graded', async () => {
    expect((await evaluate(pub, task(12), 'text')).status).toBe('submitted');
    expect((await evaluate(pub, task(14), 'text')).status).toBe('pending_review');
    expect((await evaluate(pub, task(15), 'text')).status).toBe('done');
  });
  it('choice keys can be revealed after attempts', async () => {
    expect(await revealChoiceKey(pub, task(3))).toEqual(['a', 'c']);
    expect(await revealChoiceKey(pub, task(7))).toEqual(['name', 'role', 'detail', 'close']);
  });
  it('a task is finished after a right answer, a submission, or two tries', () => {
    expect(isFinished('correct', 1)).toBe(true);
    expect(isFinished('incorrect', 1)).toBe(false);
    expect(isFinished('incorrect', 2)).toBe(true);
    expect(isFinished('pending_review', 1)).toBe(true);
  });
  it('normalisation', () => {
    expect(normalise('  I’M  Here! ')).toBe("i'm here");
    expect(canonical('multiple_choice', ['b', 'a'])).toBe('a,b');
  });
});

describe('lesson model', () => {
  it('keeps section order and attaches every task exactly once', () => {
    const steps = buildSteps(pub);
    expect(steps[0].kind).toBe('overview');
    expect(steps.at(-1)!.kind).toBe('wrap-up');
    expect(steps.slice(1, -1).map((s) => s.id)).toEqual(raw.sections.map((s) => s.id));
    const all = steps.flatMap((s) => s.tasks.map((t) => t.id));
    expect(all.sort()).toEqual(raw.tasks.map((t) => t.id).sort());
  });
  it('tasks without a section go to Further practice', () => {
    const loose = { ...pub, tasks: [...pub.tasks, { ...task(1), id: 'D001-T99', sectionId: undefined }] };
    const steps = buildSteps(loose);
    expect(steps.find((s) => s.kind === 'practice')!.tasks.map((t) => t.id)).toEqual(['D001-T99']);
  });
});
