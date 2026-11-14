import type { MatchEvent } from '../game/match';
import type { Player } from '../game/types';
import { SKIN } from './avatar';
import { BASE, MY_KIT, type TeamKit, drawPlayerSprite, oppKitFor } from './pitch';

// TV 중계처럼 보이는 경기 화면.
// 경기 결과(이벤트 목록)는 그대로 두고, 이벤트 사이를 실제 축구처럼 연출한다.
// 원칙: 공은 항상 누군가의 발에 있거나, 정해진 두 선수 사이를 오간다.
//  - 공격 팀은 가까운 동료에게 패스하며 한 단계씩 전진한다 (빌드업)
//  - 받는 선수는 공이 오는 곳으로 달려가 받는다
//  - 공을 뺏을 때는 가장 가까운 수비가 달려들어 그 자리에서 뺏는다
// 좌표는 실제 경기장 규격(미터): 가로 105, 세로 68. 홈 팀은 +x 방향으로 공격한다.

const PL = 105;
const PW = 68;
const CW = 400;
const CH = 280;
/** 한 번에 보낼 수 있는 패스 거리 (이보다 멀면 중간에 한 번 더 거친다) */
const PASS_RANGE = 26;

// ───────── 이벤트 시각 정하기 (해설·점수와 화면을 맞추기 위해 함께 쓴다) ─────────

const timeCache = new WeakMap<MatchEvent[], number[]>();

/** 이벤트마다 화면에서 일어나는 시각(ms). 같은 분에 몰린 이벤트를 연출할 시간만큼 벌려 둔다 */
export function eventTimes(events: MatchEvent[], durMs: number): number[] {
  const hit = timeCache.get(events);
  if (hit) return hit;
  const sec = durMs / 1000;
  const t: number[] = [];
  events.forEach((e, i) => {
    if (i === 0) return t.push(0);
    const p = events[i - 1];
    let gap = 1.2;
    if (p.type === 'goal') gap = 4.6;
    else if (p.type === 'halftime') gap = 2.4;
    else if (p.type === 'kickoff') gap = 1.6;
    else if (e.type === 'chance') gap = 1.5;
    else if (e.type === 'pass') gap = 1.8;
    else if (e.type === 'freekick' || e.type === 'penalty') gap = 1.8;
    else if ((e.type === 'goal' || e.type === 'save' || e.type === 'miss') && (p.type === 'freekick' || p.type === 'penalty')) gap = 1.5;
    else if ((e.type === 'goal' || e.type === 'save' || e.type === 'miss') && p.type === 'chance') gap = 0.75;
    else if (e.type === 'yellow' || e.type === 'red') gap = 0.7;
    else if (e.type === 'halftime') gap = 1.4;
    const nominal = (e.minute / 90) * sec;
    t.push(Math.max(nominal, t[i - 1] + gap));
  });
  // 너무 밀렸으면 전체를 줄여 경기 시간 안에 넣는다
  const last = t[t.length - 1];
  const limit = sec * 0.985;
  const scale = last > limit ? limit / last : 1;
  const out = t.map((x, i) => (i === t.length - 1 ? sec : x * scale) * 1000);
  timeCache.set(events, out);
  return out;
}

// ───────── 상태 ─────────

interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 넘어져 있는 시각까지 (초) */
  fallenUntil: number;
  /** 다이빙 중인 시각까지와 방향 */
  diveUntil: number;
  diveDir: number;
}

interface Flight {
  fx: number;
  fy: number;
  fz: number;
  tx: number;
  ty: number;
  tz: number;
  t0: number;
  t1: number;
  peak: number;
  /** 도착하면 공을 가질 선수 (슛이면 null) */
  to: { team: 0 | 1; slot: number } | null;
}

interface Ball {
  x: number;
  y: number;
  z: number;
  owner: { team: 0 | 1; slot: number } | null;
  flight: Flight | null;
  /** 패스가 조금 빗나가 받는 선수에게 굴러가는 중 */
  rollingTo: { team: 0 | 1; slot: number } | null;
  vx: number;
  vy: number;
}

type Who = { team: 0 | 1; slot: number };
type Move = { x: number; y: number; speed: number; until: number };
type Step = { t: number; run: () => void };

const dirOf = (team: 0 | 1) => (team === 0 ? 1 : -1);
const other = (team: 0 | 1) => (team === 0 ? 1 : 0) as 0 | 1;
const goalX = (attackingTeam: 0 | 1) => (attackingTeam === 0 ? PL : 0);
const ownGoalX = (team: 0 | 1) => (team === 0 ? 0 : PL);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** 포메이션 기본 자리 (미터) */
function basePos(team: 0 | 1, slot: number): { x: number; y: number } {
  const [fx, fy] = BASE[slot];
  return team === 0 ? { x: fx * PL, y: fy * PW } : { x: (1 - fx) * PL, y: (1 - fy) * PW };
}

/** 킥오프 자리: 자기 진영 안으로 */
function kickoffPos(team: 0 | 1, slot: number, kicking: boolean): { x: number; y: number } {
  const b = basePos(team, slot);
  const half = team === 0 ? b.x * 0.47 : PL - (PL - b.x) * 0.47;
  if (kicking && slot === 9) return { x: PL / 2 - dirOf(team) * 0.6, y: PW / 2 };
  if (kicking && slot === 7) return { x: PL / 2 - dirOf(team) * 3, y: PW / 2 + 6 };
  return { x: half, y: b.y };
}

export class BroadcastView {
  readonly canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  myKit: TeamKit = MY_KIT;

  private bodies: Body[][] = [[], []];
  private ball: Ball = { x: PL / 2, y: PW / 2, z: 0, owner: null, flight: null, rollingTo: null, vx: 0, vy: 0 };
  private possession: 0 | 1 = 0;
  private events: MatchEvent[] | null = null;
  private times: number[] = [];
  /** 다음에 처리할 이벤트 번호 */
  private next = 0;
  private lastT = 0;
  private now = 0;
  /** 이번 구간에 할 일 (시각 순) */
  private plan: Step[] = [];
  /** 특정 선수에게 준 이동 지시 (달려가서 받기, 침투, 압박) */
  private moves = new Map<string, Move>();
  /** 세트피스·킥오프처럼 모두가 정해진 자리로 가야 할 때 */
  private arrangement: Map<string, { x: number; y: number }> | null = null;
  private celebration: { team: 0 | 1; slot: number; until: number; corner: { x: number; y: number } } | null = null;
  private card: { color: string; team: 0 | 1; slot: number; until: number } | null = null;
  private netShake: { side: number; until: number } | null = null;
  private fade = 0;
  private referee = { x: PL / 2 - 6, y: PW / 2 + 8 };
  private cam = { x: PL / 2, y: PW / 2, w: 90, shake: 0 };
  private seats: { x: number; y: number; c: string; skin: string; fill: number }[] = [];
  /** 태클·반칙을 실제로 하는 수비 (공에 가장 가까운 선수) */
  private challenger: Who | null = null;

