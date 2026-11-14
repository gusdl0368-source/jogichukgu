import { ADS, LUCKY_SCOUT, MAX_SCOUT_LEVEL, MEMBERSHIP, TIERS, incomeMult } from '../../data/balance';
import { PLAYER_TEAM_ID, myFixture, myRank, sortedTable } from '../../game/league';
import type { MatchEvent } from '../../game/match';
import type { MatchSummary } from '../../game/state';
import { FORMATION, type Player } from '../../game/types';
import { RIVAL_LINES, pickLine, rivalManager } from '../../data/rival';
import type { ActionHandler, App } from '../app';
import { playerCard, playerInfo, shortName, statBlock, summaryStats } from '../cards';
import { crestHtml, duration, esc, fmt, pct, tierBadge } from '../dom';
import { confetti } from '../effects';
import { duckMusic, setCrowd, sfx } from '../sound';
import { openOffer, renderQuickBar, renderStadiumUpgrade, renderTraining } from '../bm';
import { openEnding, openMissions, openPass, openMembership, openSeasonEnd } from '../shared';
import { STYLES, type TacticStyle } from '../../game/match';
import { drawFullTime } from '../pitch';
import { eventTimes } from '../broadcast';
import { pxIcon } from '../icons';
import { pixelize } from '../pixelEmoji';
import { rewardText } from '../dom';

// ───────── 화면 밖 상태 ─────────

const ui = {
  nextMatchAt: 0,
  banner: null as null | { summary: MatchSummary; until: number },
  shownGoals: 0,
  flashUntil: 0,
  autoRunning: false,
  autoTimer: 0 as number | ReturnType<typeof setTimeout>,
  cmpFull: false,
  autoLog: [] as string[],
};

const BREAK_MS = 6000;

/** 경기 시작/종료 처리. 어느 탭에 있든 tick마다 불린다. */
export function lifecycle(app: App, now: number): void {
  const g = app.game;
  if (g.state.champion) return;
  if (!g.state.match) {
    if (now < ui.nextMatchAt) return;
    if (g.startMatch(now)) {
      ui.shownGoals = 0;
      ui.banner = null;
      if (g.isRivalMatch() && app.tab === 'match') {
        const rv = g.rival()!;
        app.toast(`🔥 라이벌전! ${rivalManager(rv.id, g.state.league.season)}: “${pickLine(RIVAL_LINES.before, g.state.league.round)}”`);
      }
      if (app.tab === 'match') sfx('whistle');
      if (app.tab === 'match') app.refresh();
    }
    return;
  }
  if (g.matchElapsed(now) < 1) return;
  const summary = g.finishMatch();
  if (!summary) return;
  ui.banner = { summary, until: now + BREAK_MS };
  ui.nextMatchAt = now + BREAK_MS;
  app.save();
  if (app.tab === 'match') {
    app.refresh();
    sfx(summary.outcome === 'win' ? 'win' : summary.outcome === 'loss' ? 'lose' : 'tap');
  }
  if (summary.champion) {
    sfx('fanfare');
    confetti(app.root, 220);
    openEnding(app);
  } else if (summary.seasonEnd) {
    if (summary.seasonEnd.promoted) {
      sfx('fanfare');
      confetti(app.root);
    }
    openSeasonEnd(app, summary);
  } else if (app.state.stats.matches === 3 && !app.topModal()) {
    // 첫 경기 몇 판을 본 뒤에야 창단 패키지를 소개한다 (처음부터 결제창을 띄우지 않게)
    setTimeout(() => { if (!app.topModal()) openOffer(app); }, 1600);
  }
}

function liveEvents(app: App, now: number): MatchEvent[] {
  const m = app.state.match;
  if (!m) return [];
  const dur = app.game.matchDurationMs();
  const elapsed = now - m.startedAt;
  const times = eventTimes(m.result.events, dur);
  // 화면 속 장면과 같은 시각에 해설·점수가 바뀌도록 같은 시간표를 쓴다
  return m.result.events.filter((_, i) => times[i] <= elapsed);
}

