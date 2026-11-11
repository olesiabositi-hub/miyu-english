import { esc } from '../ui';

/**
 * Section `content` / `transcript` are plain strings in contract v1.0. We render a small,
 * safe Markdown subset (proposed convention, docs/lesson-renderer.md): blank line = paragraph,
 * "- " list items, "## " heading, **bold**, *italic*. Everything is HTML-escaped first.
 */
export function richInline(s: string): string { return inline(s); }
function inline(s: string): string {
  return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>');
}
export function richText(src: string): string {
  return src.trim().split(/\n\s*\n/).map((block) => {
    const lines = block.split('\n');
    if (lines.every((l) => /^\s*[-•]\s+/.test(l))) return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-•]\s+/, ''))}</li>`).join('')}</ul>`;
    if (/^#{2,3}\s/.test(lines[0])) return `<h3>${inline(lines[0].replace(/^#+\s/, ''))}</h3>${lines.length > 1 ? `<p>${lines.slice(1).map(inline).join('<br>')}</p>` : ''}`;
    return `<p>${lines.map(inline).join('<br>')}</p>`;
  }).join('');
}

/** Wraps the first occurrence of each evidence text in <mark class="evidence">. Works inside a single text node. */
export function highlightEvidence(root: HTMLElement, spans: { id: string; text: string }[]): number {
  let found = 0;
  for (const sp of spans) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const i = node.textContent?.indexOf(sp.text) ?? -1;
      if (i < 0) continue;
      const range = document.createRange();
      range.setStart(node, i);
      range.setEnd(node, i + sp.text.length);
      const mark = document.createElement('mark');
      mark.className = 'evidence';
      mark.dataset.span = sp.id;
      range.surroundContents(mark);
      found++;
      break;
    }
  }
  return found;
}
export function clearEvidence(root: HTMLElement) {
  root.querySelectorAll('mark.evidence').forEach((m) => m.replaceWith(...Array.from(m.childNodes)));
  root.normalize();
}
