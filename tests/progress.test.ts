// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { load, update, reset, loadProfile, saveProfile, __resetMemory } from '../src/lib/progress';

describe('progress is stored per course', () => {
  beforeEach(() => { localStorage.clear(); __resetMemory(); });
  it('writes to miyu:<courseId>:progress:v1 and keeps courses apart', () => {
    update((s) => { s.diagnostic = 'skipped'; }); // active course = default (english)
    expect(JSON.parse(localStorage.getItem('miyu:english:progress:v1')!).diagnostic).toBe('skipped');
    expect(load('greek').diagnostic).toBe('none');
    expect(load('greek').courseId).toBe('greek');
  });
  it('reset clears only the active course; the profile is shared', () => {
    saveProfile({ name: 'Olesia' });
    update((s) => { s.daily['2026-11-11'] = 15; });
    reset();
    expect(load().daily).toEqual({});
    expect(loadProfile().name).toBe('Olesia');
  });
  it('migrates progress saved by the first single-course build', () => {
    localStorage.setItem('miyu-english:v2', JSON.stringify({ version: 2, diagnostic: 'done', lessons: {}, review: [], daily: {} }));
    expect(load('english').diagnostic).toBe('done');
    expect(load('english').courseId).toBe('english');
  });
});