  constructor() {
    this.canvas = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = CW * dpr;
    this.canvas.height = CH * dpr;
    this.g = this.canvas.getContext('2d')!;
    this.g.scale(dpr, dpr);
    this.g.imageSmoothingEnabled = false;
    this.kickoff(0, true);
    this.makeSeats();
  }

  // ───────── 외부 API ─────────

  /**
   * @param events 경기 전체 이벤트 (없으면 경기 사이 쉬는 시간)
   * @param elapsedMs 경기 시작 후 지난 시간
   * @param durMs 경기 길이
   */
  draw(events: MatchEvent[] | null, elapsedMs: number, durMs: number, meTeam: 0 | 1, squads: [Player[], Player[]], crowd: number, t: number): void {
    const dt = Math.min(0.05, Math.max(0, (t - this.lastT) / 1000));
    this.lastT = t;
    if (events !== this.events) this.startMatch(events, durMs);
    this.now = elapsedMs / 1000;
    if (events) this.advance();
    const bx = this.ball.x;
    const by = this.ball.y;
    this.runPlan();
    this.step(dt);
    // 킥오프·골킥·프리킥처럼 장면이 바뀌어 공이 옮겨지면 방송처럼 짧게 화면을 끊어 준다
    if (dist(bx, by, this.ball.x, this.ball.y) > 6 && !this.ball.flight) {
      this.fade = 1;
      this.cam.x = this.ball.x;
      this.cam.y = this.ball.y;
    }
    this.updateCamera(dt);
    this.render(meTeam, squads, crowd, t);
    if (this.fade > 0) {
      this.g.fillStyle = `rgba(10,14,24,${Math.min(1, this.fade) * 0.85})`;
      this.g.fillRect(0, 0, CW, CH);
      this.fade = Math.max(0, this.fade - dt * 3.5);
    }
  }

  // ───────── 경기 흐름 ─────────

  private startMatch(events: MatchEvent[] | null, durMs: number): void {
    this.events = events;
    this.times = events ? eventTimes(events, durMs) : [];
    this.next = 0;
    this.plan = [];
    this.moves.clear();
    this.arrangement = null;
    this.celebration = null;
    this.card = null;
    this.challenger = null;
    this.kickoff(0, true);
    this.cam = { x: PL / 2, y: PW / 2, w: 90, shake: 0 };
  }

  /** 킥오프 자리로 (snap이면 바로) */
  private kickoff(team: 0 | 1, snap: boolean): void {
    for (const t of [0, 1] as const) {
      if (!this.bodies[t].length || snap) {
        this.bodies[t] = BASE.map((_, slot) => {
          const p = kickoffPos(t, slot, t === team);
          return { x: p.x, y: p.y, vx: 0, vy: 0, fallenUntil: 0, diveUntil: 0, diveDir: 0 };
        });
      }
    }
    this.ball = { x: PL / 2, y: PW / 2, z: 0, owner: { team, slot: 9 }, flight: null, rollingTo: null, vx: 0, vy: 0 };
    this.possession = team;
    this.arrangement = null;
    this.celebration = null;
  }

  /** 지난 이벤트를 처리하고 다음 이벤트까지의 연출을 준비한다 */
  private advance(): void {
    const ev = this.events!;
    let guard = 0;
    while (this.next < ev.length && this.times[this.next] / 1000 <= this.now && guard++ < 200) {
      const late = this.now - this.times[this.next] / 1000 > 1.5;
      // 이전 구간의 남은 계획은 이벤트 순간에 정리한다
      this.flushPlan();
      this.resolve(this.next, late);
      this.next++;
      if (this.next < ev.length) this.setup(this.next, this.times[this.next - 1] / 1000, this.times[this.next] / 1000, late);
    }
  }

  private runPlan(): void {
    while (this.plan.length && this.plan[0].t <= this.now) this.plan.shift()!.run();
  }

  /** 남은 계획 중 공 소유를 바꾸는 일은 바로 처리하고 나머지는 버린다 */
  private flushPlan(): void {
    this.plan = [];
    if (this.ball.flight?.to) this.land(this.ball.flight.to);
    if (this.ball.rollingTo) this.land(this.ball.rollingTo);
  }

  private at(t: number, run: () => void): void {
    this.plan.push({ t, run });
    this.plan.sort((a, b) => a.t - b.t);
  }

  private body(w: Who): Body {
    return this.bodies[w.team][w.slot];
  }

  private key(w: Who): string {
    return `${w.team}-${w.slot}`;
  }

  /** 공을 그 선수 발밑으로 */
  private land(w: Who): void {
    this.ball.flight = null;
    this.ball.rollingTo = null;
    this.ball.owner = w;
    this.ball.z = 0;
    this.possession = w.team;
    this.moves.delete(this.key(w));
  }

  /** team 쪽에서 (x, y)에 가장 가까운 선수 */
  private nearest(team: 0 | 1, x: number, y: number, outfield = true, except = -1): number {
    let best = -1;
    let bd = Infinity;
    this.bodies[team].forEach((b, slot) => {
      if ((outfield && slot === 0) || slot === except) return;
      const d = dist(b.x, b.y, x, y);
      if (d < bd) {
        bd = d;
        best = slot;
      }
    });
    return best;
  }

  /**
   * 패스: t0에 차서 t1에 도착. 받는 선수는 도착 지점으로 달려간다.
   * 도착 지점은 받는 선수가 지금 있는 곳보다 조금 앞 (공을 향해 받으러 나오고, 공격 방향으로 한 발).
   */
  private passAt(t0: number, t1: number, to: Who, opts: { lofted?: boolean; point?: { x: number; y: number } } = {}): void {
    this.at(t0, () => {
      // 앞 패스가 아직 굴러가는 중이면 그 선수가 받은 걸로 치고, 공이 있는 자리에서 바로 찬다 (원터치)
      if (this.ball.rollingTo) {
        const bx = this.ball.x, by = this.ball.y;
        this.land(this.ball.rollingTo);
        this.ball.x = bx;
        this.ball.y = by;
      }
      if (!this.ball.owner && !this.ball.flight) return;
      const from = { x: this.ball.x, y: this.ball.y };
      const r = this.body(to);
      const p = opts.point ?? { x: clamp(r.x + dirOf(to.team) * 2, 2, PL - 2), y: clamp(r.y + (from.y - r.y) * 0.1, 2, PW - 2) };
      const d = dist(from.x, from.y, p.x, p.y);
      const lofted = opts.lofted ?? d > 30;
      const dur = Math.max(0.35, Math.min(t1 - this.now, d / (lofted ? 17 : 19) + 0.15));
      this.ball.flight = { fx: from.x, fy: from.y, fz: 0, tx: p.x, ty: p.y, tz: 0, t0: this.now, t1: this.now + dur, peak: lofted ? Math.min(6, d / 9) : 0.1, to };
      this.ball.owner = null;
      this.moves.set(this.key(to), { x: p.x, y: p.y, speed: Math.min(9, Math.max(3, dist(r.x, r.y, p.x, p.y) / dur + 0.5)), until: this.now + dur + 0.2 });
    });
  }

