import type { Avatar, Player } from '../game/types';
import { HAIR, SKIN, shade } from './avatar';

// 픽셀 선수 스프라이트, 유니폼, 경기 종료 장면 등 그림 도구. 경기 중계 화면은 broadcast.ts.

/** 홈 팀(왼쪽 → 오른쪽 공격) 기준 포메이션 위치. 슬롯 순서는 FORMATION과 같다. */
export const BASE: [number, number][] = [
  [0.05, 0.5], [0.24, 0.16], [0.21, 0.38], [0.21, 0.62], [0.24, 0.84],
  [0.4, 0.34], [0.4, 0.66], [0.53, 0.5], [0.68, 0.18], [0.74, 0.5], [0.68, 0.82],
];

export interface TeamKit {
  shirt: string;
  shorts: string;
  socks: string;
  keeper: string;
  ring: string;
}

export const MY_KIT: TeamKit = { shirt: '#2f6fed', shorts: '#ffffff', socks: '#1f4fb8', keeper: '#21c7d9', ring: '#7dff9b' };
export const OPP_KIT: TeamKit = { shirt: '#e5484d', shorts: '#1d2433', socks: '#b9363a', keeper: '#f4c430', ring: '#ffd0d0' };
const OPP_KIT_ALT: TeamKit = { shirt: '#f2f4f8', shorts: '#2f6fed', socks: '#f2f4f8', keeper: '#f4c430', ring: '#cfe0ff' };

/** 내 유니폼이 빨간 계열이면 상대는 흰 유니폼 */
export function oppKitFor(mine: TeamKit): TeamKit {
  const n = parseInt(mine.shirt.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return r > 180 && g < 120 && b < 120 ? OPP_KIT_ALT : OPP_KIT;
}

export function teamKitFrom(k: { main: string; shorts: string; socks: string; keeper: string }): TeamKit {
  return { shirt: k.main, shorts: k.shorts, socks: k.socks, keeper: k.keeper, ring: '#7dff9b' };
}

/** 선수 한 명을 위에서 본 픽셀 스프라이트로 그린다. (cx, cy) = 발 위치 */
export function drawPlayerSprite(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  u: number,
  kit: TeamKit,
  avatar: Avatar | undefined,
  opts: { keeper?: boolean; frame?: number; facing?: 1 | -1; pose?: 'run' | 'cheer' | 'sad' | 'stand'; ring?: boolean },
): void {
  const skin = SKIN[avatar?.skin ?? 1] ?? SKIN[1];
  const hair = HAIR[avatar?.hair ?? 0] ?? HAIR[0];
  const shirt = opts.keeper ? kit.keeper : kit.shirt;
  const pose = opts.pose ?? 'run';
  const f = opts.frame ?? 0;
  const face = opts.facing ?? 1;
  const r = (x: number, y: number, w: number, h: number, c: string) => {
    g.fillStyle = c;
    g.fillRect(Math.round(cx + x * u), Math.round(cy + y * u), Math.ceil(w * u), Math.ceil(h * u));
  };
  // 그림자와 발밑 링
  g.fillStyle = 'rgba(0,0,0,0.28)';
  g.beginPath();
  g.ellipse(cx, cy, 4.2 * u, 1.6 * u, 0, 0, Math.PI * 2);
  g.fill();
  if (opts.ring) {
    g.strokeStyle = kit.ring;
    g.lineWidth = Math.max(1, u * 0.7);
    g.beginPath();
    g.ellipse(cx, cy, 4.6 * u, 1.9 * u, 0, 0, Math.PI * 2);
    g.stroke();
  }
  const lift = pose === 'cheer' ? -Math.abs(Math.sin(f * 1.3)) * 2 : 0;
  const by = -12 + lift; // 몸 위쪽 기준
  const out = '#1b1f2a';
  // 다리 (달릴 때 번갈아)
  const step = pose === 'run' || pose === 'sad' ? (f % 2 === 0 ? 1 : -1) : 0;
  r(-2, by + 8, 1.5, 3 + step * 0.5, kit.socks);
  r(0.5, by + 8, 1.5, 3 - step * 0.5, kit.socks);
  r(-2.2, by + 11 + step * 0.5, 1.9, 1, out);
  r(0.3, by + 11 - step * 0.5, 1.9, 1, out);
  // 반바지
  r(-2.5, by + 6.5, 5, 2, kit.shorts);
  // 몸통
  r(-3, by + 3, 6, 4, out);
  r(-2.5, by + 3.3, 5, 3.5, shirt);
  r(1, by + 3.3, 1.5, 3.5, shade(shirt, -35));
  // 팔
  if (pose === 'cheer') {
    r(-4, by - 1, 1.2, 4.5, skin);
    r(2.8, by - 1, 1.2, 4.5, skin);
  } else {
    const swing = pose === 'run' ? step * 0.6 : 0;
    r(-4, by + 3.5 + swing, 1.2, 3, skin);
    r(2.8, by + 3.5 - swing, 1.2, 3, skin);
  }
  // 머리 (슬프면 고개를 숙인다)
  const hy = by + (pose === 'sad' ? 0.8 : 0);
  r(-2, hy, 4, 3.3, out);
  r(-1.6, hy + 0.3, 3.2, 2.8, skin);
  r(-1.8, hy - 0.4, 3.6, 1.3, hair);
  if (pose !== 'sad') r(face > 0 ? 0.6 : -1.2, hy + 1.4, 0.6, 0.6, '#1b1b22');
}


const CROWD_COLORS = ['#e5484d', '#2f6fed', '#f5b81c', '#ffffff', '#2fb35a', '#8a5cf0'];

let keeperUrl = '';
/** 승부차기용 상대 골키퍼 그림 (두 팔 벌린 자세) */
export function keeperSpriteUrl(): string {
  if (keeperUrl) return keeperUrl;
  const c = document.createElement('canvas');
  c.width = 40;
  c.height = 48;
  const g = c.getContext('2d')!;
  drawPlayerSprite(g, 20, 46, 3, OPP_KIT, { skin: 2, hair: 0, hairStyle: 0, beard: 0 }, { keeper: true, pose: 'cheer', frame: 0 });
  keeperUrl = c.toDataURL();
  return keeperUrl;
}

let ballUrl = '';
export function ballSpriteUrl(): string {
  if (ballUrl) return ballUrl;
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 8;
  const g = c.getContext('2d')!;
  const rows = ['..kkkk..', '.kwwwwk.', 'kwkkwwwk', 'kwkkwkwk', 'kwwwwkwk', 'kwkwwwwk', '.kwwkwk.', '..kkkk..'];
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    g.fillStyle = ch === 'k' ? '#1b1f2a' : '#ffffff';
    g.fillRect(x, y, 1, 1);
  }));
  ballUrl = c.toDataURL();
  return ballUrl;
}

