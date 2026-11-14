// 리텐션·수익화 장치의 수치. 회비는 "운동장 몇 초치 × 리그 배율"로 정해 리그가 올라도 의미가 유지된다.

import type { Reward } from '../game/types';
import { ECONOMY, TIERS, incomeMult } from './balance';
import { NATIONS } from './nations';

// ───────── 7일 출석 ─────────

export const ATTENDANCE: Reward[] = [
  { gems: 20 },
  { contacts: 100 },
  { whistles: 300 },
  { boards: 120 },
  { gems: 40 },
  { contacts: 300 },
  { gems: 100, contacts: 500 },
];

/** 연속 출석 7일마다 추가 보너스 */
export const STREAK_BONUS: Reward = { gems: 50 };

// ───────── 경기장 증축 ─────────

export const MAX_STADIUM_LEVEL = 20;

export function stadiumUpgradeCost(level: number): number {
  return Math.round(4000 * Math.pow(2.25, level));
}

/** 레벨당 운동장 회비 +15%, 오프라인 상한 +0.5시간 */
export const STADIUM_PER_LEVEL = { cash: 0.15, capHours: 0.5 };

export const STADIUM_NAMES = ['공터', '흙 운동장', '인조잔디', '관중석 한 줄', '조명탑', '전광판', '지붕 관중석', '2층 관중석', 'VIP 박스', '돔 구장'];

export function stadiumName(level: number): string {
  return STADIUM_NAMES[Math.min(STADIUM_NAMES.length - 1, Math.floor(level / 2))];
}

// ───────── 선수 훈련 ─────────

export const MAX_TRAIN = 10;

/** 등급 t 선수의 훈련 lv → lv+1 비용 (회비) */
export function trainCost(tier: number, level: number): number {
  return Math.round(250 * Math.pow(3.1, tier) * Math.pow(1.45, level));
}

// ───────── 도감 ─────────

export const COLLECTION_SIZE = NATIONS.length * TIERS.length;

export const COLLECTION_MILESTONES: { count: number; reward: Reward; power: number }[] = [
  { count: 5, reward: { gems: 20 }, power: 0.005 },
  { count: 12, reward: { gems: 30, contacts: 100 }, power: 0.005 },
  { count: 25, reward: { gems: 50 }, power: 0.01 },
  { count: 40, reward: { gems: 80, contacts: 300 }, power: 0.01 },
  { count: 60, reward: { gems: 120 }, power: 0.01 },
  { count: 80, reward: { gems: 160, contacts: 500 }, power: 0.015 },
  { count: 100, reward: { gems: 220 }, power: 0.015 },
  { count: 120, reward: { gems: 300 }, power: 0.02 },
  { count: 135, reward: { gems: 500 }, power: 0.03 },
];

export function collectionKey(nation: string, tier: number): string {
  return `${nation}-${tier}`;
}

// ───────── 행운 룰렛 ─────────

export interface WheelSlot {
  label: string;
  weight: number;
  reward: (league: number) => Reward;
  color: string;
}

const hour = (l: number) => 3600 * ECONOMY.stadiumCashPerSec * incomeMult(l);

export const WHEEL: WheelSlot[] = [
  { label: '회비 30분', weight: 22, color: '#49c35a', reward: (l) => ({ cash: Math.round(hour(l) / 2) }) },
  { label: '연락처 60', weight: 20, color: '#3a7be6', reward: () => ({ contacts: 60 }) },
  { label: '젬 10', weight: 14, color: '#a066ff', reward: () => ({ gems: 10 }) },
  { label: '호루라기 200', weight: 14, color: '#c9d1e3', reward: () => ({ whistles: 200 }) },
  { label: '작전판 80', weight: 14, color: '#a8723a', reward: () => ({ boards: 80 }) },
  { label: '회비 3시간', weight: 8, color: '#2f8f3e', reward: (l) => ({ cash: Math.round(hour(l) * 3) }) },
  { label: '연락처 300', weight: 6, color: '#1f4fb8', reward: () => ({ contacts: 300 }) },
  { label: '젬 100', weight: 2, color: '#ef4f9a', reward: () => ({ gems: 100 }) },
];

export const WHEEL_GEM_COST = 30;
export const WHEEL_AD_SPINS = 2;

// ───────── 한정 특가 ─────────

