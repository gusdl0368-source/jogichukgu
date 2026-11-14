import { ADS, AUTO_SCOUT, ECONOMY, LEAGUE, MATCH, MAX_SCOUT_LEVEL, MEMBERSHIP, SKILLS, TIERS, TOURNAMENT, TRAINING, scoutProbabilities, scoutUpgradeCost } from '../data/balance';
import { RESEARCH, type ResearchEffect, type TreeId, researchCost, rushGemCost } from '../data/research';
import { EXTRA_SKILL_SLOT, GEM_ITEMS, GEM_PACKS, MEMBERSHIP_PRODUCT, PASS_PRODUCT, PASS_STEPS, SPONSORS, dailyDeals, passReward } from '../data/shop';
import { MAX_SKILL_LEVEL, SKILLS as SKILL_DEFS, SUMMON_RARITY_BY_LEVEL, shardsToLevel } from '../data/skills';
import { randomCrest, randomUserTeamName } from '../data/teams';
import { CAMPS, type CampId, campWinChance } from '../data/training';
import { PLAYER_TEAM_ID, aiSide, createLeague, myFixture, myRank, playOtherMatches, recordResult, seasonOver } from './league';
import { type MatchMods, type TeamSide, explain, simulateMatch } from './match';
import { compareSlot, generatePlayer, generateSquad, teamPower } from './players';
import { Rng } from './rng';
import { type GameState, type MatchSummary, type TournamentOpponent, dayKey, newDaily, nextReset } from './state';
import { type Currency, type Player, type Reward, type TeamPower } from './types';

export type AdKind = 'cash' | 'contacts' | 'gems';

export interface OfflineReport {
  seconds: number;
  matches: MatchSummary[];
}

/** 게임 규칙 전부. UI는 이 클래스의 메서드만 부른다. 시간은 항상 now(ms)를 인자로 받는다. */
export class Game {
  constructor(public state: GameState) {}

  private rng(): Rng {
    const r = new Rng(this.state.rngSeed);
    this.state.rngSeed = r.seed();
    return r;
  }

  // ───────────────────────── 보너스 ─────────────────────────

  researchEffect(effect: ResearchEffect): number {
    let v = 0;
    for (const node of RESEARCH) {
      if (node.effect === effect) v += (this.state.research.levels[node.id] ?? 0) * node.perLevel;
    }
    return v;
  }

  sponsorEffect(effect: 'stadiumCash' | 'sellPrice' | 'teamPower'): number {
    return SPONSORS.filter((s) => s.effect === effect && this.state.sponsors.includes(s.id)).reduce((a, s) => a + s.value, 0);
  }

  powerBonus(): number {
    return this.researchEffect('teamPower') + this.sponsorEffect('teamPower');
  }

  power(squad: Player[] = this.state.squad): TeamPower {
    return teamPower(squad, this.powerBonus());
  }

  mods(): MatchMods {
    const m: MatchMods = {
      passAcc: this.researchEffect('passAcc'),
      powerShot: 0,
      counter: 0,
      gkSave: this.researchEffect('gkSave'),
      stamina: this.researchEffect('stamina'),
      longShot: 0,
      pressing: this.researchEffect('pressing'),
      finishing: this.researchEffect('finishing'),
    };
    for (const id of this.state.skills.equipped) {
      const def = SKILL_DEFS.find((s) => s.id === id);
      const owned = this.state.skills.owned[id];
      if (def && owned) m[def.effect] += def.perLevel * owned.level;
    }
    return m;
  }

  mySide(): TeamSide {
    return { name: this.state.teamName, squad: this.state.squad, power: this.power(), mods: this.mods() };
  }

  isMember(now: number): boolean {
    return this.state.membershipUntil > now;
  }

  // ───────────────────────── 재화 ─────────────────────────

  add(reward: Reward): void {
    for (const [k, v] of Object.entries(reward) as [Currency, number][]) {
      this.state.wallet[k] = Math.max(0, this.state.wallet[k] + Math.round(v));
    }
  }

  canAfford(cost: Reward): boolean {
    return (Object.entries(cost) as [Currency, number][]).every(([k, v]) => this.state.wallet[k] >= v);
  }