function liveScore(app: App, events: MatchEvent[]): [number, number] {
  const m = app.state.match!;
  const meTeam = m.home ? 0 : 1;
  let me = 0;
  let opp = 0;
  for (const e of events) if (e.type === 'goal') (e.team === meTeam ? me++ : opp++);
  return [me, opp];
}

// ───────── 렌더 ─────────

export function render(app: App): string {
  const g = app.game;
  const s = app.state;
  const now = app.now();
  const power = g.power();
  const fx = myFixture(s.league);
  const opp = s.match ? s.league.teams.find((t) => t.id === s.match!.opponentId)! : fx?.opponent;
  const oppPower = s.match ? s.match.oppPower : opp?.squad ? g.power(opp.squad).total / (1 + g.powerBonus()) : 0;
  const stadium = g.stadiumPending(now);
  const rank = s.league.round > 0 ? `${myRank(s.league)}위` : '순위';
  const rows = [
    [8, 9, 10],
    [5, 7, 6],
    [1, 2, 3, 4],
    [0],
  ];
  return `
  <div style="padding-top:6px;background:var(--bg)">
    ${renderGuide(app)}
    <div class="scoreboard">
      <div class="side me">${crestHtml(s.crest, 28)}<div style="min-width:0"><div class="name">${esc(s.teamName)}</div><div class="pw">⚡${power.total}</div></div></div>
      <div class="score" id="score">0 - 0</div>
      <div class="side opp">${opp ? crestHtml(opp.crest, 28) : ''}<div style="min-width:0"><div class="name">${opp && opp.id === app.game.rival()?.id ? '🔥' : ''}${esc(opp?.name ?? '-')}</div><div class="pw">⚡${Math.round(oppPower * 10) / 10}</div></div></div>
    </div>
    <div class="venue">${app.game.isRivalMatch() && !s.champion ? '<span class="rival-tag">🔥 라이벌전</span> ' : ''}${TIERS[s.league.level].icon} ${TIERS[s.league.level].name} · ${TIERS[s.league.level].venue} · <button class="venue-style" data-act="style-cycle">${STYLES[s.style].icon} ${STYLES[s.style].name}</button></div>
    <div class="pitch-wrap" id="pitch-wrap">
      <div id="pitch-slot"></div>
      <div class="clock" id="clock">00'</div>
      <div class="commentary" id="commentary">${s.champion ? '🏆 슈퍼스타 리그 우승! 동네에서 세계 정상까지' : '다음 경기를 준비 중…'}</div>
      ${renderBanner(now)}
    </div>
    <div class="linestats">
      <div>공격<b>${power.atk}</b></div>
      <div>미드<b>${power.mid}</b></div>
      <div>수비<b>${power.def}</b></div>
      <div class="total">팀 파워<b>${power.total}</b></div>
    </div>
    ${renderQuickBar(app)}
  </div>
  <div class="board" style="position:relative">
    <div class="formation">
      ${rows.map((r) => `<div class="row">${r.map((slot) => playerCard(s.squad[slot], { act: 'player', arg: String(slot) })).join('')}</div>`).join('')}
    </div>
  </div>
  <div class="actions" style="grid-template-columns:52px 52px 1fr 84px 52px">
    <button class="sq-btn" data-act="league"><span class="ico">${TIERS[s.league.level].icon}</span>${rank}</button>
    <button class="sq-btn" data-act="stadium" id="stadium-btn"><span class="ico">🏟️</span><span id="stadium-cash">${fmt(stadium.cash)}</span>${stadium.capped ? '<span class="dot"></span>' : ''}</button>
    <button class="scout-btn" data-act="scout" ${s.wallet.contacts <= 0 ? 'disabled' : ''}><span class="ico">${pxIcon('scout', 26)}</span><span class="cnt">${pxIcon('contacts', 13)} ${fmt(s.wallet.contacts)}</span></button>
    <button class="sq-btn" data-act="probs">${(s.luckyUntil ?? 0) > now || g.isMember(now) ? '<span class="buff">🍀</span>' : ''}스카우트<br><b style="font-size:15px">Lv.${s.scoutLevel}</b>${s.wallet.cash >= g.upgradeCost() && s.scoutLevel < MAX_SCOUT_LEVEL ? '<span class="dot"></span>' : ''}</button>
    <button class="sq-btn ${ui.autoRunning ? 'on' : ''}" data-act="auto"><span class="ico">🔁</span>${ui.autoRunning ? '자동 ON' : '자동'}</button>
  </div>`;
}

