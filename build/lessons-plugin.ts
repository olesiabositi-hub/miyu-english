/**
 * Vite plugin: turns content/lessons/*.json into a browser-safe virtual module.
 *   import { lessons, demo } from 'virtual:miyu-lessons'
 * - production: only publishable lessons (status approved/published + all QA flags true)
 * - dev server or MIYU_PREVIEW_DRAFTS=1: drafts too (marked by status)
 * - answer keys → salted SHA-256 hashes; tutorRules and quality.notes removed
 * - assetRefs resolved against public/ ; missing files are counted, never invented
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import type { Plugin } from 'vite';
import type { Lesson, PublicLesson, PublicSection, PublicTask } from '../src/lib/contract';
import { isPublishable } from '../src/lib/contract';
import { hashInput, keyCanonicals } from '../src/lib/answer-key';

const ID = 'virtual:miyu-lessons';
const AUDIO = new Set(['.mp3', '.m4a', '.ogg', '.oga', '.wav', '.webm', '.aac']);
const IMAGE = new Set(['.webp', '.jpg', '.jpeg', '.png', '.avif', '.svg']);

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export function toPublic(lesson: Lesson, root: string, demo = false): PublicLesson {
  const sections: PublicSection[] = lesson.sections.map(({ assetRefs, ...s }) => {
    const audio: string[] = [];
    const images: string[] = [];
    let missing = 0;
    for (const ref of assetRefs ?? []) {
      const isUrl = /^https?:\/\//.test(ref);
      const rel = ref.replace(/^\.?\/?(public\/)?/, '');
      if (!isUrl && !existsSync(join(root, 'public', rel))) { missing++; continue; }
      const url = isUrl ? ref : '../' + rel; // lesson pages live under /learn/
      const ext = extname(ref.split('?')[0]).toLowerCase();
      if (AUDIO.has(ext)) audio.push(url); else if (IMAGE.has(ext)) images.push(url); else missing++;
    }
    return { ...s, ...(audio.length ? { audio } : {}), ...(images.length ? { images } : {}), ...(missing ? { missingAssets: missing } : {}) };
  });
  const tasks: PublicTask[] = lesson.tasks.map(({ tutorRules: _t, scoring, ...t }) => {
    const { correctOptionIds, acceptedAnswers, ...rest } = scoring;
    const canons = keyCanonicals(t.responseType, correctOptionIds, acceptedAnswers);
    return { ...t, scoring: { ...rest, ...(canons.length ? { keyHashes: canons.map((c) => sha(hashInput(lesson.id, t.id, c))), keyCount: correctOptionIds?.length } : {}) } };
  });
  const { notes: _n, ...quality } = lesson.quality;
  return { ...lesson, sections, tasks, quality, ...(demo ? { demo: true } : {}) };
}

export function readLessons(root: string): Lesson[] {
  const dir = join(root, 'content/lessons');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /^D\d{3}\.json$/.test(f)).sort().map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
}

export default function lessonsPlugin(): Plugin {
  let root = process.cwd();
  let includeDrafts = false;
  return {
    name: 'miyu-lessons',
    configResolved(c) { root = resolve(c.root); includeDrafts = c.command === 'serve' || process.env.MIYU_PREVIEW_DRAFTS === '1'; },
    resolveId(id) { return id === ID ? '\0' + ID : null; },
    load(id) {
      if (id !== '\0' + ID) return null;
      const all = readLessons(root);
      all.forEach((_, i) => this.addWatchFile(join(root, 'content/lessons', `${all[i].id}.json`)));
      const lessons = all.filter((l) => includeDrafts || isPublishable(l)).map((l) => toPublic(l, root));
      const demoPath = join(root, 'tests/fixtures/D001.demo.json');
      const demo = existsSync(demoPath) ? toPublic(JSON.parse(readFileSync(demoPath, 'utf8')), root, true) : null;
      return `export const lessons = ${JSON.stringify(lessons)};\nexport const demo = ${JSON.stringify(demo)};\nexport const includesDrafts = ${includeDrafts};`;
    },
  };
}