  private spend(cost: Reward): boolean {
    if (!this.canAfford(cost)) return false;
    for (const [k, v] of Object.entries(cost) as [Currency, number][]) this.state.wallet[k] -= v;
    return true;
  }

  // ───────────────────────── 하루 초기화 ─────────────────────────

  ensureDaily(now: number): void {
    const key = dayKey(now);
    if (this.state.daily.key !== key) this.state.daily = newDaily(key);
    this.ensureTournament(now);
  }

  // ───────────────────────── 스카우트 ─────────────────────────

  probabilities(level = this.state.scoutLevel): number[] {
    return scoutProbabilities(level);
  }

  upgradeCost(): number {
    return Math.round(scoutUpgradeCost(this.state.scoutLevel) * (1 - this.researchEffect('scoutDiscount')));
  }

  upgradeScout(): boolean {
    if (this.state.scoutLevel >= MAX_SCOUT_LEVEL) return false;
    if (!this.spend({ cash: this.upgradeCost() })) return false;
    this.state.scoutLevel++;
    return true;
  }

  /** 연락처 1개로 선수 1명. 결정 전인 선수가 있으면 null */
  scout(): Player | null {
    if (this.state.pending) return null;
    if (!this.spend({ contacts: 1 })) return null;
    const rng = this.rng();
    const tier = rng.weighted(this.probabilities());
    const player = generatePlayer(rng, tier);
    this.state.pending = player;
    this.state.scoutCount++;
    return player;
  }

  pendingSlot(): number {
    return this.state.pending ? compareSlot(this.state.squad, this.state.pending.position) : -1;
  }

  isUpgrade(p: Player): boolean {
    return p.overall > this.state.squad[compareSlot(this.state.squad, p.position)].overall;
  }

  sellPrice(p: Player): number {
    const base = TIERS[p.tier].sellPrice * (0.8 + p.overall / 250);
    return Math.max(1, Math.round(base * (1 + this.researchEffect('sellPrice') + this.sponsorEffect('sellPrice'))));
  }

  /** 대기 중인 선수 영입. 밀려난 선수는 자동 판매. 반환값: 판매 수익 */
  signPending(): number {
    const p = this.state.pending;
    if (!p) return 0;
    const slot = this.pendingSlot();
    const old = this.state.squad[slot];
    this.state.squad[slot] = p;
    this.state.pending = null;
    this.state.stats.signed++;
    const price = this.sellPrice(old);
    this.add({ cash: price });
    return price;
  }

  sellPending(): number {
    const p = this.state.pending;
    if (!p) return 0;
    const price = this.sellPrice(p);
    this.add({ cash: price });
    this.state.pending = null;
    this.state.stats.sold++;
    return price;
  }

  autoScoutInterval(now: number): number {
    const speed = (this.isMember(now) ? MEMBERSHIP.autoScoutSpeedMult : 1) * (1 + this.researchEffect('autoSpeed'));
    return AUTO_SCOUT.intervalMs / speed;
  }

  /**
   * 자동 스카우트 한 번. 남길 등급이면서 지금 주전보다 좋으면 멈추고 비교 팝업을 띄운다(paused).
   * 아니면 바로 판매한다(sold).
   */
  autoStep(): { status: 'paused' | 'sold' | 'empty' | 'blocked'; player?: Player; cash?: number } {
    if (this.state.pending) return { status: 'blocked' };
    const p = this.scout();
    if (!p) return { status: 'empty' };
    if (this.state.autoScout.keepTiers[p.tier] && this.isUpgrade(p)) return { status: 'paused', player: p };
    const cash = this.sellPending();
    return { status: 'sold', player: p, cash };
  }

  // ───────────────────────── 운동장 수익 ─────────────────────────

  stadiumRates(): { cashPerSec: number; contactEverySec: number; capHours: number } {
    const lv = this.state.league.level;
    return {
      cashPerSec: ECONOMY.stadiumCashPerSec * Math.pow(ECONOMY.stadiumLeagueMult, lv) * (1 + this.researchEffect('stadiumCash') + this.sponsorEffect('stadiumCash')),
      contactEverySec: ECONOMY.stadiumContactEverySec / (1 + this.researchEffect('stadiumContacts')),
      capHours: ECONOMY.stadiumCapHours + this.researchEffect('offlineCap'),
    };
  }