function renderGuide(app: App): string {
  const q = app.game.guide();
  if (!q) return '';
  return `<button class="guide ${q.done ? 'done' : ''}" data-act="guide">
    <span class="g-ico">${q.done ? '🎁' : '🎯'}</span>
    <span class="g-body"><b>${esc(q.name)}</b> <span class="g-prog">${fmt(q.cur)}/${fmt(q.target)}</span><br><span class="g-hint">${q.done ? '눌러서 보상 받기' : esc(q.hint)}</span></span>
    <span class="g-rew">${rewardText(q.reward)}</span>
  </button>`;
}

function renderBanner(now: number): string {
  const b = ui.banner;
  if (!b || now > b.until) return '';
  const s = b.summary;
  const label = s.outcome === 'win' ? '승리!' : s.outcome === 'draw' ? '무승부' : '패배';
  const color = s.outcome === 'win' ? '#7dff9b' : s.outcome === 'draw' ? '#ffe08a' : '#ff9b9b';
  return `<div class="result-banner" id="banner">
    <canvas id="ft-scene" width="400" height="120"></canvas>
    <div class="ft-title">FULL-TIME</div>
    <div class="big" style="color:${color}">${s.myScore[0]} - ${s.myScore[1]} ${label} <span class="ft-cash">💵 +${fmt(s.cash)}</span></div>
    <div class="muted" style="color:#cfd6e4">vs ${esc(s.opponentName)}${s.rival?.bonusCash ? ` · <span class="rival-bonus">🔥 보너스 💵+${fmt(s.rival.bonusCash)} 💎+${s.rival.bonusGems}</span>` : ''}</div>
    ${s.scorers?.length ? `<div class="ft-scorers">⚽ ${scorerLine(s.scorers)}</div>` : ''}
    ${s.rival ? `<div class="rival-quote">${esc(s.rival.manager)}: “${esc(s.rival.line)}”</div>` : ''}
    <ul>${s.reasons.slice(0, s.rival ? 0 : s.scorers?.length ? 2 : 3).map((r) => `<li>• ${esc(r)}</li>`).join('')}</ul>
  </div>`;
}

/** ['김', '이', '김'] → '김 2 · 이' */
function scorerLine(names: string[]): string {
  const count = new Map<string, number>();
  for (const n of names) count.set(n, (count.get(n) ?? 0) + 1);
  return [...count].map(([n, c]) => `${esc(n)}${c > 1 ? ` ${c}` : ''}`).join(' · ');
}

export function mounted(app: App): void {
  const slot = app.root.querySelector('#pitch-slot');
  if (slot) slot.replaceWith(app.pitch.canvas);
  tick(app, app.now());
}

