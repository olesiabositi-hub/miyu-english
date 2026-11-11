/**
 * Speaking practice recorder.
 * - one or more labelled segments, each with an optional time target (guidance only — nothing stops or scores)
 * - optional unseen follow-up question with a start window (shown as a countdown; recording is never forced)
 * - recordings saved in this browser (IndexedDB) so they survive a reload; download / delete per segment
 * - a written alternative when the microphone is unavailable — clearly not speaking evidence
 */
import { esc, icon, feedback } from '../ui';
import { saveClip, getClip, deleteClip, persistentStorage, type Clip } from '../../lib/recordings';

export interface SpeakingOpts {
  /** unique key prefix for stored clips, e.g. english:D001:D001-T13 */
  storeKey: string;
  fileStem: string;
  segments: { label: string; targetSeconds?: number }[];
  followUps?: string[];
  startWithinSeconds?: number;
  minSeconds?: number;
  maxSeconds?: number;
  /** persisted scratch state (revealed question, reveal time) */
  state: { question?: string; revealedAt?: number };
  saveState(v: { question?: string; revealedAt?: number }): void;
  submitted: boolean;
  /** practice only (pronunciation section): no submit button */
  practiceOnly?: boolean;
  lang: string;
  initialText?: string;
  onSubmit?(r: { via: 'audio' | 'text'; text?: string; durations: (number | null)[]; latencySec?: number }): void;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export function mountSpeaking(host: HTMLElement, o: SpeakingOpts): () => void {
  const clips: (Clip | undefined)[] = o.segments.map(() => undefined);
  const urls: (string | undefined)[] = o.segments.map(() => undefined);
  let recording = -1;
  let startedAt = 0;
  let latencySec: number | undefined;
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let tick: number | undefined;
  let error = '';
  let mode: 'audio' | 'text' = 'audio';
  let text = o.initialText ?? '';
  let submitted = o.submitted;
  let persistent = true;
  const canRecord = typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  const key = (i: number) => `${o.storeKey}:${i}`;

  const total = () => clips.reduce((n, c) => n + (c?.durationSec ?? 0), 0);
  const allRecorded = () => clips.every(Boolean);

  function windowLeft(): number | null {
    if (!o.state.revealedAt || !o.startWithinSeconds) return null;
    return o.startWithinSeconds - (Date.now() - o.state.revealedAt) / 1000;
  }

  function targetNote(i: number, sec: number): string {
    const t = o.segments[i].targetSeconds;
    if (t) return ` · target ${fmt(t)}${sec > t * 1.15 ? ' — over target' : sec >= t * 0.85 ? ' — on target' : ''}`;
    return '';
  }

  function draw() {
    const needsQuestion = !!o.followUps?.length;
    const revealed = !!o.state.question;
    let questionHtml = '';
    if (needsQuestion) {
      if (!revealed) {
        questionHtml = `<div class="speak-q"><p>Your follow-up question is hidden until you are ready.${o.startWithinSeconds ? ` After you reveal it, try to start speaking within ${o.startWithinSeconds} seconds.` : ''}</p>
          <button class="btn btn--ink" type="button" data-reveal-q>I’m ready — show my question</button></div>`;
      } else {
        const left = windowLeft();
        const lat = latencySec != null ? `Started after ${Math.round(latencySec)} s${o.startWithinSeconds ? (latencySec <= o.startWithinSeconds ? ' — within the target' : ` — later than the ${o.startWithinSeconds} s target`) : ''}.` : '';
        questionHtml = `<div class="speak-q speak-q--open" lang="${esc(o.lang)}"><span class="eyebrow">Your follow-up question</span><p class="display speak-q__text">${esc(o.state.question!)}</p>
          <p class="muted-sm" data-window aria-live="polite">${lat || (left != null && recording < 0 && !clips[0] ? (left > 0 ? `Start within ${Math.ceil(left)} s` : 'The start window has passed — start when you can.') : '')}</p></div>`;
      }
    }
    const segs = o.segments.map((sg, i) => {
      const c = clips[i];
      const isRec = recording === i;
      const disabled = (needsQuestion && !revealed) || (recording >= 0 && !isRec) || !canRecord;
      return `<li class="seg ${c ? 'is-done' : ''} ${isRec ? 'is-rec' : ''}">
        <div class="seg__head"><span class="seg__n">${i + 1}</span><span class="seg__label">${esc(sg.label)}</span>${sg.targetSeconds ? `<span class="seg__target">target ${fmt(sg.targetSeconds)}</span>` : ''}</div>
        ${isRec ? `<div class="or__bar" aria-live="polite"><span class="rec-dot" aria-hidden="true"></span><span data-elapsed>0:00</span><button class="btn btn--ink" type="button" data-stop>${icon.stop} Stop</button></div>`
        : c ? `<audio controls src="${urls[i]}"></audio>
            <div class="seg__meta"><span class="muted-sm">${fmt(c.durationSec)}${targetNote(i, c.durationSec)}</span>
            <span class="seg__btns"><button class="chip" type="button" data-rec="${i}" ${disabled ? 'disabled' : ''}>Record again</button><a class="chip" href="${urls[i]}" download="${esc(o.fileStem)}-${i + 1}.${c.mime.includes('mp4') ? 'm4a' : 'webm'}">Download</a><button class="chip" type="button" data-del="${i}">Delete</button></span></div>`
        : `<button class="btn btn--ghost" type="button" data-rec="${i}" ${disabled ? 'disabled' : ''}>${icon.mic} Record</button>`}
      </li>`;
    }).join('');
    const totalLine = (o.minSeconds || o.maxSeconds) && clips.some(Boolean)
      ? `<p class="muted-sm">Total speaking time ${fmt(total())}${o.minSeconds && o.maxSeconds ? ` · target ${fmt(o.minSeconds)}–${fmt(o.maxSeconds)}` : ''}${o.minSeconds && total() < o.minSeconds ? ' — shorter than the target' : o.maxSeconds && total() > o.maxSeconds ? ' — longer than the target' : ''}</p>` : '';

    const audioBody = canRecord
      ? `${questionHtml}<ol class="segs">${segs}</ol>${totalLine}${error ? feedback('err', esc(error)) : ''}
         ${o.practiceOnly ? '' : `<div class="or__bar"><span class="muted-sm">${allRecorded() ? 'All parts recorded.' : `Record ${o.segments.length > 1 ? 'every part' : 'your answer'} to submit.`}</span><button class="btn btn--ink" type="button" data-submit ${allRecorded() && recording < 0 ? '' : 'aria-disabled="true"'}>${submitted ? 'Update submission' : 'Submit recording'}</button></div>`}`
      : `${questionHtml}${feedback('info', 'Recording is not available in this browser. You can write what you would say instead.')}`;

    const textBody = `${questionHtml}${feedback('info', 'Written practice: this helps you plan, but it is not evidence of speaking, timing or pronunciation.')}
      <label class="sr-only" for="${esc(o.fileStem)}-txt">What you would say</label>
      <textarea id="${esc(o.fileStem)}-txt" rows="6" lang="${esc(o.lang)}" spellcheck="false" placeholder="Write what you would say…">${esc(text)}</textarea>
      ${o.practiceOnly ? '' : `<div class="or__bar"><span></span><button class="btn btn--ink" type="button" data-submit-text ${text.trim() ? '' : 'aria-disabled="true"'}>${submitted ? 'Update' : 'Submit written version'}</button></div>`}`;

    host.innerHTML = `<div class="speak">
      <p class="muted-sm speak__note">${icon.info}<span>${persistent ? 'Recordings are saved only in this browser on this device — nothing is uploaded or scored automatically. Download a copy to keep it.' : 'This browser cannot save recordings: they will be lost when you leave the page. Download a copy to keep it.'}${o.startWithinSeconds || o.minSeconds || o.segments.some((s) => s.targetSeconds) ? ' Timings are shown for your own reference.' : ''}</span></p>
      ${mode === 'audio' && canRecord ? audioBody : canRecord ? textBody : audioBody + textBody.replace(questionHtml, '')}
      ${canRecord && recording < 0 ? `<button class="text-btn" type="button" data-mode="${mode === 'audio' ? 'text' : 'audio'}">${mode === 'audio' ? 'Can’t record right now? Write it instead' : 'Back to recording'}</button>` : ''}
    </div>`;
  }

  async function startRec(i: number) {
    error = '';
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = [];
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        const dur = (Date.now() - startedAt) / 1000;
        const mime = recorder?.mimeType || 'audio/webm';
        const clip: Clip = { blob: new Blob(chunks, { type: mime }), mime, durationSec: dur, savedAt: Date.now() };
        stream?.getTracks().forEach((t) => t.stop()); stream = null;
        if (tick) clearInterval(tick);
        clips[i] = clip;
        if (urls[i]) URL.revokeObjectURL(urls[i]!);
        urls[i] = URL.createObjectURL(clip.blob);
        recording = -1;
        await saveClip(key(i), clip);
        draw();
        host.querySelector<HTMLElement>(`[data-rec="${i}"]`)?.focus();
      };
      if (o.followUps?.length && i === 0 && o.state.revealedAt && latencySec == null) latencySec = (Date.now() - o.state.revealedAt) / 1000;
      recorder.start();
      recording = i; startedAt = Date.now();
      draw();
      host.querySelector<HTMLElement>('[data-stop]')?.focus();
      tick = window.setInterval(() => { const e = host.querySelector('[data-elapsed]'); if (e) e.textContent = fmt((Date.now() - startedAt) / 1000) + (o.segments[i].targetSeconds ? ` / ${fmt(o.segments[i].targetSeconds!)}` : ''); }, 250);
    } catch (err) {
      stream?.getTracks().forEach((t) => t.stop()); stream = null;
      error = (err as DOMException)?.name === 'NotAllowedError' ? 'Microphone access was blocked. Allow it in your browser settings, or write it instead.' : 'We couldn’t start the recording. Check your microphone, or write it instead.';
      draw();
    }
  }

  const windowTick = window.setInterval(() => {
    const w = host.querySelector('[data-window]');
    const left = windowLeft();
    if (w && left != null && recording < 0 && !clips[0] && latencySec == null) w.textContent = left > 0 ? `Start within ${Math.ceil(left)} s` : 'The start window has passed — start when you can.';
  }, 500);

  const onClick = async (e: Event) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-reveal-q]')) {
      const q = o.followUps![Math.floor(Math.random() * o.followUps!.length)];
      o.state = { question: q, revealedAt: Date.now() };
      o.saveState(o.state);
      draw();
      host.querySelector<HTMLElement>('[data-rec="0"]')?.focus();
      return;
    }
    const r = t.closest<HTMLElement>('[data-rec]');
    if (r && !(r as HTMLButtonElement).disabled && recording < 0) { void startRec(Number(r.dataset.rec)); return; }
    if (t.closest('[data-stop]')) { recorder?.stop(); return; }
    const d = t.closest<HTMLElement>('[data-del]');
    if (d) { const i = Number(d.dataset.del); await deleteClip(key(i)); clips[i] = undefined; if (urls[i]) URL.revokeObjectURL(urls[i]!); urls[i] = undefined; draw(); return; }
    const m = t.closest<HTMLElement>('[data-mode]');
    if (m) { mode = m.dataset.mode as 'audio' | 'text'; draw(); host.querySelector<HTMLElement>('textarea, [data-rec="0"], [data-reveal-q]')?.focus(); return; }
    const s = t.closest<HTMLElement>('[data-submit]');
    if (s && s.getAttribute('aria-disabled') !== 'true') { submitted = true; o.onSubmit?.({ via: 'audio', durations: clips.map((c) => (c ? Math.round(c.durationSec) : null)), latencySec: latencySec != null ? Math.round(latencySec) : undefined }); return; }
    const st = t.closest<HTMLElement>('[data-submit-text]');
    if (st && st.getAttribute('aria-disabled') !== 'true') { submitted = true; o.onSubmit?.({ via: 'text', text, durations: [] }); }
  };
  const onInput = (e: Event) => {
    const ta = e.target as HTMLTextAreaElement;
    if (ta.tagName !== 'TEXTAREA') return;
    text = ta.value;
    const b = host.querySelector('[data-submit-text]');
    if (b) text.trim() ? b.removeAttribute('aria-disabled') : b.setAttribute('aria-disabled', 'true');
  };
  host.addEventListener('click', onClick);
  host.addEventListener('input', onInput);
  draw();
  void (async () => {
    persistent = await persistentStorage();
    for (let i = 0; i < o.segments.length; i++) {
      const c = await getClip(key(i));
      if (c) { clips[i] = c; urls[i] = URL.createObjectURL(c.blob); }
    }
    draw();
  })();
  return () => {
    host.removeEventListener('click', onClick);
    host.removeEventListener('input', onInput);
    clearInterval(windowTick);
    if (tick) clearInterval(tick);
    if (recorder?.state === 'recording') recorder.stop();
    stream?.getTracks().forEach((t) => t.stop());
    urls.forEach((u) => u && URL.revokeObjectURL(u));
  };
}
