#!/usr/bin/env node
/**
 * MIYU Language Academy — content validation (schema + cross-field checks the JSON Schema cannot express).
 * Usage: node scripts/validate-lessons.mjs [courseId ...]   (default: every course in content/site.json)
 * For each course: course.json against schemas/course.schema.json, then every lesson in
 * course.contract.lessonsDir (+ tests/fixtures/<courseId>/*.json) against the course's lesson schema.
 * Exit code 1 on any error. Warnings never fail the build.
 * Pedagogical quality is NOT checked here — that is editorial review (see INTEGRATION_CONTRACT.md).
 */
import Ajv2020 from 'ajv/dist/2020.js';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateCourse = ajv.compile(readJson('schemas/course.schema.json'));
const BLANK = /_{3,}/g;
const CHOICE = new Set(['single_choice', 'multiple_choice', 'ordering', 'matching']);
const list = (d) => (existsSync(join(root, d)) ? readdirSync(join(root, d)).filter((f) => f.endsWith('.json')).map((f) => join(root, d, f)) : []);

const site = readJson('content/site.json');
const courseIds = process.argv.slice(2).length ? process.argv.slice(2) : site.courses;
let errors = 0, warnings = 0, fileCount = 0;
if (!site.courses.includes(site.defaultCourse)) { console.error(`✗ site.json: defaultCourse ${site.defaultCourse} is not in courses`); errors++; }
for (const courseId of courseIds) {
  const course = readJson(`content/courses/${courseId}/course.json`);
  console.log(`\n■ course ${courseId}`);
  if (!validateCourse(course)) { validateCourse.errors.forEach((e) => console.error(`  ✗ course.json ${e.instancePath || '/'} ${e.message}`)); errors += validateCourse.errors.length; continue; }
  if (course.id !== courseId) { console.error(`  ✗ course.json id ${course.id} must equal folder name ${courseId}`); errors++; }
  const validate = ajv.compile(readJson(course.contract.schema));
  const idPattern = new RegExp(course.contract.lessonIdPattern);
  const moduleIds = new Set(course.modules.map((m) => m.id));
  const files = [...list(course.contract.lessonsDir), ...list(`tests/fixtures/${courseId}`)];
  fileCount += files.length;
for (const file of files) {
  const name = basename(file);
  const E = (m) => { errors++; console.error(`  ✗ ${m}`); };
  const W = (m) => { warnings++; console.warn(`  ! ${m}`); };
  let L;
  try { L = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { console.error(`✗ ${name}: invalid JSON — ${e.message}`); errors++; continue; }
  console.log(`${name}`);
  if (!validate(L)) { validate.errors.forEach((e) => E(`schema ${e.instancePath || '/'} ${e.message}`)); continue; }

  const inContent = file.includes(course.contract.lessonsDir);
  if (!idPattern.test(L.id)) E(`id ${L.id} does not match course lessonIdPattern ${course.contract.lessonIdPattern}`);
  if (L.sequence > course.totalLessons) E(`sequence ${L.sequence} exceeds course totalLessons ${course.totalLessons}`);
  if (!moduleIds.has(L.moduleId)) E(`moduleId ${L.moduleId} is not a module of course ${courseId}`);
  if (L.language !== course.targetLanguage.code) E(`language ${L.language} ≠ course targetLanguage ${course.targetLanguage.code}`);
  if (!course.levels.scale.includes(L.level)) W(`level ${L.level} is outside the course scale ${course.levels.scale.join(', ')}`);
  const cs = course.input?.specialCharacters ?? [];
  const nonAscii = new Set((JSON.stringify(L.tasks.map((t) => t.scoring.acceptedAnswers ?? [])).match(/[^\x00-\x7F’‘“”–—…·]/gu) ?? []));
  for (const ch of nonAscii) if (!cs.includes(ch) && !cs.includes(ch.toLocaleUpperCase(course.targetLanguage.code))) W(`accepted answers use “${ch}” — consider adding it to course.json input.specialCharacters`);
  if (inContent && name !== `${L.id}.json`) E(`file name must be ${L.id}.json`);
  if (`D${String(L.sequence).padStart(3, '0')}` !== L.id) W(`sequence ${L.sequence} does not match id ${L.id}`);

  const sectionIds = new Set();
  const spans = new Map();
  for (const s of L.sections) {
    if (sectionIds.has(s.id)) E(`duplicate section id ${s.id}`);
    sectionIds.add(s.id);
    const haystack = `${s.content}\n${s.transcript ?? ''}`;
    for (const sp of s.evidenceSpans ?? []) {
      if (spans.has(sp.id)) E(`duplicate evidence span id ${sp.id}`);
      spans.set(sp.id, s);
      if (!haystack.replace(/\*\*|\*/g, '').includes(sp.text)) E(`evidence span ${sp.id} text not found verbatim in section ${s.id}`);
      if (sp.startSeconds != null && sp.endSeconds != null && sp.endSeconds <= sp.startSeconds) E(`evidence span ${sp.id}: endSeconds must be after startSeconds`);
    }
    if (s.type === 'listening' && !s.transcript) W(`listening section ${s.id} has no transcript`);
    for (const ref of s.assetRefs ?? []) {
      if (/^https?:\/\//.test(ref)) continue;
      const rel = ref.replace(/^\.?\/?(public\/)?/, '');
      if (!existsSync(join(root, 'public', rel))) (L.status === 'approved' || L.status === 'published' ? E : W)(`asset not found: public/${rel} (shown to learners as “audio being prepared”)`);
    }
  }

  const taskIds = new Set();
  for (const t of L.tasks) {
    const at = `${t.id}`;
    if (taskIds.has(t.id)) E(`duplicate task id ${t.id}`);
    taskIds.add(t.id);
    if (!t.id.startsWith(L.id + '-')) E(`${at}: task id must start with ${L.id}-`);
    if (t.sectionId && !sectionIds.has(t.sectionId)) E(`${at}: sectionId ${t.sectionId} does not exist`);
    const opts = t.options ?? [];
    const optIds = new Set(opts.map((o) => o.id));
    if (optIds.size !== opts.length) E(`${at}: duplicate option ids`);
    if (CHOICE.has(t.responseType) && opts.length < 2) E(`${at}: ${t.responseType} needs at least 2 options`);
    const sc = t.scoring;
    for (const id of sc.correctOptionIds ?? []) if (!optIds.has(id)) E(`${at}: correctOptionIds contains unknown option ${id}`);
    for (const id of sc.evidenceSpanIds ?? []) if (!spans.has(id)) E(`${at}: evidenceSpanIds contains unknown span ${id}`);
    if (sc.mode === 'auto') {
      const n = sc.correctOptionIds?.length ?? 0;
      if (t.responseType === 'single_choice' && n !== 1) E(`${at}: auto single_choice needs exactly 1 correctOptionId`);
      if (t.responseType === 'multiple_choice' && n < 1) E(`${at}: auto multiple_choice needs correctOptionIds`);
      if (t.responseType === 'ordering' && n !== opts.length) E(`${at}: auto ordering needs correctOptionIds listing every option in order`);
      if ((t.responseType === 'short_text' || t.responseType === 'gap_fill') && !sc.acceptedAnswers?.length) E(`${at}: auto ${t.responseType} needs acceptedAnswers`);
      if (t.responseType === 'gap_fill') {
        const blanks = (t.prompt.match(BLANK) ?? []).length;
        if (!blanks) E(`${at}: gap_fill prompt has no blank (use ___)`);
        for (const a of sc.acceptedAnswers ?? []) if (a.split('|').length !== blanks) E(`${at}: accepted answer “${a}” has ${a.split('|').length} part(s) for ${blanks} blank(s) — separate parts with |`);
      }
      if (['long_text', 'audio_recording', 'self_reflection'].includes(t.responseType)) E(`${at}: ${t.responseType} cannot be auto-scored`);
      if (t.responseType === 'matching') E(`${at}: auto matching has no key structure in contract v1.0 — use formative or agree v1.1`);
    }
    if (sc.mode === 'rubric' && !sc.rubric) E(`${at}: rubric mode needs a rubric`);
    if (t.responseType === 'matching' && sc.acceptedAnswers?.length) {
      for (const a of sc.acceptedAnswers) {
        const m = a.match(/^\s*([^\s-]+)\s*-\s*([^\s-]+)\s*$/);
        if (!m) W(`${at}: matching answer “${a}” is not an "item-option" pair — rendered as a self-check`);
        else if (!optIds.has(m[2])) E(`${at}: matching answer “${a}” refers to unknown option ${m[2]}`);
      }
    }
    if (t.responseType === 'gap_fill' && sc.mode !== 'auto' && sc.acceptedAnswers?.length) {
      const blanks = (t.prompt.match(BLANK) ?? []).length;
      const perBlank = sc.acceptedAnswers.length === blanks && sc.acceptedAnswers.every((a) => !a.includes('|'));
      const fullSets = sc.acceptedAnswers.every((a) => a.split('|').length === blanks);
      if (!perBlank && !fullSets) W(`${at}: gap_fill answers match neither one-per-blank (${blanks}) nor "a|b|c" full sets`);
    }
    if (sc.mode === 'formative' && sc.maxPoints !== 0) W(`${at}: formative task with maxPoints ${sc.maxPoints}`);
  }
  for (const t of L.tasks) for (const d of t.dependencies) {
    if (d === t.id) E(`${t.id}: depends on itself`);
    else if (!taskIds.has(d) && !sectionIds.has(d)) E(`${t.id}: dependency ${d} is not a task or section id`);
  }
  // dependency cycles
  const deps = new Map(L.tasks.map((t) => [t.id, t.dependencies.filter((d) => taskIds.has(d))]));
  const seen = new Map();
  const visit = (id) => { if (seen.get(id) === 1) return true; if (seen.get(id) === 2) return false; seen.set(id, 1); const c = deps.get(id).some(visit); seen.set(id, 2); return c; };
  for (const id of taskIds) if (visit(id)) { E(`dependency cycle involving ${id}`); break; }

  const uiPath = join(root, 'content/courses', courseId, 'lesson-ui', `${L.id}.json`);
  if (inContent && existsSync(uiPath)) {
    const ui = JSON.parse(readFileSync(uiPath, 'utf8'));
    for (const tid of Object.keys(ui.tasks ?? {})) if (!taskIds.has(tid)) E(`lesson-ui/${L.id}.json: unknown task ${tid}`);
  }
  const q = L.quality;
  const publishable = (L.status === 'approved' || L.status === 'published') && q.editorialApproved && q.answerKeyVerified && q.audioReviewed;
  if ((L.status === 'approved' || L.status === 'published') && !publishable) E(`status ${L.status} but QA flags are not all true — will not be published`);
  const pilot = !publishable && inContent && (course.pilotLessons ?? []).includes(L.id);
  console.log(`  ${publishable ? '✓ publishable' : pilot ? '◆ PILOT (owner-approved draft, decision 0005)' : `· not published (status ${L.status})`} · ${L.sections.length} sections · ${L.tasks.length} tasks`);
}
}
console.log(`\n${courseIds.length} course(s), ${fileCount} lesson file(s), ${errors} error(s), ${warnings} warning(s)`);
process.exit(errors ? 1 : 0);
