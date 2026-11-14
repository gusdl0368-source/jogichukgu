import { MATCH } from '../data/balance';
import { clamp } from './players';
import { Rng } from './rng';
import { FORMATION, type Player, type TeamPower } from './types';

/** 스킬·연구로 얻는 경기 확률 보정치. 전부 확률에 더하는 값(0.01 = +1%p). */
export interface MatchMods {
  passAcc: number;
  powerShot: number;
  counter: number;
  gkSave: number;
  stamina: number;
  longShot: number;
  pressing: number;
  finishing: number;
}

export const NO_MODS: MatchMods = {
  passAcc: 0,
  powerShot: 0,
  counter: 0,
  gkSave: 0,
  stamina: 0,
  longShot: 0,
  pressing: 0,
  finishing: 0,
};

export interface TeamSide {
  name: string;
  squad: Player[];
  power: TeamPower;
  mods: MatchMods;
}

export type EventType = 'kickoff' | 'pass' | 'tackle' | 'chance' | 'shot' | 'miss' | 'save' | 'goal' | 'halftime' | 'fulltime';

export interface MatchEvent {
  minute: number;
  type: EventType;
  /** 0 = 홈, 1 = 원정 */
  team: 0 | 1;
  /** 이벤트에 등장한 선수(해당 팀 슬롯 번호) */
  slot?: number;
  /** 공 위치: 0 = 홈 골대, 1 = 원정 골대 */
  x: number;
  y: number;
  text: string;
  powerShot?: boolean;
}

export interface SideStats {
  goals: number;
  shots: number;
  onTarget: number;
  saves: number;
  possessions: number;
  lateConceded: number;
}

export interface MatchResult {
  events: MatchEvent[];
  score: [number, number];
  stats: [SideStats, SideStats];
  /** 홈 팀 입장에서 본 결과 이유 */
  reasons: string[];
  seed: number;
}

const ATTACKERS = [9, 8, 10, 7]; // ST, LW, RW, CAM
const ATTACKER_WEIGHT = [0.42, 0.2, 0.2, 0.18];
const BUILDERS = [5, 6, 7]; // CM, CM, CAM
const DEFENDERS = [1, 2, 3, 4, 5, 6];

function emptyStats(): SideStats {
  return { goals: 0, shots: 0, onTarget: 0, saves: 0, possessions: 0, lateConceded: 0 };
}

function avgPhysical(squad: Player[]): number {
  return squad.reduce((a, p) => a + p.stats.physical, 0) / squad.length;
}

/** 후반 체력 저하 배율. 체력이 낮을수록 60분 이후 크게 떨어진다. */
function fatigue(minute: number, squad: Player[], mods: MatchMods): number {
  if (minute <= 60) return 1;
  const progress = (minute - 60) / 30;
  const weakness = (1 - avgPhysical(squad) / 100) * 0.35 * Math.max(0, 1 - mods.stamina * 10);
  return 1 - progress * weakness;
}

function name(p: Player): string {
  return p.name;
}

