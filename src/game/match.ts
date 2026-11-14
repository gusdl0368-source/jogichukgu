import { MATCH, TIERS } from '../data/balance';
import { clamp } from './players';
import { Rng } from './rng';
import { FORMATION, type Player, type TeamPower } from './types';

/** 스킬·연구·특성으로 얻는 경기 확률 보정치. 전부 확률에 더하는 값(0.01 = +1%p). */
export interface MatchMods {
  passAcc: number;
  powerShot: number;
  counter: number;
  gkSave: number;
  stamina: number;
  longShot: number;
  pressing: number;
  finishing: number;
  /** 프리킥·페널티킥 성공률 */
  setPiece: number;
  /** 반칙·카드를 줄이는 비율 (0.25 = 25% 덜 함) */
  discipline: number;
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
  setPiece: 0,
  discipline: 0,
};

export type TacticStyle = 'attack' | 'balance' | 'defense';

/** 경기 운영 방식: 라인별 힘에 곱한다 */
export const STYLES: Record<TacticStyle, { name: string; icon: string; desc: string; atk: number; mid: number; def: number }> = {
  attack: { name: '닥공', icon: '⚔️', desc: '공격 +10%, 수비 -8%', atk: 1.1, mid: 1, def: 0.92 },
  balance: { name: '균형', icon: '⚖️', desc: '보정 없음', atk: 1, mid: 1, def: 1 },
  defense: { name: '버스 세우기', icon: '🚌', desc: '수비 +10%, 공격 -8%', atk: 0.92, mid: 1, def: 1.1 },
};

export interface TeamSide {
  name: string;
  squad: Player[];
  power: TeamPower;
  mods: MatchMods;
  style?: TacticStyle;
}

export type EventType =
  | 'kickoff' | 'pass' | 'tackle' | 'chance' | 'shot' | 'miss' | 'save' | 'goal'
  | 'foul' | 'yellow' | 'red' | 'freekick' | 'penalty' | 'halftime' | 'fulltime';

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
  fouls: number;
  yellows: number;
  reds: number;
  setPieceGoals: number;
  penaltyGoals: number;
}

export interface MatchResult {
  events: MatchEvent[];
  score: [number, number];
  stats: [SideStats, SideStats];
  /** 홈 팀 입장에서 본 결과 이유 */
  reasons: string[];
  seed: number;
}

export interface MatchOptions {
  /** 경기가 열리는 리그 단계: 해설 분위기가 달라진다 */
  tier?: number;
}

const ATTACKERS = [9, 8, 10, 7]; // ST, LW, RW, CAM
const ATTACKER_WEIGHT = [0.42, 0.2, 0.2, 0.18];
const BUILDERS = [5, 6, 7]; // CM, CM, CAM
const DEFENDERS = [1, 2, 3, 4, 5, 6];

