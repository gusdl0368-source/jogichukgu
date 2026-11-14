import { ECONOMY, TIERS } from '../data/balance';
import type { CampId } from '../data/training';
import { type Crest } from '../data/teams';
import { createLeague, type LeagueState } from './league';
import type { MatchResult, TacticStyle } from './match';
import type { MissionKey } from '../data/missions';
import { generateSquad } from './players';
import { Rng, randomSeed } from './rng';
import type { Player, Wallet } from './types';

export const SAVE_VERSION = 2;
export const SAVE_KEY = 'jogichukgu-save-v1';

export interface CurrentMatch {
  round: number;
  opponentId: string;
  home: boolean;
  startedAt: number;
  result: MatchResult;
  myPower: number;
  oppPower: number;
}

export interface MatchSummary {
  opponentName: string;
  score: [number, number];
  /** 내 팀 기준 점수 [나, 상대] */
  myScore: [number, number];
  outcome: 'win' | 'draw' | 'loss';
  reasons: string[];
  cash: number;
  seasonEnd?: { rank: number; promoted: boolean; level: number; reward?: { cash: number; gems: number } };
  champion?: boolean;
}

export interface TournamentOpponent {
  name: string;
  crest: Crest;
  tiers: number[];
  seed: number;
  power: number;
  stars: number;
}

export interface TournamentBot {
  name: string;
  crest: Crest;
  power: number;
  finalStars: number;
}

export interface TournamentState {
  seasonKey: string;
  stars: number;
  bots: TournamentBot[];
  opponents: TournamentOpponent[];
  /** 지난 시즌 보상(받기 전) */
  pendingReward: { rank: number; gems: number } | null;
}

export interface DailyState {
  key: string;
  ads: { cash: number; contacts: number; gems: number; stadium: number; autoScout: number };
  freeGems: boolean;
  campUsed: Record<CampId, number>;
  campAd: Record<CampId, number>;
  tournamentTickets: number;
  tournamentAd: number;
  membershipClaimed: boolean;
  deals: { set: number; bought: boolean[] };
  /** 일일 미션 진행도와 받은 보상 */
  missions: { progress: Record<MissionKey, number>; claimed: MissionKey[]; bonus: boolean };
  /** 오늘의 슈퍼스타 영입 제안을 샀는지 */
  superstarBought: boolean;
}

export interface GameStats {
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  goals: number;
  sold: number;
  signed: number;
  promotions: number;
  collects: number;
  camps: number;
  cups: number;
  autoUsed: boolean;
  styleChanged: boolean;
  bestTier: number;
}

export function newStats(): GameStats {
  return { matches: 0, wins: 0, draws: 0, losses: 0, goals: 0, sold: 0, signed: 0, promotions: 0, collects: 0, camps: 0, cups: 0, autoUsed: false, styleChanged: false, bestTier: 0 };
}

export interface GameState {
  version: number;
  createdAt: number;
  lastActive: number;
  rngSeed: number;
  teamName: string;
  crest: Crest;
  wallet: Wallet;
  squad: Player[];
  scoutLevel: number;
  scoutCount: number;
  pending: Player | null;
  autoScout: { keepTiers: boolean[]; enabled: boolean };
  league: LeagueState;
  match: CurrentMatch | null;
  lastSummary: MatchSummary | null;
  /** contactCarrySec: 다음 연락처까지 이미 지난 시간(초) */
  stadium: { lastCollect: number; contactCarrySec: number };
  daily: DailyState;
  research: { levels: Record<string, number>; active: { id: string; endsAt: number } | null };
  skills: { owned: Record<string, { level: number; shards: number }>; equipped: string[]; summonCount: number; extraSlot: boolean };
  training: { cleared: Record<CampId, number> };
  tournament: TournamentState;
  membershipUntil: number;
  sponsors: string[];
  pass: { wins: number; premium: boolean; claimedFree: number[]; claimedPremium: number[] };
  stats: GameStats;
  /** 경기 운영 방식 */
  style: TacticStyle;
  /** 다음에 깰 가이드 퀘스트 번호 */
  guideStep: number;
  settings: { sound: boolean };
  /** 슈퍼스타 리그 우승 = 엔딩 */
  champion: boolean;
  seenTutorial: boolean;
}

const DAY_MS = 24 * 3600 * 1000;

