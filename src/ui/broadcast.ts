import type { MatchEvent } from '../game/match';
import type { Player } from '../game/types';
import { SKIN } from './avatar';
import { BASE, MY_KIT, type TeamKit, drawPlayerSprite, oppKitFor } from './pitch';

// TV 중계처럼 보이는 경기 화면.
// 경기 결과(이벤트 목록)는 그대로 두고, 이벤트 사이를 실제 축구처럼 연출한다:
// 패스가 오가고, 수비가 압박하고, 슛이 날아가고, 골이 들어가면 세리머니 후 킥오프.
// 좌표는 실제 경기장 규격(미터): 가로 105, 세로 68. 홈 팀은 +x 방향으로 공격한다.

const PL = 105;
const PW = 68;
const CW = 400;
const CH = 280;

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
    let gap = 0.9;
    if (p.type === 'goal') gap = 4.2;
    else if (p.type === 'halftime') gap = 2.2;
    else if (e.type === 'chance') gap = 1.2;
    else if (e.type === 'freekick' || e.type === 'penalty') gap = 1.7;
    else if ((e.type === 'goal' || e.type === 'save' || e.type === 'miss') && (p.type === 'freekick' || p.type === 'penalty')) gap = 1.5;
    else if ((e.type === 'goal' || e.type === 'save' || e.type === 'miss') && p.type === 'chance') gap = 0.85;
    else if (e.type === 'yellow' || e.type === 'red') gap = 0.6;
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
  /** 도착하면 공을 가질 선수 */
  to: { team: 0 | 1; slot: number } | null;
}

interface Ball {
  x: number;
  y: number;
  z: number;
  owner: { team: 0 | 1; slot: number } | null;
  flight: Flight | null;
  vx: number;
  vy: number;
}

type Override = { x: number; y: number; speed: number };