  private shootAt(t0: number, t1: number, tx: number, ty: number, tz: number, power: boolean): void {
    this.at(t0, () => {
      this.ball.flight = { fx: this.ball.x, fy: this.ball.y, fz: 0.2, tx, ty, tz, t0: this.now, t1: Math.max(this.now + (power ? 0.3 : 0.4), t1), peak: power ? 0.3 : 1, to: null };
      this.ball.owner = null;
    });
  }

  /**
   * 빌드업 경로: 지금 공 가진 선수에서 final까지, 패스 한 번에 PASS_RANGE 이내로 끊어서.
   * 중간 선수는 "지금 위치에서 가깝고, 최종 목표에 더 가까워지는" 동료를 고른다.
   */
  private route(team: 0 | 1, fromSlot: number, finalSlot: number, finalPoint?: { x: number; y: number }): number[] {
    const path: number[] = [];
    let cur = fromSlot;
    const fp = finalPoint ?? this.body({ team, slot: finalSlot });
    for (let k = 0; k < 3; k++) {
      if (cur === finalSlot) break;
      const c = this.body({ team, slot: cur });
      if (dist(c.x, c.y, fp.x, fp.y) <= PASS_RANGE || k === 2) {
        path.push(finalSlot);
        break;
      }
      let best = -1;
      let score = Infinity;
      this.bodies[team].forEach((b, slot) => {
        if (slot === cur || slot === 0 || slot === finalSlot || path.includes(slot)) return;
        const d1 = dist(c.x, c.y, b.x, b.y);
        if (d1 < 7 || d1 > PASS_RANGE) return;
        const d2 = dist(b.x, b.y, fp.x, fp.y);
        if (d2 >= dist(c.x, c.y, fp.x, fp.y)) return;
        const s = d2 + d1 * 0.3;
        if (s < score) {
          score = s;
          best = slot;
        }
      });
      if (best < 0) {
        path.push(finalSlot);
        break;
      }
      path.push(best);
      cur = best;
    }
    return path;
  }

  /** route를 [s, e] 안에 시간 배분해서 패스 계획으로 만든다. 마지막 패스는 e에 도착 */
  private planPasses(team: 0 | 1, path: number[], s: number, e: number, last?: { point: { x: number; y: number }; lofted?: boolean }): void {
    if (!path.length) return;
    // 패스 하나에 드는 시간: 공이 날아가는 시간 + 받고 다시 차는 시간
    const legs = path.length;
    const span = Math.max(0.5, e - s);
    const per = Math.min(1.5, span / legs);
    path.forEach((slot, idx) => {
      const t1 = e - (legs - 1 - idx) * per;
      const t0 = Math.max(s + 0.05, t1 - per * 0.75);
      const isLast = idx === legs - 1;
      this.passAt(t0, t1, { team, slot }, isLast && last ? { point: last.point, lofted: last.lofted } : {});
    });
  }

  /** 지금 공이 상대 팀에게 있으면, 가장 가까운 선수가 먼저 가로챈다. 가로챈 선수를 돌려준다 */
  private winBallFirst(team: 0 | 1, s: number, e: number): number {
    const o = this.ball.owner;
    if (o && o.team === team) return o.slot;
    if (this.ball.flight?.to?.team === team) return this.ball.flight.to.slot;
    // 공 근처의 우리 선수가 달려가서 뺏는다
    const slot = this.nearest(team, this.ball.x, this.ball.y);
    const t = s + Math.min(0.6, (e - s) * 0.3);
    const b = this.body({ team, slot });
    this.moves.set(this.key({ team, slot }), { x: this.ball.x, y: this.ball.y, speed: 9, until: t });
    this.at(t, () => {
      b.x += (this.ball.x - b.x) * 0.6;
      b.y += (this.ball.y - b.y) * 0.6;
      this.land({ team, slot });
    });
    return slot;
  }

