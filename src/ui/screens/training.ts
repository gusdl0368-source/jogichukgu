import { TRAINING } from '../../data/balance';
import { CAMPS, type CampId, campWinChance, keeperReadChance } from '../../data/training';
import type { Game } from '../../game/game';
import { Rng, randomSeed } from '../../game/rng';
import type { ActionHandler, App } from '../app';
import { fmt, rewardChips, rewardText } from '../dom';

/** 캠프별로 고른 난이도 */
const chosen: Record<CampId, number> = { penalty: 1, futsal: 1, jokgu: 1 };

export function anyEntries(g: Game): boolean {
  return CAMPS.some((c) => g.campEntriesLeft(c.id) > 0);
}

function maxPlayable(g: Game, id: CampId): number {
  return g.campMaxPlayable(id);
}

export function render(app: App): string {
  const g = app.game;
  return `<div class="page">
    <h2>👟 훈련 캠프</h2>
    <p class="sub">캠프마다 다른 재화를 줍니다. 하루 ${TRAINING.dailyEntries}번 + 광고 ${TRAINING.adEntries}번 · 매일 새벽 3시 충전</p>
    ${CAMPS.map((c) => {
      const max = maxPlayable(g, c.id);
      const d = Math.min(chosen[c.id], max);
      chosen[c.id] = d;
      const left = g.campEntriesLeft(c.id);
      const cleared = g.state.training.cleared[c.id];
      const chance = c.requiredPower ? campWinChance(g.power().total, c.requiredPower(d)) : null;
      return `<div class="panel">
        <div class="row-between"><h3>${c.icon} ${c.name}</h3><span class="chip" style="background:#e9edf4;color:var(--ink)">🎫 ${left}/${TRAINING.dailyEntries}</span></div>
        <p class="muted" style="margin:0 0 8px">${c.desc}</p>
        <div class="row-between" style="margin-bottom:8px">
          <button class="btn small gray" data-act="diff" data-arg="${c.id}:-1" ${d <= 1 ? 'disabled' : ''}>◀</button>
          <div style="text-align:center"><b>난이도 ${d}</b><div class="muted">최고 기록 ${cleared}단계</div></div>
          <button class="btn small gray" data-act="diff" data-arg="${c.id}:1" ${d >= max ? 'disabled' : ''}>▶</button>
        </div>
        <div class="row-between" style="margin-bottom:8px"><span class="muted">보상</span><div class="rewards">${rewardChips(c.reward(d))}</div></div>
        ${chance !== null ? `<div class="row-between" style="margin-bottom:8px"><span class="muted">기준 파워 ⚡${fmt(c.requiredPower!(d))}</span><b style="color:${chance > 0.6 ? 'var(--green)' : chance > 0.35 ? '#d08a00' : 'var(--red)'}">예상 승률 ${Math.round(chance * 100)}%</b></div>` : ''}
        <div class="btn-row">
          <button class="btn ${cleared > 0 && left > 0 ? '' : 'gray'}" data-act="sweep" data-arg="${c.id}" ${cleared > 0 && left > 0 ? '' : 'disabled'}>소탕 (${cleared || '-'}단계)</button>
          <button class="btn green" data-act="enter" data-arg="${c.id}" ${left > 0 ? '' : 'disabled'}>도전</button>
        </div>
        ${left <= 0 && g.campAdLeft(c.id) > 0 ? `<p></p><button class="btn block gold" data-act="camp-ad" data-arg="${c.id}">📺 광고 보고 입장권 +1</button>` : ''}
      </div>`;
    }).join('')}
  </div>`;
}

// ───────── 승부차기 미니게임 ─────────

interface Shootout {
  difficulty: number;
  kicks: ('ok' | 'no')[];
  busy: boolean;
  rng: Rng;
}

let pk: Shootout | null = null;

