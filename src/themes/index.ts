/**
 * Theme registry. course.json → "theme" selects one entry.
 * The CSS tokens live in src/themes/<id>.css (selector [data-theme='<id>']).
 */
export interface Theme { id: string; label: string; fontsHref: string }
export const THEMES: Record<string, Theme> = {
  'grand-academy': {
    id: 'grand-academy',
    label: 'The Grand Academy',
    fontsHref: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Inter:wght@400;500;600&display=swap',
  },
};

/** Applies a course theme to the document: data-theme + its web fonts (once). */
export function applyTheme(id: string): void {
  const theme = THEMES[id] ?? THEMES['grand-academy'];
  document.documentElement.dataset.theme = theme.id;
  if (![...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].some((l) => l.href === theme.fontsHref)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = theme.fontsHref;
    document.head.appendChild(link);
  }
}