  /** 다음 이벤트 i가 일어나기 전 [s, e] 동안의 연출을 준비한다 */
  private setup(i: number, s: number, e: number, instant: boolean): void {
    const ev = this.events![i];
    const prev = this.events![i - 1];
    this.moves.clear();
    this.challenger = null;
    if (instant) return;

    // 골 뒤에는 세리머니 → 제자리 → 킥오프, 하프타임 뒤에는 후반 킥오프
    if (prev?.type === 'goal' || prev?.type === 'halftime') {
      const kicking = prev.type === 'goal' ? other(prev.team) : 1;
      const resume = s + (prev.type === 'goal' ? Math.min(3.2, (e - s) * 0.7) : Math.min(1.6, (e - s) * 0.6));
      this.at(resume, () => {
        this.kickoff(kicking, false);
        this.arrangement = new Map();
        for (const t of [0, 1] as const) for (let slot = 0; slot < 11; slot++) this.arrangement.set(`${t}-${slot}`, kickoffPos(t, slot, t === kicking));
      });
      // 킥오프 직후 뒤로 한 번 돌리고 이벤트로 이어진다
      this.at(resume + 0.6, () => {
        this.arrangement = null;
      });
      if (ev.type === 'pass' || ev.type === 'chance') this.passAt(resume + 0.5, resume + 1.1, { team: kicking, slot: 6 });
      if (ev.type !== 'pass') return;
    }

    const A = ev.team;
    const D = other(A);
    switch (ev.type) {
      case 'pass': {
        // A팀 빌드업: (필요하면 먼저 공을 찾아오고) 가까운 동료에게 패스하며 전진
        const start = this.winBallFirst(A, s, e);
        const target = ev.slot ?? 5;
        const path = this.route(A, start, target);
        const begin = this.ball.owner?.team === A ? s + 0.4 : s + Math.min(0.8, (e - s) * 0.35);
        this.planPasses(A, path, begin, e);
        break;
      }
      case 'tackle':
      case 'foul': {
        // 공 가진 쪽(D)이 드리블하고, A팀에서 가장 가까운 선수가 달려들어 뺏는다(반칙)
        const carrier = this.ball.owner?.team === D ? this.ball.owner.slot : this.winBallFirst(D, s, Math.min(e, s + 0.8));
        void carrier;
        const ch = this.nearest(A, this.ball.x, this.ball.y);
        this.challenger = { team: A, slot: ch };
        break;
      }
      case 'chance': {
        // 슈터가 박스 쪽으로 침투하고, 마지막 패스가 그 자리로 들어간다
        const shooter = ev.slot ?? 9;
        const start = this.winBallFirst(A, s, e);
        const gx = goalX(A);
        const sb = this.body({ team: A, slot: shooter });
        const runX = gx - dirOf(A) * rand(11, 17);
        const runY = clamp(sb.y + (PW / 2 - sb.y) * 0.6 + rand(-4, 4), 14, PW - 14);
        const point = { x: runX, y: runY };
        const t0 = s + 0.1;
        this.moves.set(this.key({ team: A, slot: shooter }), { x: runX, y: runY, speed: 8.5, until: e + 0.3 });
        if (start === shooter) {
          // 직접 드리블 돌파
          this.moves.set(this.key({ team: A, slot: shooter }), { x: runX, y: runY, speed: 7.5, until: e + 0.3 });
        } else {
          const path = this.route(A, start, shooter, point);
          const wing = shooter === 8 || shooter === 10;
          this.planPasses(A, path, t0 + (this.ball.owner?.team === A ? 0.15 : 0.5), e, { point, lofted: wing && path.length === 1 });
        }
        // 수비수 한 명이 슈터를 따라간다
        const marker = this.nearest(D, runX, runY);
        if (marker >= 0) this.moves.set(this.key({ team: D, slot: marker }), { x: runX - dirOf(A) * 2, y: runY + 1, speed: 8, until: e + 0.3 });
        break;
      }
      case 'goal':
      case 'miss':
      case 'save': {
        const shooterTeam = ev.type === 'save' ? D : A;
        const keeperTeam = other(shooterTeam);
        const gx = goalX(shooterTeam);
        const kb = this.body({ team: keeperTeam, slot: 0 });
        const t0 = s + 0.05;
        if (ev.type === 'goal') {
          const ty = PW / 2 + (Math.random() < 0.5 ? -1 : 1) * rand(1.5, 3.2);
          this.shootAt(t0, e, gx + dirOf(shooterTeam) * 1.2, ty, rand(0.3, 2), !!ev.powerShot);
          // 골키퍼는 반대쪽으로 몸을 날린다
          this.at(t0 + 0.1, () => {
            kb.diveUntil = e + 0.7;
            kb.diveDir = ty > kb.y ? -1 : 1;
          });
        } else if (ev.type === 'save') {
          const ty = PW / 2 + rand(-2.8, 2.8);
          this.shootAt(t0, e, gx - dirOf(shooterTeam) * 0.9, ty, rand(0.4, 1.4), false);
          this.moves.set(this.key({ team: keeperTeam, slot: 0 }), { x: gx - dirOf(shooterTeam) * 1, y: ty, speed: 11, until: e + 0.2 });
          this.at(t0 + 0.15, () => {
            kb.diveUntil = e + 0.6;
            kb.diveDir = ty > kb.y ? 1 : -1;
          });
        } else {
          const wide = Math.random() < 0.6;
          const ty = wide ? PW / 2 + (Math.random() < 0.5 ? -1 : 1) * rand(4.6, 8) : PW / 2 + rand(-3, 3);
          this.shootAt(t0, e, gx + dirOf(shooterTeam) * 2, ty, wide ? 0.8 : 3.4, false);
        }
        break;
      }
      case 'freekick':
        this.setPiece(A, ev.slot ?? 9, false);
        break;
      case 'penalty':
        this.setPiece(A, ev.slot ?? 9, true);
        break;
      default:
        break;
    }
  }

  /** 세트피스: 키커는 공 뒤, 수비벽(프리킥) 또는 박스 밖(페널티), 골키퍼는 골라인. 중계처럼 장면 전환 */
  private setPiece(A: 0 | 1, kicker: number, penalty: boolean): void {
    const D = other(A);
    const dir = dirOf(A);
    const gx = goalX(A);
    if (penalty) {
      this.ball.x = gx - dir * 11;
      this.ball.y = PW / 2;
    } else {
      this.ball.x = gx - dir * rand(21, 28);
      this.ball.y = clamp(this.ball.y, 16, PW - 16);
    }
    this.ball.owner = null;
    this.ball.flight = null;
    this.ball.rollingTo = null;
    const arr = new Map<string, { x: number; y: number }>();
    arr.set(`${A}-${kicker}`, { x: this.ball.x - dir * 2.2, y: this.ball.y - 0.8 });
    arr.set(`${D}-0`, { x: gx - dir * 0.6, y: PW / 2 });
    const vx = gx - this.ball.x;
    const vy = PW / 2 - this.ball.y;
    const len = Math.hypot(vx, vy) || 1;
    const boxEdge = gx - dir * 18;
    let wall = 0;
    for (let slot = 1; slot < 11; slot++) {
      if (!penalty && wall < 4) {
        arr.set(`${D}-${slot}`, { x: this.ball.x + (vx / len) * 9.15 + (-vy / len) * (wall - 1.5) * 0.75, y: this.ball.y + (vy / len) * 9.15 + (vx / len) * (wall - 1.5) * 0.75 });
        wall++;
        continue;
      }
      const spreadY = PW / 2 + ((slot % 5) - 2) * 6.5;
      const x = penalty ? boxEdge - dir * (1.5 + (slot % 4) * 2.2) : gx - dir * (8 + (slot % 4) * 3);
      arr.set(`${D}-${slot}`, { x, y: spreadY + 1.5 + (slot % 2) * 1.2 });
    }
    for (let slot = 1; slot < 11; slot++) {
      if (slot === kicker) continue;
      const spreadY = PW / 2 + ((slot % 5) - 2) * 6.5;
      const x = penalty ? boxEdge - dir * (2.5 + ((slot + 2) % 4) * 2.2) : gx - dir * (10 + (slot % 4) * 3);
      arr.set(`${A}-${slot}`, { x, y: spreadY - 1.5 - (slot % 2) * 1.2 });
    }
    arr.set(`${A}-0`, { x: ownGoalX(A) + dir * 20, y: PW / 2 });
    this.arrangement = arr;
    // 중계처럼 세트피스 장면으로 바로 넘어간다
    for (const [key, p] of arr) {
      const [team, slot] = key.split('-').map(Number);
      const b = this.bodies[team][slot];
      b.x = p.x;
      b.y = p.y;
      b.vx = 0;
      b.vy = 0;
    }
    this.cam.x = this.ball.x + dir * 8;
    this.cam.y = this.ball.y;
    this.cam.w = 54;
    // 키커가 공 쪽으로 달려가서 찬다 (결과 이벤트의 슛 직전)
    this.possession = A;
  }