function renderPenalty(): string {
  if (!pk) return '';
  const done = pk.kicks.length >= 5 || pk.kicks.filter((k) => k === 'ok').length >= 3 || pk.kicks.filter((k) => k === 'no').length >= 3;
  const goals = pk.kicks.filter((k) => k === 'ok').length;
  return `<h2>🥅 승부차기 내기 · 난이도 ${pk.difficulty}</h2>
    <p class="muted" style="text-align:center;margin-top:-4px">5번 중 3골 넣으면 성공! 골키퍼가 방향을 읽을 확률 ${Math.round(keeperReadChance(pk.difficulty) * 100)}%</p>
    <div class="kicks">${Array.from({ length: 5 }, (_, i) => {
      const k = pk!.kicks[i];
      return `<span class="${k ?? ''}">${k === 'ok' ? '○' : k === 'no' ? '✕' : i + 1}</span>`;
    }).join('')}</div>
    <div class="penalty-goal"><div class="net"></div><div class="keeper" id="pk-keeper">🧤</div><div class="ball" id="pk-ball">⚽</div></div>
    ${done
      ? `<p style="text-align:center;font-size:18px"><b>${goals >= 3 ? '🎉 성공!' : '😢 실패… 막걸리는 우리가 삽니다'}</b></p><button class="btn block" data-act="pk-finish">확인</button>`
      : `<p style="text-align:center;margin:0 0 8px"><b>어디로 찰까요?</b></p>
        <div class="grid3">
          <button class="btn" data-act="kick" data-arg="0" ${pk.busy ? 'disabled' : ''}>⬅️ 왼쪽</button>
          <button class="btn" data-act="kick" data-arg="1" ${pk.busy ? 'disabled' : ''}>⬆️ 가운데</button>
          <button class="btn" data-act="kick" data-arg="2" ${pk.busy ? 'disabled' : ''}>➡️ 오른쪽</button>
        </div>`}`;
}

// ───────── 액션 ─────────

export const actions: Record<string, ActionHandler> = {
  diff(app, arg) {
    const [id, delta] = arg.split(':') as [CampId, string];
    chosen[id] = Math.max(1, Math.min(maxPlayable(app.game, id), chosen[id] + Number(delta)));
    app.refresh();
  },
  enter(app, arg) {
    const id = arg as CampId;
    const camp = CAMPS.find((c) => c.id === id)!;
    const d = chosen[id];
    if (camp.interactive) {
      if (!app.game.enterCamp(id, d)) return app.toast('입장권이 없어요');
      pk = { difficulty: d, kicks: [], busy: false, rng: new Rng(randomSeed()) };
      app.openModal({ id: 'penalty', render: renderPenalty, dismissable: false });
      app.refresh();
      return;
    }
    const r = app.game.playAutoCamp(id, d);
    if (!r) return app.toast('입장권이 없어요');
    app.openModal({
      id: 'camp-result',
      render: () => `<div class="ending"><div class="trophy">${r.success ? '🎉' : '😓'}</div>
        <h2>${camp.name} ${r.success ? '승리!' : '패배'}</h2>
        <p class="muted">승률 ${Math.round(r.chance * 100)}%</p>
        ${r.reward ? `<div class="rewards" style="justify-content:center">${rewardChips(r.reward)}</div>` : '<p>팀 파워를 더 올려서 다시 도전하세요.</p>'}
        <p></p><button class="btn block" data-act="close">확인</button></div>`,
    });
    app.refresh();
  },
  sweep(app, arg) {
    const r = app.game.sweepCamp(arg as CampId);
    if (r) app.toast(`🧹 소탕 완료 ${rewardText(r)}`);
    app.refresh();
  },
  'camp-ad'(app, arg) {
    app.playAd(() => {
      if (app.game.watchCampAd(arg as CampId)) app.toast('🎫 입장권 +1');
    });
  },
  kick(app, arg) {
    if (!pk || pk.busy) return;
    const dir = Number(arg);
    const read = pk.rng.chance(keeperReadChance(pk.difficulty));
    const keeperDir = read ? dir : (dir + 1 + pk.rng.int(0, 1)) % 3;
    // 가운데는 막기 쉽고, 구석은 빗나갈 수도 있다
    const missWide = dir !== 1 && pk.rng.chance(0.08);
    const goal = !missWide && keeperDir !== dir;
    pk.busy = true;
    app.renderModal(true);
    const keeper = app.root.querySelector<HTMLElement>('#pk-keeper');
    const ball = app.root.querySelector<HTMLElement>('#pk-ball');
    const left = ['24%', '50%', '76%'];
    requestAnimationFrame(() => {
      if (keeper) {
        keeper.style.left = left[keeperDir];
        keeper.style.transform = `translateX(-50%) rotate(${keeperDir === 0 ? -35 : keeperDir === 2 ? 35 : 0}deg)`;
      }
      if (ball) {
        ball.style.left = missWide ? (dir === 0 ? '6%' : '94%') : left[dir];
        ball.style.bottom = '105px';
      }
    });
    setTimeout(() => {
      if (!pk) return;
      pk.kicks.push(goal ? 'ok' : 'no');
      pk.busy = false;
      app.toast(goal ? '⚽ 골!' : missWide ? '아~ 빗나갔어요' : '🧤 막혔어요!');
      app.renderModal(true);
    }, 700);
  },
  'pk-finish'(app) {
    if (!pk) return;
    const success = pk.kicks.filter((k) => k === 'ok').length >= 3;
    const r = app.game.finishCamp('penalty', pk.difficulty, success);
    pk = null;
    app.closeModal();
    if (r) app.toast(`🎉 ${rewardText(r)}`);
    app.refresh();
  },
};