  stadiumPending(now: number): { cash: number; contacts: number; seconds: number; capped: boolean } {
    const r = this.stadiumRates();
    const raw = Math.max(0, (now - this.state.stadium.lastCollect) / 1000);
    const seconds = Math.min(raw, r.capHours * 3600);
    return {
      cash: Math.floor(seconds * r.cashPerSec),
      contacts: Math.floor((seconds + this.state.stadium.contactCarrySec) / r.contactEverySec),
      seconds,
      capped: raw >= r.capHours * 3600,
    };
  }

  collectStadium(now: number): { cash: number; contacts: number } {
    const p = this.stadiumPending(now);
    this.add({ cash: p.cash, contacts: p.contacts });
    // 다음 연락처까지 지난 시간은 버리지 않고 이월한다
    const r = this.stadiumRates();
    this.state.stadium.contactCarrySec = p.capped ? 0 : (p.seconds + this.state.stadium.contactCarrySec) % r.contactEverySec;
    this.state.stadium.lastCollect = now;
    return { cash: p.cash, contacts: p.contacts };
  }

  // ───────────────────────── 광고 (가짜) ─────────────────────────

  adsLeft(kind: keyof GameState['daily']['ads']): number {
    return Math.max(0, ADS.dailyLimit - this.state.daily.ads[kind]);
  }

  watchAd(kind: AdKind | 'stadium'): Reward | null {
    if (this.adsLeft(kind) <= 0) return null;
    this.state.daily.ads[kind]++;
    const reward: Reward =
      kind === 'cash' ? { cash: ADS.cash * Math.pow(ECONOMY.stadiumLeagueMult, this.state.league.level) }
      : kind === 'stadium' ? { cash: ADS.cash * Math.pow(ECONOMY.stadiumLeagueMult, this.state.league.level) }
      : kind === 'contacts' ? { contacts: ADS.contacts }
      : { gems: ADS.gems };
    this.add(reward);
    return reward;
  }

  claimFreeGems(): boolean {
    if (this.state.daily.freeGems) return false;
    this.state.daily.freeGems = true;
    this.add({ gems: ECONOMY.dailyFreeGems });
    return true;
  }

  // ───────────────────────── 경기 / 리그 ─────────────────────────

  matchDurationMs(): number {
    return MATCH.realSeconds * 1000;
  }

  startMatch(now: number): boolean {
    if (this.state.match || this.state.champion) return false;
    if (seasonOver(this.state.league)) this.newSeason(false);
    const fx = myFixture(this.state.league);
    if (!fx) return false;
    const me = this.mySide();
    const opp = aiSide(fx.opponent);
    const seed = this.rng().seed();
    const result = fx.home ? simulateMatch(me, opp, seed) : simulateMatch(opp, me, seed);
    this.state.match = {
      round: this.state.league.round,
      opponentId: fx.opponent.id,
      home: fx.home,
      startedAt: now,
      result,
      myPower: me.power.total,
      oppPower: opp.power.total,
    };
    return true;
  }

  matchElapsed(now: number): number {
    if (!this.state.match) return 0;
    return Math.min(1, (now - this.state.match.startedAt) / this.matchDurationMs());
  }

  /** 경기 결과를 확정하고 보상, 순위, 시즌 종료를 처리한다 */
  finishMatch(): MatchSummary | null {
    const m = this.state.match;
    if (!m) return null;
    const league = this.state.league;
    const opp = league.teams.find((t) => t.id === m.opponentId)!;
    const [h, a] = m.home ? [PLAYER_TEAM_ID, opp.id] : [opp.id, PLAYER_TEAM_ID];
    recordResult(league, h, a, m.result.score);
    playOtherMatches(league, this.rng().seed());
    league.round++;

    const myScore: [number, number] = m.home ? m.result.score : [m.result.score[1], m.result.score[0]];
    const outcome = myScore[0] > myScore[1] ? 'win' : myScore[0] < myScore[1] ? 'loss' : 'draw';
    const base = outcome === 'win' ? MATCH.winCash : outcome === 'draw' ? MATCH.drawCash : MATCH.lossCash;
    const cash = Math.round(base * Math.pow(MATCH.leagueCashMult, league.level) * (1 + this.researchEffect('matchCash')));
    this.add({ cash });
    const s = this.state.stats;
    s.matches++;
    s.goals += myScore[0];
    if (outcome === 'win') {
      s.wins++;
      this.state.pass.wins++;
    } else if (outcome === 'draw') s.draws++;
    else s.losses++;

    // 원정 경기면 이유도 원정 입장에서 다시 써야 하므로, 홈 기준 이유는 홈일 때만 그대로 쓴다
    const reasons = m.home ? m.result.reasons : simulateReasonsAsAway(m, this);

    const summary: MatchSummary = { opponentName: opp.name, score: m.result.score, myScore, outcome, reasons, cash };
    this.state.match = null;
    if (seasonOver(league)) summary.seasonEnd = this.endSeason();
    if (this.state.champion) summary.champion = true;
    this.state.lastSummary = summary;
    return summary;
  }

