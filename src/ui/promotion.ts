// 승격 컷신: 어둠 속에서 조명탑이 하나씩 켜지고 새 경기장과 관중이 드러난 뒤 리그 이름이 등장한다.
// 약 4.5초, 아무 데나 누르면 넘어간다.

import { TIERS } from '../data/balance';
import type { Avatar } from '../game/types';
import { confetti } from './effects';
import { drawPlayerSprite, type TeamKit } from './pitch';
import { sfx } from './sound';

const W = 180;
const H = 320;
const DURATION = 4.6;

export function showPromotion(level: number, kit: TeamKit, avatars: Avatar[], onDone: () => void): void {
  const tier = TIERS[level];
  const prev = TIERS[Math.max(0, level - 1)];
  const root = document.createElement('div');
  root.className = 'promo-cut';
  root.style.setProperty('--tier', tier.color);
  root.innerHTML = `
    <canvas width="${W}" height="${H}"></canvas>
    <div class="promo-from">${prev.icon} ${prev.name}</div>
    <div class="promo-text">
      <div class="promo-up">승격!</div>
      <div class="promo-tier">${tier.icon} ${tier.name}</div>
      <div class="promo-venue">새 홈구장 · ${tier.venue}</div>
    </div>
    <div class="promo-skip">눌러서 계속</div>`;
  document.body.appendChild(root);
  const g = root.querySelector('canvas')!.getContext('2d')!;
  // 관중 수는 리그 등급의 관중 비율을 따른다 (최소한은 보이게)
  const fill = Math.max(0.25, tier.crowd);
  const seats = buildSeats(fill, tier.color);
  const t0 = performance.now();
  let raf = 0;
  let cheered = false;

  const frame = (now: number) => {
    const t = (now - t0) / 1000;
    draw(g, t, seats, tier.color, kit, avatars);
    if (t > 2.3 && !cheered) {
      cheered = true;
      root.classList.add('reveal');
      sfx('fanfare');
      confetti(root, 160);
    }
    if (t > DURATION) finish();
    else raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  sfx('whistle');

  let done = false;
  function finish(): void {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    root.classList.add('out');
    setTimeout(() => {
      root.remove();
      onDone();
    }, 350);
  }
  root.addEventListener('pointerup', () => {
    // 너무 빨리 눌러 놓치지 않게, 공개 장면 전이면 공개로 건너뛴다
    if (!cheered) {
      cheered = true;
      root.classList.add('reveal');
      sfx('fanfare');
      confetti(root, 160);
      return;
    }
    finish();
  });
}

interface Seat {
  x: number;
  y: number;
  c: string;
  p: number;
}

function buildSeats(fill: number, accent: string): Seat[] {
  const colors = [accent, '#f2f4f8', '#ffd35a', accent, '#2f6fed', '#e5484d'];
  const seats: Seat[] = [];
  let k = 0;
  for (let row = 0; row < 9; row++) {
    for (let x = 2; x < W - 2; x += 4) {
      k++;
      // 결정적인 의사 난수: 관중 비율만큼만 채운다
      const r = ((k * 2654435761) >>> 0) / 4294967296;
      if (r > fill) continue;
      seats.push({ x: x + (row % 2) * 2, y: 112 + row * 6, c: colors[k % colors.length], p: k * 0.37 });
    }
  }
  return seats;
}

function draw(g: CanvasRenderingContext2D, t: number, seats: Seat[], accent: string, kit: TeamKit, avatars: Avatar[]): void {
  // 0~1.6초: 어둠 속 조명탑 4개가 차례로 켜짐, 1.6~2.3초: 경기장 밝아짐, 2.3초~: 관중 환호
  const lightsOn = Math.min(4, Math.floor(t / 0.4));
  const bright = Math.max(0, Math.min(1, (t - 1.6) / 0.7));

  // 밤하늘 → 경기장 조명 받은 하늘
  g.fillStyle = mix('#0b1020', '#1d2a52', bright);
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 30; i++) {
    if (Math.sin(t * 3 + i * 1.7) > 0.3 - bright) continue;
    const h = ((i + 1) * 2654435761) >>> 0;
    g.fillStyle = '#c8d0ff';
    g.fillRect(h % W, (h >>> 12) % 90, 1, 1);
  }

  // 관중석 구조물
  g.fillStyle = mix('#14182a', '#2c3150', bright);
  g.fillRect(0, 104, W, 64);
  g.fillStyle = mix('#0f1322', accent, bright * 0.55);
  g.fillRect(0, 100, W, 4);
  // 관중: 밝아질수록 보이고, 공개 뒤엔 들썩인다
  if (bright > 0) {
    for (const s of seats) {
      const jump = t > 2.3 ? Math.max(0, Math.sin(t * 9 + s.p)) * 2 : 0;
      g.globalAlpha = bright;
      g.fillStyle = s.c;
      g.fillRect(s.x, s.y - jump, 3, 3);
      g.fillStyle = '#f0c8a0';
      g.fillRect(s.x + 1, s.y - 2 - jump, 1, 2);
      g.globalAlpha = 1;
    }
  }

  // 잔디
  for (let i = 0; i < 10; i++) {
    g.fillStyle = mix(i % 2 ? '#0e2a14' : '#113118', i % 2 ? '#3fae4f' : '#47bd58', bright);
    g.fillRect(0, 168 + i * 16, W, 16);
  }
  g.fillStyle = `rgba(255,255,255,${0.15 + bright * 0.7})`;
  g.fillRect(0, 244, W, 1);
  g.fillRect(89, 168, 1, 152);
  for (let a = 0; a < 40; a++) {
    const ang = (a / 40) * Math.PI * 2;
    g.fillRect(Math.round(90 + Math.cos(ang) * 22), Math.round(244 + Math.sin(ang) * 14), 1, 1);
  }

  // 조명탑 4개
  // 휴대폰 세로 화면에서 양옆이 조금 잘리므로 안쪽에 둔다
  const towers = [28, 66, 114, 152];
  towers.forEach((x, i) => {
    g.fillStyle = '#3a3f5c';
    g.fillRect(x - 1, 60, 2, 44);
    const on = i < lightsOn;
    g.fillStyle = on ? '#fff6c8' : '#2a2f45';
    g.fillRect(x - 6, 52, 12, 8);
    if (on) {
      // 켜지는 순간 번쩍
      const since = t - (i + 1) * 0.4;
      const flash = since < 0.15 ? 0.5 : 0.12;
      g.fillStyle = `rgba(255,246,200,${flash})`;
      g.beginPath();
      g.moveTo(x - 6, 60);
      g.lineTo(x + 6, 60);
      g.lineTo(x + (x < 90 ? 60 : -20), 320);
      g.lineTo(x + (x < 90 ? 20 : -60), 320);
      g.fill();
    }
  });

  // 우리 선수들: 조명 아래 서 있다가 공개 순간부터 환호
  if (bright > 0) {
    const spots = [[50, 236], [72, 252], [90, 232], [108, 252], [130, 236]];
    g.globalAlpha = bright;
    spots.forEach(([x, y], i) => {
      drawPlayerSprite(g, x, y, 1, kit, avatars[i % Math.max(1, avatars.length)], { pose: t > 2.3 ? 'cheer' : 'stand', frame: t * 6 + i * 1.3, facing: i < 2 ? 1 : -1 });
    });
    g.globalAlpha = 1;
  }
}

/** 두 #rrggbb 색을 k(0~1)로 섞는다 */
function mix(a: string, b: string, k: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
