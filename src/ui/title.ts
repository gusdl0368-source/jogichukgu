// 타이틀 화면: 새벽 운동장 픽셀 그림 + 로고. 아무 데나 누르면 시작 (소리도 이때 켜진다).

import { GAME_VERSION } from '../data/version';
import { generatePlayer } from '../game/players';
import { Rng } from '../game/rng';
import type { Avatar } from '../game/types';
import { drawPlayerSprite, MY_KIT, OPP_KIT } from './pitch';
import { sfx } from './sound';

const W = 180;
const H = 320;

export function showTitle(onStart: () => void): void {
  const root = document.createElement('div');
  root.className = 'title-screen';
  root.innerHTML = `
    <canvas width="${W}" height="${H}"></canvas>
    <div class="title-logo">
      <div class="title-kicker">동네 운동장에서 세계 정상까지</div>
      <h1>새벽<br>조기축구</h1>
    </div>
    <div class="title-start">화면을 눌러 시작</div>
    <div class="title-foot">${GAME_VERSION} · 한 손으로 즐기는 구단 키우기</div>`;
  document.body.appendChild(root);
  const canvas = root.querySelector('canvas')!;
  const g = canvas.getContext('2d')!;
  const rng = new Rng(2024);
  const avatars: Avatar[] = [0, 1, 2, 3].map(() => generatePlayer(rng, 2).avatar);
  // 관중석 사람들 (색만 다른 점)
  const crowd = Array.from({ length: 70 }, (_, i) => ({ x: (i * 37) % W, y: 150 + ((i * 13) % 14), c: ['#e5484d', '#2f6fed', '#f4c430', '#f2f4f8', '#7dff9b'][i % 5], p: i * 0.7 }));
  let raf = 0;
  const t0 = performance.now();

  const frame = (now: number) => {
    const t = (now - t0) / 1000;
    draw(g, t, avatars, crowd);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  let done = false;
  const start = () => {
    if (done) return;
    done = true;
    sfx('whistle');
    root.classList.add('out');
    setTimeout(() => {
      cancelAnimationFrame(raf);
      root.remove();
      onStart();
    }, 450);
  };
  root.addEventListener('pointerup', start);
  root.addEventListener('keydown', start);
  root.tabIndex = 0;
  root.focus();
}

function draw(g: CanvasRenderingContext2D, t: number, avatars: Avatar[], crowd: { x: number; y: number; c: string; p: number }[]): void {
  // 새벽 하늘: 픽셀 띠
  const bands = ['#1b2440', '#253259', '#38407a', '#5a4f8e', '#8a5f92', '#c47490', '#ee9a7f', '#ffc57a'];
  const bh = 22;
  bands.forEach((c, i) => {
    g.fillStyle = c;
    g.fillRect(0, i * bh - 10, W, bh);
  });
  // 별 (위쪽만, 깜빡임)
  for (let i = 0; i < 24; i++) {
    const x = (i * 53) % W;
    const y = (i * 29) % 60;
    if (Math.sin(t * 2 + i) > 0.2) {
      g.fillStyle = '#e8ecff';
      g.fillRect(x, y, 1, 1);
    }
  }
  // 떠오르는 해
  const sunY = 150 - Math.min(14, t * 3);
  g.fillStyle = '#ffe08a';
  for (let dy = -14; dy <= 14; dy++) {
    const w = Math.round(Math.sqrt(196 - dy * dy));
    g.fillRect(126 - w, sunY + dy, w * 2, 1);
  }
  // 아파트 실루엣
  g.fillStyle = '#2a2547';
  [[0, 112, 26], [24, 120, 22], [44, 104, 20], [62, 124, 30], [150, 108, 30], [96, 128, 18]].forEach(([x, y, w]) => g.fillRect(x, y, w, 160 - y));
  g.fillStyle = '#ffd36a';
  for (let i = 0; i < 26; i++) {
    const x = [4, 10, 16, 28, 34, 48, 54, 66, 74, 84, 154, 162, 170][i % 13];
    const y = 116 + ((i * 7) % 36);
    if ((i * 31 + Math.floor(t)) % 5) g.fillRect(x, y, 2, 2);
  }
  // 조명탑
  for (const lx of [14, 166]) {
    g.fillStyle = '#3a3f5c';
    g.fillRect(lx, 92, 2, 70);
    g.fillStyle = '#fff6c8';
    g.fillRect(lx - 5, 86, 12, 6);
    g.fillStyle = 'rgba(255,246,200,0.10)';
    g.beginPath();
    g.moveTo(lx - 5, 92);
    g.lineTo(lx + 7, 92);
    g.lineTo(lx + (lx < 90 ? 70 : -60), 260);
    g.lineTo(lx + (lx < 90 ? 20 : -110), 260);
    g.fill();
  }
  // 관중석 펜스 + 사람들
  g.fillStyle = '#3b3358';
  g.fillRect(0, 148, W, 18);
  for (const c of crowd) {
    const jump = Math.max(0, Math.sin(t * 4 + c.p)) * 1.5;
    g.fillStyle = c.c;
    g.fillRect(c.x, c.y - jump, 3, 3);
    g.fillStyle = '#f0c8a0';
    g.fillRect(c.x + 1, c.y - 2 - jump, 1, 2);
  }
  g.fillStyle = '#e9ecf2';
  g.fillRect(0, 165, W, 3);
  // 잔디 (줄무늬)
  for (let i = 0; i < 10; i++) {
    g.fillStyle = i % 2 ? '#3fae4f' : '#47bd58';
    g.fillRect(0, 168 + i * 16, W, 16);
  }
  // 라인과 골대
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.fillRect(0, 214, W, 1);
  g.fillRect(40, 176, 100, 1);
  g.fillRect(40, 176, 1, 22);
  g.fillRect(139, 176, 1, 22);
  g.fillRect(40, 198, 100, 1);
  // 골대
  g.fillStyle = '#ffffff';
  g.fillRect(66, 168, 48, 2);
  g.fillRect(66, 168, 2, 12);
  g.fillRect(112, 168, 2, 12);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  for (let x = 70; x < 112; x += 4) g.fillRect(x, 170, 1, 9);

  // 선수들: 공을 주고받는다
  const cycle = (t * 0.55) % 1;
  const ps = [
    { x: 46, y: 262, kit: MY_KIT, a: avatars[0] },
    { x: 132, y: 248, kit: MY_KIT, a: avatars[1] },
    { x: 92, y: 226, kit: OPP_KIT, a: avatars[2] },
  ];
  const keeperX = 90 + Math.sin(t * 1.4) * 10;
  drawPlayerSprite(g, keeperX, 186, 1, OPP_KIT, avatars[3], { keeper: true, frame: t * 6, pose: 'stand' });
  ps.forEach((p, i) => {
    const bob = Math.sin(t * 2 + i) * 3;
    drawPlayerSprite(g, p.x + bob, p.y, 1, p.kit, p.a, { frame: t * 8 + i, facing: p.x < 90 ? 1 : -1, pose: 'run' });
  });
  // 공: 0번 → 1번 로빙 패스, 다시 돌아옴
  const fwd = Math.floor(t * 0.55) % 2 === 0;
  const A = fwd ? ps[0] : ps[1];
  const B = fwd ? ps[1] : ps[0];
  const bx = A.x + (B.x - A.x) * cycle + 4 * (fwd ? 1 : -1);
  const by = A.y + (B.y - A.y) * cycle;
  const bz = Math.sin(cycle * Math.PI) * 26;
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillRect(Math.round(bx) - 2, Math.round(by) - 1, 4, 2);
  g.fillStyle = '#ffffff';
  g.fillRect(Math.round(bx) - 2, Math.round(by - bz) - 4, 4, 4);
  g.fillStyle = '#1d2433';
  g.fillRect(Math.round(bx) - 1, Math.round(by - bz) - 3, 1, 1);
  g.fillRect(Math.round(bx) + 1, Math.round(by - bz) - 2, 1, 1);
}