  private endSeason(): NonNullable<MatchSummary['seasonEnd']> {
    const league = this.state.league;
    const rank = myRank(league);
    const level = league.level;
    if (rank === 1) {
      const reward = { cash: LEAGUE.promotionCash(level), gems: LEAGUE.promotionGems };
      this.add(reward);
      this.state.stats.promotions++;
      if (level >= TIERS.length - 1) {
        this.state.champion = true;
        return { rank, promoted: false, level, reward };
      }
      this.newSeason(true);
      return { rank, promoted: true, level: level + 1, reward };
    }
    this.newSeason(false);
    return { rank, promoted: false, level };
  }

  private newSeason(promote: boolean): void {
    const old = this.state.league;
    const level = Math.min(TIERS.length - 1, old.level + (promote ? 1 : 0));
    this.state.league = createLeague(this.rng().seed(), level, old.season + 1, this.state.teamName, this.state.crest);
  }

  /** 게임을 안 켠 동안 지나간 경기를 최대 maxMatches까지 즉시 처리 */
  catchUp(now: number, maxMatches = 6): OfflineReport {
    const seconds = Math.max(0, (now - this.state.lastActive) / 1000);
    const matches: MatchSummary[] = [];
    const gap = this.matchDurationMs() + 5000;
    if (this.state.match && now - this.state.match.startedAt >= this.matchDurationMs()) {
      const s = this.finishMatch();
      if (s) matches.push(s);
    }
    let t = this.state.lastActive + gap;
    while (!this.state.champion && !this.state.match && t + gap <= now && matches.length < maxMatches) {
      this.startMatch(t);
      const s = this.finishMatch();
      if (s) matches.push(s);
      t += gap;
    }
    this.state.lastActive = now;
    return { seconds, matches };
  }

  // ───────────────────────── 연구 ─────────────────────────

  researchLevel(id: string): number {
    return this.state.research.levels[id] ?? 0;
  }

  researchUnlocked(id: string): boolean {
    const node = RESEARCH.find((n) => n.id === id)!;
    return !node.requires || this.researchLevel(node.requires.id) >= node.requires.level;
  }

  treeProgress(tree: TreeId): number {
    const nodes = RESEARCH.filter((n) => n.tree === tree);
    const max = nodes.reduce((a, n) => a + n.maxLevel, 0);
    const cur = nodes.reduce((a, n) => a + this.researchLevel(n.id), 0);
    return cur / max;
  }

  startResearch(id: string, now: number): boolean {
    this.tickResearch(now);
    if (this.state.research.active) return false;
    const node = RESEARCH.find((n) => n.id === id);
    if (!node || !this.researchUnlocked(id)) return false;
    const lv = this.researchLevel(id);
    if (lv >= node.maxLevel) return false;
    const cost = researchCost(node, lv);
    if (!this.spend({ boards: cost.boards })) return false;
    this.state.research.active = { id, endsAt: now + cost.minutes * 60 * 1000 };
    return true;
  }

  /** 끝난 연구 반영. 끝났으면 노드 id 반환 */
  tickResearch(now: number): string | null {
    const a = this.state.research.active;
    if (!a || a.endsAt > now) return null;
    this.state.research.levels[a.id] = this.researchLevel(a.id) + 1;
    this.state.research.active = null;
    return a.id;
  }

  rushCost(now: number): number {
    const a = this.state.research.active;
    return a ? rushGemCost(a.endsAt - now) : 0;
  }

