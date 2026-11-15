// 밸런스 시뮬레이터: 무과금 유저가 하루 몇 번 접속해서 플레이하면 며칠 만에 어디까지 가는지 본다.
// 사용법: npm run sim -- [일수] [하루 접속 횟수] [접속당 분] [시드]
// 환경변수: SIM_NO_ADS=1 광고 안 봄, SIM_PASS=1 시즌 패스 구매, SIM_MEMBER=1 정회원 매주 구매

import { TIERS } from '../src/data/balance';
import { DAILY_MISSIONS } from '../src/data/missions';
import { MEMBERSHIP_PRODUCT, PASS_PRODUCT, PASS_STEPS } from '../src/data/shop';
import { CAMPS } from '../src/data/training';
import { Game } from '../src/game/game';
import { myRank } from '../src/game/league';
import { newGameState } from '../src/game/state';

const DAYS = Number(process.argv[2] ?? 40);
const SESSIONS = Number(process.argv[3] ?? 4);
const SESSION_MIN = Number(process.argv[4] ?? 15);
const SEED = Number(process.argv[5] ?? 1);

const START = new Date(2026, 0, 1, 7, 0, 0).getTime();
const MIN = 60 * 1000;

const g = new Game(newGameState(START, SEED));
const income: Record<string, number> = {};
const contactsIn: Record<string, number> = {};
function track(src: string, fn: () => void): void {
  const before = g.state.wallet.cash;
  const beforeC = g.state.wallet.contacts;
  fn();
  income[src] = (income[src] ?? 0) + g.state.wallet.cash - before;
  contactsIn[src] = (contactsIn[src] ?? 0) + g.state.wallet.contacts - beforeC;
}
g.state.seenTutorial = true;
const ADS = !process.env.SIM_NO_ADS;
const PASS = !!process.env.SIM_PASS;
const MEMBER = !!process.env.SIM_MEMBER;
let paid = 0;
let playedMin = 0;
if (PASS) {
  g.purchase(PASS_PRODUCT.id, START);
  paid += PASS_PRODUCT.price;
}

function scoutAll(): void {
  // 자동 스카우트처럼: 좋으면 영입, 아니면 방출
  for (;;) {
    const p = g.scout();
    if (!p) break;
    track('판매', () => (g.isUpgrade(p) ? g.signPending() : g.sellPending()));
  }
}

function spend(now: number): void {
  track('보상(가이드·미션·패스·젬)', () => rewards());
  while (g.upgradeScout()) {
    // 회비가 되는 만큼 스카우트 레벨업
  }
  scoutAll();
  while (g.upgradeScout()) {
    // 판매 수익으로 한 번 더
  }
  // 연구: 열린 노드 중 가장 싼 것
  if (!g.state.research.active) {
    const nodes = ['k_snack', 's_sell', 'c_pass', 'k_parking', 's_auto', 'c_press', 'k_fans', 's_contacts', 'c_finish', 'c_gk', 'k_unity', 's_discount', 'c_stamina'];
    for (const id of nodes) if (g.startResearch(id, now)) break;
  }
  while (g.summonSkill()) {
    // 호루라기 다 쓰기
  }
  g.upgradeAllSkills();
  // 남는 회비: 경기장 증축(수입의 기반) → 선수 훈련(싼 것부터)
  while (!process.env.SIM_NO_STADIUM && g.state.wallet.cash > g.stadiumUpgradeCost() * 1.5 && g.upgradeStadium(now)) {
    // 여유 있을 때만 증축
  }
  for (; !process.env.SIM_NO_TRAIN; ) {
    let best = -1;
    for (let slot = 0; slot < 11; slot++) {
      if ((g.state.squad[slot].train ?? 0) >= 10) continue;
      if (best < 0 || g.trainCost(slot) < g.trainCost(best)) best = slot;
    }
    if (best < 0 || g.trainCost(best) > g.state.wallet.cash * 0.5 || !g.trainPlayer(best)) break;
  }
  while (!process.env.SIM_NO_DEX && g.claimCollection()) {
    // 도감 보상
  }
  // 그래도 남는 회비: 스카우트 출장비로 연락처 (넉넉할 때만)
  let bought = false;
  while (!process.env.SIM_NO_FUND && g.travelFundLeft() > 0 && g.state.wallet.cash > g.travelFundCost() * 3 && g.buyTravelFund()) bought = true;
  if (bought) scoutAll();
}

function rewards(): void {
  // 가이드와 일일 미션 보상
  while (g.claimGuide()) {
    // 연속으로 깬 가이드 모두 받기
  }
  for (const m of DAILY_MISSIONS) g.claimMission(m.id);
  g.claimMissionBonus();
  // 시즌 패스 보상 (무료 트랙은 누구나, 프리미엄은 샀을 때)
  for (let i = 0; i < PASS_STEPS; i++) {
    g.claimPass(i, false);
    g.claimPass(i, true);
  }
  // 젬은 연락처로 바꾼다 (실제 유저도 병목인 스카우트에 쓴다)
  while (g.buyGemItem('g_contacts')) {
    // 젬 50 → 연락처 300
  }
}