/** 매일 03:00 초기화 기준의 날짜 키 */
export function dayKey(now: number): string {
  const d = new Date(now - ECONOMY.dailyResetHour * 3600 * 1000);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** 다음 03:00 시각(ms) */
export function nextReset(now: number): number {
  const d = new Date(now);
  d.setHours(ECONOMY.dailyResetHour, 0, 0, 0);
  if (d.getTime() <= now) d.setTime(d.getTime() + DAY_MS);
  return d.getTime();
}

export function newDaily(key: string): DailyState {
  return {
    key,
    ads: { cash: 0, contacts: 0, gems: 0, stadium: 0, autoScout: 0 },
    freeGems: false,
    campUsed: { penalty: 0, futsal: 0, jokgu: 0 },
    campAd: { penalty: 0, futsal: 0, jokgu: 0 },
    tournamentTickets: 3,
    tournamentAd: 0,
    membershipClaimed: false,
    deals: { set: 0, bought: [false, false, false] },
    missions: { progress: { scout: 0, wins: 0, collect: 0, camp: 0, cup: 0 }, claimed: [], bonus: false },
    superstarBought: false,
  };
}

export function newGameState(now: number, seed = randomSeed(), teamName = '새벽 FC'): GameState {
  const rng = new Rng(seed);
  const crest: Crest = { color: '#2f6fed', icon: '🌅' };
  return {
    version: SAVE_VERSION,
    createdAt: now,
    lastActive: now,
    rngSeed: rng.seed(),
    teamName,
    crest,
    wallet: { cash: ECONOMY.startCash, contacts: ECONOMY.startContacts, gems: ECONOMY.startGems, boards: 0, whistles: 0 },
    squad: generateSquad(rng, () => 0),
    scoutLevel: 1,
    scoutCount: 0,
    pending: null,
    autoScout: { keepTiers: TIERS.map((_, i) => i >= 1), enabled: false },
    league: createLeague(rng.seed(), 0, 1, teamName, crest),
    match: null,
    lastSummary: null,
    stadium: { lastCollect: now, contactCarrySec: 0 },
    daily: newDaily(dayKey(now)),
    research: { levels: {}, active: null },
    skills: { owned: {}, equipped: [], summonCount: 0, extraSlot: false },
    training: { cleared: { penalty: 0, futsal: 0, jokgu: 0 } },
    tournament: { seasonKey: '', stars: 0, bots: [], opponents: [], pendingReward: null },
    membershipUntil: 0,
    sponsors: [],
    pass: { wins: 0, premium: false, claimedFree: [], claimedPremium: [] },
    stats: newStats(),
    style: 'balance',
    guideStep: 0,
    settings: { sound: true },
    champion: false,
    seenTutorial: false,
  };
}

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

/** 저장 데이터 복원. 예전 버전이면 새 버전으로 옮기고, 깨졌거나 모르는 버전이면 null */
export function deserialize(raw: string | null): GameState | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as GameState;
    if (!s || typeof s !== 'object' || !Array.isArray(s.squad) || s.squad.length !== 11) return null;
    return migrate(s);
  } catch {
    return null;
  }
}

/** v1 → v2: 국적·미션·경기 운영·설정 필드 추가. 진행은 그대로 유지한다. */
export function migrate(s: GameState): GameState | null {
  if (s.version === SAVE_VERSION) return s;
  if (s.version !== 1) return null;
  const v1 = s as GameState & { stats: Partial<GameStats> };
  const fixPlayer = (p: Player): Player => ({ ...p, nation: p.nation ?? 'KR' });
  v1.squad = v1.squad.map(fixPlayer);
  if (v1.pending) v1.pending = fixPlayer(v1.pending);
  for (const t of v1.league.teams) if (t.squad) t.squad = t.squad.map(fixPlayer);
  v1.stats = { ...newStats(), ...v1.stats, bestTier: Math.max(...v1.squad.map((p) => p.tier)) };
  v1.style = 'balance';
  v1.guideStep = 0;
  v1.settings = { sound: true };
  const d = newDaily(v1.daily.key);
  v1.daily = { ...d, ...v1.daily, missions: d.missions, superstarBought: false };
  // 리그가 홈·원정 18경기로 바뀌기 전 저장이면 남은 일정을 그대로 두되 경기 수는 표시로만 쓴다
  // 진행 중이던 경기는 이벤트 형식이 달라질 수 있어 결과만 남기고 다시 시작한다
  v1.match = null;
  v1.version = SAVE_VERSION;
  return v1;
}