export function simulateMatch(home: TeamSide, away: TeamSide, seed: number): MatchResult {
  const rng = new Rng(seed);
  const sides = [home, away] as const;
  const stats: [SideStats, SideStats] = [emptyStats(), emptyStats()];
  const events: MatchEvent[] = [{ minute: 0, type: 'kickoff', team: 0, x: 0.5, y: 0.5, text: '새벽 6시, 휘슬이 울립니다!' }];
  const n = MATCH.possessions;
  let lastLoser: 0 | 1 | null = null;

  for (let i = 0; i < n; i++) {
    const minute = Math.min(90, Math.round(((i + rng.next()) / n) * 90));
    if (i === Math.floor(n / 2)) {
      events.push({ minute: 45, type: 'halftime', team: 0, x: 0.5, y: 0.5, text: '전반 종료. 막걸리 한 모금씩 하고 갑니다.' });
    }
    const f = [fatigue(minute, home.squad, home.mods), fatigue(minute, away.squad, away.mods)];
    const mid = [home.power.mid * f[0] * (1 + home.mods.pressing), away.power.mid * f[1] * (1 + away.mods.pressing)];
    const ratio = mid[0] / mid[1];
    const pHome = Math.pow(ratio, 2.5) / (1 + Math.pow(ratio, 2.5));
    const att: 0 | 1 = rng.chance(pHome) ? 0 : 1;
    const def: 0 | 1 = att === 0 ? 1 : 0;
    const A = sides[att];
    const D = sides[def];
    stats[att].possessions++;
    const dir = (x: number) => (att === 0 ? x : 1 - x);
    const y = () => 0.2 + rng.next() * 0.6;

    // 역습: 직전 포제션을 잃은 팀이 아니라 뺏은 팀이 빠르게 전개
    const isCounter = lastLoser === def && rng.chance(0.25 + A.mods.counter);

    // 1) 빌드업 패스
    const builderSlot = rng.pick(BUILDERS);
    const builder = A.squad[builderSlot];
    const midShare = (A.power.mid * f[att]) / (A.power.mid * f[att] + D.power.mid * f[def]);
    const passP = clamp(0.5 + 0.4 * midShare + A.mods.passAcc + (isCounter ? 0.1 : 0), 0.3, 0.95);
    if (!rng.chance(passP)) {
      const tackler = rng.pick(DEFENDERS);
      events.push({
        minute, type: 'tackle', team: def, slot: tackler, x: dir(0.45), y: y(),
        text: rng.pick([
          `${name(D.squad[tackler])}, 깔끔한 태클로 공을 뺏어냅니다.`,
          `${name(builder)}의 패스가 ${name(D.squad[tackler])}에게 막힙니다.`,
          `${D.name} 압박이 좋네요. ${name(D.squad[tackler])}가 끊어냅니다.`,
        ]),
      });
      lastLoser = att;
      continue;
    }
    events.push({
      minute, type: 'pass', team: att, slot: builderSlot, x: dir(0.55), y: y(),
      text: isCounter
        ? rng.pick([`${A.name}의 빠른 역습!`, `공을 뺏자마자 ${name(builder)}가 앞으로 찔러줍니다!`])
        : rng.pick([`${name(builder)}가 차분하게 패스를 돌립니다.`, '침착한 패스 플레이가 이어집니다.', `${name(builder)}, 시야가 넓네요.`]),
    });

    // 2) 찬스 만들기: 공격 vs 수비
    const atkShare = (A.power.atk * f[att]) / (A.power.atk * f[att] + D.power.def * f[def]);
    const chanceP = clamp(0.22 + 0.55 * atkShare + (isCounter ? 0.12 : 0), 0.15, 0.85);
    const shooterSlot = ATTACKERS[rng.weighted(ATTACKER_WEIGHT)];
    const shooter = A.squad[shooterSlot];
    const longShot = !rng.chance(chanceP);
    if (longShot && !rng.chance(0.25 + A.mods.longShot)) {
      const tackler = rng.pick(DEFENDERS);
      events.push({
        minute, type: 'tackle', team: def, slot: tackler, x: dir(0.7), y: y(),
        text: rng.pick([`${name(D.squad[tackler])}의 육탄 방어!`, `${D.name} 수비벽이 단단합니다.`, `${name(shooter)}의 돌파, 막혔습니다.`]),
      });
      lastLoser = att;
      continue;
    }
    events.push({
      minute, type: 'chance', team: att, slot: shooterSlot, x: dir(longShot ? 0.72 : 0.82), y: y(),
      text: longShot
        ? `${name(shooter)}, 먼 거리에서 노려봅니다!`
        : rng.pick([`${name(shooter)}에게 좋은 찬스!`, `${name(shooter)}, 수비를 제쳤습니다!`, `${name(shooter)}가 박스 안으로 파고듭니다!`]),
    });

    // 3) 슈팅
    stats[att].shots++;
    const keeper = D.squad[0];
    const powerShot = rng.chance(0.08 + A.mods.powerShot);
    const onTargetP = clamp(0.3 + shooter.stats.shooting / 220 + A.mods.finishing - (longShot ? 0.15 : 0), 0.15, 0.9);
    if (!rng.chance(onTargetP)) {
      events.push({
        minute, type: 'miss', team: att, slot: shooterSlot, x: dir(0.97), y: rng.chance(0.5) ? 0.25 : 0.75,
        text: rng.pick([`${name(shooter)}의 슛이 골대를 벗어납니다.`, '아~ 하늘 높이 날아갑니다. 옆 동네까지 갔네요.', `${name(shooter)}, 아쉽게 빗나갑니다.`]),
      });
      lastLoser = att;
      continue;
    }
    stats[att].onTarget++;
    const saveP = clamp(
      0.5 + (keeper.overall - shooter.stats.shooting) / 110 + D.mods.gkSave - (powerShot ? 0.18 : 0) - (longShot ? -0.12 : 0),
      0.12,
      0.85,
    );
    if (rng.chance(saveP)) {
      stats[def].saves++;
      events.push({
        minute, type: 'save', team: def, slot: 0, x: dir(0.96), y: 0.5,
        text: powerShot
          ? `${name(shooter)}의 대포알 슛! 하지만 ${name(keeper)}가 막아냅니다!`
          : rng.pick([`${name(keeper)} 슈퍼세이브!`, `골키퍼 ${name(keeper)}, 몸을 날립니다!`, `${name(keeper)}가 침착하게 잡아냅니다.`]),
      });
      lastLoser = att;
      continue;
    }
    stats[att].goals++;
    if (minute > 60 && f[def] < 0.95) stats[def].lateConceded++;
    events.push({
      minute, type: 'goal', team: att, slot: shooterSlot, x: dir(1), y: 0.5, powerShot,
      text: powerShot
        ? `골!!! ${name(shooter)}의 대포알 파워슛! 골망이 찢어질 뻔했습니다!`
        : rng.pick([`골! ${name(shooter)}, 침착하게 마무리합니다!`, `골!! ${name(shooter)}의 ${shooter.job} 본능!`, `골! ${A.name}, ${name(shooter)}가 해냅니다!`]),
    });
    lastLoser = att;
  }

  const score: [number, number] = [stats[0].goals, stats[1].goals];
  events.push({
    minute: 90, type: 'fulltime', team: 0, x: 0.5, y: 0.5,
    text: `경기 종료! ${home.name} ${score[0]} - ${score[1]} ${away.name}`,
  });
  return { events, score, stats, reasons: explain(stats, home, away), seed };
}

