import { describe, expect, it } from 'vitest';
import { MAX_SCOUT_LEVEL, MATCH, TIERS, scoutProbabilities } from '../src/data/balance';
import { RESEARCH } from '../src/data/research';
import { GEM_PACKS, SPONSORS } from '../src/data/shop';
import { Game } from '../src/game/game';
import { PLAYER_TEAM_ID, myRank, roundRobin, sortedTable } from '../src/game/league';
import { NO_MODS, simulateMatch } from '../src/game/match';
import { computeOverall, generatePlayer, generateSquad, teamPower } from '../src/game/players';
import { Rng } from '../src/game/rng';
import { dayKey, deserialize, newGameState, nextReset, serialize } from '../src/game/state';
import { FORMATION } from '../src/game/types';

const T0 = new Date(2026, 10, 14, 12, 0, 0).getTime();
const HOUR = 3600 * 1000;

function newGame(seed = 42): Game {
  const g = new Game(newGameState(T0, seed));
  g.ensureDaily(T0);
  return g;
}

describe('스카우트 확률', () => {
  it('모든 레벨에서 합계가 100%', () => {
    for (let lv = 1; lv <= MAX_SCOUT_LEVEL; lv++) {
      const sum = scoutProbabilities(lv).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(100, 6);
    }
  });

  it('레벨이 오르면 최하위 등급 확률은 줄고, 새 등급이 열린다', () => {
    const p1 = scoutProbabilities(1);
    const p20 = scoutProbabilities(20);
    expect(p20[0]).toBeLessThan(p1[0]);
    expect(p1[3]).toBe(0);
    expect(p20[3]).toBeGreaterThan(0);
  });

  it('최고 레벨에서는 국가대표가 나온다', () => {
    expect(scoutProbabilities(MAX_SCOUT_LEVEL)[TIERS.length - 1]).toBeGreaterThan(0);
  });
});

describe('선수 생성', () => {
  it('능력치는 1~99, 종합 능력치는 포지션 가중 평균', () => {
    const rng = new Rng(1);
    for (let i = 0; i < 300; i++) {
      const p = generatePlayer(rng, rng.int(0, TIERS.length - 1));
      for (const v of Object.values(p.stats)) {
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(99);
      }
      expect(p.overall).toBe(computeOverall(p.position, p.stats));
    }
  });

  it('등급이 높을수록 평균 종합 능력치가 높다', () => {
    const rng = new Rng(2);
    const avg = (tier: number) => {
      let s = 0;
      for (let i = 0; i < 200; i++) s += generatePlayer(rng, tier).overall;
      return s / 200;
    };
    let prev = 0;
    for (let t = 0; t < TIERS.length; t++) {
      const a = avg(t);
      expect(a).toBeGreaterThan(prev);
      prev = a;
    }
  });

  it('스쿼드는 포메이션 11자리 포지션 그대로', () => {
    const squad = generateSquad(new Rng(3), () => 1);
    expect(squad.map((p) => p.position)).toEqual(FORMATION);
  });
});

describe('팀 파워', () => {
  it('합계 = 공격 + 미드 + 수비, 보너스는 배율로 적용', () => {
    const squad = generateSquad(new Rng(4), () => 2);
    const p = teamPower(squad);
    expect(p.total).toBeCloseTo(p.atk + p.mid + p.def, 0);
    expect(teamPower(squad, 0.1).total).toBeCloseTo(p.total * 1.1, 0);
  });
});

describe('경기 시뮬레이션', () => {
  const rng = new Rng(5);
  const side = (tier: number, name: string) => {
    const squad = generateSquad(rng, () => tier);
    return { name, squad, power: teamPower(squad), mods: NO_MODS };
  };

  it('같은 시드면 같은 결과', () => {
    const a = side(2, 'A');
    const b = side(2, 'B');
    expect(simulateMatch(a, b, 99).score).toEqual(simulateMatch(a, b, 99).score);
  });

  it('점수 = 골 이벤트 수, 마지막 이벤트는 종료', () => {
    const r = simulateMatch(side(2, 'A'), side(2, 'B'), 7);
    const goals = [0, 1].map((t) => r.events.filter((e) => e.type === 'goal' && e.team === t).length);
    expect(goals).toEqual(r.score);
    expect(r.events.at(-1)!.type).toBe('fulltime');
    expect(r.reasons.length).toBeGreaterThan(0);
  });

  it('강한 팀이 더 자주 이기지만 항상 이기지는 않는다', () => {
    let wins = 0;
    let losses = 0;
    const n = 300;
    for (let i = 0; i < n; i++) {
      const r = simulateMatch(side(3, 'S'), side(2, 'W'), rng.seed());
      if (r.score[0] > r.score[1]) wins++;
      if (r.score[0] < r.score[1]) losses++;
    }
    expect(wins / n).toBeGreaterThan(0.55);
    expect(losses).toBeGreaterThan(0);
  });
});

