import type { MatchEvent } from '../game/match';
import type { Avatar, Player } from '../game/types';
import { HAIR, SKIN, shade } from './avatar';

// 위에서 본 2D 경기장. 이벤트 위치를 따라 공이 움직이고, 픽셀 선수들이 공 쪽으로 달려간다.

/** 홈 팀(왼쪽 → 오른쪽 공격) 기준 포메이션 위치. 슬롯 순서는 FORMATION과 같다. */
const BASE: [number, number][] = [
  [0.05, 0.5], [0.24, 0.16], [0.21, 0.38], [0.21, 0.62], [0.24, 0.84],
  [0.4, 0.34], [0.4, 0.66], [0.53, 0.5], [0.68, 0.18], [0.74, 0.5], [0.68, 0.82],
];

const W = 400;
const H = 280;
/** 위아래 관중석, 광고판 높이 */
const STAND = 14;
const AD = 8;
const TOP = STAND + AD;
const FH = H - TOP * 2;

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

const SPONSORS = ['바삭치킨', '튼튼철물', '행복부동산', '새벽우유', '동네약국', '번개택배', '막걸리상회', '해돋이 헬스'];
const SPONSOR_COLORS = ['#e5484d', '#2f6fed', '#f5b81c', '#2fb35a', '#8a5cf0', '#f07a2c'];

interface Dot {
  x: number;
  y: number;
  vx: number;
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

export class PitchView {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dots: Dot[][] = [[], []];
  private ball: Dot = { x: 0.5, y: 0.5, vx: 0 };
  /** 내 팀 유니폼 (구단 꾸미기) */
  myKit: TeamKit = MY_KIT;

  constructor() {
    this.canvas = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = W * dpr;
    this.canvas.height = H * dpr;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.scale(dpr, dpr);
    this.ctx.imageSmoothingEnabled = false;
    for (const t of [0, 1]) this.dots[t] = BASE.map(([x, y]) => (t === 0 ? { x, y, vx: 0 } : { x: 1 - x, y: 1 - y, vx: 0 }));
  }