export function tick(app: App, now: number): void {
  const s = app.state;
  const m = s.match;
  // 경기 중일 때만 관중 함성
  setCrowd(m ? Math.max(0.15, TIERS[s.league.level].crowd) : 0, Math.min(1, app.pitch.excitement() + (m && app.game.isRivalMatch() ? 0.2 : 0)));
  // 경기 중에는 함성이 들리게 음악을 줄인다
  duckMusic(m ? 0.4 : 1);
  const clock = app.root.querySelector('#clock');
  const score = app.root.querySelector('#score');
  const comm = app.root.querySelector('#commentary');
  const banner = app.root.querySelector('#banner');
  if (banner && ui.banner && now > ui.banner.until) banner.remove();
  const stadiumCash = app.root.querySelector('#stadium-cash');
  if (stadiumCash) stadiumCash.textContent = fmt(app.game.stadiumPending(now).cash);
  if (!m) {
    if (clock) clock.textContent = ui.banner ? '경기 종료' : `다음 경기 ${Math.max(0, Math.ceil((ui.nextMatchAt - now) / 1000))}초`;
    return;
  }
  const events = liveEvents(app, now);
  const [me, opp] = liveScore(app, events);
  if (score) score.textContent = `${me} - ${opp}`;
  if (clock) clock.textContent = `${String(Math.floor(app.game.matchElapsed(now) * 90)).padStart(2, '0')}'`;
  const last = events[events.length - 1];
  if (comm && last && (comm as HTMLElement).dataset.text !== last.text) {
    (comm as HTMLElement).dataset.text = last.text;
    comm.textContent = last.text;
    pixelize(comm);
  }
  const goals = me + opp;
  if (goals > ui.shownGoals) {
    ui.shownGoals = goals;
    const meScored = last?.type === 'goal' && last.team === (m.home ? 0 : 1);
    sfx(meScored ? 'goal' : 'concede');
    const wrap = app.root.querySelector('#pitch-wrap');
    if (wrap && last?.type === 'goal') {
      // TV 중계 자막처럼 아래에서 올라오는 득점 배너
      const squad = last.team === (m.home ? 0 : 1) ? s.squad : s.league.teams.find((x) => x.id === m.opponentId)?.squad;
      const scorer = last.slot !== undefined ? squad?.[last.slot] : undefined;
      const el = document.createElement('div');
      el.className = `goal-banner ${meScored ? 'mine' : 'theirs'}`;
      el.innerHTML = `<b>GOAL!</b> ${esc(scorer ? shortName(scorer) : '')} <span>${Math.floor(app.game.matchElapsed(now) * 90)}'</span>`;
      wrap.appendChild(el);
      setTimeout(() => el.remove(), 3200);
    }
  }
}

/** requestAnimationFrame마다 경기장 그리기 */
export function draw(app: App, t: number): void {
  if (app.tab !== 'match') return;
  const s = app.state;
  const m = s.match;
  const myTeam = m ? (m.home ? 0 : 1) : 0;
  const oppTeam = m ? s.league.teams.find((x) => x.id === m.opponentId) : myFixture(s.league)?.opponent;
  const oppSquad = oppTeam?.squad ?? s.squad;
  const squads: [Player[], Player[]] = myTeam === 0 ? [s.squad, oppSquad] : [oppSquad, s.squad];
  const elapsed = m ? Date.now() - m.startedAt : 0;
  app.pitch.draw(m ? m.result.events : null, elapsed, app.game.matchDurationMs(), myTeam as 0 | 1, squads, TIERS[s.league.level].crowd, t);
  const scene = app.root.querySelector<HTMLCanvasElement>('#ft-scene');
  if (scene && ui.banner) drawFullTime(scene, ui.banner.summary.outcome, s.squad, t, app.pitch.myKit);
}

// ───────── 모달 ─────────

/** 리그보다 두 단계 높은 등급이거나 최상위 등급이면 대박 */
function isRare(app: App, tier: number): boolean {
  return tier >= Math.min(TIERS.length - 1, app.state.league.level + 2) || tier >= 6;
}

function openCompare(app: App): void {
  if (app.topModal()?.id === 'compare') return app.renderModal(true);
  ui.cmpFull = false;
  const p = app.state.pending;
  const rare = !!p && isRare(app, p.tier);
  // 자동 스카우트는 어느 탭에서든 비교 창을 띄우므로, 버튼 동작을 창에 직접 붙인다
  app.openModal({
    id: 'compare',
    render: () => renderCompare(app),
    dismissable: false,
    cls: rare ? 'rare-reveal' : 'reveal',
    actions: { sign: actions.sign, sell: actions.sell, 'cmp-full': actions['cmp-full'] },
  });
  if (rare) {
    sfx('rare');
    confetti(app.root, 80);
  } else sfx('scout');
}