describe('리그', () => {
  it('라운드 로빈: 모든 팀이 서로 한 번씩 만난다', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `t${i}`);
    const rounds = roundRobin(ids);
    expect(rounds).toHaveLength(9);
    const seen = new Set<string>();
    for (const round of rounds) {
      const inRound = new Set<string>();
      for (const [h, a] of round) {
        expect(inRound.has(h) || inRound.has(a)).toBe(false);
        inRound.add(h);
        inRound.add(a);
        seen.add([h, a].sort().join('-'));
      }
    }
    expect(seen.size).toBe(45);
  });

  it('시즌 18경기(홈·원정)를 치르면 다음 시즌으로 넘어가고 순위가 기록된다', () => {
    const g = newGame();
    expect(g.state.league.fixtures).toHaveLength(18);
    let summary = null;
    for (let i = 0; i < 18; i++) {
      expect(g.startMatch(T0 + i * HOUR)).toBe(true);
      summary = g.finishMatch();
    }
    expect(summary!.seasonEnd).toBeDefined();
    expect(g.state.league.season).toBe(2);
    expect(g.state.league.round).toBe(0);
    expect(g.state.stats.matches).toBe(18);
  });

  it('1위면 승격하고 보상을 받는다', () => {
    const g = newGame();
    // 내 팀을 한 단계 위 선수로 채워서 1위를 만든다
    g.state.squad = generateSquad(new Rng(6), () => 3);
    for (let i = 0; i < 18; i++) {
      g.startMatch(T0);
      g.finishMatch();
    }
    const table = sortedTable(g.state.league);
    expect(table.every((r) => r.row.played === 0)).toBe(true);
    expect(g.state.league.level).toBe(1);
    expect(g.state.stats.promotions).toBe(1);
  });

  it('국가대표 리그에서 우승하면 엔딩', () => {
    const g = newGame();
    g.state.league.level = TIERS.length - 1;
    g.state.squad = generateSquad(new Rng(7), () => TIERS.length - 1).map((p) => ({
      ...p,
      stats: { pace: 99, shooting: 99, passing: 99, dribbling: 99, defending: 99, physical: 99 },
      overall: 99,
    }));
    for (let i = 0; i < 18 && !g.state.champion; i++) {
      g.startMatch(T0);
      g.finishMatch();
    }
    expect(g.state.champion).toBe(true);
    expect(g.startMatch(T0)).toBe(false);
  });

  it('내 순위는 1~10', () => {
    const g = newGame();
    g.startMatch(T0);
    g.finishMatch();
    const r = myRank(g.state.league);
    expect(r).toBeGreaterThanOrEqual(1);
    expect(r).toBeLessThanOrEqual(10);
    expect(g.state.league.teams.some((t) => t.id === PLAYER_TEAM_ID)).toBe(true);
  });
});

