import { esc, icon, feedback } from './ui';
import { paletteHtml, wirePalette } from './lesson/char-palette';

export interface OpenOpts {
  id: string;
  mode: 'write' | 'speak';
  initialText?: string;
  submitted?: boolean;
  minWords?: number;
  /** optional guidance only — recording never stops on its own */
  targetSeconds?: number;
  allowSwitch?: boolean;
  submitLabel?: string;
  onDraft?: (text: string) => void;
  /** language/direction of the learner's answer (course target language) */
  lang?: string;
  languageName?: string;
  dir?: 'ltr' | 'rtl';
  specialCharacters?: string[];
  onSubmit: (value: string, via: 'text' | 'audio') => void;
}

const words = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

/**
 * Free response: writing (with draft autosave) or speaking (microphone, kept on this device).
 * Speaking always offers a text alternative. Recordings are not uploaded anywhere.
 */
export function mountOpenResponse(root: HTMLElement, o: OpenOpts): () => void {
  let mode = o.mode;
  let text = o.initialText ?? '';
  let submitted = !!o.submitted;
  let rec: 'idle' | 'asking' | 'recording' | 'recorded' | 'error' = 'idle';
  let recError = '';
  let audioUrl = '';
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let started = 0;
  let tick: number | undefined;
  let draftTimer: number | undefined;
  const uid = 'or-' + o.id.replace(/[^\w-]/g, '');
  const countLabel = (n: number) => `${n} ${n === 1 ? 'word' : 'words'}${o.minWords ? ` · aim for ${o.minWords}+` : ''}${o.onDraft ? ' · draft saved automatically' : ''}`;

  function stopStream() { stream?.getTracks().forEach((t) => t.stop()); stream = null; if (tick) clearInterval(tick); }

  function draw() {
    let body: string;
    if (mode === 'write') {
      const n = words(text);
      body = `<label class="sr-only" for="${uid}">Your answer</label>${paletteHtml(o.specialCharacters, o.lang ?? 'en')}
        <textarea id="${uid}" rows="5" ${o.lang ? `lang="${esc(o.lang)}"` : ''} ${o.dir ? `dir="${o.dir}"` : ''} spellcheck="false" placeholder="${o.languageName ? `Write your answer in ${esc(o.languageName)}…` : 'Write your answer…'}" aria-describedby="${uid}-wc">${esc(text)}</textarea>
        <div class="or__bar"><span id="${uid}-wc" class="muted-sm">${countLabel(n)}</span>
        <button class="btn btn--ink" type="button" data-or-save ${n === 0 ? 'aria-disabled="true"' : ''}>${submitted ? 'Update answer' : o.submitLabel ?? 'Submit'}</button></div>`;
    } else {
      const target = o.targetSeconds ? `<span class="muted-sm">Aim for about ${o.targetSeconds} seconds — no countdown, take your time.</span>` : '';
      if (rec === 'idle' || rec === 'asking') body = `<p class="muted-sm">Your recording stays on this device and is not uploaded. You’ll be asked for microphone access.</p>
          <div class="or__bar">${target}<button class="btn btn--ink" type="button" data-or-rec ${rec === 'asking' ? 'aria-disabled="true"' : ''}>${icon.mic} Record</button></div>`;
      else if (rec === 'recording') body = `<div class="or__bar" aria-live="polite"><span class="rec-dot" aria-hidden="true"></span><span data-elapsed>0 s</span>${target}<button class="btn btn--ink" type="button" data-or-stop>${icon.stop} Stop</button></div>`;
      else if (rec === 'recorded') body = `<audio controls src="${audioUrl}"></audio>
          <div class="or__bar"><button class="btn btn--ghost" type="button" data-or-rec>Record again</button><button class="btn btn--ink" type="button" data-or-save>${submitted ? 'Submitted ✓' : o.submitLabel ?? 'Submit recording'}</button></div>`;
      else body = feedback('err', esc(recError)) + `<div class="or__bar"><button class="btn btn--ghost" type="button" data-or-rec>Try again</button><button class="btn btn--ink" type="button" data-or-switch="write">Type instead</button></div>`;
    }
    const sw = (o.allowSwitch ?? true) && rec !== 'recording'
      ? `<button class="text-btn" type="button" data-or-switch="${mode === 'write' ? 'speak' : 'write'}">${mode === 'write' ? 'Prefer to speak? Record instead' : 'Type instead'}</button>` : '';
    root.innerHTML = `<div class="or">${body}${sw}</div>`;
  }

  async function startRec() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { rec = 'error'; recError = 'Recording is not supported in this browser. You can type your answer instead.'; draw(); return; }
    rec = 'asking'; draw();
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = [];
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        audioUrl = URL.createObjectURL(new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' }));
        stopStream(); rec = 'recorded'; draw();
        root.querySelector<HTMLElement>('[data-or-save]')?.focus();
      };
      recorder.start();
      rec = 'recording'; started = Date.now(); draw();
      root.querySelector<HTMLElement>('[data-or-stop]')?.focus();
      tick = window.setInterval(() => { const e = root.querySelector('[data-elapsed]'); if (e) e.textContent = `${Math.round((Date.now() - started) / 1000)} s`; }, 500);
    } catch (err) {
      stopStream(); rec = 'error';
      recError = (err as DOMException)?.name === 'NotAllowedError' ? 'Microphone access was blocked. Allow it in your browser settings, or type your answer instead.' : 'We couldn’t start the recording. Check your microphone, or type your answer instead.';
      draw();
    }
  }

  const onClick = (e: Event) => {
    const t = e.target as HTMLElement;
    const sw = t.closest<HTMLElement>('[data-or-switch]');
    if (sw) { if (recorder?.state === 'recording') recorder.stop(); stopStream(); mode = sw.dataset.orSwitch as 'write' | 'speak'; rec = 'idle'; draw(); root.querySelector<HTMLElement>('textarea, [data-or-rec]')?.focus(); return; }
    if (t.closest('[data-or-rec]') && rec !== 'asking') { void startRec(); return; }
    if (t.closest('[data-or-stop]')) { recorder?.stop(); return; }
    const sv = t.closest<HTMLElement>('[data-or-save]');
    if (sv && sv.getAttribute('aria-disabled') !== 'true') {
      submitted = true;
      if (mode === 'write') o.onSubmit(text, 'text'); else o.onSubmit('[recording kept on this device]', 'audio');
    }
  };
  const onInput = (e: Event) => {
    const ta = e.target as HTMLTextAreaElement;
    if (ta.tagName !== 'TEXTAREA') return;
    text = ta.value;
    const wc = root.querySelector(`#${uid}-wc`);
    if (wc) wc.textContent = countLabel(words(text));
    const btn = root.querySelector('[data-or-save]');
    if (btn) words(text) ? btn.removeAttribute('aria-disabled') : btn.setAttribute('aria-disabled', 'true');
    if (o.onDraft) { clearTimeout(draftTimer); draftTimer = window.setTimeout(() => o.onDraft!(text), 400); }
  };
  root.addEventListener('click', onClick);
  root.addEventListener('input', onInput);
  const unwire = o.specialCharacters?.length ? wirePalette(root) : () => {};
  draw();
  return () => {
    root.removeEventListener('click', onClick);
    root.removeEventListener('input', onInput);
    unwire();
    if (recorder?.state === 'recording') recorder.stop();
    stopStream();
    if (o.onDraft && draftTimer) { clearTimeout(draftTimer); o.onDraft(text); }
  };
}