function renderCompare(app: App): string {
  const g = app.game;
  const p = g.state.pending;
  if (!p) return '';
  const slot = g.pendingSlot();
  const cur = g.state.squad[slot];
  const better = p.overall > cur.overall;
  return `
    <span class="compare-tag">현재 주전</span>
    <div class="cmp">${playerCard(cur)}<div>${playerInfo(cur)}${statBlock(cur, undefined, ui.cmpFull)}</div></div>
    ${isRare(app, p.tier) ? `<div class="rare-banner" style="--tier:${TIERS[p.tier].color}">✨ 대박! ${TIERS[p.tier].name} 선수 발견 ✨</div>` : ''}
    <span class="compare-tag" style="background:${better ? 'var(--green)' : 'var(--red)'}">새 선수 ${better ? '▲ 더 좋아요' : '▼ 별로예요'}</span>
    <div class="cmp new">${playerCard(p, { up: better })}<div>${playerInfo(p)}${statBlock(p, cur, ui.cmpFull)}</div></div>
    <p style="text-align:center;margin:4px 0 10px"><button class="btn small gray" data-act="cmp-full">${ui.cmpFull ? '핵심 능력치만 보기' : 'ⓘ 능력치 전부 보기'}</button></p>
    <div class="btn-row">
      <button class="btn red" data-act="sell">방출 +💵${fmt(g.sellPrice(p))}</button>
      <button class="btn" data-act="sign">영입</button>
    </div>`;
}

function renderProbs(app: App): string {
  const g = app.game;
  const now = app.now();
  const base = g.state.scoutLevel;
  const lv = g.effectiveScoutLevel(now);
  const bonus = lv - base;
  const cur = g.probabilities(lv);
  const max = base >= MAX_SCOUT_LEVEL;
  const next = max ? cur : g.probabilities(Math.min(MAX_SCOUT_LEVEL, lv + 1));
  const cost = g.upgradeCost();
  const member = g.isMember(now);
  const luckyLeft = (g.state.luckyUntil ?? 0) - now;
  return `<h2>🔭 스카우트 확률</h2>
    <div class="panel" style="padding:8px 10px;text-align:center">
      기본 <b>Lv.${base}</b>${member ? ` + 정회원 <b style="color:#8a5cf0">+${MEMBERSHIP.scoutLevelBonus}</b>` : ''}${luckyLeft > 0 ? ` + 행운 <b style="color:var(--green)">+${LUCKY_SCOUT.levelBonus}</b> (${duration(luckyLeft)})` : ''}${bonus > 0 ? ` = 적용 <b>Lv.${lv}</b>` : ''}
      <div class="btn-row" style="margin-top:8px">
        <button class="btn small gold" data-act="lucky-ad" ${g.luckyAdsLeft() > 0 ? '' : 'disabled'}>📺 행운 스카우트 ${LUCKY_SCOUT.minutes}분 (${g.luckyAdsLeft()}/${LUCKY_SCOUT.dailyAds})</button>
        <button class="btn small" data-act="membership" style="background:#8a5cf0;box-shadow:inset 0 2px 0 rgba(255,255,255,.35),0 3px 0 var(--outline)">${member ? '정회원 적용 중' : `정회원 +${MEMBERSHIP.scoutLevelBonus}레벨`}</button>
      </div>
    </div>
    <div class="prob-row" style="background:#1d2433"><span style="text-align:left">등급</span><span>Lv.${lv}</span><span class="next">${max ? '최대' : `Lv.${Math.min(MAX_SCOUT_LEVEL, lv + 1)}`}</span></div>
    ${TIERS.map((t, i) => `<div class="prob-row" style="background:${t.color}"><span style="text-align:left">${t.name}</span><span>${pct(cur[i])}</span><span class="next">${pct(next[i])}${next[i] > 0 && cur[i] === 0 ? ' 🆕' : ''}</span></div>`).join('')}
    <p class="muted" style="text-align:center">레벨을 올리면 높은 등급 선수가 나올 확률이 오릅니다.</p>
    ${max ? '<p style="text-align:center"><b>최고 레벨입니다!</b></p>' : `<button class="btn block ${g.state.wallet.cash >= cost ? 'green' : 'gray'}" data-act="do-upgrade">스카우트 업그레이드 💵${fmt(cost)}</button>`}`;
}

