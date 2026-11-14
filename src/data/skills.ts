import type { MatchMods } from '../game/match';

export interface SkillDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  /** 0 일반, 1 희귀, 2 영웅 */
  rarity: 0 | 1 | 2;
  effect: keyof MatchMods;
  perLevel: number;
}

export const RARITY = [
  { name: '일반', color: '#9aa3ad' },
  { name: '희귀', color: '#3d8bef' },
  { name: '영웅', color: '#8a5cf0' },
];

export const SKILLS: SkillDef[] = [
  { id: 'cannon', name: '대포알 슈팅', icon: '💥', desc: '슈팅이 파워슛이 될 확률', rarity: 0, effect: 'powerShot', perLevel: 0.01 },
  { id: 'knife', name: '칼패스', icon: '🔪', desc: '패스 성공 확률', rarity: 0, effect: 'passAcc', perLevel: 0.01 },
  { id: 'lightning', name: '번개 역습', icon: '⚡', desc: '역습 발동 확률', rarity: 0, effect: 'counter', perLevel: 0.02 },
  { id: 'longshot', name: '중거리 대포', icon: '🎯', desc: '먼 거리 슈팅 시도 확률', rarity: 1, effect: 'longShot', perLevel: 0.02 },
  { id: 'spider', name: '거미손', icon: '🕷️', desc: '골키퍼 선방 확률', rarity: 1, effect: 'gkSave', perLevel: 0.01 },
  { id: 'press', name: '동네 압박', icon: '🐝', desc: '중원 장악력', rarity: 1, effect: 'pressing', perLevel: 0.01 },
  { id: 'iron', name: '강철 체력', icon: '🦾', desc: '후반 체력 저하 감소', rarity: 2, effect: 'stamina', perLevel: 0.01 },
  { id: 'cool', name: '침착한 마무리', icon: '🧊', desc: '유효 슈팅 확률', rarity: 2, effect: 'finishing', perLevel: 0.01 },
];

export const MAX_SKILL_LEVEL = 10;

/** 소환 레벨별 희귀도 확률(%) */
export const SUMMON_RARITY_BY_LEVEL: number[][] = [
  [85, 14, 1],
  [78, 19, 3],
  [70, 24, 6],
  [62, 28, 10],
  [55, 31, 14],
  [48, 34, 18],
];

/** 레벨 lv → lv+1 에 필요한 중복 조각 수 */
export function shardsToLevel(level: number): number {
  return level;
}
