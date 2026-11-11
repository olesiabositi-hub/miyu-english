import type { ResponseType } from './contract';

/** Per-course answer matching rules (course.json → answerMatching). */
export interface MatchRules { lang: string; caseSensitive: boolean; ignoreDiacritics: boolean; ignoreTrailingPunctuation: boolean }
export const DEFAULT_RULES: MatchRules = { lang: 'en', caseSensitive: false, ignoreDiacritics: false, ignoreTrailingPunctuation: true };

/**
 * Text normalisation shared by the build (hashing keys) and the browser (hashing responses).
 * Script-agnostic: NFC/NFKC, locale-aware lower-casing (e.g. Greek final sigma), optional accent folding.
 */
export function normalise(s: string, r: MatchRules = DEFAULT_RULES): string {
  let out = s
    .normalize('NFKC')
    .replace(/[’‘`´ʼ]/g, "'")
    .replace(/[“”«»„]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  if (!r.caseSensitive) out = out.toLocaleLowerCase(r.lang);
  if (r.ignoreDiacritics) out = out.normalize('NFD').replace(/\p{M}+/gu, '').normalize('NFC');
  if (r.ignoreTrailingPunctuation) out = out.replace(/[.!?,;:;·…]+$/u, '').trim();
  return out;
}

/** Blanks in a gap_fill prompt: three or more underscores. */
export const BLANK = /_{3,}/g;
export const blankCount = (prompt: string) => (prompt.match(BLANK) ?? []).length;
/** Separator for multi-blank answers — proposed convention, see docs/lesson-renderer.md §7. */
export const GAP_SEPARATOR = ' | ';

export type Response = string | string[];

/**
 * Canonical string that is hashed for comparison.
 * - single_choice: the option id            (any of keyHashes may match)
 * - multiple_choice: sorted ids joined by , (exact set)
 * - ordering: ids in learner order joined by , (exact sequence)
 * - short_text / gap_fill: normalised text   (any accepted answer)
 */
export function canonical(type: ResponseType, response: Response, r: MatchRules = DEFAULT_RULES): string {
  switch (type) {
    case 'single_choice': return String(response);
    case 'multiple_choice': return [...(response as string[])].sort().join(',');
    case 'ordering': return (response as string[]).join(',');
    case 'gap_fill': return Array.isArray(response) ? response.map((x) => normalise(x, r)).join(GAP_SEPARATOR) : normalise(response, r);
    default: return normalise(String(response), r);
  }
}

/** Canonical strings for the stored key of a task (used at build time). */
export function keyCanonicals(type: ResponseType, correctOptionIds?: string[], acceptedAnswers?: string[], r: MatchRules = DEFAULT_RULES): string[] {
  if (type === 'single_choice') return correctOptionIds ?? [];
  if (type === 'multiple_choice') return correctOptionIds?.length ? [[...correctOptionIds].sort().join(',')] : [];
  if (type === 'ordering') return correctOptionIds?.length ? [correctOptionIds.join(',')] : [];
  if (type === 'gap_fill') return (acceptedAnswers ?? []).map((a) => a.split('|').map((x) => normalise(x, r)).join(GAP_SEPARATOR));
  if (type === 'short_text') return (acceptedAnswers ?? []).map((a) => normalise(a, r));
  return [];
}

export const KEY_SALT = 'miyu-academy/v1';
export const hashInput = (courseId: string, lessonId: string, taskId: string, canon: string) => `${KEY_SALT}|${courseId}|${lessonId}|${taskId}|${canon}`;

/** Browser-side SHA-256 → hex. */
export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
