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
    setTimeout(() => updateMusic(), 0);
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

let vibrateOn = () => true;
export function setVibrateEnabled(fn: () => boolean): void {
  vibrateOn = fn;
}
/** 지원하는 휴대폰에서만 짧게 진동 (아이폰 사파리는 지원 안 함) */
function buzz(pattern: number[]): void {
  try {
    if (unlocked && vibrateOn() && typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern);
  } catch {
    /* 무시 */
  }
}
const BUZZ: Partial<Record<Sfx, number[]>> = { goal: [40, 40, 90], rare: [25, 30, 25, 30, 60], fanfare: [60, 50, 60, 50, 160], sign: [20] };

export function sfx(name: Sfx): void {
  const b = BUZZ[name];
  if (b) buzz(b);
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

// ───────── 경기장 함성 (계속 깔리는 배경음) ─────────

let crowdNode: { gain: GainNode; filter: BiquadFilterNode } | null = null;

/**
 * level: 관중 수 (0~1, 0이면 끔), excite: 지금 장면의 흥분도 (0~1).
 * 찬스면 함성이 커지고 밝아진다.
 */
export function setCrowd(level: number, excite: number): void {
  if (!enabled() || !unlocked || level <= 0) {
    if (crowdNode && ctx) crowdNode.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    return;
  }
  const a = audio();
  if (!a) return;
  if (!crowdNode) {
    const len = a.sampleRate * 2;
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    // 갈색 잡음: 웅성거림처럼 들린다
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    const src = a.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = a.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    const gain = a.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(a.destination);
    src.start();
    crowdNode = { gain, filter };
  }
  const target = (0.05 + level * 0.12) * (0.5 + excite);
  crowdNode.gain.gain.setTargetAtTime(target, a.currentTime, 0.35);
  crowdNode.filter.frequency.setTargetAtTime(600 + excite * 1400, a.currentTime, 0.3);
}

// ───────── 배경음악: 새벽 운동장 8비트 (파일 없이 합성) ─────────
// 92BPM, C - Am - F - G 진행. 베이스(삼각파) + 아르페지오(사각파 작게) + 멜로디(사각파) + 하이햇(잡음)

let musicOn = () => true;
let musicGain: GainNode | null = null;
let musicTimer: ReturnType<typeof setInterval> | null = null;
let nextStep = 0;
let stepIndex = 0;
let duck = 1;

const BPM = 92;
const STEP = 60 / BPM / 2; // 8분음표
const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

// 마디마다 코드 (근음 midi, 구성음)
const CHORDS: [number, number[]][] = [
  [48, [60, 64, 67]], // C
  [45, [57, 60, 64]], // Am
  [41, [57, 60, 65]], // F
  [43, [55, 59, 62]], // G
];
// 8마디 멜로디: 마디당 8칸 (0이면 쉼표)
const MELODY: number[] = [
  76, 0, 74, 72, 74, 0, 76, 79,
  76, 0, 72, 0, 69, 0, 72, 0,
  72, 0, 74, 76, 77, 0, 76, 74,
  74, 0, 0, 72, 71, 0, 74, 0,
  76, 0, 79, 0, 81, 79, 76, 0,
  72, 0, 76, 0, 74, 72, 69, 0,
  77, 0, 76, 74, 72, 0, 74, 76,
  74, 0, 71, 0, 72, 0, 0, 0,
];

export function setMusicEnabled(fn: () => boolean): void {
  musicOn = fn;
}

function voice(a: BaseAudioContext, out: AudioNode, type: OscillatorType, freq: number, t: number, dur: number, vol: number): void {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function hat(a: BaseAudioContext, out: AudioNode, t: number, vol: number): void {
  const len = Math.floor(a.sampleRate * 0.04);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 6000;
  const g = a.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(out);
  src.start(t);
}

export function scheduleStep(a: BaseAudioContext, out: AudioNode, i: number, t: number): void {
  const bar = Math.floor(i / 8) % 8;
  const beat = i % 8;
  const [root, tones] = CHORDS[bar % 4];
  // 베이스: 4분음표, 짝수 박에 옥타브 위
  if (beat % 2 === 0) voice(a, out, 'triangle', hz(root + (beat % 4 === 2 ? 12 : 0)), t, STEP * 1.8, 0.5);
  // 아르페지오
  voice(a, out, 'square', hz(tones[beat % 3] + 12), t, STEP * 0.7, 0.05);
  // 멜로디 (4마디 뒤부터 나와서 처음엔 잔잔하게)
  const note = MELODY[(bar * 8 + beat) % MELODY.length];
  if (note && i >= 32) voice(a, out, 'square', hz(note), t, STEP * 1.6, 0.12);
  // 하이햇
  if (beat % 2 === 1) hat(a, out, t, 0.08);
}

/** 배경음악을 켜거나 끈다. 사용자가 한 번 누른 뒤에만 실제로 소리가 난다 */
export function updateMusic(): void {
  const want = musicOn() && enabled() && unlocked && document.visibilityState !== 'hidden';
  if (!want) {
    if (musicGain && ctx) musicGain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
    if (musicTimer) {
      clearInterval(musicTimer);
      musicTimer = null;
    }
    return;
  }
  const a = audio();
  if (!a) return;
  if (!musicGain) {
    musicGain = a.createGain();
    musicGain.gain.value = 0;
    musicGain.connect(a.destination);
  }
  musicGain.gain.setTargetAtTime(0.11 * duck, a.currentTime, 0.4);
  if (musicTimer) return;
  nextStep = a.currentTime + 0.1;
  musicTimer = setInterval(() => {
    if (!ctx || !musicGain) return;
    // 0.3초 앞까지 미리 예약
    while (nextStep < ctx.currentTime + 0.3) {
      scheduleStep(ctx, musicGain, stepIndex++, nextStep);
      nextStep += STEP;
    }
  }, 100);
}

/** 경기 중 관중 함성이 클 때 음악을 줄인다 (0~1) */
export function duckMusic(level: number): void {
  duck = level;
  if (musicGain && ctx && musicTimer) musicGain.gain.setTargetAtTime(0.11 * duck, ctx.currentTime, 0.5);
}
