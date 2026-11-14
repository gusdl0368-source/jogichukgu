import type { MatchMods } from '../game/match';

// 선수 특성. 높은 등급일수록 특성을 가진 선수가 자주 나온다.
// 주전으로 뛰면 팀 경기 확률에 더해진다.

export interface TraitDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  effect: keyof MatchMods;
  value: number;
}

export const TRAITS: TraitDef[] = [
  { id: 'freekick', name: '프리킥 장인', icon: '🎯', desc: '프리킥·페널티킥 성공률', effect: 'setPiece', value: 0.06 },
  { id: 'poacher', name: '골 냄새', icon: '👃', desc: '유효 슈팅 확률', effect: 'finishing', value: 0.02 },
  { id: 'cannon', name: '대포알', icon: '💥', desc: '파워슛 확률', effect: 'powerShot', value: 0.02 },
  { id: 'maestro', name: '패스 마스터', icon: '🪄', desc: '패스 성공 확률', effect: 'passAcc', value: 0.02 },
  { id: 'engine', name: '강철 심장', icon: '🫀', desc: '후반 체력 저하 감소', effect: 'stamina', value: 0.02 },
  { id: 'rocket', name: '로켓 스타트', icon: '🚀', desc: '역습 확률', effect: 'counter', value: 0.03 },
  { id: 'wall', name: '통곡의 벽', icon: '🧱', desc: '상대 패스 차단(중원 장악)', effect: 'pressing', value: 0.015 },
  { id: 'longshot', name: '중거리 슈터', icon: '🏹', desc: '먼 거리 슈팅 시도', effect: 'longShot', value: 0.03 },
  { id: 'gloves', name: '거미손', icon: '🧤', desc: '골키퍼 선방 확률', effect: 'gkSave', value: 0.025 },
  { id: 'clean', name: '신사', icon: '🎩', desc: '반칙·카드 줄이기', effect: 'discipline', value: 0.25 },
];

/** 그 포지션에 어울리는 특성만: 거미손은 골키퍼만, 골키퍼는 슈팅 특성 없음 */
const GK_ONLY = ['gloves'];
const NOT_GK = ['freekick', 'poacher', 'cannon', 'rocket', 'longshot'];

export function traitsFor(position: string): TraitDef[] {
  return TRAITS.filter((t) => (position === 'GK' ? !NOT_GK.includes(t.id) : !GK_ONLY.includes(t.id)));
}

export function traitById(id: string | undefined): TraitDef | undefined {
  return id ? TRAITS.find((t) => t.id === id) : undefined;
}

/** 등급별 특성 보유 확률 */
export function traitChance(tier: number): number {
  return Math.min(0.6, 0.04 + tier * 0.06);
}
