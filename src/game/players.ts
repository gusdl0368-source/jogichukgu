import { TIERS } from '../data/balance';
import { JOBS_BY_TIER, NATIONS, type Nation } from '../data/nations';
import { traitChance, traitsFor } from '../data/traits';
import { Rng } from './rng';
import { FORMATION, type Player, type Position, type StatKey, type Stats, STAT_KEYS, type TeamPower } from './types';

const NICKNAMES = [
  '번개', '탱크', '새벽왕', '막걸리', '철벽', '쌕쌕이', '뻥축', '빨랫줄', '대포알', '문어발', '불도저', '헛다리', '꽁지머리',
  '아저씨', '산삼', '거미손', '독수리', '방앗간', '총알', '부엉이',
];

/** 포지션별 능력치 가중치. 종합 능력치는 이 가중 평균이다. */
export const POSITION_WEIGHTS: Record<Position, Partial<Record<StatKey, number>>> = {
  GK: { defending: 0.55, physical: 0.25, passing: 0.2 },
  CB: { defending: 0.5, physical: 0.3, pace: 0.1, passing: 0.1 },
  LB: { pace: 0.3, defending: 0.35, passing: 0.2, physical: 0.15 },
  RB: { pace: 0.3, defending: 0.35, passing: 0.2, physical: 0.15 },
  CM: { passing: 0.4, defending: 0.2, physical: 0.2, dribbling: 0.2 },
  CAM: { passing: 0.35, dribbling: 0.3, shooting: 0.25, pace: 0.1 },
  LW: { pace: 0.35, dribbling: 0.35, shooting: 0.2, passing: 0.1 },
  RW: { pace: 0.35, dribbling: 0.35, shooting: 0.2, passing: 0.1 },
  ST: { shooting: 0.45, pace: 0.25, physical: 0.15, dribbling: 0.15 },
};

/** 비교 팝업에 크게 보여줄 핵심 능력치 2개 */
export const KEY_STATS_2: Record<Position, [StatKey, StatKey]> = {
  GK: ['defending', 'physical'],
  CB: ['defending', 'physical'],
  LB: ['pace', 'defending'],
  RB: ['pace', 'defending'],
  CM: ['passing', 'defending'],
  CAM: ['passing', 'dribbling'],
  LW: ['pace', 'dribbling'],
  RW: ['pace', 'dribbling'],
  ST: ['pace', 'shooting'],
};

/** 포메이션 카드 요약용 3개 */
export const KEY_STATS_3: Record<Position, [StatKey, StatKey, StatKey]> = {
  GK: ['defending', 'physical', 'passing'],
  CB: ['defending', 'physical', 'pace'],
  LB: ['pace', 'defending', 'passing'],
  RB: ['pace', 'defending', 'passing'],
  CM: ['passing', 'defending', 'physical'],
  CAM: ['passing', 'dribbling', 'shooting'],
  LW: ['pace', 'dribbling', 'shooting'],
  RW: ['pace', 'dribbling', 'shooting'],
  ST: ['pace', 'shooting', 'physical'],
};

export const POSITION_LABEL: Record<Position, string> = {
  GK: '골키퍼',
  LB: '왼쪽 풀백',
  CB: '센터백',
  RB: '오른쪽 풀백',
  CM: '중앙 미드',
  CAM: '공격형 미드',
  LW: '왼쪽 윙',
  ST: '스트라이커',
  RW: '오른쪽 윙',
};

/** 스카우트 시 포지션이 나올 비율. 포메이션 슬롯 수에 비례한다(CB, CM은 2배). */
const POSITION_POOL: Position[] = FORMATION;

export function computeOverall(position: Position, stats: Stats): number {
  const w = POSITION_WEIGHTS[position];
  let total = 0;
  for (const k of STAT_KEYS) total += (w[k] ?? 0) * stats[k];
  return Math.round(total);
}

let idCounter = 0;
function newId(rng: Rng): string {
  idCounter = (idCounter + 1) % 1e6;
  return `${Date.now().toString(36)}${idCounter.toString(36)}${rng.int(0, 1e6).toString(36)}`;
}

export function randomNation(rng: Rng, tier: number): Nation {
  return NATIONS[rng.weighted(NATIONS.map((n) => n.weight[tier] ?? 0))];
}

