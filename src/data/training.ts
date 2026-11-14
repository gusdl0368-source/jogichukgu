import type { Reward } from '../game/types';

export type CampId = 'penalty' | 'futsal' | 'jokgu';

export interface CampDef {
  id: CampId;
  name: string;
  icon: string;
  desc: string;
  /** 직접 조작하는 미니게임인지 */
  interactive: boolean;
  maxDifficulty: number;
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
    maxDifficulty: 30,
    reward: (d) => ({ whistles: Math.round(80 * Math.pow(1.25, d - 1)) }),
  },
  {
    id: 'futsal',
    name: '동네 풋살',
    icon: '⚽',
    desc: '동네 형들과 5대5 한 판. 보상: 연락처 + 회비',
    interactive: false,
    maxDifficulty: 30,
    reward: (d) => ({ contacts: Math.round(40 * Math.pow(1.22, d - 1)), cash: Math.round(150 * Math.pow(1.6, d - 1)) }),
    requiredPower: (d) => Math.round(260 * Math.pow(1.13, d - 1)),
  },
  {
    id: 'jokgu',
    name: '운동장 족구',
    icon: '🏐',
    desc: '경기 끝나고 족구 한 판. 보상: 작전판 (전술 연구)',
    interactive: false,
    maxDifficulty: 30,
    reward: (d) => ({ boards: Math.round(45 * Math.pow(1.25, d - 1)) }),
    requiredPower: (d) => Math.round(280 * Math.pow(1.13, d - 1)),
  },
];

/** 승부차기: 골키퍼가 방향을 맞힐 확률 */
export function keeperReadChance(difficulty: number): number {
  return Math.min(0.62, 0.22 + 0.016 * (difficulty - 1));
}

/** 자동 캠프 승률: 팀 파워가 기준보다 높을수록 올라간다 */
export function campWinChance(power: number, required: number): number {
  const x = (power - required) / (required * 0.1);
  return 1 / (1 + Math.exp(-x));
}