  /** 이벤트 i가 일어난 순간 */
  private resolve(i: number, late: boolean): void {
    const ev = this.events![i];
    const A = ev.team;
    const D = other(A);
    switch (ev.type) {
      case 'kickoff':
        this.kickoff(0, true);
        break;
      case 'pass':
        this.arrangement = null;
        this.land({ team: A, slot: ev.slot ?? 5 });
        if (late) this.snapShape(A);
        break;
      case 'tackle': {
        this.arrangement = null;
        const ch = this.challenger ?? { team: A, slot: this.nearest(A, this.ball.x, this.ball.y) };
        const b = this.body(ch);
        // 뺏는 순간 공 가까이에
        b.x += (this.ball.x - b.x) * 0.7;
        b.y += (this.ball.y - b.y) * 0.7;
        this.land(ch);
        break;
      }
      case 'foul': {
        const victim = this.ball.owner?.team === D ? this.ball.owner : { team: D, slot: this.nearest(D, this.ball.x, this.ball.y) };
        const ch = this.challenger ?? { team: A, slot: this.nearest(A, this.ball.x, this.ball.y) };
        const cb = this.body(ch);
        cb.x += (this.ball.x - cb.x) * 0.7;
        cb.y += (this.ball.y - cb.y) * 0.7;
        this.body(victim).fallenUntil = this.now + 1.5;
        this.land(victim);
        this.referee = { x: cb.x - 4, y: cb.y + 3 };
        // 카드는 실제로 반칙한 선수에게
        this.challenger = ch;
        break;
      }
      case 'yellow':
      case 'red': {
        const who = this.challenger ?? { team: A, slot: ev.slot ?? 2 };
        this.card = { color: ev.type === 'yellow' ? '#f5d90a' : '#e5484d', team: who.team, slot: who.slot, until: this.now + 1.8 };
        break;
      }
      case 'chance': {
        this.arrangement = null;
        const shooter = { team: A, slot: ev.slot ?? 9 };
        const sb = this.body(shooter);
        // 공이 아직 오는 중이면 슈터가 받는 자리로 맞춘다
        if (this.ball.flight?.to && this.ball.flight.to.slot === shooter.slot && this.ball.flight.to.team === A) {
          sb.x = this.ball.flight.tx;
          sb.y = this.ball.flight.ty;
        }
        this.land(shooter);
        if (late) {
          sb.x = goalX(A) - dirOf(A) * 14;
          sb.y = PW / 2;
        }
        break;
      }
      case 'freekick':
      case 'penalty': {
        // 키커가 공 옆에 선다 (다음 결과 이벤트에서 찬다)
        const k = this.body({ team: A, slot: ev.slot ?? 9 });
        k.x = this.ball.x - dirOf(A) * 1;
        k.y = this.ball.y;
        this.possession = A;
        break;
      }
      case 'goal': {
        this.arrangement = null;
        const gx = goalX(A);
        this.ball.flight = null;
        this.ball.rollingTo = null;
        this.ball.x = gx + dirOf(A) * 1.4;
        this.ball.z = 0.2;
        this.ball.owner = null;
        this.netShake = { side: A === 0 ? 1 : -1, until: this.now + 1.2 };
        const scorer = ev.slot ?? 9;
        this.celebration = { team: A, slot: scorer, until: this.now + 3, corner: { x: gx - dirOf(A) * 2, y: this.body({ team: A, slot: scorer }).y < PW / 2 ? 2 : PW - 2 } };
        this.cam.shake = ev.powerShot ? 1 : 0.6;
        break;
      }
      case 'save': {
        this.arrangement = null;
        const k = this.body({ team: A, slot: 0 });
        this.ball.x = k.x;
        this.ball.y = k.y;
        this.land({ team: A, slot: 0 });
        break;
      }
      case 'miss': {
        this.arrangement = null;
        // 공은 밖으로 → 잠시 뒤 골킥
        this.ball.flight = null;
        this.ball.owner = null;
        this.ball.vx = dirOf(A) * 6;
        this.ball.vy = 0;
        const keeperTeam = D;
        this.at(this.now + 0.9, () => {
          const k = this.body({ team: keeperTeam, slot: 0 });
          this.ball.x = ownGoalX(keeperTeam) + dirOf(keeperTeam) * 5.5;
          this.ball.y = PW / 2;
          k.x = this.ball.x - dirOf(keeperTeam) * 0.8;
          k.y = this.ball.y;
          this.land({ team: keeperTeam, slot: 0 });
        });
        break;
      }
      case 'halftime':
      case 'fulltime':
        this.arrangement = null;
        this.celebration = null;
        this.ball.flight = null;
        if (ev.type === 'fulltime') this.ball.owner = null;
        break;
    }
    if (late) {
      // 늦게 들어와서 지나간 장면은 연출 없이 상태만 맞춘다
      this.celebration = null;
      this.card = null;
      this.netShake = null;
      if (ev.type === 'goal') this.kickoff(other(A), true);
      if (ev.type === 'halftime') this.kickoff(1, true);
    }
  }

  /** 늦게 들어왔을 때 선수들을 공 근처 대형으로 바로 옮긴다 */
  private snapShape(A: 0 | 1): void {
    for (const team of [0, 1] as const) {
      this.bodies[team].forEach((b, slot) => {
        const p = this.shapeTarget(team, slot, this.ball.x, this.ball.y, team === A);
        b.x = p.x;
        b.y = p.y;
      });
    }
  }

  /** 대형 유지: 공 위치와 공격/수비 상황에 따라 블록이 움직인다 */
  private shapeTarget(team: 0 | 1, slot: number, bx: number, by: number, attacking: boolean): { x: number; y: number } {
    const b = basePos(team, slot);
    const dir = dirOf(team);
    if (slot === 0) {
      const gx = ownGoalX(team);
      return { x: gx + dir * (attacking ? 10 : 3) + (bx - PL / 2) * 0.05, y: PW / 2 + (by - PW / 2) * 0.22 };
    }
    // 공을 가진 팀은 라인을 올리고 넓게, 수비 팀은 내리고 좁게
    const shift = (bx - PL / 2) * 0.6;
    const push = attacking ? 6 : -4;
    const runner = attacking && (slot === 8 || slot === 9 || slot === 10) ? 4 : 0;
    const width = attacking ? 1.1 : 0.8;
    const x = b.x + shift + dir * (push + runner);
    const y = PW / 2 + (b.y - PW / 2) * width + (by - PW / 2) * 0.3;
    return { x: clamp(x, 4, PL - 4), y: clamp(y, 3, PW - 3) };
  }

  // ───────── 물리 ─────────

