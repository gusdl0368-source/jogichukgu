// 상점 상품. 프로토타입이라 실제 결제는 연동하지 않고, 구매 버튼을 누르면 확인 후 바로 지급한다.

import type { Reward } from '../game/types';
import { ECONOMY, incomeMult } from './balance';

export interface CashProduct {
  id: string;
  name: string;
  /** 원화 가격 */
  price: number;
  desc?: string;
}

export const GEM_PACKS: (CashProduct & { gems: number })[] = [
  { id: 'gems_100', name: '젬 100', gems: 100, price: 3300 },
  { id: 'gems_300', name: '젬 300', gems: 300, price: 7700 },
  { id: 'gems_1300', name: '젬 1,300', gems: 1300, price: 33000 },
  { id: 'gems_5000', name: '젬 5,000', gems: 5000, price: 110000 },
];

/** 하루 특가 3종. 세 개를 다 사면 다음 세트가 열린다. league에 따라 회비 양이 커진다. */
export function dailyDeals(set: number, league: number): (CashProduct & { reward: Reward })[] {
  // 회비는 "운동장 몇 시간치"로 정한다
  const hour = 3600 * ECONOMY.stadiumCashPerSec * incomeMult(league) * (1 + set * 0.5);
  return [
    { id: `deal_${set}_0`, name: '스카우트 대장 특가', price: 7700, reward: { contacts: 500, gems: 150 } },
    { id: `deal_${set}_1`, name: '구단주 특가', price: 25000, reward: { contacts: 900, gems: 120, boards: 800, cash: Math.round(6 * hour) } },
    { id: `deal_${set}_2`, name: '자원 몰빵 특가', price: 77000, reward: { cash: Math.round(30 * hour), whistles: 4000, contacts: 2000, boards: 2500, gems: 250 } },
  ];
}

export interface Sponsor extends CashProduct {
  icon: string;
  effect: 'stadiumCash' | 'sellPrice' | 'teamPower';
  value: number;
}

export const SPONSORS: Sponsor[] = [
  { id: 'chicken', icon: '🍗', name: '바삭치킨 유니폼 스폰서', desc: '운동장 회비 수입 +30% (영구)', price: 3900, effect: 'stadiumCash', value: 0.3 },
  { id: 'hardware', icon: '🔨', name: '튼튼철물 구단 버스', desc: '선수 판매가 +30% (영구)', price: 5900, effect: 'sellPrice', value: 0.3 },
  { id: 'realty', icon: '🏠', name: '행복부동산 운동장 현수막', desc: '팀 파워 +3% (영구)', price: 9900, effect: 'teamPower', value: 0.03 },
];

export const MEMBERSHIP_PRODUCT: CashProduct = {
  id: 'membership',
  name: '정회원 회비 (7일)',
  price: 6600,
  desc: '즉시 연락처 150 + 젬 100, 매일 연락처 150 + 젬 20, 자동 스카우트 2배 속도',
};

export const EXTRA_SKILL_SLOT: CashProduct = { id: 'skill_slot', name: '스킬 슬롯 +1', price: 4900, desc: '팀 스킬을 하나 더 장착합니다' };

export const PASS_PRODUCT: CashProduct = { id: 'pass_premium', name: '시즌 회비 패스 (프리미엄)', price: 17000 };

/** 패스 단계: 리그 경기 승리 수로 진행 */
export const PASS_STEPS = 40;

export function passReward(step: number, premium: boolean, league: number): Reward {
  // 무료는 운동장 20분치, 프리미엄은 1시간치
  const cash = Math.round(1200 * ECONOMY.stadiumCashPerSec * incomeMult(league) * (premium ? 3 : 1));
  const kind = step % 3;
  if (kind === 0) return { cash, contacts: premium ? 40 : 15 };
  if (kind === 1) return { cash, whistles: premium ? 250 : 80 };
  return { cash, boards: premium ? 120 : 40 };
}

/** 젬으로 사는 상품 */
export interface GemItem {
  id: string;
  name: string;
  icon: string;
  gems: number;
  reward: (league: number) => Reward;
}

export const GEM_ITEMS: GemItem[] = [
  { id: 'g_contacts', name: '연락처 300', icon: '📞', gems: 50, reward: () => ({ contacts: 300 }) },
  { id: 'g_cash', name: '회비 상자 (운동장 3시간치)', icon: '💵', gems: 40, reward: (l) => ({ cash: Math.round(3 * 3600 * ECONOMY.stadiumCashPerSec * incomeMult(l)) }) },
  { id: 'g_boards', name: '작전판 200', icon: '📋', gems: 60, reward: () => ({ boards: 200 }) },
  { id: 'g_whistles', name: '호루라기 600', icon: '📯', gems: 60, reward: () => ({ whistles: 600 }) },
];
