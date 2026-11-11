import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { adapt, readCourse, readSite, buildCourse } from '../build/lessons-plugin';
import type { Lesson, CourseConfig } from '../src/lib/contract';
import { isPublishable } from '../src/lib/contract';
import { evaluate, revealChoiceKey, isFinished } from '../src/lib/scoring';
import { buildSteps } from '../src/lib/lesson-model';
import { normalise, canonical, keyCanonicals, type MatchRules } from '../src/lib/answer-key';

const root = new URL('..', import.meta.url).pathname;
const raw: Lesson = JSON.parse(readFileSync(root + 'tests/fixtures/english/D001.demo.json', 'utf8'));
const english = readCourse(root, 'english');
const pub = adapt(raw, english, root, true);
const task = (n: number) => pub.tasks.find((t: { id: string }) => t.id === `D001-T${String(n).padStart(2, '0')}`)!;

describe('contract', () => {
  it('demo fixture is valid against the shared schema', () => {
    const v = new Ajv2020({ strict: false }).compile(JSON.parse(readFileSync(root + 'schemas/lesson.schema.json', 'utf8')));
    expect(v(raw), JSON.stringify(v.errors)).toBe(true);
  });
  it('every course in site.json has a valid course.json', () => {
    const v = new Ajv2020({ strict: false }).compile(JSON.parse(readFileSync(root + 'schemas/course.schema.json', 'utf8')));
    const site = readSite(root);
    expect(site.courses).toContain(site.defaultCourse);
    for (const id of site.courses) expect(v(readCourse(root, id)), id + JSON.stringify(v.errors)).toBe(true);
    expect(english.modules).toHaveLength(13);
    expect(english.totalLessons).toBe(90);
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
    const listening = pub.sections.find((s: { type: string }) => s.type === 'listening')!;
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
    expect(steps.slice(1, -1).map((s) => s.id)).toEqual(raw.sections.map((s: { id: string }) => s.id));
    const all = steps.flatMap((s) => s.tasks.map((t) => t.id));
    expect(all.sort()).toEqual(raw.tasks.map((t) => t.id).sort());
  });
  it('tasks without a section go to Further practice', () => {
    const loose = { ...pub, tasks: [...pub.tasks, { ...task(1), id: 'D001-T99', sectionId: undefined }] };
    const steps = buildSteps(loose);
    expect(steps.find((s) => s.kind === 'practice')!.tasks.map((t) => t.id)).toEqual(['D001-T99']);
  });
});

describe('multi-course platform', () => {
  const greekRules: MatchRules = { lang: 'el', caseSensitive: false, ignoreDiacritics: true, ignoreTrailingPunctuation: true };
  const danishRules: MatchRules = { lang: 'da', caseSensitive: false, ignoreDiacritics: false, ignoreTrailingPunctuation: true };
  it('Greek: locale-aware lower-casing (final sigma) and optional accent folding', () => {
    expect(normalise('ΚΑΛΗΜΈΡΑ', greekRules)).toBe(normalise('καλημερα', greekRules));
    expect(normalise('Οδός', greekRules)).toBe('οδος');
    expect(normalise('ΟΔΟΣ', { ...greekRules, ignoreDiacritics: false })).toBe('οδος');
  });
  it('Danish: æ ø å are kept distinct from a/o', () => {
    expect(normalise('Smørrebrød', danishRules)).toBe('smørrebrød');
    expect(normalise('smorrebrod', danishRules)).not.toBe(normalise('smørrebrød', danishRules));
  });
  it('keys are scoped to the course: same lesson id in another course hashes differently', () => {
    const other: CourseConfig = { ...english, id: 'greek', targetLanguage: { code: 'el', name: 'Greek', script: 'Grek', dir: 'ltr' } };
    const a = adapt(raw, english, root).tasks[0].scoring.keyHashes;
    const b = adapt(raw, other, root).tasks[0].scoring.keyHashes;
    expect(a).not.toEqual(b);
  });
  it('accepted answers are normalised with the course rules', () => {
    expect(keyCanonicals('short_text', undefined, ['Καλημέρα!'], greekRules)).toEqual(['καλημερα']);
  });
  it('course payload carries config but not contract internals', () => {
    const c = buildCourse(root, 'english', false);
    expect(c.config.id).toBe('english');
    expect(c.config.contractVersion).toBe('1.0.0');
    expect((c.config as Record<string, unknown>).contract).toBeUndefined();
    // only the owner-approved pilot is released; the demo is draft and lives in fixtures
    expect(c.lessons.map((l) => l.id)).toEqual(['D001']);
    expect(c.lessons[0].pilot).toBe(true);
    expect(c.demo?.demo).toBe(true);
  });
  it('unknown lesson schema versions fail loudly instead of rendering wrongly', () => {
    expect(() => adapt({ ...raw, schemaVersion: '9.9.9' } as unknown as Lesson, english, root)).toThrow(/No adapter/);
  });
});

describe('a new course is added by configuration only', () => {
  it('builds a second (throw-away) course from course.json alone, in a temp copy', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, cpSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const dir = mkdtempSync(tmpdir() + '/miyu-');
    cpSync(root + 'content', dir + '/content', { recursive: true });
    cpSync(root + 'schemas', dir + '/schemas', { recursive: true });
    mkdirSync(dir + '/content/courses/greek-sample', { recursive: true });
    const cfg: CourseConfig = {
      ...english, id: 'greek-sample', title: 'Sample Greek course (test only)', theme: 'grand-academy',
      targetLanguage: { code: 'el', name: 'Greek', script: 'Grek', dir: 'ltr' },
      levels: { from: 'A0', to: 'A2', scale: ['A0', 'A1', 'A2'], framework: 'CEFR' }, totalLessons: 60,
      answerMatching: { caseSensitive: false, ignoreDiacritics: true, ignoreTrailingPunctuation: true },
      input: { specialCharacters: ['ά', 'έ', 'ή', 'ί', 'ό', 'ύ', 'ώ'] },
      contract: { ...english.contract, lessonsDir: 'content/courses/greek-sample/lessons' },
      modules: [{ id: 'M01', number: 1, title: 'Module 1', lessons: [] }],
    };
    writeFileSync(dir + '/content/courses/greek-sample/course.json', JSON.stringify(cfg));
    writeFileSync(dir + '/content/site.json', JSON.stringify({ defaultCourse: 'english', courses: ['english', 'greek-sample'] }));
    const v = new Ajv2020({ strict: false }).compile(JSON.parse(readFileSync(dir + '/schemas/course.schema.json', 'utf8')));
    expect(v(cfg), JSON.stringify(v.errors)).toBe(true);
    const built = readSite(dir).courses.map((id) => buildCourse(dir, id, false));
    expect(built.map((c) => c.config.id)).toEqual(['english', 'greek-sample']);
    expect(built[1].config.targetLanguage.script).toBe('Grek');
    expect(built[1].lessons).toEqual([]);
  });
});
