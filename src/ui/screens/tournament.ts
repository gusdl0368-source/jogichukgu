import { TOURNAMENT } from '../../data/balance';
import { nextReset } from '../../game/state';
import type { ActionHandler, App } from '../app';
import { crestHtml, duration, esc, fmt } from '../dom';

export function render(app: App): string {
  const g = app.game;
  const now = app.now();
  const t = g.state.tournament;
  const table = g.tournamentTable(now);
  const rank = g.tournamentRank(now);
  return `<div class="page">
    <div class="panel" style="text-align:center;background:linear-gradient(#ffcf6a,#e99a1c);border-color:#b9750b;color:#3d2600">
      <div style="font-size:44px">🏆</div>
      <div style="font-weight:900;font-size:22px">동네 대항전</div>
      <div style="font-weight:700">시즌 종료까지 <span id="cup-left">${duration(nextReset(now) - now)}</span></div>
      <div class="muted" style="color:#5a3a00">1위 💎${TOURNAMENT.rewardByRank(1)} · 3위 이내 💎${TOURNAMENT.rewardByRank(2)} · 10위 이내 💎${TOURNAMENT.rewardByRank(10)}</div>
    </div>
    ${t.pendingReward ? `<div class="panel" style="text-align:center;border-color:var(--gold)"><b>지난 시즌 ${t.pendingReward.rank}위!</b><p></p><button class="btn block gold" data-act="cup-reward">💎 ${t.pendingReward.gems} 받기</button></div>` : ''}
    <div class="panel">
      <div class="row-between"><h3>내 순위 ${rank}위 · ⭐${t.stars}</h3><span class="chip" style="background:#efe6ff;color:#5631a8">🎫 ${g.tournamentTicketsLeft()}/${TOURNAMENT.dailyTickets}</span></div>
      <p class="muted" style="margin:0 0 8px">다른 구단과 겨뤄 별을 모으세요. 강한 상대일수록 별이 많습니다. 도전권은 매일 새벽 3시 충전.</p>
      <button class="btn block ${g.tournamentTicketsLeft() > 0 ? 'green' : 'gray'}" data-act="cup-open">상대 고르기</button>
      ${g.tournamentTicketsLeft() <= 0 && g.state.daily.tournamentAd < TOURNAMENT.adTickets ? '<p></p><button class="btn block gold" data-act="cup-ad">📺 광고 보고 도전권 +1</button>' : ''}
    </div>
    <div class="panel"><h3>순위표</h3>
      <table class="table">
        ${table.map((r, i) => `<tr class="${r.me ? 'me' : ''}"><td>${i + 1}</td><td class="l">${esc(r.name)}</td><td>⚡${fmt(r.power)}</td><td><b>⭐${r.stars}</b></td></tr>`).join('')}
      </table>
    </div>
  </div>`;
}

function renderOpponents(app: App): string {
  const g = app.game;
  return `<h2>상대 고르기</h2>
    <p class="muted" style="text-align:center;margin-top:-4px">내 팀 ⚡${g.power().total} · 🎫 ${g.tournamentTicketsLeft()}</p>
    ${g.state.tournament.opponents.map((o, i) => `<div class="panel" style="display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;margin-bottom:8px">
      ${crestHtml(o.crest, 36)}
      <div><b>${esc(o.name)}</b><div class="muted">⚡${fmt(o.power)}</div></div>
      <button class="btn small ${g.tournamentTicketsLeft() > 0 ? '' : 'gray'}" data-act="challenge" data-arg="${i}">⭐+${o.stars}<br>도전</button>
    </div>`).join('')}`;
}

export function tick(app: App, now: number): void {
  const el = app.root.querySelector('#cup-left');
  if (el) el.textContent = duration(nextReset(now) - now);
}

export const actions: Record<string, ActionHandler> = {
  'cup-open'(app) {
    app.openModal({ id: 'cup', render: () => renderOpponents(app) });
  },
  challenge(app, arg) {
    const r = app.game.challenge(Number(arg));
    if (!r) return app.toast('🎫 도전권이 없어요');
    const s = r.summary;
    app.closeModal();
    app.openModal({
      id: 'cup-result',
      render: () => `<div class="ending"><div class="trophy">${s.outcome === 'win' ? '⭐' : s.outcome === 'draw' ? '🤝' : '😓'}</div>
        <h2>vs ${esc(s.opponentName)}</h2>
        <p style="font-size:26px;font-weight:900;margin:0">${s.myScore[0]} - ${s.myScore[1]}</p>
        <p><b>${s.outcome === 'win' ? `승리! 별 +${r.stars}` : s.outcome === 'draw' ? '무승부 (별 없음)' : '패배 (별 없음)'}</b></p>
        <ul style="text-align:left">${s.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        <button class="btn block" data-act="close">확인</button></div>`,
    });
    app.refresh();
  },
  'cup-ad'(app) {
    app.playAd(() => {
      if (app.game.watchTournamentAd()) app.toast('🎫 도전권 +1');
    });
  },
  'cup-reward'(app) {
    const gems = app.game.claimTournamentReward();
    if (gems) app.toast(`💎 +${gems}`);
    app.refresh();
  },
};
