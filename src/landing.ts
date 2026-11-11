import { modules, pad2, esc, type Module } from './lib/curriculum';

/* Sticky header after the hero starts scrolling away */
const header = document.querySelector<HTMLElement>('[data-header]')!;
const mobileCta = document.querySelector<HTMLElement>('[data-mobile-cta]');
const onScroll = () => {
  const y = window.scrollY;
  header.classList.toggle('is-stuck', y > 80);
  mobileCta?.classList.toggle('is-visible', y > window.innerHeight * 0.8);
};
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

/* Mobile menu */
const menuBtn = document.querySelector<HTMLButtonElement>('[data-menu]')!;
const nav = document.querySelector<HTMLElement>('[data-nav]')!;
const setMenu = (open: boolean) => {
  nav.classList.toggle('is-open', open);
  menuBtn.setAttribute('aria-expanded', String(open));
  if (open) header.classList.add('is-stuck');
  else onScroll();
};
menuBtn.addEventListener('click', () => setMenu(!nav.classList.contains('is-open')));
nav.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('a')) setMenu(false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('is-open')) { setMenu(false); menuBtn.focus(); } });

/* Curriculum explorer: switch modules without reload */
const list = document.querySelector<HTMLOListElement>('[data-modules]')!;
const card = {
  eyebrow: document.querySelector<HTMLElement>('[data-mc-eyebrow]')!,
  title: document.querySelector<HTMLElement>('[data-mc-title]')!,
  skills: document.querySelector<HTMLElement>('[data-mc-skills]')!,
  lessons: document.querySelector<HTMLElement>('[data-mc-lessons]')!,
  preview: document.querySelector<HTMLAnchorElement>('[data-mc-preview]')!,
};

function lessonsHtml(m: Module): string {
  if (!m.lessons.length) return '<li class="muted">Lesson list will be published with the curriculum.</li>';
  return m.lessons.map((l) => `<li><span>${esc(l.title)}</span><span class="muted">Lesson ${l.number}</span></li>`).join('');
}
function skillsHtml(m: Module): string {
  return (m.skills ?? []).map((s) => `<span>${esc(s)}</span>`).join('');
}

let active = 0;
let panelOpen = true;
function render() {
  list.innerHTML = modules.map((m, i) => {
    const on = i === active && panelOpen;
    return `<li class="mod-item">
      <button class="mod-btn" type="button" aria-pressed="${on}" data-i="${i}">
        <span class="mod-btn__dot" aria-hidden="true"></span>
        <span class="mod-btn__num">${pad2(m.number)}</span>
        <span class="mod-btn__name">${esc(m.title)}</span>
      </button>
      ${on ? `<div class="mod-panel">
        <span>${m.days ? 'Days ' + esc(m.days) : 'Days and skills: with the curriculum'}</span>
        <span>${m.lessons.length ? m.lessons.map((l) => esc(l.title)).join(' · ') : 'Lesson list will be published with the curriculum.'}</span>
        <a class="link-arrow" href="${m.lessons.length ? `./learn/#/lesson/${m.lessons[0].id}` : './learn/#/lessons'}">Preview a Lesson →</a>
      </div>` : ''}
    </li>`;
  }).join('');
  const m = modules[active];
  card.eyebrow.textContent = `Module ${pad2(m.number)}${m.days ? ' · Days ' + m.days : ''}`;
  card.title.textContent = m.title;
  card.skills.innerHTML = skillsHtml(m);
  card.skills.hidden = !m.skills?.length;
  card.lessons.innerHTML = lessonsHtml(m);
  card.preview.href = m.lessons[0] ? `./learn/#/lesson/${m.lessons[0].id}` : './learn/#/lessons';
}
list.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.mod-btn');
  if (!btn) return;
  const i = Number(btn.dataset.i);
  const isMobile = window.matchMedia('(max-width: 760px)').matches;
  panelOpen = isMobile && i === active ? !panelOpen : true;
  active = i;
  render();
  list.querySelector<HTMLButtonElement>(`[data-i="${i}"]`)?.focus();
});
render();