/**
 * 경기 종료 장면: 이기면 두 팔 들고 환호, 지면 고개 숙이고 퇴장, 비기면 하이파이브.
 * 레퍼런스의 FULL-TIME 컷신 같은 한 장면을 그때그때 그린다.
 */
export function drawFullTime(canvas: HTMLCanvasElement, outcome: 'win' | 'draw' | 'loss', squad: Player[], t: number, kit: TeamKit = MY_KIT): void {
  const g = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  g.imageSmoothingEnabled = false;
  // 하늘과 조명
  const sky = g.createLinearGradient(0, 0, 0, h);
  if (outcome === 'win') {
    sky.addColorStop(0, '#1d3b7a');
    sky.addColorStop(1, '#3a6fd1');
  } else if (outcome === 'loss') {
    sky.addColorStop(0, '#2b2f3a');
    sky.addColorStop(1, '#4b5263');
  } else {
    sky.addColorStop(0, '#2a3a5a');
    sky.addColorStop(1, '#4d6a8f');
  }
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  // 비 (지면)
  if (outcome === 'loss') {
    g.strokeStyle = 'rgba(200,210,230,0.35)';
    g.lineWidth = 1;
    for (let i = 0; i < 40; i++) {
      const x = ((i * 53 + t / 4) % (w + 20)) - 10;
      const y = (i * 37 + t / 2) % h;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x - 3, y + 8);
      g.stroke();
    }
  }
  // 관중석 실루엣과 조명탑
  g.fillStyle = 'rgba(10,15,30,0.55)';
  g.fillRect(0, h * 0.28, w, h * 0.3);
  for (let i = 0; i < 60; i++) {
    g.fillStyle = CROWD_COLORS[i % CROWD_COLORS.length];
    const jump = outcome === 'win' ? Math.abs(Math.sin(t / 120 + i)) * 2 : 0;
    g.globalAlpha = 0.55;
    g.fillRect((i / 60) * w, h * 0.33 + (i % 3) * 6 - jump, 3, 4);
  }
  g.globalAlpha = 1;
  for (const lx of [w * 0.12, w * 0.88]) {
    g.fillStyle = '#c9d1e3';
    g.fillRect(lx - 1, 4, 2, h * 0.28);
    g.fillStyle = outcome === 'loss' ? '#9aa3ad' : '#fff6c9';
    g.fillRect(lx - 7, 2, 14, 5);
  }
  // 잔디
  g.fillStyle = '#3f9b4b';
  g.fillRect(0, h * 0.58, w, h * 0.42);
  g.fillStyle = '#46a752';
  for (let i = 0; i < 8; i += 2) g.fillRect((i * w) / 8, h * 0.58, w / 8, h * 0.42);
  // 선수 5명
  const pose = outcome === 'win' ? 'cheer' : outcome === 'loss' ? 'sad' : 'stand';
  const picks = [9, 8, 7, 10, 0];
  picks.forEach((slot, i) => {
    const p = squad[slot];
    const walk = outcome === 'loss' ? ((t / 40 + i * 30) % (w + 60)) - 30 : 0;
    const x = outcome === 'loss' ? w - walk : w * (0.16 + i * 0.17);
    const y = h * 0.9 + (i % 2) * 4;
    drawPlayerSprite(g, x, y, 3.2, kit, p?.avatar, { keeper: slot === 0, frame: Math.floor(t / 130) + i, facing: outcome === 'loss' ? -1 : 1, pose: outcome === 'loss' ? 'sad' : pose });
  });
}
