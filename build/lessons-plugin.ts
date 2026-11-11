/**
 * Vite plugin: content/ → browser-safe virtual module.
 *   import { site, courses } from 'virtual:miyu-courses'
 *
 * For every course listed in content/site.json:
 *  - reads content/courses/<id>/course.json (validated by scripts/validate-lessons.mjs)
 *  - reads lessons from course.contract.lessonsDir and maps them with the adapter for their schemaVersion
 *  - production: only publishable lessons (status approved/published + all QA flags true)
 *    dev server or MIYU_PREVIEW_DRAFTS=1: drafts too (marked by status)
 *  - interface demo fixtures from tests/fixtures/<id>/*.demo.json
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';
import type { CourseConfig, Lesson, PublicCourse, PublicLesson, SiteConfig } from '../src/lib/contract';
import { isPublishable } from '../src/lib/contract';
import { adaptV1 } from './adapters/v1';

const ID = 'virtual:miyu-courses';
const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8'));

/** Registry of lesson-contract adapters. A new contract version = a new entry here. */
export const ADAPTERS: Record<string, (l: Lesson, c: CourseConfig, root: string, demo?: boolean) => PublicLesson> = {
  '1.0.0': adaptV1,
};
export function adapt(raw: Lesson, course: CourseConfig, root: string, demo = false): PublicLesson {
  const fn = ADAPTERS[raw.schemaVersion];
  if (!fn) throw new Error(`No adapter for lesson schemaVersion ${raw.schemaVersion} (${course.id}/${raw.id})`);
  return fn(raw, course, root, demo);
}

export function readSite(root: string): SiteConfig { return readJson(join(root, 'content/site.json')); }
export function readCourse(root: string, id: string): CourseConfig { return readJson(join(root, 'content/courses', id, 'course.json')); }

export function readLessons(root: string, course: CourseConfig): Lesson[] {
  const dir = join(root, course.contract.lessonsDir);
  if (!existsSync(dir)) return [];
  const pattern = new RegExp(course.contract.lessonIdPattern.replace(/^\^|\$$/g, '') + '\\.json$');
  return readdirSync(dir).filter((f) => pattern.test(f)).sort().map((f) => readJson<Lesson>(join(dir, f)));
}

export function buildCourse(root: string, id: string, includeDrafts: boolean): PublicCourse {
  const course = readCourse(root, id);
  const lessons = readLessons(root, course).filter((l) => includeDrafts || isPublishable(l)).map((l) => adapt(l, course, root));
  const fxDir = join(root, 'tests/fixtures', id);
  const demoFile = existsSync(fxDir) ? readdirSync(fxDir).find((f) => f.endsWith('.demo.json')) : undefined;
  const demo = demoFile ? adapt(readJson<Lesson>(join(fxDir, demoFile)), course, root, true) : null;
  const { contract, ...config } = course;
  return { config: { ...config, contractVersion: contract.version }, lessons, demo };
}

export default function coursesPlugin(): Plugin {
  let root = process.cwd();
  let includeDrafts = false;
  return {
    name: 'miyu-courses',
    configResolved(c) { root = resolve(c.root); includeDrafts = c.command === 'serve' || process.env.MIYU_PREVIEW_DRAFTS === '1'; },
    resolveId(id) { return id === ID ? '\0' + ID : null; },
    load(id) {
      if (id !== '\0' + ID) return null;
      const site = readSite(root);
      this.addWatchFile(join(root, 'content/site.json'));
      const courses = site.courses.map((cid) => {
        const course = readCourse(root, cid);
        this.addWatchFile(join(root, 'content/courses', cid, 'course.json'));
        const dir = join(root, course.contract.lessonsDir);
        if (existsSync(dir)) readdirSync(dir).forEach((f) => this.addWatchFile(join(dir, f)));
        return buildCourse(root, cid, includeDrafts);
      });
      return `export const site = ${JSON.stringify(site)};\nexport const courses = ${JSON.stringify(courses)};\nexport const includesDrafts = ${includeDrafts};`;
    },
  };
}
