// 밸런스 수치는 전부 여기서 조정한다. 코드 로직은 이 값만 읽는다.

export interface TierDef {
  id: number;
  name: string;
  short: string;
  color: string;
  /** 이 등급 선수의 기본 능력치 범위 */
  statMin: number;
  statMax: number;
  /** 판매가(회비) */
  sellPrice: number;
}

/** 선수 등급 = 리그 단계. 이름을 공유한다. */
export const TIERS: TierDef[] = [
  { id: 0, name: '동네 조기축구', short: '동네', color: '#9aa3ad', statMin: 30, statMax: 46, sellPrice: 2 },
  { id: 1, name: '구 리그', short: '구', color: '#a8d672', statMin: 40, statMax: 55, sellPrice: 5 },
  { id: 2, name: '시·도 리그', short: '시·도', color: '#4cbf5a', statMin: 50, statMax: 63, sellPrice: 12 },
  { id: 3, name: 'K7 리그', short: 'K7', color: '#2bb7a3', statMin: 58, statMax: 70, sellPrice: 28 },
  { id: 4, name: 'K6 리그', short: 'K6', color: '#3d8bef', statMin: 65, statMax: 76, sellPrice: 66 },
  { id: 5, name: 'K5 리그', short: 'K5', color: '#8a5cf0', statMin: 71, statMax: 82, sellPrice: 159 },
  { id: 6, name: 'K4 리그', short: 'K4', color: '#f2b51d', statMin: 77, statMax: 87, sellPrice: 382 },
  { id: 7, name: 'K3 리그', short: 'K3', color: '#f07a2c', statMin: 82, statMax: 92, sellPrice: 917 },
  { id: 8, name: '국가대표', short: '국대', color: '#ef4f9a', statMin: 88, statMax: 99, sellPrice: 2201 },
];

/** 등급이 처음 나오기 시작하는 스카우트 레벨 */
const TIER_UNLOCK_LEVEL = [1, 1, 3, 6, 10, 15, 21, 28, 36];
/** 처음 열릴 때의 가중치(%)와 레벨마다 커지는 배율 */
const TIER_START_WEIGHT = [100, 20, 2, 0.5, 0.05, 0.05, 0.05, 0.05, 0.05];
const TIER_GROWTH = [0.86, 1.08, 1.32, 1.4, 1.45, 1.45, 1.45, 1.45, 1.45];
/** 가중치 상한 (무한히 커지지 않게) */
const TIER_WEIGHT_CAP = [100, 60, 55, 50, 45, 40, 35, 30, 25];

export const MAX_SCOUT_LEVEL = 50;

/** 스카우트 레벨별 등급 확률(%). 합계는 100. 소수점 둘째 자리까지 공개용. */
export function scoutProbabilities(level: number): number[] {
  const weights = TIERS.map((_, t) => {
    if (level < TIER_UNLOCK_LEVEL[t]) return 0;
    const steps = level - TIER_UNLOCK_LEVEL[t];
    return Math.min(TIER_WEIGHT_CAP[t], TIER_START_WEIGHT[t] * Math.pow(TIER_GROWTH[t], steps));
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => (w / sum) * 100);
}

/** 레벨 lv → lv+1 업그레이드 비용(회비) */
export function scoutUpgradeCost(level: number): number {
  return Math.round(40 * Math.pow(1.42, level - 1) * Math.pow(level, 1.5));
}

/** 리그 단계가 하나 오를 때마다 모든 회비 수입에 곱하는 배율 */
export const INCOME_LEAGUE_MULT = 2.4;

export function incomeMult(league: number): number {
  return Math.pow(INCOME_LEAGUE_MULT, league);
}

export const ECONOMY = {
  /** 운동장 수익: 초당 회비, 연락처 1개당 초 */
  stadiumCashPerSec: 0.5,
  stadiumContactEverySec: 90,
  /** 오프라인 누적 상한(시간) */
  stadiumCapHours: 8,
  startCash: 200,
  startContacts: 120,
  startGems: 20,
  /** 매일 03:00에 초기화 */
  dailyResetHour: 3,
  dailyFreeGems: 10,
};

export const ADS = {
  /** 하루 광고 보상 횟수와 보상 */
  dailyLimit: 3,
  /** 운동장 30분치 (리그 배율은 따로 곱한다) */
  cash: 900,
  contacts: 50,
  gems: 10,
  /** 가짜 광고 재생 시간(ms) */
  durationMs: 1500,
};

export const MATCH = {
  /** 경기 1판 실제 길이(초) */
  realSeconds: 75,
  /** 90분 경기의 공격 기회(포제션) 수 */
  possessions: 28,
  winCash: 60,
  drawCash: 25,
  lossCash: 10,
};

export const LEAGUE = {
  teams: 10,
  /** 승격 보상 (리그 단계 L에서 승격할 때) */
  promotionGems: 50,
  /** 운동장 2시간치 */
  promotionCash: (league: number) => Math.round(3600 * incomeMult(league)),
  /** 리그 L 상대 팀 선수 등급 분포: L-1, L, L+1 비율 */
  opponentTierMix: [0.15, 0.6, 0.25],
};

export const TRAINING = {
  dailyEntries: 2,
  adEntries: 1,
};

export const TOURNAMENT = {
  dailyTickets: 3,
  adTickets: 1,
  opponents: 5,
  tableSize: 20,
  /** 시즌 종료 순위별 젬 보상 */
  rewardByRank: (rank: number) => (rank === 1 ? 300 : rank <= 3 ? 150 : rank <= 10 ? 60 : 20),
};

export const SKILLS = {
  summonCost: 200,
  slots: 3,
  /** 소환 레벨이 오르는 데 필요한 누적 소환 수 */
  summonLevelSteps: [10, 30, 70, 150, 300],
};

export const MEMBERSHIP = {
  days: 7,
  dailyContacts: 150,
  dailyGems: 20,
  autoScoutSpeedMult: 2,
};

export const AUTO_SCOUT = {
  /** 자동 스카우트 간격(ms) */
  intervalMs: 450,
};