export function randomName(rng: Rng, nation: Nation = NATIONS[0], tier = 0): string {
  const given = rng.pick(nation.given);
  const sur = rng.pick(nation.surname);
  if (nation.familyFirst) {
    const full = nation.code === 'KR' ? sur + given : `${sur} ${given}`;
    // 동네 아저씨들은 별명으로 불린다
    return nation.code === 'KR' && tier <= 1 && rng.chance(0.35) ? `'${rng.pick(NICKNAMES)}' ${full}` : full;
  }
  return `${given} ${sur}`;
}

export function generatePlayer(rng: Rng, tier: number, position?: Position): Player {
  const def = TIERS[tier];
  const pos = position ?? rng.pick(POSITION_POOL);
  const base = rng.int(def.statMin, def.statMax);
  const weights = POSITION_WEIGHTS[pos];
  const stats = {} as Stats;
  for (const k of STAT_KEYS) {
    const relevant = (weights[k] ?? 0) > 0;
    // 포지션에 중요한 능력치는 기본값 근처, 아닌 능력치는 낮게
    const offset = relevant ? rng.int(-4, 6) : rng.int(-22, -4);
    stats[k] = clamp(base + offset, 1, 99);
  }
  const nation = randomNation(rng, tier);
  const trait = rng.chance(traitChance(tier)) ? rng.pick(traitsFor(pos)).id : undefined;
  // 동네는 나이가 제각각, 프로는 전성기 나이
  const age = tier <= 1 ? rng.int(17, 58) : tier <= 3 ? rng.int(18, 38) : rng.int(19, 34);
  return {
    id: newId(rng),
    name: randomName(rng, nation, tier),
    job: rng.pick(JOBS_BY_TIER[tier]),
    age,
    position: pos,
    nation: nation.code,
    ...(trait ? { trait } : {}),
    tier,
    stats,
    overall: computeOverall(pos, stats),
    avatar: {
      skin: rng.int(0, 4),
      hair: rng.int(0, 6),
      hairStyle: rng.int(0, 9),
      beard: rng.chance(0.35) ? rng.int(1, 4) : 0,
      brow: rng.int(0, 2),
      mouth: rng.int(0, 3),
      acc: rng.chance(0.12) ? rng.int(1, 3) : 0,
    },
  };
}

/** 포메이션 11자리를 모두 채운 스쿼드. tierFor(slot)로 슬롯별 등급을 정한다. */
export function generateSquad(rng: Rng, tierFor: (slot: number) => number): Player[] {
  return FORMATION.map((pos, slot) => generatePlayer(rng, tierFor(slot), pos));
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

const LINE_OF_SLOT: Array<'atk' | 'mid' | 'def'> = FORMATION.map((p) =>
  p === 'LW' || p === 'ST' || p === 'RW' ? 'atk' : p === 'CM' || p === 'CAM' ? 'mid' : 'def',
);
const LINE_FACTOR = { atk: 1.45, mid: 1.5, def: 0.93 };

/** 팀 파워 = 공격 + 미드 + 수비. bonus는 전술/스폰서 등 % 보너스(0.07 = +7%). */
export function teamPower(squad: Player[], bonus = 0): TeamPower {
  const sums = { atk: 0, mid: 0, def: 0 };
  squad.forEach((p, slot) => {
    sums[LINE_OF_SLOT[slot]] += p.overall;
  });
  const m = 1 + bonus;
  const atk = round1(sums.atk * LINE_FACTOR.atk * m);
  const mid = round1(sums.mid * LINE_FACTOR.mid * m);
  const def = round1(sums.def * LINE_FACTOR.def * m);
  return { atk, mid, def, total: round1(atk + mid + def) };
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/**
 * 새 선수와 비교할 현재 주전 슬롯. 같은 포지션 슬롯이 여러 개면(CB, CM) 더 약한 쪽.
 */
export function compareSlot(squad: Player[], position: Position): number {
  let best = -1;
  FORMATION.forEach((pos, slot) => {
    if (pos !== position) return;
    if (best === -1 || squad[slot].overall < squad[best].overall) best = slot;
  });
  return best;
}
