// 효과음: 오디오 파일 없이 WebAudio로 짧게 합성한다.
// 브라우저 정책상 사용자가 한 번 누른 뒤부터 소리가 난다.

export type Sfx = 'tap' | 'scout' | 'rare' | 'sign' | 'coin' | 'goal' | 'concede' | 'win' | 'lose' | 'fanfare' | 'whistle' | 'kick';

let ctx: AudioContext | null = null;
let enabled = () => true;
/** 브라우저는 사용자가 한 번 누르기 전에는 소리를 막는다. 그 전에는 아무것도 하지 않는다. */
let unlocked = false;
if (typeof window !== 'undefined') {
  const unlock = () => {
    unlocked = true;
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

export function setSoundEnabled(fn: () => boolean): void {
  enabled = fn;
}

function audio(): AudioContext | null {
  if (!enabled() || !unlocked) return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'square', vol = 0.06, slideTo?: number): void {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(start: number, dur: number, vol = 0.05, freq = 1200): void {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + start;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  const g = a.createGain();
  g.gain.setValueAtTime(vol, t);
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

const NOTES = { C5: 523, E5: 659, G5: 784, C6: 1047, A4: 440, F4: 349, D5: 587 };

export function sfx(name: Sfx): void {
  if (!enabled()) return;
  switch (name) {
    case 'tap':
      tone(880, 0, 0.04, 'square', 0.03);
      break;
    case 'scout':
      tone(600, 0, 0.12, 'triangle', 0.06, 1200);
      break;
    case 'rare':
      [NOTES.C5, NOTES.E5, NOTES.G5, NOTES.C6].forEach((f, i) => tone(f, i * 0.08, 0.25, 'square', 0.06));
      noise(0.3, 0.6, 0.04, 3000);
      break;
    case 'sign':
      tone(NOTES.G5, 0, 0.08, 'square', 0.05);
      tone(NOTES.C6, 0.08, 0.16, 'square', 0.05);
      break;
    case 'coin':
      tone(988, 0, 0.06, 'square', 0.04);
      tone(1319, 0.06, 0.14, 'square', 0.04);
      break;
    case 'kick':
      noise(0, 0.08, 0.08, 400);
      break;
    case 'whistle':
      tone(2200, 0, 0.12, 'sine', 0.05);
      tone(2200, 0.16, 0.28, 'sine', 0.05);
      break;
    case 'goal':
      noise(0, 1.2, 0.07, 900);
      [NOTES.C5, NOTES.E5, NOTES.G5].forEach((f, i) => tone(f, 0.05 + i * 0.1, 0.3, 'triangle', 0.06));
      break;
    case 'concede':
      tone(NOTES.E5, 0, 0.2, 'triangle', 0.05, NOTES.A4);
      break;
    case 'win':
      [NOTES.C5, NOTES.E5, NOTES.G5, NOTES.C6].forEach((f, i) => tone(f, i * 0.12, 0.22, 'square', 0.05));
      break;
    case 'lose':
      [NOTES.G5, NOTES.E5, NOTES.C5].forEach((f, i) => tone(f, i * 0.16, 0.25, 'triangle', 0.05));
      break;
    case 'fanfare':
      [NOTES.C5, NOTES.C5, NOTES.C5, NOTES.G5, NOTES.E5, NOTES.C6].forEach((f, i) => tone(f, [0, 0.12, 0.24, 0.4, 0.62, 0.8][i], i === 5 ? 0.6 : 0.14, 'square', 0.06));
      noise(0.8, 1.2, 0.04, 2500);
      break;
  }
}