function renderAuto(app: App): string {
  const g = app.game;
  const probs = g.probabilities();
  const now = app.now();
  return `<h2>🔁 자동 스카우트</h2>
    <p class="muted" style="text-align:center;margin-top:-4px">체크한 등급에서 <b>지금 주전보다 좋은 선수</b>가 나오면 멈추고 비교 창을 띄웁니다. 나머지는 자동으로 방출해서 회비로 바꿉니다.</p>
    ${TIERS.map((t, i) => probs[i] > 0 ? `
      <label class="check-row" style="background:${t.color}">
        <input type="checkbox" data-act="keep" data-arg="${i}" ${g.state.autoScout.keepTiers[i] ? 'checked' : ''}>
        <span>${t.name}</span><span>${pct(probs[i])}</span>
      </label>` : '').join('')}
    <p class="muted" style="text-align:center">속도: ${(1000 / g.autoScoutInterval(now)).toFixed(1)}명/초 ${g.isMember(now) ? '(정회원 2배 적용 중)' : '· 정회원이면 2배'}</p>
    <div class="muted" style="min-height:54px;font-size:11px;background:#fff;border-radius:8px;padding:6px">${ui.autoLog.slice(-4).map(esc).join('<br>') || '아직 기록이 없습니다.'}</div>
    <p></p>
    <button class="btn block ${ui.autoRunning ? 'red' : 'green'}" data-act="auto-toggle">${ui.autoRunning ? '자동 스카우트 멈추기' : '자동 스카우트 시작'}</button>`;
}

function renderStadium(app: App): string {
  const g = app.game;
  const now = app.now();
  const r = g.stadiumRates();
  const p = g.stadiumPending(now);
  return `<h2>🏟️ 운동장 수익</h2>
    <div class="grid2">
      <div class="tile"><div class="big-ico">💵</div><div class="t">${r.cashPerSec >= 10 ? fmt(r.cashPerSec) : r.cashPerSec.toFixed(1)}/초</div></div>
      <div class="tile"><div class="big-ico">📞</div><div class="t">1개/${Math.round(r.contactEverySec)}초</div></div>
    </div>
    <p style="text-align:center;margin:14px 0 4px"><b style="font-size:20px">💵 ${fmt(p.cash)} · 📞 ${p.contacts}</b></p>
    <p class="muted" style="text-align:center;margin:0 0 12px">${duration(p.seconds * 1000)} 동안 쌓임 · 최대 ${r.capHours}시간 ${p.capped ? '<b style="color:var(--red)">(가득 찼어요!)</b>' : ''}</p>
    <div class="btn-row">
      <button class="btn" data-act="collect">수령하기</button>
      <button class="btn green" data-act="stadium-ad" ${g.adsLeft('stadium') <= 0 ? 'disabled' : ''}>📺 +💵${fmt(ADS.cash * incomeMult(g.state.league.level))} (${g.adsLeft('stadium')}/${ADS.dailyLimit})</button>
    </div>
    ${renderStadiumUpgrade(app)}`;
}

