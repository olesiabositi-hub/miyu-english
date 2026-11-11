import type { ResponseType } from './contract';

/** Text normalisation shared by the build (hashing keys) and the browser (hashing responses). */
export function normalise(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?,;:]+$/, '')
    .trim();
}

/** Blanks in a gap_fill prompt: three or more underscores. */
export const BLANK = /_{3,}/g;
export const blankCount = (prompt: string) => (prompt.match(BLANK) ?? []).length;
/** Separator for multi-blank answers — proposed convention, see docs/lesson-renderer.md §Open questions. */
export const GAP_SEPARATOR = ' | ';

export type Response = string | string[];

/**
 * Canonical string that is hashed for comparison.
 * - single_choice: the option id            (any of keyHashes may match)
 * - multiple_choice: sorted ids joined by , (exact set)
 * - ordering: ids in learner order joined by , (exact sequence)
 * - short_text / gap_fill: normalised text   (any accepted answer)
 */
export function canonical(type: ResponseType, response: Response): string {
  switch (type) {
    case 'single_choice': return String(response);
    case 'multiple_choice': return [...(response as string[])].sort().join(',');
    case 'ordering': return (response as string[]).join(',');
    case 'gap_fill': return Array.isArray(response) ? response.map(normalise).join(GAP_SEPARATOR) : normalise(response);
    default: return normalise(String(response));
  }
}

/** Canonical strings for the stored key of a task (used at build time). */
export function keyCanonicals(type: ResponseType, correctOptionIds?: string[], acceptedAnswers?: string[]): string[] {
  if (type === 'single_choice') return correctOptionIds ?? [];
  if (type === 'multiple_choice') return correctOptionIds?.length ? [[...correctOptionIds].sort().join(',')] : [];
  if (type === 'ordering') return correctOptionIds?.length ? [correctOptionIds.join(',')] : [];
  if (type === 'gap_fill') return (acceptedAnswers ?? []).map((a) => a.split('|').map(normalise).join(GAP_SEPARATOR));
  if (type === 'short_text') return (acceptedAnswers ?? []).map(normalise);
  return [];
}

export const KEY_SALT = 'miyu-english/v1';
export const hashInput = (lessonId: string, taskId: string, canon: string) => `${KEY_SALT}|${lessonId}|${taskId}|${canon}`;

/** Browser-side SHA-256 → hex. */
export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