  private step(dt: number): void {
    const now = this.now;
    const bx = this.ball.x;
    const by = this.ball.y;
    const owner = this.ball.owner;
    const defTeam = other(this.possession);
    // 압박: 수비 쪽에서 공에 가장 가까운 선수 (태클 담당이 있으면 그 선수)
    const presser = this.challenger && this.challenger.team === defTeam ? this.challenger.slot : this.nearest(defTeam, bx, by);
    const pressSpeed = this.challenger ? 8.5 : 6.5;

    for (const team of [0, 1] as const) {
      const dir = dirOf(team);
      this.bodies[team].forEach((b, slot) => {
        const key = `${team}-${slot}`;
        if (b.fallenUntil > now || b.diveUntil > now) {
          b.vx *= 0.85;
          b.vy *= 0.85;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          return;
        }
        let tx: number;
        let ty: number;
        let speed = 6;
        const arr = this.arrangement?.get(key);
        const mv = this.moves.get(key);
        if (this.celebration) {
          const c = this.celebration;
          const scorer = this.body({ team: c.team, slot: c.slot });
          if (team === c.team && slot === c.slot) {
            tx = c.corner.x;
            ty = c.corner.y;
            speed = 8;
          } else if (team === c.team && slot !== 0) {
            tx = scorer.x - dir * (1.5 + (slot % 3));
            ty = scorer.y + ((slot % 5) - 2) * 1.3;
            speed = 7.5;
          } else {
            const p = kickoffPos(team, slot, false);
            tx = p.x;
            ty = p.y;
            speed = 2.5;
          }
        } else if (arr) {
          tx = arr.x;
          ty = arr.y;
          speed = 7;
        } else if (mv && mv.until > now) {
          tx = mv.x;
          ty = mv.y;
          speed = mv.speed;
        } else if (owner && owner.team === team && owner.slot === slot) {
          // 공 가진 선수: 앞으로 드리블 (빈 공간 쪽으로 살짝)
          tx = b.x + dir * 4;
          ty = b.y + (PW / 2 - b.y) * 0.08;
          speed = 4;
        } else if (team === defTeam && slot === presser && (owner || this.ball.flight)) {
          // 공 가진 선수 앞을 막는다 (골문 쪽에 선다)
          const ob = owner ? this.body(owner) : { x: bx, y: by };
          tx = ob.x - dirOf(defTeam) * 1.5;
          ty = ob.y;
          speed = pressSpeed;
        } else {
          const p = this.shapeTarget(team, slot, bx, by, team === this.possession);
          tx = p.x;
          ty = p.y;
          speed = 5.5;
        }
        const dx = tx - b.x;
        const dy = ty - b.y;
        const d = Math.hypot(dx, dy);
        // 가까우면 천천히 멈추고, 멀면 최고 속도까지
        const want = d < 0.3 ? 0 : Math.min(speed, d * 1.8);
        const wvx = d > 0 ? (dx / d) * want : 0;
        const wvy = d > 0 ? (dy / d) * want : 0;
        const a = Math.min(1, dt * 4);
        b.vx += (wvx - b.vx) * a;
        b.vy += (wvy - b.vy) * a;
        b.x = clamp(b.x + b.vx * dt, -2, PL + 2);
        b.y = clamp(b.y + b.vy * dt, -2, PW + 2);
      });
    }

    // 공
    const f = this.ball.flight;
    if (f) {
      const p = clamp((now - f.t0) / (f.t1 - f.t0), 0, 1);
      this.ball.x = f.fx + (f.tx - f.fx) * p;
      this.ball.y = f.fy + (f.ty - f.fy) * p;
      this.ball.z = f.fz + (f.tz - f.fz) * p + f.peak * 4 * p * (1 - p);
      if (p >= 1) {
        this.ball.flight = null;
        this.ball.z = f.tz;
        if (f.to) {
          // 받는 선수가 가까우면 바로 받고, 아니면 그쪽으로 굴러간다
          const r = this.body(f.to);
          if (dist(r.x, r.y, this.ball.x, this.ball.y) < 2.2) this.land(f.to);
          else this.ball.rollingTo = f.to;
        }
      }
    } else if (this.ball.rollingTo) {
      const r = this.body(this.ball.rollingTo);
      const d = dist(r.x, r.y, this.ball.x, this.ball.y);
      if (d < 1.2) this.land(this.ball.rollingTo);
      else {
        const sp = Math.min(d, 7 * dt);
        this.ball.x += ((r.x - this.ball.x) / d) * sp;
        this.ball.y += ((r.y - this.ball.y) / d) * sp;
        // 받는 선수도 공 쪽으로
        this.moves.set(this.key(this.ball.rollingTo), { x: this.ball.x, y: this.ball.y, speed: 8, until: now + 0.3 });
      }
    } else if (this.ball.owner) {
      const o = this.body(this.ball.owner);
      const dir = dirOf(this.ball.owner.team);
      const sp = Math.hypot(o.vx, o.vy);
      // 드리블: 발 앞에서 살짝 튕긴다
      const fx = o.x + dir * (0.6 + (sp > 1 ? Math.abs(Math.sin(now * 7)) * 0.5 : 0));
      const fy = o.y + 0.25;
      // 발밑에서 멀리 있으면 (태클로 뺏었거나 흘러온 공) 순간이동하지 않고 끌고 온다
      const gap = dist(fx, fy, this.ball.x, this.ball.y);
      if (gap > 1.5) {
        const sp2 = Math.min(gap, 16 * dt);
        this.ball.x += ((fx - this.ball.x) / gap) * sp2;
        this.ball.y += ((fy - this.ball.y) / gap) * sp2;
      } else {
        this.ball.x = fx;
        this.ball.y = fy;
      }
      this.ball.z = Math.max(0, this.ball.z - dt * 4);
    } else {
      // 굴러가는 공
      this.ball.x += this.ball.vx * dt;
      this.ball.y += this.ball.vy * dt;
      this.ball.vx *= 1 - dt * 1.2;
      this.ball.vy *= 1 - dt * 1.2;
      this.ball.z = Math.max(0, this.ball.z - dt * 3);
    }
    if (this.celebration && this.celebration.until < now) this.celebration = null;

    // 심판: 공에서 조금 떨어져 따라다닌다
    const rx = clamp(this.ball.x - 8, 4, PL - 4);
    const ry = clamp(this.ball.y + (this.ball.y < PW / 2 ? 10 : -10), 4, PW - 4);
    this.referee.x += (rx - this.referee.x) * Math.min(1, dt * 1.2);
    this.referee.y += (ry - this.referee.y) * Math.min(1, dt * 1.2);
  }

  // ───────── 카메라 ─────────