function renderLeague(app: App): string {
  const s = app.state;
  const t = sortedTable(s.league);
  const lv = s.league.level;
  return `<h2>${tierBadge(lv)} 순위표</h2>
    <p class="muted" style="text-align:center;margin-top:-4px">시즌 ${s.league.season} · ${s.league.round}/${s.league.fixtures.length}경기 · <b>1위를 하면 ${lv + 1 < TIERS.length ? `${TIERS[lv + 1].name} 승격` : '세계 정상!'}</b></p>
    <p class="muted" style="text-align:center;margin:-2px 0 8px;font-size:12px">🔥 표시는 이번 시즌 라이벌 · 이기면 회비 2배와 💎+5</p>
    <table class="table">
      <tr><th>#</th><th class="l">팀</th><th>경기</th><th>승</th><th>무</th><th>패</th><th>득실</th><th>승점</th></tr>
      ${t.map(({ team, row }, i) => `<tr class="${team.id === PLAYER_TEAM_ID ? 'me' : ''}">
        <td>${i + 1}</td><td class="l">${crestHtml(team.crest, 20)} ${team.id === app.game.rival()?.id ? '<span class="rival-mini" title="라이벌">🔥</span>' : ''}${esc(team.name)}</td>
        <td>${row.played}</td><td>${row.won}</td><td>${row.drawn}</td><td>${row.lost}</td><td>${row.gf - row.ga}</td><td><b>${row.points}</b></td></tr>`).join('')}
    </table>`;
}

function renderPlayer(app: App, slot: number): string {
  const p = app.state.squad[slot];
  return `<h2>${FORMATION[slot]} 주전</h2>
    <div class="cmp">${playerCard(p, { big: true })}<div>${playerInfo(p)}${summaryStats(p)}</div></div>
    <div class="goal-record"><span>⚽ 이번 시즌 <b>${p.seasonGoals ?? 0}골</b></span><span>통산 <b>${p.goals ?? 0}골</b></span>${topScorerBadge(app, p)}</div>
    <div class="panel"><h3>전체 능력치</h3>${statBlock(p, undefined, true)}</div>
    ${renderTraining(app, slot)}
    <p class="muted" style="text-align:center">더 좋은 ${FORMATION[slot]} 선수를 영입하면 교체돼요. 훈련 레벨은 그 선수에게만 남습니다.</p>`;
}

function topScorerBadge(app: App, p: Player): string {
  const top = app.game.seasonTopScorer();
  return top && top.name === p.name && top.goals > 0 ? '<span class="chip-top">👑 팀 득점 1위</span>' : '';
}

// ───────── 자동 스카우트 ─────────

export function stopAuto(): void {
  ui.autoRunning = false;
  clearTimeout(ui.autoTimer);
}

function runAuto(app: App): void {
  if (!ui.autoRunning) return;
  const g = app.game;
  const r = g.autoStep();
  if (r.status === 'empty') {
    stopAuto();
    app.toast('📞 연락처가 다 떨어졌어요');
    app.refresh();
    return;
  }
  if (r.status === 'sold' && r.player) {
    ui.autoLog.push(`${TIERS[r.player.tier].short} ${r.player.position} ${r.player.overall} ${shortName(r.player)} → 방출 +💵${fmt(r.cash ?? 0)}`);
    if (ui.autoLog.length > 30) ui.autoLog.shift();
    app.updateWallet();
    const sc = app.root.querySelector('.scout-btn');
    const cnt = sc?.querySelector('.cnt');
    if (cnt) cnt.innerHTML = `${pxIcon('contacts', 13)} ${fmt(g.state.wallet.contacts)}`;
  }
  if (r.status === 'paused') {
    if (app.tab === 'match') {
      if (app.topModal()?.id === 'auto') app.closeModal();
      openCompare(app);
    } else {
      // 다른 탭을 보고 있으면 방해하지 않는다: 알림만 주고 경기 탭에 돌아오면 비교 창을 띄운다
      app.toast(`🔭 좋은 선수 발견! 경기 탭에서 확인하세요`);
      app.refreshTabDots();
    }
  } else if (app.topModal()?.live) app.renderModal();
  ui.autoTimer = setTimeout(() => runAuto(app), g.autoScoutInterval(app.now()));
}


// ───────── 액션 ─────────

