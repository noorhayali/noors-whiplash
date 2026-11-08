// Original procedural audio — every sound and the music loop are synthesized live
// with the Web Audio API, so there are no licensing concerns and nothing to download.
// Audio only starts after a user gesture (browser autoplay rules).

type SfxName = 'click' | 'join' | 'tick' | 'submit' | 'vote' | 'whoosh' | 'reveal' | 'score' | 'victory' | 'sweep' | 'buzz';

const PREF_KEY = 'comedyclash.audio';
let prefs = { volume: 0.7, muted: false, music: true };
try {
  Object.assign(prefs, JSON.parse(localStorage.getItem(PREF_KEY) || '{}'));
} catch {}

let ctx: AudioContext | null = null;
let master: GainNode;
let sfxBus: GainNode;
let musicBus: GainNode;
let noiseBuf: AudioBuffer;
const listeners = new Set<() => void>();

export const audioPrefs = () => prefs;
export const audioReady = () => !!ctx && ctx.state === 'running';
export function onAudioChange(f: () => void) {
  listeners.add(f);
  return () => listeners.delete(f);
}
const notify = () => {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  } catch {}
  listeners.forEach((f) => f());
};

/** Call from any click/tap handler. Safe to call repeatedly. */
export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    sfxBus = ctx.createGain();
    musicBus = ctx.createGain();
    sfxBus.connect(master);
    musicBus.connect(master);
    musicBus.gain.value = 0.32;
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    applyVolume();
  }
  if (ctx.state === 'suspended') ctx.resume().then(notify);
  notify();
}

function applyVolume() {
  if (!ctx) return;
  master.gain.setTargetAtTime(prefs.muted ? 0 : prefs.volume, ctx.currentTime, 0.05);
}
export function setVolume(v: number) {
  prefs.volume = Math.max(0, Math.min(1, v));
  applyVolume();
  notify();
}
export function setMuted(m: boolean) {
  prefs.muted = m;
  applyVolume();
  notify();
}
export function setMusicEnabled(on: boolean) {
  prefs.music = on;
  if (!on) stopMusic();
  else if (currentTheme) startMusic(currentTheme);
  notify();
}

// ---------- building blocks ----------
function tone(freq: number, t: number, dur: number, type: OscillatorType = 'square', vol = 0.2, bus = sfxBus, slideTo?: number) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(t: number, dur: number, vol = 0.2, filterFreq = 2000, type: BiquadFilterType = 'bandpass', bus = sfxBus, sweepTo?: number) {
  if (!ctx) return;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(filterFreq, t);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(bus);
  s.start(t);
  s.stop(t + dur + 0.05);
}

const N = (semi: number) => 261.63 * Math.pow(2, semi / 12); // semitones from middle C

export function sfx(name: SfxName) {
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime + 0.01;
  switch (name) {
    case 'click':
      tone(880, t, 0.06, 'square', 0.12, sfxBus, 1320);
      break;
    case 'join':
      [0, 4, 7, 12].forEach((s, i) => tone(N(s + 12), t + i * 0.07, 0.18, 'triangle', 0.22));
      tone(N(24), t + 0.28, 0.3, 'sine', 0.15);
      break;
    case 'tick':
      noise(t, 0.05, 0.4, 3000, 'bandpass');
      tone(1200, t, 0.04, 'sine', 0.15);
      break;
    case 'submit':
      noise(t, 0.25, 0.25, 600, 'bandpass', sfxBus, 5000);
      tone(N(19), t + 0.18, 0.4, 'sine', 0.25);
      tone(N(24), t + 0.24, 0.5, 'sine', 0.18);
      break;
    case 'vote':
      tone(300, t, 0.12, 'sine', 0.35, sfxBus, 900);
      noise(t, 0.04, 0.3, 4000, 'highpass');
      break;
    case 'whoosh':
      noise(t, 0.45, 0.35, 300, 'bandpass', sfxBus, 6000);
      break;
    case 'reveal': {
      // snare roll into a crash
      for (let i = 0; i < 14; i++) noise(t + i * 0.05, 0.06, 0.08 + i * 0.015, 1800, 'bandpass');
      noise(t + 0.72, 1.2, 0.35, 8000, 'highpass');
      tone(N(-12), t + 0.72, 0.5, 'sawtooth', 0.12);
      break;
    }
    case 'score':
      [0, 4, 7, 11, 14, 19].forEach((s, i) => tone(N(s + 12), t + i * 0.05, 0.12, 'square', 0.1));
      break;
    case 'sweep':
      [0, 7, 12, 16, 19, 24].forEach((s, i) => tone(N(s + 7), t + i * 0.06, 0.3, 'sawtooth', 0.09));
      noise(t + 0.36, 0.8, 0.25, 9000, 'highpass');
      break;
    case 'buzz':
      tone(110, t, 0.5, 'sawtooth', 0.2);
      tone(116, t, 0.5, 'sawtooth', 0.2);
      break;
    case 'victory': {
      const melody: [number, number, number][] = [
        [7, 0, 0.15], [7, 0.15, 0.15], [7, 0.3, 0.15], [12, 0.45, 0.6],
        [10, 1.05, 0.25], [12, 1.3, 0.25], [16, 1.55, 0.25], [19, 1.8, 0.9],
      ];
      melody.forEach(([s, at, d]) => {
        tone(N(s), t + at, d, 'square', 0.13);
        tone(N(s - 12), t + at, d, 'triangle', 0.15);
      });
      [0, 4, 7, 12].forEach((s) => tone(N(s - 12), t + 1.8, 1.4, 'sawtooth', 0.05));
      noise(t + 1.8, 1.5, 0.3, 9000, 'highpass');
      break;
    }
  }
}