describe('스카우트와 영입', () => {
  it('스카우트하면 연락처 1개를 쓰고 대기 선수가 생긴다', () => {
    const g = newGame();
    const before = g.state.wallet.contacts;
    const p = g.scout();
    expect(p).not.toBeNull();
    expect(g.state.wallet.contacts).toBe(before - 1);
    expect(g.scout()).toBeNull();
  });

  it('영입하면 주전이 바뀌고 밀려난 선수는 판매된다', () => {
    const g = newGame();
    const p = g.scout()!;
    const slot = g.pendingSlot();
    const cash = g.state.wallet.cash;
    const earned = g.signPending();
    expect(g.state.squad[slot].id).toBe(p.id);
    expect(earned).toBeGreaterThan(0);
    expect(g.state.wallet.cash).toBe(cash + earned);
  });

  it('CB처럼 자리가 두 개면 약한 쪽과 비교한다', () => {
    const g = newGame();
    g.state.squad[2] = { ...g.state.squad[2], overall: 10 };
    g.state.squad[3] = { ...g.state.squad[3], overall: 40 };
    g.state.pending = generatePlayer(new Rng(8), 1, 'CB');
    expect(g.pendingSlot()).toBe(2);
  });

  it('연락처가 없으면 스카우트 불가', () => {
    const g = newGame();
    g.state.wallet.contacts = 0;
    expect(g.scout()).toBeNull();
    expect(g.autoStep().status).toBe('empty');
  });

  it('자동 스카우트: 남길 등급이 아니면 바로 판매', () => {
    const g = newGame();
    g.state.autoScout.keepTiers = TIERS.map(() => false);
    const r = g.autoStep();
    expect(r.status).toBe('sold');
    expect(g.state.pending).toBeNull();
  });

  it('자동 스카우트: 남길 등급이면서 업그레이드면 멈춘다', () => {
    const g = newGame();
    g.state.squad = g.state.squad.map((p) => ({ ...p, overall: 1 }));
    g.state.autoScout.keepTiers = TIERS.map(() => true);
    expect(g.autoStep().status).toBe('paused');
    expect(g.state.pending).not.toBeNull();
  });

  it('스카우트 레벨업은 회비를 쓴다', () => {
    const g = newGame();
    g.state.wallet.cash = 1e9;
    const cost = g.upgradeCost();
    expect(g.upgradeScout()).toBe(true);
    expect(g.state.scoutLevel).toBe(2);
    expect(g.state.wallet.cash).toBe(1e9 - cost);
    g.state.wallet.cash = 0;
    expect(g.upgradeScout()).toBe(false);
  });
});

describe('운동장 수익', () => {
  it('시간에 비례해 쌓이고 상한에서 멈춘다', () => {
    const g = newGame();
    const r = g.stadiumRates();
    const p1 = g.stadiumPending(T0 + 100 * 1000);
    expect(p1.cash).toBe(Math.floor(100 * r.cashPerSec));
    expect(p1.contacts).toBe(1);
    const far = g.stadiumPending(T0 + 100 * HOUR);
    expect(far.capped).toBe(true);
    expect(far.cash).toBe(Math.floor(r.capHours * 3600 * r.cashPerSec));
  });

  it('수령하면 지갑에 들어가고 다시 0부터 쌓인다', () => {
    const g = newGame();
    const cash = g.state.wallet.cash;
    const got = g.collectStadium(T0 + 200 * 1000);
    expect(g.state.wallet.cash).toBe(cash + got.cash);
    expect(g.stadiumPending(T0 + 200 * 1000).cash).toBe(0);
  });

  it('연락처 자투리 시간은 이월된다 (60초씩 세 번 = 180초 = 2개)', () => {
    const g = newGame();
    const before = g.state.wallet.contacts;
    for (let i = 1; i <= 3; i++) g.collectStadium(T0 + i * 60 * 1000);
    expect(g.state.wallet.contacts).toBe(before + 2);
  });
});

describe('하루 초기화', () => {
  it('03:00 기준으로 날짜가 바뀐다', () => {
    const before = new Date(2026, 10, 14, 2, 59).getTime();
    const after = new Date(2026, 10, 14, 3, 1).getTime();
    expect(dayKey(before)).not.toBe(dayKey(after));
    expect(nextReset(before)).toBe(new Date(2026, 10, 14, 3, 0).getTime());
  });

  it('광고 보상은 하루 3번, 다음 날 다시 채워진다', () => {
    const g = newGame();
    for (let i = 0; i < 3; i++) expect(g.watchAd('gems')).not.toBeNull();
    expect(g.watchAd('gems')).toBeNull();
    g.ensureDaily(T0 + 24 * HOUR);
    expect(g.watchAd('gems')).not.toBeNull();
  });
});

describe('저장', () => {
  it('직렬화 후 복원하면 같은 상태', () => {
    const g = newGame();
    g.scout();
    const restored = deserialize(serialize(g.state));
    expect(restored).toEqual(g.state);
  });

  it('깨진 데이터는 null', () => {
    expect(deserialize('{bad')).toBeNull();
    expect(deserialize(JSON.stringify({ version: 999 }))).toBeNull();
  });
});

describe('오프라인 진행', () => {
  it('끝난 경기와 지나간 경기를 최대 6경기까지 처리', () => {
    const g = newGame();
    g.startMatch(T0);
    const report = g.catchUp(T0 + 10 * HOUR);
    expect(report.matches.length).toBe(6);
    expect(g.state.lastActive).toBe(T0 + 10 * HOUR);
  });

  it('진행 중인 경기는 끝나기 전이면 그대로 둔다', () => {
    const g = newGame();
    g.startMatch(T0);
    g.state.lastActive = T0;
    const report = g.catchUp(T0 + (MATCH.realSeconds / 2) * 1000);
    expect(report.matches.length).toBe(0);
    expect(g.state.match).not.toBeNull();
  });
});

