import type { MatchEvent } from '../game/match';
import type { Player } from '../game/types';

// 위에서 본 2D 경기장. 이벤트 위치를 따라 공이 움직이고, 선수 점들이 공 쪽으로 몰린다.

/** 홈 팀(왼쪽 → 오른쪽 공격) 기준 포메이션 위치. 슬롯 순서는 FORMATION과 같다. */
const BASE: [number, number][] = [
  [0.05, 0.5], [0.24, 0.16], [0.21, 0.38], [0.21, 0.62], [0.24, 0.84],
  [0.4, 0.34], [0.4, 0.66], [0.53, 0.5], [0.68, 0.18], [0.74, 0.5], [0.68, 0.82],
];

const W = 400;
const H = 230;

interface Dot {
  x: number;
  y: number;
}

export class PitchView {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dots: Dot[][] = [[], []];
  private ball: Dot = { x: 0.5, y: 0.5 };

  constructor() {
    this.canvas = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = W * dpr;
    this.canvas.height = H * dpr;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.scale(dpr, dpr);
    for (const t of [0, 1]) this.dots[t] = BASE.map(([x, y]) => (t === 0 ? { x, y } : { x: 1 - x, y: 1 - y }));
  }

  /**
   * @param events 지금까지 일어난 이벤트들
   * @param meTeam 내 팀이 홈(0)인지 원정(1)인지. 내 팀은 파란색.
   * @param squads [홈 스쿼드, 원정 스쿼드]
   * @param t 애니메이션용 시간(ms)
   */
  draw(events: MatchEvent[], meTeam: 0 | 1, squads: [Player[], Player[]], t: number): void {
    const g = this.ctx;
    this.drawField(g);

    const last = events[events.length - 1];
    const target = last ? { x: last.x, y: last.y } : { x: 0.5, y: 0.5 };
    // 공은 목표 위치로 부드럽게, 약간 흔들리며 이동
    const wob = last && (last.type === 'pass' || last.type === 'chance') ? Math.sin(t / 260) * 0.03 : 0;
    this.ball.x += (target.x + wob - this.ball.x) * 0.08;
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
        d.x += (tx - d.x) * 0.05;
        d.y += (ty - d.y) * 0.05;
      });
    }

    for (const team of [0, 1] as const) {
      const mine = team === meTeam;
      this.dots[team].forEach((d, slot) => {
        const x = d.x * W;
        const y = d.y * H;
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.beginPath();
        g.ellipse(x, y + 6, 6, 2.5, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = slot === 0 ? (mine ? '#21c7d9' : '#f4c430') : mine ? '#2f6fed' : '#e5484d';
        g.strokeStyle = '#fff';
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(x, y, 5.5, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        if (mine) {
          const name = squads[team][slot]?.name.replace(/^'.*' /, '') ?? '';
          g.font = 'bold 9px sans-serif';
          g.textAlign = 'center';
          g.fillStyle = 'rgba(0,0,0,0.55)';
          g.fillText(name, x + 0.5, y + 16.5);
          g.fillStyle = '#fff';
          g.fillText(name, x, y + 16);
        }
      });
    }

    const bx = this.ball.x * W;
    const by = this.ball.y * H;
    g.fillStyle = '#fff';
    g.strokeStyle = '#222';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(bx, by, 3.5, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }

  private drawField(g: CanvasRenderingContext2D): void {
    for (let i = 0; i < 10; i++) {
      g.fillStyle = i % 2 ? '#3d9a4a' : '#43a350';
      g.fillRect((i * W) / 10, 0, W / 10, H);
    }
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.lineWidth = 2;
    g.strokeRect(6, 6, W - 12, H - 12);
    g.beginPath();
    g.moveTo(W / 2, 6);
    g.lineTo(W / 2, H - 6);
    g.stroke();
    g.beginPath();
    g.arc(W / 2, H / 2, 28, 0, Math.PI * 2);
    g.stroke();
    g.strokeRect(6, H / 2 - 50, 52, 100);
    g.strokeRect(W - 58, H / 2 - 50, 52, 100);
    g.strokeRect(6, H / 2 - 22, 18, 44);
    g.strokeRect(W - 24, H / 2 - 22, 18, 44);
    // 골대
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.fillRect(1, H / 2 - 16, 5, 32);
    g.fillRect(W - 6, H / 2 - 16, 5, 32);
  }
}
