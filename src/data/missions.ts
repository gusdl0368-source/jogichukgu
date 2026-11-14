import type { Game } from '../game/game';
import type { Reward } from '../game/types';

// 일일 미션(매일 03:00 초기화)과 가이드 퀘스트(처음부터 엔딩까지 이어지는 한 줄짜리 목표).

export type MissionKey = 'scout' | 'wins' | 'collect' | 'camp' | 'cup';

export interface DailyMission {
  id: MissionKey;
  name: string;
  icon: string;
  target: number;
  reward: Reward;
}

export const DAILY_MISSIONS: DailyMission[] = [
  { id: 'scout', name: '선수 100명 스카우트', icon: '🔭', target: 100, reward: { gems: 5, contacts: 30 } },
  { id: 'wins', name: '리그 경기 3승', icon: '⚽', target: 3, reward: { gems: 10 } },
  { id: 'collect', name: '운동장 수익 3번 수령', icon: '🏟️', target: 3, reward: { contacts: 40 } },
  { id: 'camp', name: '훈련 캠프 3번 도전', icon: '👟', target: 3, reward: { whistles: 150 } },
  { id: 'cup', name: '대항전 1번 도전', icon: '🏆', target: 1, reward: { boards: 60 } },
];

/** 일일 미션을 모두 끝내면 받는 상자 */
export const DAILY_BONUS: Reward = { gems: 30, contacts: 100 };

export interface GuideQuest {
  name: string;
  hint: string;
  /** [현재, 목표] */
  progress: (g: Game) => [number, number];
  reward: Reward;
}

const reach = (cur: number, target: number): [number, number] => [Math.min(cur, target), target];

export const GUIDE: GuideQuest[] = [
  { name: '첫 스카우트', hint: '🔭 버튼을 눌러 선수를 찾아보세요', progress: (g) => reach(g.state.scoutCount, 1), reward: { contacts: 20 } },
  { name: '첫 영입', hint: '지금 주전보다 좋은 선수를 영입하세요', progress: (g) => reach(g.state.stats.signed, 1), reward: { cash: 100 } },
  { name: '스카우트 Lv.2', hint: '스카우트 버튼 옆에서 레벨을 올리세요', progress: (g) => reach(g.state.scoutLevel, 2), reward: { contacts: 30 } },
  { name: '운동장 수익 수령', hint: '🏟️ 버튼에서 쌓인 회비를 받으세요', progress: (g) => reach(g.state.stats.collects, 1), reward: { gems: 10 } },
  { name: '리그 첫 승', hint: '경기는 자동으로 진행돼요', progress: (g) => reach(g.state.stats.wins, 1), reward: { cash: 200 } },
  { name: '자동 스카우트 켜기', hint: '🔁 자동 버튼으로 스카우트를 맡겨보세요', progress: (g) => reach(g.state.stats.autoUsed ? 1 : 0, 1), reward: { contacts: 50 } },
  { name: '훈련 캠프 도전', hint: '👟 훈련 탭에서 캠프에 도전하세요', progress: (g) => reach(g.state.stats.camps, 1), reward: { whistles: 100 } },
  { name: '팀 스킬 소환', hint: '📋 전술 탭 → 팀 스킬에서 소환하세요', progress: (g) => reach(g.state.skills.summonCount, 1), reward: { gems: 10 } },
  { name: '경기 운영 바꿔보기', hint: '📋 전술 탭에서 닥공/균형/버스 세우기를 골라보세요', progress: (g) => reach(g.state.stats.styleChanged ? 1 : 0, 1), reward: { contacts: 40 } },
  { name: '스카우트 Lv.5', hint: '회비로 스카우트 레벨을 올리세요', progress: (g) => reach(g.state.scoutLevel, 5), reward: { contacts: 80 } },
  { name: '전술 연구 시작', hint: '📋 전술 탭에서 연구를 시작하세요', progress: (g) => reach(Object.values(g.state.research.levels).reduce((a, b) => a + b, 0) + (g.state.research.active ? 1 : 0), 1), reward: { boards: 50 } },
  { name: '대항전 도전', hint: '🏆 대회 탭에서 다른 구단에 도전하세요', progress: (g) => reach(g.state.stats.cups, 1), reward: { gems: 15 } },
  { name: '지역 리그 승격', hint: '리그 1위를 하면 승격해요', progress: (g) => reach(g.state.league.level, 1), reward: { gems: 30 } },
  { name: '팀 파워 700', hint: '더 좋은 선수를 영입하세요', progress: (g) => reach(Math.floor(g.power().total), 700), reward: { contacts: 150 } },
  { name: '3부 리그 승격', hint: '점점 상대가 강해집니다', progress: (g) => reach(g.state.league.level, 2), reward: { gems: 40 } },
  { name: '스카우트 Lv.10', hint: '더 높은 등급 선수가 나오기 시작해요', progress: (g) => reach(g.state.scoutLevel, 10), reward: { gems: 30 } },
  { name: '2부 리그 승격', hint: '이제부터 해외 선수가 자주 보여요', progress: (g) => reach(g.state.league.level, 3), reward: { gems: 50 } },
  { name: '세미프로 승격', hint: '특성 있는 선수를 노려보세요', progress: (g) => reach(g.state.league.level, 4), reward: { gems: 80 } },
  { name: '프로 1부 승격', hint: '드디어 프로 무대!', progress: (g) => reach(g.state.league.level, 5), reward: { gems: 100 } },
  { name: '엘리트 리그 진출', hint: '유럽 명문 구장이 기다립니다', progress: (g) => reach(g.state.league.level, 6), reward: { gems: 120 } },
  { name: '월드클래스 진출', hint: '대륙 챔피언스 무대로', progress: (g) => reach(g.state.league.level, 7), reward: { gems: 150 } },
  { name: '슈퍼스타 리그 진출', hint: '마지막 무대입니다', progress: (g) => reach(g.state.league.level, 8), reward: { gems: 200 } },
  { name: '세계 정상', hint: '슈퍼스타 리그에서 우승하세요', progress: (g) => reach(g.state.champion ? 1 : 0, 1), reward: { gems: 500 } },
];