function emptyStats(): SideStats {
  return { goals: 0, shots: 0, onTarget: 0, saves: 0, possessions: 0, lateConceded: 0, fouls: 0, yellows: 0, reds: 0, setPieceGoals: 0, penaltyGoals: 0 };
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

interface Flavor {
  kickoff: string;
  halftime: string;
  miss: string;
  local: boolean;
}

function flavor(tier: number): Flavor {
  const t = TIERS[Math.max(0, Math.min(TIERS.length - 1, tier))];
  const local = tier <= 1;
  return {
    kickoff: local ? `${t.venue}, 휘슬이 울립니다!` : `${t.venue}, 킥오프!`,
    halftime: local ? '전반 종료. 막걸리 한 모금씩 하고 갑니다.' : '전반 종료. 선수들이 라커룸으로 들어갑니다.',
    miss: local ? '아~ 하늘 높이 날아갑니다. 옆 동네까지 갔네요.' : '아~ 크로스바를 넘어갑니다!',
    local,
  };
}

export function simulateMatch(home: TeamSide, away: TeamSide, seed: number, opts: MatchOptions = {}): MatchResult {
  const rng = new Rng(seed);
  const fl = flavor(opts.tier ?? 0);
  const sides = [home, away] as const;
  const stats: [SideStats, SideStats] = [emptyStats(), emptyStats()];
  const events: MatchEvent[] = [{ minute: 0, type: 'kickoff', team: 0, x: 0.5, y: 0.5, text: fl.kickoff }];
  const n = MATCH.possessions;
  const booked: [Set<number>, Set<number>] = [new Set(), new Set()];
  let lastLoser: 0 | 1 | null = null;

  /** 경기 운영 방식, 체력, 퇴장 인원을 반영한 라인별 힘 */
  const eff = (t: 0 | 1, minute: number) => {
    const s = sides[t];
    const st = STYLES[s.style ?? 'balance'];
    const m = fatigue(minute, s.squad, s.mods) * Math.pow(0.86, stats[t].reds);
    return { atk: s.power.atk * st.atk * m, mid: s.power.mid * st.mid * m * (1 + s.mods.pressing), def: s.power.def * st.def * m, fatigue: m };
  };

  /** 반칙 처리: 카드 판정까지. 반환값은 퇴장 여부 */
  const foul = (t: 0 | 1, slot: number, minute: number, x: number, y: number): void => {
    const s = sides[t];
    const p = s.squad[slot];
    stats[t].fouls++;
    events.push({ minute, type: 'foul', team: t, slot, x, y, text: rng.pick([`${name(p)}의 반칙! 휘슬이 울립니다.`, `${name(p)}, 늦은 태클입니다.`, `${name(p)}가 상대를 넘어뜨립니다.`]) });
    const disc = 1 - s.mods.discipline;
    if (rng.chance(0.02 * disc)) {
      stats[t].reds++;
      events.push({ minute, type: 'red', team: t, slot, x, y, text: `🟥 다이렉트 퇴장! ${name(p)}, 그라운드를 떠납니다.` });
    } else if (rng.chance(0.22 * disc)) {
      if (booked[t].has(slot)) {
        stats[t].reds++;
        events.push({ minute, type: 'red', team: t, slot, x, y, text: `🟨🟨 경고 누적 퇴장! ${name(p)}가 쫓겨납니다.` });
      } else {
        booked[t].add(slot);
        stats[t].yellows++;
        events.push({ minute, type: 'yellow', team: t, slot, x, y, text: `🟨 ${name(p)}에게 옐로카드.` });
      }
    }
  };

  const goal = (att: 0 | 1, def: 0 | 1, minute: number, slot: number, text: string, f: number, extra?: Partial<MatchEvent>) => {
    stats[att].goals++;
    if (minute > 60 && f < 0.95) stats[def].lateConceded++;
    events.push({ minute, type: 'goal', team: att, slot, x: att === 0 ? 1 : 0, y: 0.5, text, ...extra });
  };

  for (let i = 0; i < n; i++) {
    const minute = Math.min(90, Math.round(((i + rng.next()) / n) * 90));
    if (i === Math.floor(n / 2)) {
      events.push({ minute: 45, type: 'halftime', team: 0, x: 0.5, y: 0.5, text: fl.halftime });
    }
    const e = [eff(0, minute), eff(1, minute)];
    const ratio = e[0].mid / e[1].mid;
    const pHome = Math.pow(ratio, 3.5) / (1 + Math.pow(ratio, 3.5));
    const att: 0 | 1 = rng.chance(pHome) ? 0 : 1;
    const def: 0 | 1 = att === 0 ? 1 : 0;
    const A = sides[att];
    const D = sides[def];
    stats[att].possessions++;
    const dir = (x: number) => (att === 0 ? x : 1 - x);
    const y = () => 0.2 + rng.next() * 0.6;

    // 역습: 직전 포제션에서 공을 뺏은 팀이 빠르게 전개
    const isCounter = lastLoser === def && rng.chance(0.25 + A.mods.counter);

    // 1) 빌드업 패스
    const builderSlot = rng.pick(BUILDERS);
    const builder = A.squad[builderSlot];
    const midShare = e[att].mid / (e[att].mid + e[def].mid);
    const passP = clamp(0.5 + 0.4 * midShare + A.mods.passAcc + (isCounter ? 0.1 : 0), 0.3, 0.95);
    if (!rng.chance(passP)) {
      const tackler = rng.pick(DEFENDERS);
      // 거친 태클은 반칙이 되고, 공격 팀이 공을 지킨다
      if (rng.chance(0.12 * (1 - D.mods.discipline))) {
        foul(def, tackler, minute, dir(0.45), y());
      } else {
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
    } else {
      events.push({
        minute, type: 'pass', team: att, slot: builderSlot, x: dir(0.55), y: y(),
        text: isCounter
          ? rng.pick([`${A.name}의 빠른 역습!`, `공을 뺏자마자 ${name(builder)}가 앞으로 찔러줍니다!`])
          : rng.pick([`${name(builder)}가 차분하게 패스를 돌립니다.`, '침착한 패스 플레이가 이어집니다.', `${name(builder)}, 시야가 넓네요.`]),
      });
    }

    // 2) 찬스 만들기: 공격 vs 수비
    const atkShare = e[att].atk / (e[att].atk + e[def].def);
    const chanceP = clamp(0.1 + 0.8 * atkShare + (isCounter ? 0.12 : 0), 0.1, 0.9);
    const shooterSlot = ATTACKERS[rng.weighted(ATTACKER_WEIGHT)];
    const shooter = A.squad[shooterSlot];
    const keeper = D.squad[0];
    const longShot = !rng.chance(chanceP);
    if (longShot && !rng.chance(0.25 + A.mods.longShot)) {
      const tackler = rng.pick(DEFENDERS);
      // 위험 지역 반칙: 페널티킥 또는 직접 프리킥
      if (rng.chance(0.16 * (1 - D.mods.discipline))) {
        foul(def, tackler, minute, dir(0.8), y());
        const isPenalty = rng.chance(0.22);
        stats[att].shots++;
        if (isPenalty) {
          events.push({ minute, type: 'penalty', team: att, slot: shooterSlot, x: dir(0.88), y: 0.5, text: `페널티킥 선언! 키커는 ${name(shooter)}.` });
          const p = clamp(0.74 + A.mods.setPiece * 0.6 - D.mods.gkSave * 0.6 + (shooter.stats.shooting - keeper.overall) / 400, 0.45, 0.93);
          if (rng.chance(p)) {
            stats[att].onTarget++;
            stats[att].penaltyGoals++;
            goal(att, def, minute, shooterSlot, `골! ${name(shooter)}, 페널티킥을 침착하게 성공시킵니다!`, e[def].fatigue);
          } else {
            stats[def].saves++;
            events.push({ minute, type: 'save', team: def, slot: 0, x: dir(0.96), y: 0.5, text: `${name(keeper)}가 페널티킥을 막아냅니다!! 엄청난 선방!` });
          }
        } else {
          events.push({ minute, type: 'freekick', team: att, slot: shooterSlot, x: dir(0.78), y: y(), text: `${name(shooter)}가 프리킥을 준비합니다…` });
          const p = clamp(0.1 + A.mods.setPiece + (shooter.stats.shooting - keeper.overall) / 300, 0.04, 0.4);
          if (rng.chance(p)) {
            stats[att].onTarget++;
            stats[att].setPieceGoals++;
            goal(att, def, minute, shooterSlot, `골!!! ${name(shooter)}의 환상적인 프리킥! 구석에 꽂힙니다!`, e[def].fatigue);
          } else {
            events.push({ minute, type: 'miss', team: att, slot: shooterSlot, x: dir(0.97), y: 0.3, text: rng.pick(['프리킥이 수비벽에 막힙니다.', `${name(shooter)}의 프리킥, 살짝 빗나갑니다.`]) });
          }
        }
        lastLoser = att;
        continue;
      }
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
    const powerShot = rng.chance(0.08 + A.mods.powerShot);
    const onTargetP = clamp(0.3 + shooter.stats.shooting / 220 + A.mods.finishing - (longShot ? 0.15 : 0), 0.15, 0.9);
    if (!rng.chance(onTargetP)) {
      events.push({
        minute, type: 'miss', team: att, slot: shooterSlot, x: dir(0.97), y: rng.chance(0.5) ? 0.25 : 0.75,
        text: rng.pick([`${name(shooter)}의 슛이 골대를 벗어납니다.`, fl.miss, `${name(shooter)}, 아쉽게 빗나갑니다.`]),
      });
      lastLoser = att;
      continue;
    }
    stats[att].onTarget++;
    const saveP = clamp(
      0.55 + (keeper.overall - shooter.stats.shooting) / 110 + D.mods.gkSave - (powerShot ? 0.18 : 0) + (longShot ? 0.12 : 0),
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
    goal(
      att, def, minute, shooterSlot,
      powerShot
        ? `골!!! ${name(shooter)}의 대포알 파워슛! 골망이 찢어질 뻔했습니다!`
        : rng.pick([`골! ${name(shooter)}, 침착하게 마무리합니다!`, fl.local ? `골!! ${name(shooter)}의 ${shooter.job} 본능!` : `골!! ${name(shooter)}, 클래스가 다릅니다!`, `골! ${A.name}, ${name(shooter)}가 해냅니다!`]),
      e[def].fatigue,
      { powerShot },
    );
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
    if (h.reds > 0) reasons.push(`레드카드 ${h.reds}장으로 수적 열세 → 반칙 줄이는 '신사' 특성 선수가 도움돼요`);
    if (a.saves >= 4) reasons.push(`상대 골키퍼 ${away.squad[0].name}의 선방 ${a.saves}회`);
    if (a.penaltyGoals + a.setPieceGoals > 0) reasons.push(`세트피스 실점 ${a.penaltyGoals + a.setPieceGoals}골`);
    if (poss <= 42) reasons.push(`점유율 열세 (${poss}%) → 미드필드 보강 필요`);
    if (a.shots >= h.shots + 3) reasons.push(`슈팅 수 열세 (${h.shots} vs ${a.shots}) → 수비 보강 필요`);
    if (h.lateConceded > 0) reasons.push(`후반 체력 저하로 ${h.lateConceded}실점 → 체력 좋은 선수 필요`);
    if (h.shots >= 6 && h.goals <= 1) reasons.push(`결정력 부족: 슈팅 ${h.shots}회에 ${h.goals}골`);
    if (away.power.total > home.power.total * 1.08) reasons.push(`팀 파워 차이 (${home.power.total} vs ${away.power.total})`);
    if (reasons.length === 0) reasons.push('대등한 경기였지만 운이 따르지 않았습니다');
  } else if (won) {
    if (a.reds > 0) reasons.push(`상대 퇴장 ${a.reds}명으로 수적 우위`);
    if (h.saves >= 3) reasons.push(`우리 골키퍼 ${home.squad[0].name}의 선방 ${h.saves}회`);
    if (h.penaltyGoals + h.setPieceGoals > 0) reasons.push(`세트피스 득점 ${h.penaltyGoals + h.setPieceGoals}골`);
    if (poss >= 58) reasons.push(`중원 장악 (점유율 ${poss}%)`);
    if (h.shots >= a.shots + 3) reasons.push(`슈팅 수 우위 (${h.shots} vs ${a.shots})`);
    if (a.lateConceded > 0) reasons.push(`상대 후반 체력 저하 공략 (${a.lateConceded}골)`);
    if (reasons.length === 0) reasons.push('집중력으로 승리를 지켜냈습니다');
  } else {
    reasons.push(`점유율 ${poss}%, 슈팅 ${h.shots} vs ${a.shots}`);
    if (a.saves >= 3) reasons.push(`상대 골키퍼 선방 ${a.saves}회가 승리를 막았습니다`);
    if (h.reds > 0) reasons.push(`퇴장 ${h.reds}명이 발목을 잡았습니다`);
  }
  return reasons.slice(0, 4);
}

/** 경기 화면 없이 결과만 빠르게 계산 (다른 팀 경기, 대회, 시뮬레이터용) */
export function quickResult(home: TeamSide, away: TeamSide, seed: number, opts: MatchOptions = {}): [number, number] {
  return simulateMatch(home, away, seed, opts).score;
}

export const SLOT_POSITIONS = FORMATION;