  rushResearch(now: number): boolean {
    const a = this.state.research.active;
    if (!a) return false;
    if (!this.spend({ gems: this.rushCost(now) })) return false;
    a.endsAt = now;
    this.tickResearch(now);
    return true;
  }

  // ───────────────────────── 스킬 ─────────────────────────

  summonLevel(): number {
    return SKILLS.summonLevelSteps.filter((n) => this.state.skills.summonCount >= n).length;
  }

  skillSlots(): number {
    return SKILLS.slots + (this.state.skills.extraSlot ? 1 : 0);
  }

  summonSkill(): string | null {
    if (!this.spend({ whistles: SKILLS.summonCost })) return null;
    const rng = this.rng();
    const rarity = rng.weighted(SUMMON_RARITY_BY_LEVEL[this.summonLevel()]);
    const def = rng.pick(SKILL_DEFS.filter((s) => s.rarity === rarity));
    const owned = this.state.skills.owned[def.id];
    if (owned) owned.shards++;
    else {
      this.state.skills.owned[def.id] = { level: 1, shards: 0 };
      if (this.state.skills.equipped.length < this.skillSlots()) this.state.skills.equipped.push(def.id);
    }
    this.state.skills.summonCount++;
    return def.id;
  }

  canUpgradeSkill(id: string): boolean {
    const o = this.state.skills.owned[id];
    return !!o && o.level < MAX_SKILL_LEVEL && o.shards >= shardsToLevel(o.level);
  }

  upgradeSkill(id: string): boolean {
    if (!this.canUpgradeSkill(id)) return false;
    const o = this.state.skills.owned[id];
    o.shards -= shardsToLevel(o.level);
    o.level++;
    return true;
  }

  upgradeAllSkills(): number {
    let n = 0;
    for (const id of Object.keys(this.state.skills.owned)) while (this.upgradeSkill(id)) n++;
    return n;
  }

  toggleEquip(id: string): boolean {
    const eq = this.state.skills.equipped;
    const i = eq.indexOf(id);
    if (i >= 0) {
      eq.splice(i, 1);
      return true;
    }
    if (!this.state.skills.owned[id] || eq.length >= this.skillSlots()) return false;
    eq.push(id);
    return true;
  }

  // ───────────────────────── 훈련 캠프 ─────────────────────────

  campEntriesLeft(id: CampId): number {
    return Math.max(0, TRAINING.dailyEntries - this.state.daily.campUsed[id]);
  }

  campAdLeft(id: CampId): number {
    return Math.max(0, TRAINING.adEntries - this.state.daily.campAd[id]);
  }

  watchCampAd(id: CampId): boolean {
    if (this.campAdLeft(id) <= 0) return false;
    this.state.daily.campAd[id]++;
    this.state.daily.campUsed[id]--;
    return true;
  }

  /** 입장권 하나 사용. 도전 가능한 난이도는 깬 단계 + 1까지 */
  enterCamp(id: CampId, difficulty: number): boolean {
    const camp = CAMPS.find((c) => c.id === id)!;
    if (difficulty < 1 || difficulty > Math.min(camp.maxDifficulty, this.state.training.cleared[id] + 1)) return false;
    if (this.campEntriesLeft(id) <= 0) return false;
    this.state.daily.campUsed[id]++;
    return true;
  }

  /** 도전 결과 반영. 성공하면 보상 지급 + 최고 단계 갱신 */
  finishCamp(id: CampId, difficulty: number, success: boolean): Reward | null {
    if (!success) return null;
    const camp = CAMPS.find((c) => c.id === id)!;
    const reward = camp.reward(difficulty);
    this.add(reward);
    this.state.training.cleared[id] = Math.max(this.state.training.cleared[id], difficulty);
    return reward;
  }

  /** 자동 캠프(풋살, 족구) 한 번에 처리 */
  playAutoCamp(id: CampId, difficulty: number): { success: boolean; chance: number; reward: Reward | null } | null {
    const camp = CAMPS.find((c) => c.id === id)!;
    if (camp.interactive || !this.enterCamp(id, difficulty)) return null;
    const chance = campWinChance(this.power().total, camp.requiredPower!(difficulty));
    const success = this.rng().chance(chance);
    return { success, chance, reward: this.finishCamp(id, difficulty, success) };
  }

