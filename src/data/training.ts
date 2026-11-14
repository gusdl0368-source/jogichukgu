import type { Reward } from '../game/types';
import { ECONOMY, incomeMult } from './balance';

export type CampId = 'penalty' | 'futsal' | 'jokgu';

export interface CampDef {
  id: CampId;
  name: string;
  icon: string;
  desc: string;
  /** 직접 조작하는 미니게임인지 */
  interactive: boolean;
  reward: (difficulty: number) => Reward;
  /** 자동 캠프의 기준 팀 파워 */
  requiredPower?: (difficulty: number) => number;
}

export const CAMPS: CampDef[] = [
  {
    id: 'penalty',
    name: '승부차기 내기',
    icon: '🥅',
    desc: '진 팀이 막걸리 쏘기! 5번 차서 3골 이상 넣으면 성공. 보상: 호루라기 (스킬 소환)',
    interactive: true,
    reward: (d) => ({ whistles: Math.round(80 * Math.pow(1.18, d - 1)) }),
  },
  {
    id: 'futsal',
    name: '동네 풋살',
    icon: '⚽',
    desc: '동네 형들과 5대5 한 판. 보상: 연락처 + 회비',
    interactive: false,
    // 회비는 그 난이도에 맞는 리그의 운동장 10분치
    reward: (d) => ({ contacts: Math.round(20 * Math.pow(1.07, d - 1)), cash: Math.round(600 * ECONOMY.stadiumCashPerSec * incomeMult((d - 1) / 3)) }),
    requiredPower: (d) => 430 + 30 * (d - 1),
  },
  {
    id: 'jokgu',
    name: '운동장 족구',
    icon: '🏐',
    desc: '경기 끝나고 족구 한 판. 보상: 작전판 (전술 연구)',
    interactive: false,
    reward: (d) => ({ boards: Math.round(45 * Math.pow(1.18, d - 1)) }),
    requiredPower: (d) => 445 + 30 * (d - 1),
  },
];

export const MAX_CAMP_DIFFICULTY = 30;

/** 리그 단계마다 난이도 3단계씩 열린다 */
export function campDifficultyCap(league: number): number {
  return Math.min(MAX_CAMP_DIFFICULTY, 3 + league * 3);
}

/** 승부차기: 골키퍼가 방향을 맞힐 확률 */
export function keeperReadChance(difficulty: number): number {
  return Math.min(0.62, 0.22 + 0.016 * (difficulty - 1));
}

/** 자동 캠프 승률: 팀 파워가 기준보다 높을수록 올라간다 */
export function campWinChance(power: number, required: number): number {
  const x = (power - required) / (required * 0.1);
  return 1 / (1 + Math.exp(-x));
}