export interface OfferDef {
  id: 'starter' | 'promotion' | 'comeback';
  name: string;
  desc: string;
  price: number;
  hours: number;
  reward: (league: number) => Reward;
  /** 정가 대비 가치 표시용 */
  value: string;
}

export const OFFERS: Record<OfferDef['id'], OfferDef> = {
  starter: {
    id: 'starter',
    name: '새벽 FC 창단 패키지',
    desc: '처음 3일만! 단 한 번 구매 가능',
    price: 1200,
    hours: 72,
    reward: () => ({ gems: 200, contacts: 600, whistles: 600 }),
    value: '가치 10배',
  },
  promotion: {
    id: 'promotion',
    name: '승격 기념 패키지',
    desc: '승격 축하! 24시간 한정',
    price: 4900,
    hours: 24,
    reward: (l) => ({ gems: 300, contacts: 1000, cash: Math.round(hour(l) * 8) }),
    value: '가치 6배',
  },
  comeback: {
    id: 'comeback',
    name: '돌아온 감독님 패키지',
    desc: '오랜만이에요! 24시간 한정',
    price: 2500,
    hours: 24,
    reward: (l) => ({ gems: 150, contacts: 800, cash: Math.round(hour(l) * 6) }),
    value: '가치 8배',
  },
};

/** 이 시간 이상 안 들어왔다가 오면 복귀 패키지 */
export const COMEBACK_AFTER_HOURS = 48;

// ───────── 구단 꾸미기 ─────────

export interface KitDef {
  id: string;
  name: string;
  /** 0 = 기본(무료) */
  gems: number;
  main: string;
  dark: string;
  light: string;
  trim: string;
  shorts: string;
  socks: string;
  keeper: string;
}

export const KITS: KitDef[] = [
  { id: 'blue', name: '새벽 블루', gems: 0, main: '#2f6fed', dark: '#1f4fb8', light: '#5b8ff5', trim: '#ffffff', shorts: '#ffffff', socks: '#1f4fb8', keeper: '#21c7d9' },
  { id: 'red', name: '불꽃 레드', gems: 80, main: '#e5484d', dark: '#b9363a', light: '#f07a7e', trim: '#ffffff', shorts: '#1d2433', socks: '#e5484d', keeper: '#f5b81c' },
  { id: 'green', name: '잔디 그린', gems: 80, main: '#2fb35a', dark: '#1f8441', light: '#62d184', trim: '#ffffff', shorts: '#ffffff', socks: '#2fb35a', keeper: '#8a5cf0' },
  { id: 'black', name: '심야 블랙', gems: 120, main: '#2a2f3d', dark: '#161a24', light: '#4a5163', trim: '#f5b81c', shorts: '#2a2f3d', socks: '#f5b81c', keeper: '#2fb35a' },
  { id: 'yellow', name: '해돋이 옐로', gems: 120, main: '#f5b81c', dark: '#c98a0b', light: '#ffd86a', trim: '#1d2433', shorts: '#1d2433', socks: '#f5b81c', keeper: '#3a7be6' },
  { id: 'purple', name: '로열 퍼플', gems: 150, main: '#8a5cf0', dark: '#6a35c9', light: '#b18cff', trim: '#ffffff', shorts: '#ffffff', socks: '#8a5cf0', keeper: '#f07a2c' },
  { id: 'sky', name: '하늘색 클래식', gems: 150, main: '#6fb7f0', dark: '#3f8ac4', light: '#a8d6fa', trim: '#ffffff', shorts: '#1d2433', socks: '#ffffff', keeper: '#e5484d' },
  { id: 'gold', name: '챔피언 골드', gems: 300, main: '#d9a520', dark: '#9c7410', light: '#f5d26a', trim: '#1d2433', shorts: '#1d2433', socks: '#d9a520', keeper: '#ef4f9a' },
];

export const CREST_ICONS = ['🌅', '🦁', '🐯', '🦅', '🐻', '🐺', '🦊', '🐉', '⭐', '🔥', '⚓', '👑', '⚡', '🍀', '🌙', '🐓'];
export const CREST_COLORS = ['#2f6fed', '#e5484d', '#2fb35a', '#f5b81c', '#8a5cf0', '#1d2433', '#f07a2c', '#ef4f9a'];
/** 엠블럼 바꾸는 값 (첫 번째 변경은 무료) */
export const CREST_CHANGE_GEMS = 20;

// ───────── 오프라인 보상 2배 ─────────

export const OFFLINE_DOUBLE_ADS = 3;
