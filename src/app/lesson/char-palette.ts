import { esc } from '../ui';

/**
 * On-screen keys for letters a learner's keyboard may not have (e.g. Danish æ ø å, Greek tonos).
 * Configured per course: course.json → input.specialCharacters. Renders nothing when empty.
 */
export function paletteHtml(chars: string[] | undefined, lang: string): string {
  if (!chars?.length) return '';
  return `<div class="char-palette" role="group" aria-label="Special characters" lang="${esc(lang)}">${chars
    .map((c) => `<button type="button" class="char-key" data-char="${esc(c)}" aria-label="Insert ${esc(c)}">${esc(c)}</button>`).join('')}</div>`;
}

/** Wire palette buttons inside `root` to insert into the last focused text field in `root`. */
export function wirePalette(root: HTMLElement): () => void {
  let last: HTMLInputElement | HTMLTextAreaElement | null = null;
  const onFocus = (e: Event) => { const t = e.target as HTMLElement; if (t.matches('input[type="text"], input:not([type]), textarea')) last = t as HTMLInputElement; };
  const onDown = (e: Event) => { if ((e.target as HTMLElement).closest('[data-char]')) e.preventDefault(); }; // keep caret in the field
  const onClick = (e: Event) => {
    const k = (e.target as HTMLElement).closest<HTMLElement>('[data-char]');
    if (!k) return;
    const field = last && root.contains(last) && !last.readOnly ? last : root.querySelector<HTMLInputElement>('input:not([readonly]):not([type="radio"]):not([type="checkbox"]), textarea');
    if (!field) return;
    const ch = k.dataset.char!;
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? start;
    field.setRangeText(ch, start, end, 'end');
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.focus();
  };
  root.addEventListener('focusin', onFocus);
  root.addEventListener('mousedown', onDown);
  root.addEventListener('click', onClick);
  return () => { root.removeEventListener('focusin', onFocus); root.removeEventListener('mousedown', onDown); root.removeEventListener('click', onClick); };
}