function daily(t: number): void {
  g.claimFreeGems();
  if (MEMBER && !g.isMember(t)) {
    g.purchase(MEMBERSHIP_PRODUCT.id, t);
    paid += MEMBERSHIP_PRODUCT.price;
  }
  g.claimMembershipDaily(t);
  if (!process.env.SIM_NO_DAILYBM) {
    g.claimAttendance(t);
    g.spinWheel('free');
    while (ADS && g.spinWheel('ad')) {}
  }
  if (ADS) {
    for (const kind of ['cash', 'contacts', 'gems'] as const) while (g.watchAd(kind)) {}
    while (g.watchAd('stadium')) {}
  }
  for (const c of CAMPS) {
    if (ADS) g.watchCampAd(c.id);
    while (g.campEntriesLeft(c.id) > 0) {
      const next = g.campMaxPlayable(c.id);
      if (c.interactive) {
        // 승부차기는 사람이 차므로 60% 확률로 성공한다고 가정
        if (!g.enterCamp(c.id, next)) break;
        g.finishCamp(c.id, next, Math.random() < 0.6);
      } else {
        const r = g.playAutoCamp(c.id, next);
        if (!r) break;
      }
    }
  }
  while (g.tournamentTicketsLeft() > 0 || (ADS && g.watchTournamentAd())) {
    if (!g.challenge(4)) break;
  }
  g.claimTournamentReward();
}

let t = START;
let lastDay = '';
const log: string[] = [];
let champDay = -1;

for (let day = 0; day < DAYS && champDay < 0; day++) {
  for (let s = 0; s < SESSIONS; s++) {
    const sessionStart = START + day * 24 * 60 * MIN + (s * 16 * 60 * MIN) / SESSIONS;
    t = sessionStart;
    g.ensureDaily(t);
    g.tickResearch(t);
    track('오프라인 경기', () => g.catchUp(t));
    track('운동장', () => {
      const got = g.collectStadium(t);
      // 오프라인 보상 2배 광고
      if (ADS) g.doubleOffline(got);
    });
    // 접속할 때마다 행운 스카우트 광고 (하루 3번)
    if (ADS) g.watchLuckyScout(t);
    if (g.state.daily.key !== lastDay) {
      lastDay = g.state.daily.key;
      track('일일(광고/캠프/대회)', () => daily(t));
    }
    // 접속 중에는 경기가 계속 이어진다 (경기 75초 + 휴식 6초)
    const end = sessionStart + SESSION_MIN * MIN;
    while (t < end && !g.state.champion) {
      spend(t);
      g.startMatch(t);
      t += g.matchDurationMs() + 6000;
      track('경기', () => g.finishMatch());
      track('운동장', () => g.collectStadium(t));
      g.tickResearch(t);
    }
    spend(t);
    playedMin += (t - sessionStart) / MIN;
    g.state.lastActive = t;
    if (g.state.champion && champDay < 0) champDay = day + 1;
  }
  const s = g.state;
  log.push(
    `D${String(day + 1).padStart(2)} | ${TIERS[s.league.level].short.padEnd(4)} S${String(s.league.season).padStart(3)} ${String(myRank(s.league)).padStart(2)}위 | ⚡${g.power().total.toFixed(0).padStart(5)} | 스카우트Lv${String(s.scoutLevel).padStart(2)} | 💵${Math.round(s.wallet.cash).toString().padStart(9)} | 📞${String(s.wallet.contacts).padStart(5)} | 등급 ${s.squad.map((p) => p.tier).join('')} | 승격 ${s.stats.promotions}`,
  );
}

console.log(`시뮬레이션: 하루 ${SESSIONS}번 × ${SESSION_MIN}분 접속 · 광고 ${ADS ? '봄' : '안 봄'} · 패스 ${PASS ? '구매' : 'X'} · 정회원 ${MEMBER ? '매주' : 'X'}`);
console.log(log.join('\n'));
console.log(champDay > 0 ? `\n🏆 ${champDay}일째 슈퍼스타 리그 우승 (엔딩)` : `\n${DAYS}일 안에 엔딩 미도달`);
console.log('연락처 출처', Object.fromEntries(Object.entries(contactsIn).filter(([k]) => k !== '판매').map(([k, v]) => [k, Math.round(v)])));
console.log('회비 출처', Object.fromEntries(Object.entries(income).map(([k, v]) => [k, Math.round(v)])));
console.log(`경기 ${g.state.stats.matches} · 스카우트 ${g.state.scoutCount}명`);
console.log(`총 플레이 ${Math.round(playedMin / 60)}시간 · 결제 ₩${paid.toLocaleString('ko-KR')}`);