  private updateCamera(dt: number): void {
    // 공을 부드럽게 따라가고, 박스 근처에서만 살짝 확대한다
    const nearGoal = this.ball.x < 25 || this.ball.x > PL - 25;
    const focusW = this.celebration ? 58 : nearGoal ? 58 : 68;
    const lead = this.ball.owner ? dirOf(this.ball.owner.team) * 5 : 0;
    const tx = this.ball.x + lead;
    const ty = this.ball.y;
    this.cam.w += (focusW - this.cam.w) * Math.min(1, dt * 0.8);
    this.cam.x += (tx - this.cam.x) * Math.min(1, dt * 1.6);
    this.cam.y += (ty - this.cam.y) * Math.min(1, dt * 1.2);
    const viewH = (this.cam.w * CH) / CW;
    this.cam.x = clamp(this.cam.x, this.cam.w / 2 - 12, PL + 12 - this.cam.w / 2);
    this.cam.y = clamp(this.cam.y, viewH / 2 - 14, PW + 14 - viewH / 2);
    this.cam.shake = Math.max(0, this.cam.shake - dt * 1.4);
  }

  // ───────── 그리기 ─────────

  private makeSeats(): void {
    const colors = ['#e5484d', '#2f6fed', '#f5b81c', '#ffffff', '#2fb35a', '#8a5cf0'];
    let n = 0;
    const add = (x: number, y: number) => {
      const r = Math.sin(n * 12.9898) * 43758.5453;
      const fill = r - Math.floor(r);
      this.seats.push({ x, y, c: colors[n % colors.length], skin: SKIN[n % SKIN.length], fill });
      n++;
    };
    for (let row = 0; row < 4; row++) {
      for (let x = -10; x <= PL + 10; x += 1.4) {
        add(x + (row % 2) * 0.7, -6 - row * 1.8);
        add(x + (row % 2) * 0.7, PW + 6 + row * 1.8);
      }
      // 골대 뒤 관중석
      for (let y = -2; y <= PW + 2; y += 1.4) {
        add(-6 - row * 1.8, y + (row % 2) * 0.7);
        add(PL + 5 + row * 1.8, y + (row % 2) * 0.7);
      }
    }
  }