  /** 소탕: 깬 최고 단계를 입장권 하나로 바로 클리어 */
  sweepCamp(id: CampId): Reward | null {
    const d = this.state.training.cleared[id];
    if (d < 1 || !this.enterCamp(id, d)) return null;
    return this.finishCamp(id, d, true);
  }

  // ───────────────────────── 대회 ─────────────────────────

  ensureTournament(now: number): void {
    const key = dayKey(now);
    const t = this.state.tournament;
    if (t.seasonKey === key) return;
    if (t.seasonKey) {
      const rank = this.tournamentRank(now, true);
      t.pendingReward = { rank, gems: TOURNAMENT.rewardByRank(rank) };
    }
    const rng = this.rng();
    const used = new Set<string>([this.state.teamName]);
    const myPower = this.power().total;
    t.seasonKey = key;
    t.stars = 0;
    t.bots = Array.from({ length: TOURNAMENT.tableSize - 1 }, () => ({
      name: randomUserTeamName(rng, used),
      crest: randomCrest(rng),
      power: Math.round(myPower * (0.8 + rng.next() * 0.45)),
      finalStars: rng.int(15, 90),
    }));
    this.refreshOpponents();
  }

  private tournamentProgress(now: number): number {
    const end = nextReset(now);
    return Math.min(1, 1 - (end - now) / (24 * 3600 * 1000));
  }

  tournamentTable(now: number, final = false): { name: string; power: number; stars: number; me: boolean }[] {
    const p = final ? 1 : this.tournamentProgress(now);
    const rows = this.state.tournament.bots.map((b) => ({ name: b.name, power: b.power, stars: Math.floor(b.finalStars * p), me: false }));
    rows.push({ name: this.state.teamName, power: Math.round(this.power().total), stars: this.state.tournament.stars, me: true });
    return rows.sort((a, b) => b.stars - a.stars || Number(b.me) - Number(a.me));
  }

  tournamentRank(now: number, final = false): number {
    return this.tournamentTable(now, final).findIndex((r) => r.me) + 1;
  }

  refreshOpponents(): void {
    const rng = this.rng();
    const used = new Set<string>([this.state.teamName, ...this.state.tournament.bots.map((b) => b.name)]);
    const myPower = this.power().total;
    const tiers = this.state.squad.map((p) => p.tier);
    const opps: TournamentOpponent[] = Array.from({ length: TOURNAMENT.opponents }, (_, i) => ({
      name: randomUserTeamName(rng, used),
      crest: randomCrest(rng),
      tiers,
      seed: rng.seed(),
      power: Math.round(myPower * (0.8 + i * 0.1 + rng.next() * 0.05)),
      stars: 0,
    }));
    opps.sort((a, b) => a.power - b.power).forEach((o, i) => (o.stars = i + 1));
    this.state.tournament.opponents = opps;
  }

  tournamentSide(o: TournamentOpponent): TeamSide {
    const rng = new Rng(o.seed);
    const squad = generateSquad(rng, (slot) => o.tiers[slot]);
    const raw = teamPower(squad).total;
    return { name: o.name, squad, power: teamPower(squad, o.power / raw - 1), mods: this.mods() };
  }

  tournamentTicketsLeft(): number {
    return this.state.daily.tournamentTickets;
  }

  watchTournamentAd(): boolean {
    if (this.state.daily.tournamentAd >= TOURNAMENT.adTickets) return false;
    this.state.daily.tournamentAd++;
    this.state.daily.tournamentTickets++;
    return true;
  }

  challenge(index: number): { summary: MatchSummary; stars: number } | null {
    const o = this.state.tournament.opponents[index];
    if (!o || this.state.daily.tournamentTickets <= 0) return null;
    this.state.daily.tournamentTickets--;
    const result = simulateMatch(this.mySide(), this.tournamentSide(o), this.rng().seed());
    const [a, b] = result.score;
    const outcome = a > b ? 'win' : a < b ? 'loss' : 'draw';
    const stars = outcome === 'win' ? o.stars : 0;
    this.state.tournament.stars += stars;
    this.refreshOpponents();
    return { summary: { opponentName: o.name, score: result.score, myScore: result.score, outcome, reasons: result.reasons, cash: 0 }, stars };
  }