const dirOf = (team: 0 | 1) => (team === 0 ? 1 : -1);
const goalX = (attackingTeam: 0 | 1) => (attackingTeam === 0 ? PL : 0);
const ownGoalX = (team: 0 | 1) => (team === 0 ? 0 : PL);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

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
  private ball: Ball = { x: PL / 2, y: PW / 2, z: 0, owner: null, flight: null, vx: 0, vy: 0 };
  private possession: 0 | 1 = 0;
  private events: MatchEvent[] | null = null;
  private times: number[] = [];
  /** 다음에 처리할 이벤트 번호 */
  private next = 0;
  private lastT = 0;
  private now = 0;
  private overrides = new Map<string, Override>();
  /** 세트피스·킥오프처럼 모두가 정해진 자리로 가야 할 때 */
  private arrangement: Map<string, { x: number; y: number }> | null = null;
  private celebration: { team: 0 | 1; slot: number; until: number; corner: { x: number; y: number } } | null = null;
  private card: { color: string; team: 0 | 1; slot: number; until: number } | null = null;
  private netShake: { side: number; until: number } | null = null;
  private referee = { x: PL / 2 - 6, y: PW / 2 + 8 };
  private cam = { x: PL / 2, y: PW / 2, w: 90, shake: 0 };
  private camFocus: 'play' | 'wide' | 'tight' = 'wide';
  private pendingKickoff: { at: number; team: 0 | 1 } | null = null;
  private seats: { x: number; y: number; c: string; skin: string; fill: number }[] = [];

  constructor() {
    this.canvas = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = CW * dpr;
    this.canvas.height = CH * dpr;
    this.g = this.canvas.getContext('2d')!;
    this.g.scale(dpr, dpr);
    this.g.imageSmoothingEnabled = false;
    this.resetBodies(0);
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
    this.step(dt);
    this.updateCamera(dt);
    this.render(meTeam, squads, crowd, t);
  }

  // ───────── 경기 흐름 ─────────

  private startMatch(events: MatchEvent[] | null, durMs: number): void {
    this.events = events;
    this.times = events ? eventTimes(events, durMs) : [];
    this.next = 0;
    this.overrides.clear();
    this.arrangement = null;
    this.celebration = null;
    this.card = null;
    this.pendingKickoff = null;
    this.ball.flight = null;
    this.resetBodies(0);
    this.camFocus = 'wide';
  }

  private resetBodies(kicking: 0 | 1): void {
    for (const team of [0, 1] as const) {
      this.bodies[team] = BASE.map((_, slot) => {
        const p = kickoffPos(team, slot, team === kicking);
        return { x: p.x, y: p.y, vx: 0, vy: 0, fallenUntil: 0, diveUntil: 0, diveDir: 0 };
      });
    }
    this.ball = { x: PL / 2, y: PW / 2, z: 0, owner: { team: kicking, slot: 9 }, flight: null, vx: 0, vy: 0 };
    this.possession = kicking;
  }

  /** 지난 이벤트를 처리하고 다음 이벤트까지의 연출을 준비한다 */
  private advance(): void {
    const ev = this.events!;
    let guard = 0;
    while (this.next < ev.length && this.times[this.next] / 1000 <= this.now && guard++ < 200) {
      const late = this.now - this.times[this.next] / 1000 > 1.5;
      this.resolve(this.next, late);
      this.next++;
      if (this.next < ev.length) this.setup(this.next, this.times[this.next - 1] / 1000, this.times[this.next] / 1000, late);
    }
  }

  private body(team: 0 | 1, slot: number): Body {
    return this.bodies[team][slot];
  }

  private carrier(): { team: 0 | 1; slot: number } | null {
    return this.ball.owner;
  }

  /** 공을 from에서 (team, slot)에게 보낸다. 도착 시각 t1 */
  private pass(team: 0 | 1, slot: number, t0: number, t1: number, lofted = false, at?: { x: number; y: number }): void {
    const target = at ?? this.body(team, slot);
    this.ball.flight = {
      fx: this.ball.x, fy: this.ball.y, fz: 0,
      tx: target.x, ty: target.y, tz: 0,
      t0, t1: Math.max(t0 + 0.25, t1),
      peak: lofted ? 3.2 : 0.15,
      to: { team, slot },
    };
    this.ball.owner = null;
    this.possession = team;
  }

  private shoot(t0: number, t1: number, tx: number, ty: number, tz: number, power = false): void {
    this.ball.flight = { fx: this.ball.x, fy: this.ball.y, fz: 0.2, tx, ty, tz, t0, t1: Math.max(t0 + (power ? 0.3 : 0.38), t1), peak: power ? 0.4 : 1.2, to: null };
    this.ball.owner = null;
  }

  /** 다음 이벤트 i가 일어나기 전 [s, e] 동안의 연출을 준비한다 */
  private setup(i: number, s: number, e: number, instant: boolean): void {
    const ev = this.events![i];
    const prev = this.events![i - 1];
    this.overrides.clear();
    if (instant) return;
    const L = e - s;

    // 골이 난 뒤에는 세리머니 → 제자리 → 킥오프
    if (prev?.type === 'goal') {
      const conceded = (prev.team === 0 ? 1 : 0) as 0 | 1;
      this.pendingKickoff = { at: s + Math.min(2.8, L * 0.65), team: conceded };
      return;
    }
    if (prev?.type === 'halftime') {
      this.pendingKickoff = { at: s + Math.min(1.4, L * 0.5), team: 1 };
      return;
    }

    const A = ev.team;
    const D = (A === 0 ? 1 : 0) as 0 | 1;
    switch (ev.type) {
      case 'pass': {
        // 같은 팀이 공을 돌린다: 중간 패스 한 번 + 이벤트 주인공에게 패스
        const slot = ev.slot ?? 5;
        const c = this.carrier();
        if (L > 1.3 && c && c.team === A) {
          const mids = [1, 2, 3, 4, 5, 6, 7].filter((x) => x !== slot && x !== c.slot);
          const mid = mids[Math.floor(Math.random() * mids.length)];
          this.pass(A, mid, s + 0.05, s + L * 0.45);
          this.queued = { t: s + L * 0.5, fn: () => this.pass(A, slot, s + L * 0.5, e) };
        } else this.pass(A, slot, s + 0.05, e);
        break;
      }
      case 'tackle':
      case 'foul': {
        // 수비수(이벤트 팀)가 공 가진 선수에게 달려든다
        if (ev.slot !== undefined) this.overrides.set(`${A}-${ev.slot}`, { x: this.ball.x, y: this.ball.y, speed: 9.5 });
        break;
      }
      case 'chance': {
        // 슈터가 박스 안으로 침투하고, 공이 그 자리로 간다
        const slot = ev.slot ?? 9;
        const gx = goalX(A);
        const runX = gx - dirOf(A) * (10 + Math.random() * 8);
        const runY = PW / 2 + (Math.random() - 0.5) * 22;
        this.overrides.set(`${A}-${slot}`, { x: runX, y: runY, speed: 9 });
        const c = this.carrier();
        if (c && c.team === A && c.slot === slot) {
          // 직접 드리블 돌파
          this.overrides.set(`${A}-${slot}`, { x: runX, y: runY, speed: 7.5 });
        } else {
          const wing = slot === 8 || slot === 10;
          this.pass(A, slot, s + 0.15, e, wing, { x: runX, y: runY });
        }
        // 수비수 한 명이 따라붙는다
        const marker = this.nearest(D, runX, runY, true);
        if (marker >= 0) this.overrides.set(`${D}-${marker}`, { x: runX + dirOf(A) * 1.5, y: runY, speed: 8.5 });
        this.camFocus = 'tight';
        break;
      }
      case 'goal':
      case 'miss':
      case 'save': {
        const shooterTeam = ev.type === 'save' ? D : A;
        const keeperTeam = (shooterTeam === 0 ? 1 : 0) as 0 | 1;
        const gx = goalX(shooterTeam);
        const k = this.body(keeperTeam, 0);
        if (ev.type === 'goal') {
          const ty = PW / 2 + (Math.random() < 0.5 ? -1 : 1) * (1.6 + Math.random() * 1.8);
          this.shoot(s + 0.05, e, gx + dirOf(shooterTeam) * 1.2, ty, 0.4 + Math.random() * 1.6, !!ev.powerShot);
          this.overrides.set(`${keeperTeam}-0`, { x: k.x, y: PW / 2 + (ty - PW / 2) * -0.6, speed: 4 });
        } else if (ev.type === 'save') {
          const ty = PW / 2 + (Math.random() - 0.5) * 5;
          this.shoot(s + 0.05, e, gx - dirOf(shooterTeam) * 0.8, ty, 0.6 + Math.random(), false);
          this.overrides.set(`${keeperTeam}-0`, { x: gx - dirOf(shooterTeam) * 1, y: ty, speed: 12 });
          k.diveUntil = e + 0.6;
          k.diveDir = ty > k.y ? 1 : -1;
        } else {
          const wide = Math.random() < 0.6;
          const ty = wide ? PW / 2 + (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 3) : PW / 2 + (Math.random() - 0.5) * 6;
          this.shoot(s + 0.05, e, gx + dirOf(shooterTeam) * 2, ty, wide ? 0.8 : 3.4, false);
        }
        this.camFocus = 'tight';
        break;
      }
      case 'freekick': {
        this.setPiece(A, ev.slot ?? 9, false);
        this.camFocus = 'tight';
        break;
      }
      case 'penalty': {
        this.setPiece(A, ev.slot ?? 9, true);
        this.camFocus = 'tight';
        break;
      }
      case 'halftime':
      case 'fulltime':
        this.camFocus = 'wide';
        break;
      default:
        break;
    }
  }

  private queued: { t: number; fn: () => void } | null = null;

  /** 세트피스 배치: 키커는 공 뒤, 수비벽(프리킥) 또는 박스 밖(페널티), 골키퍼는 골라인 */
  private setPiece(A: 0 | 1, kicker: number, penalty: boolean): void {
    const D = (A === 0 ? 1 : 0) as 0 | 1;
    const dir = dirOf(A);
    const gx = goalX(A);
    const bx = penalty ? gx - dir * 11 : clamp(this.ball.x, 20, PL - 20);
    const by = penalty ? PW / 2 : clamp(this.ball.y, 12, PW - 12);
    if (!penalty) {
      // 공은 상대 골문에서 22~30m 거리로
      this.ball.x = gx - dir * (22 + Math.random() * 8);
      this.ball.y = by;
    } else {
      this.ball.x = bx;
      this.ball.y = by;
    }
    this.ball.owner = null;
    this.ball.flight = null;
    const arr = new Map<string, { x: number; y: number }>();
    arr.set(`${A}-${kicker}`, { x: this.ball.x - dir * 2.2, y: this.ball.y - 0.8 });
    arr.set(`${D}-0`, { x: gx - dir * 0.6, y: PW / 2 });
    // 골대 쪽으로 가는 방향
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
      // 나머지는 박스 근처 (페널티면 박스 밖)
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
    // 중계처럼 세트피스 장면으로 바로 넘어간다: 선수들은 자리에, 카메라는 공으로
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
    this.cam.w = 52;
  }

  /** 이벤트 i가 일어난 순간 */
  private resolve(i: number, late: boolean): void {
    const ev = this.events![i];
    const A = ev.team;
    const D = (A === 0 ? 1 : 0) as 0 | 1;
    this.queued = null;
    switch (ev.type) {
      case 'kickoff':
        this.resetBodies(0);
        this.camFocus = 'wide';
        break;
      case 'pass':
        this.arrangement = null;
        this.ball.flight = null;
        this.ball.owner = { team: A, slot: ev.slot ?? 5 };
        this.possession = A;
        if (late) this.snapNear(A, ev);
        this.camFocus = 'play';
        break;
      case 'tackle':
        this.arrangement = null;
        this.ball.flight = null;
        this.ball.owner = { team: A, slot: ev.slot ?? 2 };
        this.possession = A;
        this.camFocus = 'play';
        break;
      case 'foul': {
        // 공을 가진 쪽(피해자)이 넘어지고, 그 팀이 공을 계속 갖는다
        const c = this.carrier();
        const victim = c && c.team === D ? c : { team: D, slot: 9 };
        this.body(victim.team, victim.slot).fallenUntil = this.now + 1.5;
        this.ball.owner = victim;
        this.ball.flight = null;
        this.possession = D;
        const off = this.body(A, ev.slot ?? 2);
        this.referee = { x: off.x - 4, y: off.y + 3 };
        break;
      }
      case 'yellow':
      case 'red':
        this.card = { color: ev.type === 'yellow' ? '#f5d90a' : '#e5484d', team: A, slot: ev.slot ?? 2, until: this.now + 1.8 };
        break;
      case 'chance':
        this.arrangement = null;
        this.ball.flight = null;
        this.ball.owner = { team: A, slot: ev.slot ?? 9 };
        this.possession = A;
        break;
      case 'freekick':
      case 'penalty':
        // 이미 setup에서 배치. 키커가 공을 찬다(다음 이벤트가 결과)
        this.ball.owner = null;
        this.possession = A;
        this.queued = null;
        if (this.events![i + 1]) {
          // 결과 이벤트 연출이 setup에서 shoot을 걸기 전, 키커 위치를 공 옆으로
          const k = this.body(A, ev.slot ?? 9);
          k.x = this.ball.x - dirOf(A) * 1.2;
          k.y = this.ball.y;
        }
        break;
      case 'goal': {
        this.arrangement = null;
        const gx = goalX(A);
        this.ball.flight = null;
        this.ball.x = gx + dirOf(A) * 1.4;
        this.ball.z = 0.2;
        this.ball.owner = null;
        this.netShake = { side: A === 0 ? 1 : -1, until: this.now + 1.2 };
        const scorer = ev.slot ?? 9;
        this.celebration = { team: A, slot: scorer, until: this.now + 3.2, corner: { x: gx - dirOf(A) * 1.5, y: this.body(A, scorer).y < PW / 2 ? 1.5 : PW - 1.5 } };
        this.cam.shake = ev.powerShot ? 1 : 0.6;
        this.camFocus = 'tight';
        break;
      }
      case 'save': {
        this.arrangement = null;
        // 골키퍼가 잡거나 쳐낸다
        this.ball.flight = null;
        const k = this.body(A, 0);
        this.ball.owner = { team: A, slot: 0 };
        this.ball.x = k.x;
        this.ball.y = k.y;
        this.possession = A;
        break;
      }
      case 'miss': {
        this.arrangement = null;
        // 공은 밖으로 → 골킥
        const shooterTeam = A;
        const keeperTeam = D;
        this.ball.flight = null;
        this.ball.owner = null;
        this.ball.vx = dirOf(shooterTeam) * 6;
        this.ball.vy = 0;
        this.goalKick = { at: this.now + 0.9, team: keeperTeam };
        break;
      }
      case 'halftime':
        this.arrangement = null;
        this.celebration = null;
        this.camFocus = 'wide';
        break;
      case 'fulltime':
        this.arrangement = null;
        this.ball.owner = null;
        this.ball.flight = null;
        this.camFocus = 'wide';
        break;
    }
    if (late) {
      // 늦게 들어와서 지나간 장면은 연출 없이 상태만 맞춘다
      this.celebration = null;
      this.card = null;
      this.netShake = null;
      if (ev.type === 'goal' || ev.type === 'halftime') {
        const kick = (ev.type === 'goal' ? (A === 0 ? 1 : 0) : 1) as 0 | 1;
        this.resetBodies(kick);
      }
    }
  }

  private goalKick: { at: number; team: 0 | 1 } | null = null;

  /** 늦게 들어왔을 때 선수들을 공 근처 대형으로 바로 옮긴다 */
  private snapNear(A: 0 | 1, ev: MatchEvent): void {
    const bx = (ev.x ?? 0.5) * PL;
    const by = (ev.y ?? 0.5) * PW;
    for (const team of [0, 1] as const) {
      this.bodies[team].forEach((b, slot) => {
        const p = this.shapeTarget(team, slot, bx, by, team === A);
        b.x = p.x;
        b.y = p.y;
      });
    }
  }

  /** 수비 쪽에서 (x, y)에 가장 가까운 선수 */
  private nearest(team: 0 | 1, x: number, y: number, outfield: boolean): number {
    let best = -1;
    let bd = Infinity;
    this.bodies[team].forEach((b, slot) => {
      if (outfield && slot === 0) return;
      const d = dist(b.x, b.y, x, y);
      if (d < bd) {
        bd = d;
        best = slot;
      }
    });
    return best;
  }

  /** 대형 유지: 공 위치와 공격/수비 상황에 따라 블록이 움직인다 */
  private shapeTarget(team: 0 | 1, slot: number, bx: number, by: number, attacking: boolean): { x: number; y: number } {
    const b = basePos(team, slot);
    const dir = dirOf(team);
    if (slot === 0) {
      const gx = ownGoalX(team);
      return { x: gx + dir * (attacking ? 9 : 3) + (bx - PL / 2) * 0.04, y: PW / 2 + (by - PW / 2) * 0.25 };
    }
    const forward = attacking ? 7 : -5;
    const runner = attacking && (slot === 8 || slot === 9 || slot === 10) ? 5 : 0;
    const x = b.x + (bx - PL / 2) * 0.55 + dir * (forward + runner);
    const y = b.y + (by - PW / 2) * 0.28;
    return { x: clamp(x, 3, PL - 3), y: clamp(y, 3, PW - 3) };
  }

  // ───────── 물리 ─────────

  private step(dt: number): void {
    const now = this.now;
    if (this.queued && now >= this.queued.t) {
      const q = this.queued;
      this.queued = null;
      q.fn();
    }
    // 세트피스 결과 슛: 키커가 차는 순간 (결과 이벤트 setup이 shoot을 걸었다면 그대로)
    if (this.pendingKickoff && now >= this.pendingKickoff.at) {
      const team = this.pendingKickoff.team;
      this.pendingKickoff = null;
      this.celebration = null;
      this.arrangement = null;
      this.ball = { x: PL / 2, y: PW / 2, z: 0, owner: { team, slot: 9 }, flight: null, vx: 0, vy: 0 };
      this.possession = team;
      this.camFocus = 'wide';
    }
    if (this.goalKick && now >= this.goalKick.at) {
      const team = this.goalKick.team;
      this.goalKick = null;
      const k = this.body(team, 0);
      this.ball = { x: ownGoalX(team) + dirOf(team) * 5, y: PW / 2, z: 0, owner: { team, slot: 0 }, flight: null, vx: 0, vy: 0 };
      k.x = this.ball.x - dirOf(team) * 0.8;
      k.y = this.ball.y;
      this.possession = team;
      this.camFocus = 'play';
    }

    // 골 세리머니 끝나면 모두 킥오프 자리로
    const kickoffSoon = this.pendingKickoff && this.pendingKickoff.at - now < 1.6;
    const bx = this.ball.x;
    const by = this.ball.y;
    const carrier = this.ball.owner;
    // 수비 쪽 압박 담당: 공에 가장 가까운 선수
    const defTeam = (this.possession === 0 ? 1 : 0) as 0 | 1;
    const presser = this.nearest(defTeam, bx, by, true);

    for (const team of [0, 1] as const) {
      const dir = dirOf(team);
      this.bodies[team].forEach((b, slot) => {
        const key = `${team}-${slot}`;
        let tx: number;
        let ty: number;
        let speed = 6.5;
        const arr = this.arrangement?.get(key);
        const ov = this.overrides.get(key);
        if (b.fallenUntil > now) {
          b.vx *= 0.8;
          b.vy *= 0.8;
          return;
        }
        if (kickoffSoon) {
          const p = kickoffPos(team, slot, team === this.pendingKickoff!.team);
          tx = p.x;
          ty = p.y;
          speed = 7;
        } else if (this.celebration) {
          const c = this.celebration;
          const scorer = this.body(c.team, c.slot);
          if (team === c.team && slot === c.slot) {
            tx = c.corner.x;
            ty = c.corner.y;
            speed = 8.5;
          } else if (team === c.team && slot !== 0) {
            tx = scorer.x - dir * (1.5 + (slot % 3));
            ty = scorer.y + ((slot % 5) - 2) * 1.3;
            speed = 8;
          } else {
            const p = kickoffPos(team, slot, false);
            tx = p.x;
            ty = p.y;
            speed = 3;
          }
        } else if (arr) {
          tx = arr.x;
          ty = arr.y;
          speed = 8;
        } else if (ov) {
          tx = ov.x;
          ty = ov.y;
          speed = ov.speed;
          // 압박 담당은 공 가진 선수를 계속 쫓는다
          if (carrier && carrier.team !== team) {
            const cb = this.body(carrier.team, carrier.slot);
            if (dist(ov.x, ov.y, cb.x, cb.y) < 20) {
              tx = cb.x - dirOf(carrier.team) * -1.2;
              ty = cb.y;
            }
          }
        } else if (carrier && carrier.team === team && carrier.slot === slot) {
          // 공 가진 선수: 천천히 전진 드리블
          tx = b.x + dir * 3;
          ty = b.y + (PW / 2 - b.y) * 0.05;
          speed = 4.5;
        } else if (team === defTeam && slot === presser && carrier) {
          const cb = this.body(carrier.team, carrier.slot);
          tx = cb.x - dirOf(carrier.team) * -1.4;
          ty = cb.y;
          speed = 7.5;
        } else if (this.ball.flight?.to && this.ball.flight.to.team === team && this.ball.flight.to.slot === slot) {
          // 패스 받는 선수는 공이 오는 곳으로
          tx = this.ball.flight.tx;
          ty = this.ball.flight.ty;
          speed = 8;
        } else {
          const p = this.shapeTarget(team, slot, bx, by, team === this.possession);
          // 살짝씩 다르게 움직여서 기계처럼 보이지 않게
          tx = p.x + Math.sin(now * 0.7 + slot * 1.9 + team) * 1.2;
          ty = p.y + Math.cos(now * 0.6 + slot * 2.3 + team) * 1.4;
        }
        // 목표로 향하는 속도 (최고 속도 제한, 부드러운 가속)
        const dx = tx - b.x;
        const dy = ty - b.y;
        const d = Math.hypot(dx, dy);
        const want = d < 0.4 ? 0 : Math.min(speed, d * 2.2);
        const wvx = d > 0 ? (dx / d) * want : 0;
        const wvy = d > 0 ? (dy / d) * want : 0;
        const a = Math.min(1, dt * 5);
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
      if (now < f.t0) {
        // 아직 차기 전: 키커 발밑
      } else {
        this.ball.x = f.fx + (f.tx - f.fx) * p;
        this.ball.y = f.fy + (f.ty - f.fy) * p;
        this.ball.z = f.fz + (f.tz - f.fz) * p + f.peak * 4 * p * (1 - p);
        if (p >= 1) {
          this.ball.flight = null;
          this.ball.z = f.tz;
          if (f.to) {
            this.ball.owner = f.to;
            this.ball.z = 0;
          }
        }
      }
    } else if (this.ball.owner) {
      const o = this.body(this.ball.owner.team, this.ball.owner.slot);
      const dir = dirOf(this.ball.owner.team);
      this.ball.x = o.x + dir * 0.7 + Math.sin(now * 9) * 0.15;
      this.ball.y = o.y + 0.3;
      this.ball.z = 0;
    } else {
      // 굴러가는 공
      this.ball.x += this.ball.vx * dt;
      this.ball.y += this.ball.vy * dt;
      this.ball.vx *= 1 - dt * 1.2;
      this.ball.vy *= 1 - dt * 1.2;
      this.ball.z = Math.max(0, this.ball.z - dt * 3);
    }

    // 심판: 공에서 조금 떨어져 따라다닌다
    const rx = clamp(this.ball.x - 7, 4, PL - 4);
    const ry = clamp(this.ball.y + (this.ball.y < PW / 2 ? 9 : -9), 4, PW - 4);
    this.referee.x += (rx - this.referee.x) * Math.min(1, dt * 1.5);
    this.referee.y += (ry - this.referee.y) * Math.min(1, dt * 1.5);
  }

  // ───────── 카메라 ─────────

  private updateCamera(dt: number): void {
    const lead = this.ball.owner ? dirOf(this.ball.owner.team) * 6 : 0;
    const focusW = this.camFocus === 'wide' ? 96 : this.camFocus === 'tight' ? 52 : 66;
    const tx = this.ball.x + lead;
    const ty = this.ball.y;
    const a = Math.min(1, dt * 2.2);
    this.cam.w += (focusW - this.cam.w) * Math.min(1, dt * 1.5);
    this.cam.x += (tx - this.cam.x) * a;
    this.cam.y += (ty - this.cam.y) * a;
    const viewH = (this.cam.w * CH) / CW;
    // 경기장 밖(관중석)까지만 보이게
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
      const b = this.body(o.team, o.slot);
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