  /**
   * @param events 지금까지 일어난 이벤트들
   * @param meTeam 내 팀이 홈(0)인지 원정(1)인지. 내 팀은 파란색.
   * @param squads [홈 스쿼드, 원정 스쿼드]
   * @param t 애니메이션용 시간(ms)
   */
  draw(events: MatchEvent[], meTeam: 0 | 1, squads: [Player[], Player[]], t: number, crowd = 0, goalFlash = false): void {
    const g = this.ctx;
    this.drawStands(g, crowd, t, goalFlash);
    this.drawAds(g, t);
    this.drawField(g);

    const last = events[events.length - 1];
    const target = last ? { x: last.x, y: last.y } : { x: 0.5, y: 0.5 };
    // 공은 목표 위치로 부드럽게, 약간 흔들리며 이동
    const wob = last && (last.type === 'pass' || last.type === 'chance') ? Math.sin(t / 260) * 0.03 : 0;
    const nbx = this.ball.x + (target.x + wob - this.ball.x) * 0.08;
    this.ball.vx = nbx - this.ball.x;
    this.ball.x = nbx;
    this.ball.y += (target.y + Math.cos(t / 310) * 0.02 - this.ball.y) * 0.08;

    for (const team of [0, 1] as const) {
      BASE.forEach(([bx, by], slot) => {
        const base = team === 0 ? { x: bx, y: by } : { x: 1 - bx, y: 1 - by };
        let tx = base.x + (this.ball.x - 0.5) * (slot === 0 ? 0.04 : 0.38);
        let ty = base.y + (this.ball.y - 0.5) * (slot === 0 ? 0.3 : 0.22);
        // 이벤트 주인공은 공에 붙는다
        if (last && last.team === team && last.slot === slot && last.type !== 'fulltime') {
          tx = this.ball.x - (team === 0 ? 0.025 : -0.025);
          ty = this.ball.y;
        }
        tx += Math.sin(t / 700 + slot * 1.7 + team) * 0.012;
        ty += Math.cos(t / 800 + slot * 2.3 + team) * 0.015;
        const d = this.dots[team][slot];
        const nx = d.x + (tx - d.x) * 0.05;
        d.vx = nx - d.x;
        d.x = nx;
        d.y += (ty - d.y) * 0.05;
      });
    }

    // 아래쪽 선수가 앞에 오도록 y 순서로 그린다
    const all: { team: 0 | 1; slot: number; d: Dot }[] = [];
    for (const team of [0, 1] as const) this.dots[team].forEach((d, slot) => all.push({ team, slot, d }));
    all.sort((a, b) => a.d.y - b.d.y);
    const frame = Math.floor(t / 140);
    for (const { team, slot, d } of all) {
      const mine = team === meTeam;
      const x = d.x * W;
      const y = TOP + d.y * FH;
      const moving = Math.abs(d.vx) > 0.0004;
      const p = squads[team][slot];
      drawPlayerSprite(g, x, y, 1.15, mine ? this.myKit : oppKitFor(this.myKit), p?.avatar, {
        keeper: slot === 0,
        frame: moving ? frame + slot : 0,
        facing: team === 0 ? 1 : -1,
        pose: moving ? 'run' : 'stand',
        ring: true,
      });
      if (mine && p) {
        const name = p.name.replace(/^'.*' /, '');
        g.font = 'bold 8px sans-serif';
        const tw = g.measureText(name).width;
        g.fillStyle = 'rgba(15,22,40,0.65)';
        roundRect(g, x - tw / 2 - 3, y + 2, tw + 6, 10, 4);
        g.fillStyle = '#fff';
        g.textAlign = 'center';
        g.fillText(name, x, y + 10);
      }
    }

    // 공: 그림자 + 흰 공 + 무늬
    const bx = this.ball.x * W;
    const by = TOP + this.ball.y * FH;
    const hop = Math.abs(Math.sin(t / 180)) * Math.min(4, Math.abs(this.ball.vx) * 2000);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath();
    g.ellipse(bx, by + 2, 3.2, 1.4, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1b1f2a';
    g.fillRect(bx - 3, by - 3 - hop, 6, 6);
    g.fillStyle = '#ffffff';
    g.fillRect(bx - 2.5, by - 2.5 - hop, 5, 5);
    g.fillStyle = '#1b1f2a';
    g.fillRect(bx - 0.5, by - 0.5 - hop, 1.5, 1.5);
    g.fillRect(bx - 2.5, by - 2.5 - hop, 1, 1);
  }

  /** 관중석: 리그가 오를수록 관중이 늘고, 골이 나면 들썩인다 */
  private drawStands(g: CanvasRenderingContext2D, crowd: number, t: number, cheer: boolean): void {
    for (const top of [true, false]) {
      const y0 = top ? 0 : H - STAND;
      g.fillStyle = '#273047';
      g.fillRect(0, y0, W, STAND);
      // 계단식 좌석 줄
      g.fillStyle = '#313b56';
      for (let row = 0; row < 3; row++) g.fillRect(0, y0 + 1 + row * 4.5, W, 2);
    }
    const seats = 120;
    for (const top of [true, false]) {
      for (let row = 0; row < 2; row++) {
        for (let i = 0; i < seats; i++) {
          // 좌석마다 고정된 난수로 채워질지 정한다
          const rr = Math.sin(i * 12.9898 + row * 4.1 + (top ? 78.233 : 37.719)) * 43758.5453;
          const fill = rr - Math.floor(rr);
          if (fill > crowd) continue;
          const x = 2 + (i / seats) * (W - 4) + row * 1.6;
          const jump = cheer ? Math.abs(Math.sin(t / 90 + i)) * 2.5 : 0;
          const y = (top ? 2 + row * 5 : H - STAND + 3 + row * 5) - jump;
          g.fillStyle = CROWD_COLORS[(i + row) % CROWD_COLORS.length];
          g.fillRect(x, y + 2, 2.4, 3);
          g.fillStyle = SKIN[(i * 7 + row) % SKIN.length];
          g.fillRect(x + 0.2, y, 2, 2);
          if (cheer && i % 3 === 0) {
            g.fillStyle = SKIN[(i * 7 + row) % SKIN.length];
            g.fillRect(x - 0.6, y - 2, 0.8, 2);
            g.fillRect(x + 2.2, y - 2, 0.8, 2);
          }
        }
      }
    }
    // 큰 경기장은 카메라 플래시
    if (crowd > 0.5 && Math.random() < crowd * 0.3) {
      g.fillStyle = 'rgba(255,255,255,0.95)';
      g.fillRect(Math.random() * W, Math.random() < 0.5 ? 2 : H - 10, 2, 2);
    }
  }

  /** 동네 스폰서 광고판: 천천히 흘러간다 */
  private drawAds(g: CanvasRenderingContext2D, t: number): void {
    const segW = 72;
    const offset = (t / 60) % segW;
    g.font = 'bold 7px sans-serif';
    g.textAlign = 'center';
    for (const top of [true, false]) {
      const y = top ? STAND : H - STAND - AD;
      for (let i = -1; i < W / segW + 1; i++) {
        const idx = ((i % SPONSORS.length) + SPONSORS.length) % SPONSORS.length;
        const x = i * segW + (top ? -offset : offset);
        const color = SPONSOR_COLORS[(idx + (top ? 0 : 3)) % SPONSOR_COLORS.length];
        g.fillStyle = color;
        g.fillRect(x, y, segW - 1, AD);
        g.fillStyle = 'rgba(255,255,255,0.18)';
        g.fillRect(x, y, segW - 1, 2);
        g.fillStyle = '#ffffff';
        g.fillText(SPONSORS[(idx + (top ? 0 : 4)) % SPONSORS.length], x + segW / 2, y + 6.5);
      }
    }
  }

  private drawField(g: CanvasRenderingContext2D): void {
    // 잔디: 세로 줄무늬 + 미세한 체크
    for (let i = 0; i < 12; i++) {
      g.fillStyle = i % 2 ? '#3f9b4b' : '#46a752';
      g.fillRect((i * W) / 12, TOP, W / 12 + 1, FH);
    }
    g.fillStyle = 'rgba(255,255,255,0.03)';
    for (let y = TOP; y < TOP + FH; y += 8) g.fillRect(0, y, W, 4);
    const L = 8;
    const R = W - 8;
    const T = TOP + 4;
    const B = TOP + FH - 4;
    const cy = TOP + FH / 2;
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = 2;
    g.strokeRect(L, T, R - L, B - T);
    g.beginPath();
    g.moveTo(W / 2, T);
    g.lineTo(W / 2, B);
    g.stroke();
    g.beginPath();
    g.arc(W / 2, cy, 26, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillRect(W / 2 - 1.5, cy - 1.5, 3, 3);
    // 페널티 박스, 골 에어리어, 페널티 아크
    for (const left of [true, false]) {
      const x0 = left ? L : R;
      const dir = left ? 1 : -1;
      g.strokeRect(left ? L : R - 54, cy - 52, 54, 104);
      g.strokeRect(left ? L : R - 20, cy - 22, 20, 44);
      g.beginPath();
      g.arc(x0 + dir * 40, cy, 18, left ? -0.9 : Math.PI - 0.9, left ? 0.9 : Math.PI + 0.9);
      g.stroke();
      g.fillRect(x0 + dir * 38 - 1, cy - 1, 2, 2);
      // 골대와 그물
      const gx = left ? 1 : R;
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(gx, cy - 15, 7, 30);
      g.strokeStyle = 'rgba(255,255,255,0.55)';
      g.lineWidth = 0.6;
      for (let yy = cy - 15; yy <= cy + 15; yy += 3) {
        g.beginPath();
        g.moveTo(gx, yy);
        g.lineTo(gx + 7, yy);
        g.stroke();
      }
      for (let xx = gx; xx <= gx + 7; xx += 2.3) {
        g.beginPath();
        g.moveTo(xx, cy - 15);
        g.lineTo(xx, cy + 15);
        g.stroke();
      }
      g.strokeStyle = '#ffffff';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(left ? gx + 7 : gx, cy - 15);
      g.lineTo(left ? gx : gx + 7, cy - 15);
      g.lineTo(left ? gx : gx + 7, cy + 15);
      g.lineTo(left ? gx + 7 : gx, cy + 15);
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.85)';
      // 코너 깃발
      for (const fy of [T, B]) {
        g.fillStyle = '#ffffff';
        g.fillRect(x0 - 0.5, fy - 7, 1, 7);
        g.fillStyle = '#f5b81c';
        g.fillRect(left ? x0 + 0.5 : x0 - 4.5, fy - 7, 4, 3);
      }
      g.strokeStyle = 'rgba(255,255,255,0.8)';
      g.lineWidth = 2;
    }
  }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
  g.fill();
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
