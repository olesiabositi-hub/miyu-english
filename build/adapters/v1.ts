/**
 * Adapter: MIYU Lesson Contract v1.0.0 → internal PublicLesson.
 *  - answer keys → salted SHA-256 hashes (per course matching rules)
 *  - tutorRules, quality.notes → removed
 *  - assetRefs → resolved against public/; missing files are counted, never invented
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import type { Lesson, PublicLesson, PublicSection, PublicTask, CourseConfig } from '../../src/lib/contract';
import { hashInput, keyCanonicals, type MatchRules } from '../../src/lib/answer-key';

const AUDIO = new Set(['.mp3', '.m4a', '.ogg', '.oga', '.wav', '.webm', '.aac', '.opus']);
const IMAGE = new Set(['.webp', '.jpg', '.jpeg', '.png', '.avif', '.svg']);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export const rulesFor = (c: CourseConfig): MatchRules => ({ lang: c.targetLanguage.code, ...c.answerMatching });

export function adaptV1(lesson: Lesson, course: CourseConfig, root: string, demo = false): PublicLesson {
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
  const tasks: PublicTask[] = lesson.tasks.map(({ tutorRules: _t, scoring, ...t }) => {
    const { correctOptionIds, acceptedAnswers, ...rest } = scoring;
    const canons = keyCanonicals(t.responseType, correctOptionIds, acceptedAnswers, rules);
    return { ...t, scoring: { ...rest, ...(canons.length ? { keyHashes: canons.map((c) => sha(hashInput(course.id, lesson.id, t.id, c))), keyCount: correctOptionIds?.length } : {}) } };
  });
  const { notes: _n, ...quality } = lesson.quality;
  return { ...lesson, courseId: course.id, sections, tasks, quality, ...(demo ? { demo: true } : {}) };
}