describe('연구', () => {
  it('작전판을 쓰고, 시간이 지나야 레벨이 오른다. 동시에 하나만', () => {
    const g = newGame();
    g.state.wallet.boards = 10000;
    expect(g.startResearch('c_pass', T0)).toBe(true);
    expect(g.startResearch('k_snack', T0)).toBe(false);
    expect(g.researchLevel('c_pass')).toBe(0);
    expect(g.tickResearch(T0 + HOUR)).toBe('c_pass');
    expect(g.researchLevel('c_pass')).toBe(1);
    expect(g.mods().passAcc).toBeCloseTo(0.01);
  });

  it('선행 노드가 부족하면 시작할 수 없다', () => {
    const g = newGame();
    g.state.wallet.boards = 10000;
    expect(g.researchUnlocked('c_press')).toBe(false);
    expect(g.startResearch('c_press', T0)).toBe(false);
  });

  it('젬으로 즉시 완료', () => {
    const g = newGame();
    g.state.wallet.boards = 10000;
    g.state.wallet.gems = 1000;
    g.startResearch('k_snack', T0);
    expect(g.rushResearch(T0)).toBe(true);
    expect(g.researchLevel('k_snack')).toBe(1);
  });

  it('모든 연구 노드의 선행 조건은 같은 트리 안에 있다', () => {
    for (const n of RESEARCH) {
      if (!n.requires) continue;
      const req = RESEARCH.find((r) => r.id === n.requires!.id)!;
      expect(req.tree).toBe(n.tree);
    }
  });
});

describe('스킬', () => {
  it('소환하면 호루라기를 쓰고 스킬을 얻고 자동 장착', () => {
    const g = newGame();
    g.state.wallet.whistles = 200;
    const id = g.summonSkill();
    expect(id).not.toBeNull();
    expect(g.state.skills.equipped).toContain(id);
    expect(g.summonSkill()).toBeNull();
  });

  it('중복 조각으로 레벨업', () => {
    const g = newGame();
    g.state.skills.owned.cannon = { level: 1, shards: 1 };
    expect(g.upgradeSkill('cannon')).toBe(true);
    expect(g.state.skills.owned.cannon).toEqual({ level: 2, shards: 0 });
    expect(g.upgradeSkill('cannon')).toBe(false);
  });

  it('슬롯 수를 넘게 장착할 수 없다', () => {
    const g = newGame();
    for (const id of ['cannon', 'knife', 'lightning', 'spider']) g.state.skills.owned[id] = { level: 1, shards: 0 };
    expect(g.toggleEquip('cannon')).toBe(true);
    expect(g.toggleEquip('knife')).toBe(true);
    expect(g.toggleEquip('lightning')).toBe(true);
    expect(g.toggleEquip('spider')).toBe(false);
    g.purchase('skill_slot', T0);
    expect(g.toggleEquip('spider')).toBe(true);
  });
});

describe('훈련 캠프', () => {
  it('하루 입장 2회 + 광고 1회', () => {
    const g = newGame();
    expect(g.enterCamp('penalty', 1)).toBe(true);
    expect(g.enterCamp('penalty', 1)).toBe(true);
    expect(g.enterCamp('penalty', 1)).toBe(false);
    expect(g.watchCampAd('penalty')).toBe(true);
    expect(g.enterCamp('penalty', 1)).toBe(true);
    expect(g.watchCampAd('penalty')).toBe(false);
  });

  it('깬 단계 + 1까지만 도전 가능, 성공하면 보상과 기록', () => {
    const g = newGame();
    expect(g.enterCamp('penalty', 2)).toBe(false);
    expect(g.enterCamp('penalty', 1)).toBe(true);
    const reward = g.finishCamp('penalty', 1, true);
    expect(reward!.whistles).toBeGreaterThan(0);
    expect(g.state.training.cleared.penalty).toBe(1);
  });

  it('소탕은 깬 최고 단계 보상을 바로 준다', () => {
    const g = newGame();
    expect(g.sweepCamp('jokgu')).toBeNull();
    g.state.training.cleared.jokgu = 3;
    const r = g.sweepCamp('jokgu');
    expect(r!.boards).toBeGreaterThan(0);
  });

  it('자동 캠프는 결과를 바로 낸다', () => {
    const g = newGame();
    const r = g.playAutoCamp('futsal', 1);
    expect(r).not.toBeNull();
    expect(r!.chance).toBeGreaterThan(0);
    expect(g.playAutoCamp('penalty', 1)).toBeNull();
  });
});

