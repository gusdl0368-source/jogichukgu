import { TIERS } from '../data/balance';
import { Rng } from './rng';
import { FORMATION, type Player, type Position, type StatKey, type Stats, STAT_KEYS, type TeamPower } from './types';

const SURNAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '류', '홍'];
const GIVEN = [
  '민수', '영호', '철수', '동훈', '성민', '재석', '태현', '준호', '상우', '진우', '현석', '경수', '대호', '병철', '용준',
  '기훈', '정우', '승현', '두식', '만복', '종국', '광수', '창민', '희철', '우진', '도윤', '시우', '하준', '건우', '봉식',
];
const NICKNAMES = [
  '번개', '탱크', '새벽왕', '막걸리', '철벽', '쌕쌕이', '뻥축', '빨랫줄', '대포알', '문어발', '불도저', '헛다리', '꽁지머리',
  '아저씨', '산삼', '거미손', '독수리', '방앗간', '총알', '부엉이',
];
export const JOBS = [
  '택배기사', '치킨집 사장', '대학생', '전직 선출', '공무원', '편의점 알바', '부동산 중개사', '철물점 사장', '택시기사',
  '체육교사', '회사원', '목수', '요리사', '헬스 트레이너', '은퇴자', '고등학생', '프리랜서', '경찰관', '소방관', '농부',
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

export function randomName(rng: Rng): string {
  const full = rng.pick(SURNAMES) + rng.pick(GIVEN);
  return rng.chance(0.35) ? `'${rng.pick(NICKNAMES)}' ${full}` : full;
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
  return {
    id: newId(rng),
    name: randomName(rng),
    job: rng.pick(JOBS),
    age: rng.int(17, 58),
    position: pos,
    tier,
    stats,
    overall: computeOverall(pos, stats),
    avatar: {
      skin: rng.int(0, 4),
      hair: rng.int(0, 6),
      hairStyle: rng.int(0, 5),
      beard: rng.chance(0.3) ? rng.int(1, 2) : 0,
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