export const actions: Record<string, ActionHandler> = {
  scout(app) {
    if (app.state.pending) return openCompare(app);
    if (!app.game.scout()) {
      app.toast('📞 연락처가 부족해요. 운동장 수익을 수령하세요!');
      return;
    }
    openCompare(app);
  },
  sign(app) {
    const p = app.state.pending;
    const slot = app.game.pendingSlot();
    const before = app.game.power().total;
    const got = app.game.signPending();
    app.closeModal();
    sfx('sign');
    const diff = Math.round((app.game.power().total - before) * 10) / 10;
    app.toast(`✍️ ${p ? shortName(p) : ''} 영입! 팀 파워 ${diff >= 0 ? '+' : ''}${diff} · 💵+${fmt(got)}`);
    app.refresh();
    const card = app.root.querySelectorAll('.formation .card');
    card.forEach((c) => {
      if ((c as HTMLElement).dataset.arg === String(slot)) (c as HTMLElement).animate([{ transform: 'scale(1.25)' }, { transform: 'scale(1)' }], 400);
    });
  },
  sell(app) {
    const got = app.game.sellPending();
    app.closeModal();
    sfx('coin');
    app.toast(`💵 +${fmt(got)} 방출`);
    app.refresh();
  },
  'cmp-full'(app) {
    ui.cmpFull = !ui.cmpFull;
    app.renderModal(true);
  },
  probs(app) {
    app.openModal({ render: () => renderProbs(app) });
  },
  'lucky-ad'(app) {
    app.playAd(() => {
      if (app.game.watchLuckyScout(app.now())) app.toast(`🍀 ${LUCKY_SCOUT.minutes}분 동안 스카우트 확률 UP!`);
      app.renderModal(true);
    });
  },
  'do-upgrade'(app) {
    if (app.game.upgradeScout()) {
      sfx('fanfare');
      app.toast(`🔭 스카우트 Lv.${app.state.scoutLevel}!`);
      app.refresh();
    } else app.toast('💵 회비가 부족해요');
  },
  auto(app) {
    app.openModal({ id: 'auto', render: () => renderAuto(app), live: true });
  },
  keep(app, arg, el) {
    app.state.autoScout.keepTiers[Number(arg)] = (el as HTMLInputElement).checked;
  },
  'auto-toggle'(app) {
    if (ui.autoRunning) {
      stopAuto();
    } else {
      if (app.state.wallet.contacts <= 0) return app.toast('📞 연락처가 없어요');
      ui.autoRunning = true;
      app.closeModal();
      runAuto(app);
    }
    app.refresh();
  },
  stadium(app) {
    app.openModal({ render: () => renderStadium(app), live: true });
  },
  collect(app) {
    const got = app.game.collectStadium(app.now());
    sfx('coin');
    app.toast(`🏟️ 💵+${fmt(got.cash)} 📞+${got.contacts}`);
    app.refresh();
  },
  'stadium-ad'(app) {
    app.playAd(() => {
      const r = app.game.watchAd('stadium');
      if (r) app.toast(`📺 💵+${fmt(r.cash ?? 0)}`);
    });
  },
  league(app) {
    app.openModal({ render: () => renderLeague(app) });
  },
  player(app, arg) {
    app.openModal({ id: 'player', render: () => renderPlayer(app, Number(arg)) });
  },
  pass(app) {
    openPass(app);
  },
  missions(app) {
    openMissions(app);
  },
  guide(app) {
    const r = app.game.claimGuide();
    if (r) {
      app.toast(`🎯 가이드 완료! ${rewardText(r)}`);
      app.refresh();
    } else {
      const q = app.game.guide();
      if (q) app.toast(`🎯 ${q.hint}`);
    }
  },
  'style-cycle'(app) {
    const order: TacticStyle[] = ['balance', 'attack', 'defense'];
    const next = order[(order.indexOf(app.state.style) + 1) % order.length];
    app.game.setStyle(next);
    app.toast(`${STYLES[next].icon} ${STYLES[next].name}: ${STYLES[next].desc} (다음 경기부터)`);
    app.refresh();
  },
  membership(app) {
    openMembership(app);
  },
};

/** 다른 화면에서도 대기 중인 스카우트를 되살릴 수 있게 */
export function resumePending(app: App): void {
  if (app.state.pending) openCompare(app);
}