// ---------- music: a tiny step sequencer ----------
export type MusicTheme = 'menu' | 'round1' | 'round2' | 'round3' | 'final' | 'tense';
let currentTheme: MusicTheme | null = null;
let seqTimer: number | null = null;
let step = 0;
let nextTime = 0;

const THEMES: Record<MusicTheme, { bpm: number; root: number; prog: number[][]; bass: number[]; lead?: number[] }> = {
  // chords as semitone offsets; bass pattern indexes into chord root (-1 = rest)
  menu: { bpm: 116, root: -5, prog: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [5, 9, 12]], bass: [0, -1, 0, 12, -1, 0, 7, -1], lead: [12, -1, 16, 14, -1, 12, 9, -1, 7, -1, 9, 12, -1, -1, 14, -1] },
  round1: { bpm: 112, root: -3, prog: [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17]], bass: [0, -1, 12, -1, 0, 0, -1, 7] },
  round2: { bpm: 124, root: -1, prog: [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]], bass: [0, 0, -1, 12, 0, -1, 7, 10] },
  round3: { bpm: 132, root: -7, prog: [[0, 3, 7], [5, 8, 12], [7, 10, 14], [3, 7, 10]], bass: [0, 12, 0, 12, 0, 12, 7, 10] },
  final: { bpm: 140, root: -2, prog: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]], bass: [0, 0, 12, 0, 0, 12, 7, 12], lead: [19, -1, 19, 16, -1, 14, 16, -1, 12, -1, 14, 16, -1, 19, 21, -1] },
  tense: { bpm: 100, root: -9, prog: [[0, 3, 6], [0, 3, 7], [1, 4, 8], [0, 3, 7]], bass: [0, -1, -1, 0, -1, -1, 1, -1] },
};

export function startMusic(theme: MusicTheme) {
  currentTheme = theme;
  if (!ctx || !prefs.music) return;
  if (seqTimer !== null) return; // already running; theme switches on the next bar
  step = 0;
  nextTime = ctx.currentTime + 0.1;
  seqTimer = window.setInterval(schedule, 60);
}

export function stopMusic() {
  if (seqTimer !== null) clearInterval(seqTimer);
  seqTimer = null;
}

function schedule() {
  if (!ctx || !currentTheme) return;
  const th = THEMES[currentTheme];
  const s16 = 60 / th.bpm / 4;
  while (nextTime < ctx.currentTime + 0.2) {
    const bar = Math.floor(step / 16) % th.prog.length;
    const chord = th.prog[bar];
    const i = step % 16;
    const root = th.root + chord[0];
    // kick / hat
    if (i % 4 === 0) tone(110, nextTime, 0.18, 'sine', 0.5, musicBus, 40);
    if (i % 4 === 2) noise(nextTime, 0.04, 0.12, 9000, 'highpass', musicBus);
    if (i === 4 || i === 12) noise(nextTime, 0.12, 0.2, 1800, 'bandpass', musicBus);
    // bass (8th notes)
    if (i % 2 === 0) {
      const b = th.bass[(i / 2) % th.bass.length];
      if (b >= 0) tone(N(root + b - 24), nextTime, s16 * 1.8, 'triangle', 0.3, musicBus);
    }
    // stabs
    if (i === 2 || i === 6 || i === 10 || i === 14)
      chord.forEach((c) => tone(N(th.root + c), nextTime, s16 * 0.9, 'square', 0.035, musicBus));
    // lead
    if (th.lead) {
      const l = th.lead[i];
      if (l >= 0 && bar % 2 === 1) tone(N(th.root + l), nextTime, s16 * 1.6, 'triangle', 0.08, musicBus);
    }
    nextTime += s16;
    step++;
  }
}

export function vibrate(pattern: number | number[]) {
  try {
    if (!prefs.muted) navigator.vibrate?.(pattern);
  } catch {}
}
