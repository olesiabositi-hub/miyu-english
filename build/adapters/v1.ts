/**
 * Adapter: MIYU Lesson Contract v1.0.0 → internal PublicLesson.
 *  - exact keys → salted SHA-256 hashes; per-blank (gap_fill) and per-pair (matching) keys hashed separately
 *  - rubric/manual model answers kept as plain text, revealed only after submission (decision 0005)
 *  - tutorRules, quality.notes → removed; only follow-up questions for spontaneous speaking are extracted
 *    when the lesson-ui file asks for it
 *  - assetRefs → resolved against public/; missing files are counted, never invented
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import type { Lesson, PublicLesson, PublicSection, PublicTask, PublicScoring, CourseConfig, TaskUi, Task } from '../../src/lib/contract';
import { hashInput, keyCanonicals, normalise, blankCount, type MatchRules } from '../../src/lib/answer-key';

const AUDIO = new Set(['.mp3', '.m4a', '.ogg', '.oga', '.wav', '.webm', '.aac', '.opus']);
const IMAGE = new Set(['.webp', '.jpg', '.jpeg', '.png', '.avif', '.svg']);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export const rulesFor = (c: CourseConfig): MatchRules => ({ lang: c.targetLanguage.code, ...c.answerMatching });
export interface LessonUi { lessonId: string; tasks?: Record<string, TaskUi> }

/** "1-C" style pairs for matching (proposed convention, docs/contract-proposals.md). */
export const PAIR = /^\s*([^\s-]+)\s*-\s*([^\s-]+)\s*$/;
/** Matching items named in the prompt: 1 ‘what drives me’, 2 ‘a turning point’ … */
export function matchItemsFromPrompt(prompt: string, keys: string[]): { key: string; label: string }[] {
  const found = new Map<string, string>();
  for (const m of prompt.matchAll(/(\d+)\s*[‘'"“]([^’'"”]+)[’'"”]/g)) found.set(m[1], m[2]);
  return keys.map((k) => ({ key: k, label: found.get(k) ?? `Item ${k}` }));
}
/** “Choose one: Q1? | Q2? | Q3?” inside tutorRules (pilot convention). */
export function followUpsFromTutorRules(rules: string[] | undefined): string[] {
  for (const r of rules ?? []) {
    const m = r.match(/Choose one:\s*(.+)$/s);
    if (m) return m[1].split('|').map((q) => q.trim()).filter((q) => q.endsWith('?'));
  }
  return [];
}

function scoringFor(course: CourseConfig, lesson: Lesson, t: Task, rules: MatchRules): Pick<PublicTask, 'scoring' | 'matchItems'> {
  const { correctOptionIds, acceptedAnswers, ...rest } = t.scoring;
  const h = (canon: string) => sha(hashInput(course.id, lesson.id, t.id, canon));
  const out: PublicScoring = { ...rest };
  const type = t.responseType;
  const deterministic = t.scoring.mode === 'auto' || ['single_choice', 'multiple_choice', 'ordering', 'gap_fill', 'matching'].includes(type);

  if (type === 'matching' && acceptedAnswers?.length && acceptedAnswers.every((a) => PAIR.test(a))) {
    out.pairHashes = acceptedAnswers.map((a) => h('pair:' + normalise(a.replace(/\s+/g, ''), rules)));
    out.modelAnswers = acceptedAnswers;
    const keys = acceptedAnswers.map((a) => a.match(PAIR)![1]);
    return { scoring: out, matchItems: matchItemsFromPrompt(t.prompt, keys) };
  }
  const blanks = type === 'gap_fill' ? blankCount(t.prompt) : 0;
  if (type === 'gap_fill' && blanks > 1 && acceptedAnswers?.length === blanks && acceptedAnswers.every((a) => !a.includes('|'))) {
    out.partHashes = acceptedAnswers.map((a, i) => [h(`gap${i}:` + normalise(a, rules))]);
    out.modelAnswers = acceptedAnswers;
    return { scoring: out };
  }
  if (deterministic) {
    const canons = keyCanonicals(type, correctOptionIds, acceptedAnswers, rules);
    if (canons.length) { out.keyHashes = canons.map(h); out.keyCount = correctOptionIds?.length; }
    if (type === 'gap_fill' && acceptedAnswers?.length) out.modelAnswers = acceptedAnswers.map((a) => a.split('|').join(' … '));
  } else if (acceptedAnswers?.length) {
    out.modelAnswers = acceptedAnswers; // rubric/manual open answers: model shown after submission
  }
  return { scoring: out };
}

export function adaptV1(lesson: Lesson, course: CourseConfig, root: string, demo = false, ui?: LessonUi): PublicLesson {
  const rules = rulesFor(course);
  const sections: PublicSection[] = lesson.sections.map(({ assetRefs, ...s }) => {
    const audio: string[] = [];
    const images: string[] = [];
    let missing = 0;
    for (const ref of assetRefs ?? []) {
      const isUrl = /^https?:\/\//.test(ref);
      const rel = ref.replace(/^\.?\/?(public\/)?/, '');
      if (!isUrl && !existsSync(join(root, 'public', rel))) { missing++; continue; }
      const url = isUrl ? ref : '../' + rel; // learner pages live under /learn/
      const ext = extname(ref.split('?')[0]).toLowerCase();
      if (AUDIO.has(ext)) audio.push(url); else if (IMAGE.has(ext)) images.push(url); else missing++;
    }
    return { ...s, ...(audio.length ? { audio } : {}), ...(images.length ? { images } : {}), ...(missing ? { missingAssets: missing } : {}) };
  });
  const tasks: PublicTask[] = lesson.tasks.map((t) => {
    const { tutorRules, scoring: _s, ...base } = t;
    const tui = ui?.tasks?.[t.id];
    const followUps = tui?.speaking?.followUpFromTutorRules ? followUpsFromTutorRules(tutorRules) : [];
    return { ...base, ...scoringFor(course, lesson, t, rules), ...(tui ? { ui: tui } : {}), ...(followUps.length ? { followUpQuestions: followUps } : {}) };
  });
  const { notes: _n, ...quality } = lesson.quality;
  return { ...lesson, courseId: course.id, sections, tasks, quality, ...(demo ? { demo: true } : {}) };
}