describe('대회', () => {
  it('상대 5팀, 강할수록 별이 많다', () => {
    const g = newGame();
    const opps = g.state.tournament.opponents;
    expect(opps).toHaveLength(5);
    const sorted = [...opps].sort((a, b) => a.power - b.power);
    expect(sorted.map((o) => o.stars)).toEqual([1, 2, 3, 4, 5]);
  });

  it('도전하면 티켓 1장을 쓰고 상대가 바뀐다', () => {
    const g = newGame();
    const before = g.tournamentTicketsLeft();
    const oldNames = g.state.tournament.opponents.map((o) => o.name).join();
    const r = g.challenge(0);
    expect(r).not.toBeNull();
    expect(g.tournamentTicketsLeft()).toBe(before - 1);
    expect(g.state.tournament.opponents.map((o) => o.name).join()).not.toBe(oldNames);
  });

  it('하루가 지나면 시즌 보상이 생기고 별이 초기화된다', () => {
    const g = newGame();
    g.state.tournament.stars = 999;
    g.ensureDaily(T0 + 24 * HOUR);
    expect(g.state.tournament.pendingReward!.rank).toBe(1);
    expect(g.state.tournament.stars).toBe(0);
    expect(g.claimTournamentReward()).toBeGreaterThan(0);
  });
});

describe('상점과 패스', () => {
  it('젬 팩 구매(가짜 결제)', () => {
    const g = newGame();
    const gems = g.state.wallet.gems;
    expect(g.purchase(GEM_PACKS[0].id, T0)).toBe(true);
    expect(g.state.wallet.gems).toBe(gems + GEM_PACKS[0].gems);
  });

  it('스폰서는 한 번만, 효과가 적용된다', () => {
    const g = newGame();
    const before = g.power().total;
    const realty = SPONSORS.find((s) => s.effect === 'teamPower')!;
    expect(g.purchase(realty.id, T0)).toBe(true);
    expect(g.purchase(realty.id, T0)).toBe(false);
    expect(g.power().total).toBeGreaterThan(before);
  });

  it('일일 특가 3개를 다 사면 다음 세트', () => {
    const g = newGame();
    for (let i = 0; i < 3; i++) expect(g.purchase(`deal_0_${i}`, T0)).toBe(true);
    expect(g.state.daily.deals.set).toBe(1);
  });

  it('정회원은 자동 스카우트가 2배 빠르고 매일 보상', () => {
    const g = newGame();
    const slow = g.autoScoutInterval(T0);
    g.purchase('membership', T0);
    expect(g.autoScoutInterval(T0)).toBeCloseTo(slow / 2);
    expect(g.claimMembershipDaily(T0)).toBe(true);
    expect(g.claimMembershipDaily(T0)).toBe(false);
  });

  it('패스: 승리 수만큼 열리고 프리미엄은 구매 후에만', () => {
    const g = newGame();
    expect(g.claimPass(0, false)).toBeNull();
    g.state.pass.wins = 2;
    expect(g.claimPass(0, false)).not.toBeNull();
    expect(g.claimPass(0, false)).toBeNull();
    expect(g.claimPass(0, true)).toBeNull();
    g.purchase('pass_premium', T0);
    expect(g.claimPass(0, true)).not.toBeNull();
    expect(g.passClaimable()).toBe(2);
  });
});

describe('밸런스 안전장치', () => {
  it('캠프 난이도는 리그 단계에 묶인다', () => {
    const g = newGame();
    g.state.training.cleared.penalty = 20;
    expect(g.campMaxPlayable('penalty')).toBe(3);
    g.state.league.level = 4;
    expect(g.campMaxPlayable('penalty')).toBe(15);
  });

  it('AI 팀은 리그가 높을수록 전술 보정을 받는다', async () => {
    const { leagueMods } = await import('../src/game/league');
    expect(leagueMods(0).passAcc).toBe(0);
    expect(leagueMods(8).passAcc).toBeGreaterThan(leagueMods(2).passAcc);
  });
});