  claimTournamentReward(): number {
    const r = this.state.tournament.pendingReward;
    if (!r) return 0;
    this.add({ gems: r.gems });
    this.state.tournament.pendingReward = null;
    return r.gems;
  }

  // ───────────────────────── 상점 / 결제 (가짜) ─────────────────────────

  /** 실제 결제 없이 상품 지급. productId로 무엇을 줄지 정한다 */
  purchase(productId: string, now: number): boolean {
    const gem = GEM_PACKS.find((p) => p.id === productId);
    if (gem) {
      this.add({ gems: gem.gems });
      return true;
    }
    const deals = dailyDeals(this.state.daily.deals.set, this.state.league.level);
    const di = deals.findIndex((d) => d.id === productId);
    if (di >= 0) {
      if (this.state.daily.deals.bought[di]) return false;
      this.add(deals[di].reward);
      this.state.daily.deals.bought[di] = true;
      if (this.state.daily.deals.bought.every(Boolean)) this.state.daily.deals = { set: this.state.daily.deals.set + 1, bought: [false, false, false] };
      return true;
    }
    const sponsor = SPONSORS.find((s) => s.id === productId);
    if (sponsor) {
      if (this.state.sponsors.includes(sponsor.id)) return false;
      this.state.sponsors.push(sponsor.id);
      return true;
    }
    if (productId === MEMBERSHIP_PRODUCT.id) {
      this.state.membershipUntil = Math.max(now, this.state.membershipUntil) + MEMBERSHIP.days * 24 * 3600 * 1000;
      this.add({ contacts: 150, gems: 100 });
      return true;
    }
    if (productId === PASS_PRODUCT.id) {
      if (this.state.pass.premium) return false;
      this.state.pass.premium = true;
      return true;
    }
    if (productId === EXTRA_SKILL_SLOT.id) {
      if (this.state.skills.extraSlot) return false;
      this.state.skills.extraSlot = true;
      return true;
    }
    return false;
  }

  buyGemItem(id: string): Reward | null {
    const item = GEM_ITEMS.find((g) => g.id === id);
    if (!item || !this.spend({ gems: item.gems })) return null;
    const reward = item.reward(this.state.league.level);
    this.add(reward);
    return reward;
  }

  claimMembershipDaily(now: number): boolean {
    if (!this.isMember(now) || this.state.daily.membershipClaimed) return false;
    this.state.daily.membershipClaimed = true;
    this.add({ contacts: MEMBERSHIP.dailyContacts, gems: MEMBERSHIP.dailyGems });
    return true;
  }

  // ───────────────────────── 시즌 패스 ─────────────────────────

  passUnlocked(step: number): boolean {
    return step < PASS_STEPS && this.state.pass.wins >= step + 1;
  }

  claimPass(step: number, premium: boolean): Reward | null {
    const pass = this.state.pass;
    const claimed = premium ? pass.claimedPremium : pass.claimedFree;
    if (!this.passUnlocked(step) || claimed.includes(step) || (premium && !pass.premium)) return null;
    const reward = passReward(step, premium, this.state.league.level);
    this.add(reward);
    claimed.push(step);
    return reward;
  }

  passClaimable(): number {
    let n = 0;
    for (let i = 0; i < PASS_STEPS; i++) {
      if (!this.passUnlocked(i)) break;
      if (!this.state.pass.claimedFree.includes(i)) n++;
      if (this.state.pass.premium && !this.state.pass.claimedPremium.includes(i)) n++;
    }
    return n;
  }

  // ───────────────────────── 기타 ─────────────────────────

  rename(name: string): void {
    const n = name.trim().slice(0, 14);
    if (!n) return;
    this.state.teamName = n;
    const me = this.state.league.teams.find((t) => t.id === PLAYER_TEAM_ID);
    if (me) me.name = n;
  }
}

/** 원정 경기일 때 결과 이유를 내 팀 기준으로 다시 만든다 */
function simulateReasonsAsAway(m: NonNullable<GameState['match']>, game: Game): string[] {
  const [hs, as] = m.result.stats;
  const opp = game.state.league.teams.find((t) => t.id === m.opponentId)!;
  return explain([as, hs], game.mySide(), aiSide(opp));
}