/** 홈 팀 입장에서 경기 결과의 이유를 사람이 읽을 수 있게 정리한다. */
export function explain(stats: [SideStats, SideStats], home: TeamSide, away: TeamSide): string[] {
  const [h, a] = stats;
  const reasons: string[] = [];
  const total = h.possessions + a.possessions || 1;
  const poss = Math.round((h.possessions / total) * 100);
  const won = h.goals > a.goals;
  const lost = h.goals < a.goals;

  if (lost) {
    if (a.saves >= 4) reasons.push(`상대 골키퍼 ${away.squad[0].name}의 선방 ${a.saves}회`);
    if (poss <= 42) reasons.push(`점유율 열세 (${poss}%) → 미드필드 보강 필요`);
    if (a.shots >= h.shots + 3) reasons.push(`슈팅 수 열세 (${h.shots} vs ${a.shots}) → 수비 보강 필요`);
    if (h.lateConceded > 0) reasons.push(`후반 체력 저하로 ${h.lateConceded}실점 → 체력 좋은 선수 필요`);
    if (h.shots >= 6 && h.goals <= 1) reasons.push(`결정력 부족: 슈팅 ${h.shots}회에 ${h.goals}골`);
    if (away.power.total > home.power.total * 1.08) reasons.push(`팀 파워 차이 (${home.power.total} vs ${away.power.total})`);
    if (reasons.length === 0) reasons.push('대등한 경기였지만 운이 따르지 않았습니다');
  } else if (won) {
    if (h.saves >= 3) reasons.push(`우리 골키퍼 ${home.squad[0].name}의 선방 ${h.saves}회`);
    if (poss >= 58) reasons.push(`중원 장악 (점유율 ${poss}%)`);
    if (h.shots >= a.shots + 3) reasons.push(`슈팅 수 우위 (${h.shots} vs ${a.shots})`);
    if (a.lateConceded > 0) reasons.push(`상대 후반 체력 저하 공략 (${a.lateConceded}골)`);
    if (reasons.length === 0) reasons.push('집중력으로 승리를 지켜냈습니다');
  } else {
    reasons.push(`점유율 ${poss}%, 슈팅 ${h.shots} vs ${a.shots}`);
    if (a.saves >= 3) reasons.push(`상대 골키퍼 선방 ${a.saves}회가 승리를 막았습니다`);
  }
  return reasons;
}

/** 경기 화면 없이 결과만 빠르게 계산 (다른 팀 경기, 대회, 시뮬레이터용) */
export function quickResult(home: TeamSide, away: TeamSide, seed: number): [number, number] {
  return simulateMatch(home, away, seed).score;
}

export const SLOT_POSITIONS = FORMATION;
