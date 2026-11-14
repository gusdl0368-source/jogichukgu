import { LEAGUE, TIERS } from '../data/balance';
import { type Crest, randomCrest, randomTeamName } from '../data/teams';
import { type MatchMods, NO_MODS, quickResult, type TeamSide } from './match';
import { generateSquad, teamPower } from './players';
import { Rng } from './rng';
import type { Player } from './types';

export const PLAYER_TEAM_ID = 'me';

export interface LeagueTeam {
  id: string;
  name: string;
  crest: Crest;
  /** AI 팀만 가진다. 내 팀 스쿼드는 GameState.squad */
  squad?: Player[];
}

export interface TableRow {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  points: number;
}

export interface LeagueState {
  /** 리그 단계 = 등급 인덱스 */
  level: number;
  season: number;
  /** 다음에 치를 라운드 (0부터) */
  round: number;
  teams: LeagueTeam[];
  /** fixtures[round] = [홈 id, 원정 id][] */
  fixtures: [string, string][][];
  table: Record<string, TableRow>;
}

/** 원형 방식 라운드 로빈: n팀이면 n-1라운드, 라운드마다 n/2경기 */
export function roundRobin(ids: string[]): [string, string][][] {
  const list = [...ids];
  const n = list.length;
  const rounds: [string, string][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const matches: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i];
      const b = list[n - 1 - i];
      matches.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(matches);
    // 첫 번째는 고정, 나머지를 한 칸씩 회전
    list.splice(1, 0, list.pop()!);
  }
  return rounds;
}

function emptyRow(): TableRow {
  return { played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 };
}

/** 리그 단계 L의 AI 선수 등급: L-1, L, L+1을 섞는다 */
export function opponentTier(rng: Rng, level: number): number {
  // 마지막 리그는 위 등급이 없으니 한 단계 아래 선수를 더 섞는다 (운에만 기대는 긴 막판을 줄이려고)
  const mix = level >= TIERS.length - 1 ? LEAGUE.topLeagueTierMix : LEAGUE.opponentTierMix;
  const i = rng.weighted(mix);
  return Math.max(0, Math.min(TIERS.length - 1, level - 1 + i));
}

export function createLeague(seed: number, level: number, season: number, myName: string, myCrest: Crest): LeagueState {
  const rng = new Rng(seed);
  const used = new Set<string>([myName]);
  const teams: LeagueTeam[] = [{ id: PLAYER_TEAM_ID, name: myName, crest: myCrest }];
  for (let i = 1; i < LEAGUE.teams; i++) {
    // 리그 안에서도 팀마다 강약이 있게: 약한 팀은 한 단계 아래 선수가 많다
    const strength = i / LEAGUE.teams;
    teams.push({
      id: `ai${i}`,
      name: randomTeamName(rng, used, level),
      crest: randomCrest(rng),
      squad: generateSquad(rng, () => (rng.chance(0.25 * (1 - strength)) ? Math.max(0, level - 1) : opponentTier(rng, level))),
    });
  }
  const ids = teams.map((t) => t.id);
  // 내 팀 위치를 섞어서 매 시즌 일정이 다르게
  for (let i = ids.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const table: Record<string, TableRow> = {};
  for (const t of teams) table[t.id] = emptyRow();
  // 홈/원정 두 바퀴: 전반기 일정 + 홈·원정을 바꾼 후반기
  const first = roundRobin(ids);
  const second = first.map((r) => r.map(([h, a]) => [a, h] as [string, string]));
  return { level, season, round: 0, teams, fixtures: [...first, ...second], table };
}

export function sortedTable(league: LeagueState): { team: LeagueTeam; row: TableRow }[] {
  return league.teams
    .map((team) => ({ team, row: league.table[team.id] }))
    .sort((a, b) => b.row.points - a.row.points || b.row.gf - b.row.ga - (a.row.gf - a.row.ga) || b.row.gf - a.row.gf || a.team.name.localeCompare(b.team.name));
}

export function myRank(league: LeagueState): number {
  return sortedTable(league).findIndex((r) => r.team.id === PLAYER_TEAM_ID) + 1;
}

export function recordResult(league: LeagueState, homeId: string, awayId: string, score: [number, number]): void {
  const h = league.table[homeId];
  const a = league.table[awayId];
  h.played++;
  a.played++;
  h.gf += score[0];
  h.ga += score[1];
  a.gf += score[1];
  a.ga += score[0];
  if (score[0] > score[1]) {
    h.won++;
    a.lost++;
    h.points += 3;
  } else if (score[0] < score[1]) {
    a.won++;
    h.lost++;
    a.points += 3;
  } else {
    h.drawn++;
    a.drawn++;
    h.points++;
    a.points++;
  }
}

/** 리그가 높을수록 AI 팀도 전술이 좋아진다 (내 팀의 연구·스킬과 맞먹게) */
export function leagueMods(level: number): MatchMods {
  const v = level * 0.012;
  return { ...NO_MODS, passAcc: v, powerShot: v, counter: v, gkSave: v, stamina: v / 2, longShot: v, pressing: v, finishing: v, setPiece: v * 2 };
}

export function aiSide(team: LeagueTeam, level: number): TeamSide {
  const squad = team.squad!;
  return { name: team.name, squad, power: teamPower(squad), mods: leagueMods(level) };
}

/** 이번 라운드에서 내 경기 상대와 홈/원정 여부 */
export function myFixture(league: LeagueState): { opponent: LeagueTeam; home: boolean } | null {
  const round = league.fixtures[league.round];
  if (!round) return null;
  const m = round.find(([h, a]) => h === PLAYER_TEAM_ID || a === PLAYER_TEAM_ID)!;
  const home = m[0] === PLAYER_TEAM_ID;
  const oppId = home ? m[1] : m[0];
  return { opponent: league.teams.find((t) => t.id === oppId)!, home };
}

/** 내 경기를 제외한 이번 라운드의 다른 경기들을 빠르게 계산 */
export function playOtherMatches(league: LeagueState, seed: number): void {
  const rng = new Rng(seed);
  for (const [h, a] of league.fixtures[league.round]) {
    if (h === PLAYER_TEAM_ID || a === PLAYER_TEAM_ID) continue;
    const ht = league.teams.find((t) => t.id === h)!;
    const at = league.teams.find((t) => t.id === a)!;
    recordResult(league, h, a, quickResult(aiSide(ht, league.level), aiSide(at, league.level), rng.seed(), { tier: league.level }));
  }
}

export function seasonOver(league: LeagueState): boolean {
  return league.round >= league.fixtures.length;
}