  private render(meTeam: 0 | 1, squads: [Player[], Player[]], crowd: number, t: number): void {
    const g = this.g;
    const k = CW / this.cam.w;
    const sh = this.cam.shake;
    const ox = CW / 2 - this.cam.x * k + (sh ? (Math.random() - 0.5) * sh * 6 : 0);
    const oy = CH / 2 - this.cam.y * k + (sh ? (Math.random() - 0.5) * sh * 6 : 0);
    const X = (x: number) => ox + x * k;
    const Y = (y: number) => oy + y * k;

    g.fillStyle = '#1f2840';
    g.fillRect(0, 0, CW, CH);

    // 관중석 (옆, 골대 뒤)
    g.fillStyle = '#273047';
    g.fillRect(X(-14), Y(-14), (PL + 28) * k, 10.5 * k);
    g.fillRect(X(-14), Y(PW + 3.5), (PL + 28) * k, 10.5 * k);
    g.fillRect(X(-14), Y(-4), 10 * k, (PW + 8) * k);
    g.fillRect(X(PL + 4), Y(-4), 10 * k, (PW + 8) * k);
    const cheer = this.celebration !== null;
    for (const s of this.seats) {
      if (s.fill > crowd) continue;
      const sx = X(s.x);
      const sy = Y(s.y);
      if (sx < -4 || sx > CW + 4 || sy < -4 || sy > CH + 4) continue;
      const jump = cheer ? Math.abs(Math.sin(t / 90 + s.x)) * k * 0.5 : 0;
      g.fillStyle = s.c;
      g.fillRect(sx, sy - jump, k * 0.9, k * 1);
      g.fillStyle = s.skin;
      g.fillRect(sx + k * 0.1, sy - jump - k * 0.6, k * 0.7, k * 0.6);
    }
    if (crowd > 0.5 && Math.random() < crowd * 0.4) {
      g.fillStyle = '#fff';
      g.fillRect(Math.random() * CW, Y(Math.random() < 0.5 ? -8 : PW + 8), 2, 2);
    }

    // 광고판
    const sponsors = ['바삭치킨', '튼튼철물', '행복부동산', '새벽우유', '동네약국', '번개택배', '막걸리상회'];
    const sc = ['#e5484d', '#2f6fed', '#f5b81c', '#2fb35a', '#8a5cf0', '#f07a2c'];
    g.font = `bold ${Math.max(6, k * 1.4)}px sans-serif`;
    g.textAlign = 'center';
    for (const top of [true, false]) {
      const y = top ? -3.2 : PW + 1.4;
      for (let i = 0; i * 12 < PL + 20; i++) {
        const x = -8 + i * 12;
        g.fillStyle = sc[(i + (top ? 0 : 3)) % sc.length];
        g.fillRect(X(x), Y(y), 11.8 * k, 1.8 * k);
        g.fillStyle = '#fff';
        g.fillText(sponsors[(i + (top ? 0 : 2)) % sponsors.length], X(x + 5.9), Y(y + 1.35));
      }
    }

    // 경기장 바깥 잔디(여유 공간)
    g.fillStyle = '#358a41';
    g.fillRect(X(-4), Y(-2.5), (PL + 8) * k, (PW + 5) * k);
    // 잔디 (줄무늬)
    for (let i = 0; i < 14; i++) {
      g.fillStyle = i % 2 ? '#3f9b4b' : '#47a853';
      g.fillRect(X((i * PL) / 14), Y(-1), (PL / 14) * k + 1, (PW + 2) * k);
    }
    // 선
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = Math.max(1, k * 0.12);
    g.strokeRect(X(0), Y(0), PL * k, PW * k);
    g.beginPath();
    g.moveTo(X(PL / 2), Y(0));
    g.lineTo(X(PL / 2), Y(PW));
    g.stroke();
    g.beginPath();
    g.arc(X(PL / 2), Y(PW / 2), 9.15 * k, 0, Math.PI * 2);
    g.stroke();
    for (const left of [true, false]) {
      const gx = left ? 0 : PL;
      const d = left ? 1 : -1;
      g.strokeRect(X(left ? 0 : PL - 16.5), Y(PW / 2 - 20.15), 16.5 * k, 40.3 * k);
      g.strokeRect(X(left ? 0 : PL - 5.5), Y(PW / 2 - 9.15), 5.5 * k, 18.3 * k);
      g.beginPath();
      g.arc(X(gx + d * 11), Y(PW / 2), 9.15 * k, left ? -0.93 : Math.PI - 0.93, left ? 0.93 : Math.PI + 0.93);
      g.stroke();
      g.fillStyle = '#fff';
      g.fillRect(X(gx + d * 11) - 1, Y(PW / 2) - 1, 2, 2);
      // 골대와 그물 (골이 들어가면 출렁인다)
      const shake = this.netShake && this.netShake.side === d * -1 && this.netShake.until > this.now ? Math.sin(t / 30) * 0.4 : 0;
      const nx = left ? -2 : PL;
      g.fillStyle = 'rgba(255,255,255,0.22)';
      g.fillRect(X(nx + (left ? -shake : shake)), Y(PW / 2 - 3.66), 2 * k, 7.32 * k);
      g.strokeStyle = 'rgba(255,255,255,0.5)';
      g.lineWidth = 0.6;
      for (let yy = -3.66; yy <= 3.66; yy += 0.6) {
        g.beginPath();
        g.moveTo(X(nx + (left ? -shake : shake)), Y(PW / 2 + yy));
        g.lineTo(X(nx + 2 + (left ? -shake : shake)), Y(PW / 2 + yy));
        g.stroke();
      }
      g.strokeStyle = '#fff';
      g.lineWidth = Math.max(1.5, k * 0.18);
      g.beginPath();
      g.moveTo(X(gx), Y(PW / 2 - 3.66));
      g.lineTo(X(gx - d * 2), Y(PW / 2 - 3.66));
      g.lineTo(X(gx - d * 2), Y(PW / 2 + 3.66));
      g.lineTo(X(gx), Y(PW / 2 + 3.66));
      g.stroke();
      // 코너 깃발
      for (const fy of [0, PW]) {
        g.fillStyle = '#fff';
        g.fillRect(X(gx) - 0.5, Y(fy) - k * 1.6, 1, k * 1.6);
        g.fillStyle = '#f5b81c';
        g.fillRect(X(gx) + (left ? 0.5 : -k * 0.9), Y(fy) - k * 1.6, k * 0.9, k * 0.6);
      }
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      g.lineWidth = Math.max(1, k * 0.12);
    }

    // 선수 + 심판 (아래쪽이 앞에 오게)
    // 선수는 실제보다 크게 (픽셀 게임처럼 잘 보이게)
    const u = (k * 3.4) / 12;
    const kits = [meTeam === 0 ? this.myKit : oppKitFor(this.myKit), meTeam === 1 ? this.myKit : oppKitFor(this.myKit)];
    type D = { y: number; draw: () => void };
    const list: D[] = [];
    const frame = Math.floor(t / 120);
    for (const team of [0, 1] as const) {
      this.bodies[team].forEach((b, slot) => {
        list.push({
          y: b.y,
          draw: () => {
            const sx = X(b.x);
            const sy = Y(b.y);
            if (sx < -20 || sx > CW + 20 || sy < -20 || sy > CH + 20) return;
            const speed = Math.hypot(b.vx, b.vy);
            const celebrating = this.celebration && this.celebration.team === team;
            const pose = celebrating ? 'cheer' : speed > 0.8 ? 'run' : 'stand';
            const fallen = b.fallenUntil > this.now;
            const diving = b.diveUntil > this.now && b.diveUntil - this.now < 0.9;
            const p = squads[team][slot];
            g.save();
            if (fallen || diving) {
              g.translate(sx, sy);
              g.rotate(((diving ? b.diveDir : 1) * Math.PI) / (diving ? 2.6 : 2));
              g.translate(-sx, -sy);
            }
            drawPlayerSprite(g, sx, sy, u, kits[team], p?.avatar, {
              keeper: slot === 0,
              frame: frame + slot,
              facing: b.vx === 0 ? (team === 0 ? 1 : -1) : b.vx > 0 ? 1 : -1,
              pose,
              ring: this.ball.owner?.team === team && this.ball.owner.slot === slot,
            });
            g.restore();
          },
        });
      });
    }
    list.push({
      y: this.referee.y,
      draw: () => {
        const sx = X(this.referee.x);
        const sy = Y(this.referee.y);
        drawPlayerSprite(g, sx, sy, u, { shirt: '#1d2433', shorts: '#1d2433', socks: '#1d2433', keeper: '#1d2433', ring: '#fff' }, { skin: 1, hair: 0, hairStyle: 1, beard: 0 }, { frame, pose: 'run' });
      },
    });
    list.sort((a, b) => a.y - b.y).forEach((d) => d.draw());

    // 카드: 심판 머리 위
    if (this.card && this.card.until > this.now) {
      const sx = X(this.referee.x);
      const sy = Y(this.referee.y) - 14 * u - 6;
      g.fillStyle = '#1d2433';
      g.fillRect(sx - 4, sy - 7, 8, 11);
      g.fillStyle = this.card.color;
      g.fillRect(sx - 3, sy - 6, 6, 9);
    }

    // 공 (높이만큼 위로, 그림자는 땅에)
    const bsx = X(this.ball.x);
    const bsy = Y(this.ball.y);
    const lift = this.ball.z * k * 0.9;
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath();
    g.ellipse(bsx, bsy + 1, Math.max(2, k * 0.35), Math.max(1, k * 0.15), 0, 0, Math.PI * 2);
    g.fill();
    const br = Math.max(3, k * 0.5);
    g.fillStyle = '#1b1f2a';
    g.fillRect(bsx - br - 0.5, bsy - br - lift - 0.5, br * 2 + 1, br * 2 + 1);
    g.fillStyle = '#fff';
    g.fillRect(bsx - br, bsy - br - lift, br * 2, br * 2);
    g.fillStyle = '#1b1f2a';
    g.fillRect(bsx - br * 0.3, bsy - br * 0.3 - lift, br * 0.6, br * 0.6);

    // 공 가진 선수 이름 (중계 화면처럼)
    const o = this.ball.owner;
    if (o) {
      const b = this.body(o);
      const p = squads[o.team][o.slot];
      if (p) {
        const name = p.name.replace(/^'.*' /, '');
        g.font = 'bold 9px sans-serif';
        const tw = g.measureText(name).width;
        const sx = X(b.x);
        const sy = Y(b.y) - 14 * u - 6;
        g.fillStyle = o.team === meTeam ? 'rgba(47,111,237,0.9)' : 'rgba(229,72,77,0.9)';
        g.fillRect(sx - tw / 2 - 4, sy - 9, tw + 8, 12);
        g.fillStyle = '#fff';
        g.textAlign = 'center';
        g.fillText(name, sx, sy);
      }
    }
  }

  /** 지금 화면이 흥분할 상황인지 (관중 소리용): 0~1 */
  excitement(): number {
    if (this.celebration) return 1;
    const f = this.ball.flight;
    if (f && !f.to) return 0.9;
    const x = this.ball.x;
    return x < 22 || x > PL - 22 ? 0.55 : 0.2;
  }

  /** 지금 공을 가진 선수 (해설·이름표용) */
  ownerName(squads: [Player[], Player[]]): string | null {
    const o = this.ball.owner;
    return o ? squads[o.team][o.slot]?.name ?? null : null;
  }
}
