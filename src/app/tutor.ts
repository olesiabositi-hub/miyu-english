import { esc, icon } from './ui';
import { cfg } from '../lib/course';

/** “Explain in Russian” etc. — explanation language and target language come from course.json. */
function actions(): [string, string][] {
  const c = cfg();
  const code = c.explanationLanguages?.[0];
  let name = code ?? '';
  try { if (code) name = new Intl.DisplayNames([c.uiLanguage], { type: 'language' }).of(code) ?? code; } catch { /* keep code */ }
  return [
    ['Give me a hint', 'a nudge towards the answer — never the answer itself before your first try'],
    ...(code ? [[`Explain in ${name}`, `a short explanation of the selected part in ${name}, then back to ${c.targetLanguage.name}`] as [string, string]] : []),
    ['Show more examples', 'more natural examples of the same phrase or pattern'],
    ['Why is this wrong?', 'the rule behind the feedback on your last answer'],
    ['Practise this again', 'a fresh mini-task on the same point'],
  ];
}

interface Ctx { lessonTitle: string; stepTitle: string }
let ctx: Ctx | null = null;
let task: { number: number; prompt: string; attempted: boolean } | null = null;
let selection = '';
let reply = '';
let panel: HTMLElement;
let fab: HTMLButtonElement;


function draw() {
  panel.innerHTML = `
    <div class="tutor__head">
      <span class="tutor__name"><span class="tutor-badge" aria-hidden="true">${icon.spark}</span><span id="tutor-title">MIYU Tutor</span> <span class="tag tag--dark">In development</span></span>
      <button class="tutor__close" type="button" aria-label="Close MIYU Tutor" data-tutor-close>×</button>
    </div>
    ${ctx ? `<p class="tutor__ctx">${esc(ctx.lessonTitle)} · ${esc(ctx.stepTitle)}</p>` : '<p class="tutor__ctx">Open a lesson and highlight a sentence to ask about it.</p>'}
    ${task ? `<div class="tutor__sel"><span class="eyebrow">Task ${task.number}</span><span>${esc(task.prompt.length > 140 ? task.prompt.slice(0, 140) + '…' : task.prompt)}</span></div>` : ''}
    ${selection ? `<div class="tutor__sel"><span class="eyebrow">Selected</span><span>“${esc(selection)}”</span></div>` : ctx ? '<p class="tutor__tip">Tip: highlight a word or sentence in the lesson.</p>' : ''}
    ${reply ? `<div class="tutor__reply" role="status">${reply}</div>` : ''}
    <div class="tutor__actions">${actions().map(([a], i) => `<button class="tutor__chip" type="button" data-act="${i}">${a}</button>`).join('')}</div>
    <p class="tutor__foot">Hints never reveal the answer before your first try. AI feedback supports learning; it is not an official C1 assessment.</p>`;
}

function open() { panel.hidden = false; document.body.classList.add('tutor-open'); fab.setAttribute('aria-expanded', 'true'); draw(); panel.querySelector<HTMLElement>('[data-tutor-close]')?.focus(); }
function close() { panel.hidden = true; document.body.classList.remove('tutor-open'); fab.setAttribute('aria-expanded', 'false'); reply = ''; fab.focus(); }

export function initTutor() {
  panel = document.querySelector<HTMLElement>('[data-tutor]')!;
  fab = document.querySelector<HTMLButtonElement>('[data-tutor-open]')!;
  fab.setAttribute('aria-expanded', 'false');
  fab.addEventListener('click', () => (panel.hidden ? open() : close()));
  panel.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-tutor-close]')) close();
    const act = t.closest<HTMLElement>('[data-act]');
    if (act) {
      const [name, what] = actions()[Number(act.dataset.act)];
      reply = `<strong>${esc(name)}</strong><br>MIYU Tutor is still being connected. When it’s live, this button will give you ${esc(what)}${selection ? ' — about the part you selected' : ''}.`;
      draw();
      panel.querySelector<HTMLElement>(`[data-act="${act.dataset.act}"]`)?.focus();
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) close(); });
}
export function setTutorContext(c: Ctx | null) { ctx = c; task = null; selection = ''; reply = ''; if (panel && !panel.hidden) draw(); }
export function setTutorTask(t: { number: number; prompt: string; attempted: boolean }, openPanel = false) {
  const changed = task?.number !== t.number;
  task = t;
  if (changed) reply = '';
  if (openPanel && panel.hidden) open(); else if (!panel.hidden) draw();
}
export function setTutorSelection(text: string) { selection = text; reply = ''; if (!panel.hidden) draw(); }
