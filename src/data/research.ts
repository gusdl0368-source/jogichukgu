// 전술 연구 트리. 작전판 + 시간으로 올리고, 한 번에 하나만 진행한다.

export type ResearchEffect =
  | 'passAcc' | 'pressing' | 'finishing' | 'gkSave' | 'stamina'
  | 'sellPrice' | 'autoSpeed' | 'stadiumContacts' | 'scoutDiscount'
  | 'stadiumCash' | 'offlineCap' | 'matchCash' | 'teamPower';

export type TreeId = 'coaching' | 'scouting' | 'club';

export interface ResearchNode {
  id: string;
  tree: TreeId;
  name: string;
  icon: string;
  desc: string;
  effect: ResearchEffect;
  /** 레벨당 효과 (확률은 0.01 = 1%p, 배율은 0.1 = +10%, 상한은 시간) */
  perLevel: number;
  maxLevel: number;
  /** 이 노드를 열려면 같은 트리의 앞 노드가 이 레벨 이상 */
  requires?: { id: string; level: number };
  baseCost: number;
  baseMinutes: number;
}

export const TREES: { id: TreeId; name: string; icon: string; desc: string }[] = [
  { id: 'coaching', name: '코칭', icon: '📋', desc: '경기 중 확률을 올립니다' },
  { id: 'scouting', name: '스카우팅', icon: '🔭', desc: '스카우트 효율을 올립니다' },
  { id: 'club', name: '구단 운영', icon: '🏟️', desc: '수입과 팀 파워를 올립니다' },
];

export const RESEARCH: ResearchNode[] = [
  { id: 'c_pass', tree: 'coaching', name: '칼패스 훈련', icon: '🎯', desc: '패스 성공 확률', effect: 'passAcc', perLevel: 0.01, maxLevel: 5, baseCost: 30, baseMinutes: 2 },
  { id: 'c_press', tree: 'coaching', name: '전방 압박', icon: '🏃', desc: '점유율(중원 장악)', effect: 'pressing', perLevel: 0.01, maxLevel: 5, requires: { id: 'c_pass', level: 2 }, baseCost: 45, baseMinutes: 4 },
  { id: 'c_finish', tree: 'coaching', name: '슈팅 특훈', icon: '🥅', desc: '유효 슈팅 확률', effect: 'finishing', perLevel: 0.01, maxLevel: 5, requires: { id: 'c_press', level: 2 }, baseCost: 70, baseMinutes: 8 },
  { id: 'c_gk', tree: 'coaching', name: '골키퍼 특훈', icon: '🧤', desc: '선방 확률', effect: 'gkSave', perLevel: 0.01, maxLevel: 5, requires: { id: 'c_press', level: 2 }, baseCost: 70, baseMinutes: 8 },
  { id: 'c_stamina', tree: 'coaching', name: '새벽 체력 훈련', icon: '💪', desc: '후반 체력 저하 감소', effect: 'stamina', perLevel: 0.01, maxLevel: 5, requires: { id: 'c_finish', level: 3 }, baseCost: 110, baseMinutes: 15 },

  { id: 's_sell', tree: 'scouting', name: '인맥 넓히기', icon: '🤝', desc: '선수 판매가', effect: 'sellPrice', perLevel: 0.1, maxLevel: 5, baseCost: 25, baseMinutes: 2 },
  { id: 's_auto', tree: 'scouting', name: '스카우트 수첩', icon: '📒', desc: '자동 스카우트 속도', effect: 'autoSpeed', perLevel: 0.1, maxLevel: 5, requires: { id: 's_sell', level: 2 }, baseCost: 40, baseMinutes: 4 },
  { id: 's_contacts', tree: 'scouting', name: '동네 정보망', icon: '📡', desc: '운동장 연락처 수입', effect: 'stadiumContacts', perLevel: 0.15, maxLevel: 5, requires: { id: 's_auto', level: 2 }, baseCost: 60, baseMinutes: 8 },
  { id: 's_discount', tree: 'scouting', name: '눈썰미', icon: '👀', desc: '스카우트 레벨업 비용 감소', effect: 'scoutDiscount', perLevel: 0.03, maxLevel: 5, requires: { id: 's_contacts', level: 3 }, baseCost: 100, baseMinutes: 15 },

  { id: 'k_snack', tree: 'club', name: '매점 운영', icon: '🍜', desc: '운동장 회비 수입', effect: 'stadiumCash', perLevel: 0.1, maxLevel: 5, baseCost: 30, baseMinutes: 2 },
  { id: 'k_parking', tree: 'club', name: '주차장 확장', icon: '🅿️', desc: '오프라인 누적 상한(시간)', effect: 'offlineCap', perLevel: 1, maxLevel: 4, requires: { id: 'k_snack', level: 2 }, baseCost: 45, baseMinutes: 5 },
  { id: 'k_fans', tree: 'club', name: '응원단 모집', icon: '📣', desc: '경기 보상 회비', effect: 'matchCash', perLevel: 0.1, maxLevel: 5, requires: { id: 'k_parking', level: 1 }, baseCost: 60, baseMinutes: 8 },
  { id: 'k_unity', tree: 'club', name: '회식으로 단합', icon: '🍶', desc: '팀 파워', effect: 'teamPower', perLevel: 0.01, maxLevel: 5, requires: { id: 'k_fans', level: 2 }, baseCost: 120, baseMinutes: 15 },
];

/** 현재 레벨 → 다음 레벨 비용 */
export function researchCost(node: ResearchNode, level: number): { boards: number; minutes: number } {
  return {
    boards: Math.round(node.baseCost * Math.pow(level + 1, 1.5)),
    minutes: Math.round(node.baseMinutes * Math.pow(level + 1, 1.3)),
  };
}

/** 젬으로 즉시 완료: 남은 5분당 1젬 */
export function rushGemCost(msLeft: number): number {
  return Math.max(1, Math.ceil(msLeft / (5 * 60 * 1000)));
}
