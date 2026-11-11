import type { PublicSection } from '../../lib/contract';
import { SECTION_LABEL } from '../../lib/lesson-model';
import { esc, icon, feedback } from '../ui';
import { richText, highlightEvidence, clearEvidence } from './rich-text';

export interface SectionCtl {
  /** highlight evidence spans after a task was submitted */
  showEvidence(spanIds: string[]): void;
  /** transcript may be shown once the learner has attempted a task (or played the audio) */
  unlockTranscript(): void;
  destroy(): void;
}

export function mountSection(host: HTMLElement, s: PublicSection, opts: { transcriptUnlocked: boolean; showHeading?: boolean }): SectionCtl {
  const isListening = s.type === 'listening' || !!s.audio?.length;
  const hasAudio = !!s.audio?.length;
  let transcriptOpen = false;
  let transcriptUnlocked = opts.transcriptUnlocked || !hasAudio;
  let rate = 1;
  let highlighted: string[] = [];

  const audioHtml = () => {
    if (!isListening) return '';
    if (!hasAudio) return `<div class="audio-missing">${icon.info}<div><strong>Audio is being prepared.</strong><span class="muted-sm">${s.transcript ? 'Use the transcript for now.' : 'This part will open when the recording is ready.'}</span></div></div>`;
    return `<div class="player card">
      ${s.audio!.map((src, i) => `<audio controls preload="metadata" src="${esc(src)}" data-audio="${i}"></audio>`).join('')}
      <div class="player__controls">
        <label class="speed">Speed <select data-rate>${[0.75, 0.9, 1, 1.1, 1.25].map((r) => `<option value="${r}" ${r === rate ? 'selected' : ''}>${r}×</option>`).join('')}</select></label>
        <button class="chip" type="button" data-back5>Back 5 s</button>
      </div>
    </div>`;
  };
  const transcriptHtml = () => {
    if (!s.transcript) return '';
    const btn = `<button class="chip" type="button" data-transcript aria-expanded="${transcriptOpen}" ${transcriptUnlocked ? '' : 'disabled'}>${transcriptOpen ? 'Hide transcript' : 'Show transcript'}</button>`;
    return `<div class="transcript-wrap">${btn}${transcriptUnlocked ? '' : '<span class="muted-sm">Available after your first listen or first answer.</span>'}
      ${transcriptOpen ? `<div class="transcript reading" data-selectable data-transcript-body>${richText(s.transcript)}</div>` : ''}</div>`;
  };

  function draw() {
    host.innerHTML = `
      ${opts.showHeading ? `<div class="section-head"><span class="eyebrow">${SECTION_LABEL[s.type]}</span><h2 class="display block__h">${esc(s.title)}</h2></div>` : ''}
      ${s.images?.map((src) => `<figure class="section-figure"><img src="${esc(src)}" alt="" loading="lazy"></figure>`).join('') ?? ''}
      ${s.missingAssets && !isListening ? feedback('info', 'Some media for this part is still being prepared.') : ''}
      ${s.content.trim() ? `<div class="reading" data-selectable data-content>${richText(s.content)}</div>` : ''}
      ${audioHtml()}
      ${transcriptHtml()}`;
    applyHighlights();
  }
  function applyHighlights() {
    const spans = (s.evidenceSpans ?? []).filter((e) => highlighted.includes(e.id));
    host.querySelectorAll<HTMLElement>('[data-content],[data-transcript-body]').forEach((el) => { clearEvidence(el); highlightEvidence(el, spans); });
  }

  const onClick = (e: Event) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-transcript]')) { transcriptOpen = !transcriptOpen; draw(); host.querySelector<HTMLElement>('[data-transcript]')?.focus(); }
    if (t.closest('[data-back5]')) host.querySelectorAll<HTMLAudioElement>('audio').forEach((a) => { if (!a.paused || a.currentTime > 0) a.currentTime = Math.max(0, a.currentTime - 5); });
    const seg = t.closest<HTMLElement>('[data-play-span]');
    if (seg) playSpan(seg.dataset.playSpan!);
  };
  const onChange = (e: Event) => {
    const sel = e.target as HTMLSelectElement;
    if (!sel.matches('[data-rate]')) return;
    rate = Number(sel.value);
    host.querySelectorAll<HTMLAudioElement>('audio').forEach((a) => (a.playbackRate = rate));
  };
  const onPlay = (e: Event) => {
    if ((e.target as HTMLElement).tagName !== 'AUDIO') return;
    (e.target as HTMLAudioElement).playbackRate = rate;
    if (!transcriptUnlocked) { transcriptUnlocked = true; const b = host.querySelector<HTMLButtonElement>('[data-transcript]'); if (b) { b.disabled = false; b.nextElementSibling?.remove(); } }
  };
  function playSpan(id: string) {
    const sp = s.evidenceSpans?.find((x) => x.id === id);
    const a = host.querySelector<HTMLAudioElement>('audio');
    if (!sp || sp.startSeconds == null || !a) return;
    a.currentTime = sp.startSeconds;
    void a.play();
    if (sp.endSeconds != null) {
      const stop = () => { if (a.currentTime >= sp.endSeconds!) { a.pause(); a.removeEventListener('timeupdate', stop); } };
      a.addEventListener('timeupdate', stop);
    }
  }
  host.addEventListener('click', onClick);
  host.addEventListener('change', onChange);
  host.addEventListener('play', onPlay, true);
  draw();

  return {
    showEvidence(ids) {
      highlighted = [...new Set([...highlighted, ...ids])];
      if (s.transcript && ids.some((id) => !s.content.includes(s.evidenceSpans?.find((e) => e.id === id)?.text ?? '\u0000'))) { transcriptUnlocked = true; transcriptOpen = true; }
      draw();
      host.querySelector('mark.evidence')?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    },
    unlockTranscript() { if (!transcriptUnlocked) { transcriptUnlocked = true; draw(); } },
    destroy() { host.removeEventListener('click', onClick); host.removeEventListener('change', onChange); host.removeEventListener('play', onPlay, true); host.querySelectorAll('audio').forEach((a) => a.pause()); },
  };
}

export const hasTimedSpan = (s: PublicSection | undefined, id: string) => !!s?.audio?.length && s.evidenceSpans?.some((e) => e.id === id && e.startSeconds != null);
