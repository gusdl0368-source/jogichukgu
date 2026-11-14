import { TIERS } from '../data/balance';
import { MEMBERSHIP_PRODUCT, PASS_PRODUCT, PASS_STEPS, passReward } from '../data/shop';
import type { OfflineReport } from '../game/game';
import { type MatchSummary, deserialize, serialize } from '../game/state';
import { DAILY_BONUS, DAILY_MISSIONS } from '../data/missions';
import { GAME_VERSION, PATCH_NOTES } from '../data/version';
import { sfx } from './sound';
import type { ActionHandler, App } from './app';
import { duration, esc, fmt, rewardChips, rewardText, tierBadge, won } from './dom';

// 여러 화면에서 같이 쓰는 모달과 액션

export function openPass(app: App): void {
  app.openModal({ id: 'pass', render: () => renderPass(app) });
}

function renderPass(app: App): string {
  const g = app.game;
  const p = g.state.pass;
  const lv = g.state.league.level;
  const steps = Array.from({ length: PASS_STEPS }, (_, i) => i);
  return `<h2>🎟️ 시즌 회비 패스</h2>
    <p class="muted" style="text-align:center;margin-top:-4px">리그 경기에서 이길 때마다 한 칸씩 열립니다. 현재 <b>${p.wins}승</b></p>
    ${p.premium ? '' : `<button class="btn gold block" data-act="buy-pass">프리미엄 열기 ${won(PASS_PRODUCT.price)} · 보상 3배</button><p></p>`}
    <table class="table">
      <tr><th>승</th><th>무료</th><th>프리미엄 ${p.premium ? '' : '🔒'}</th></tr>
      ${steps.map((i) => {
        const open = g.passUnlocked(i);
        const f = p.claimedFree.includes(i);
        const pr = p.claimedPremium.includes(i);
        const cell = (premium: boolean, claimed: boolean) => {
          const r = passReward(i, premium, lv);
          if (claimed) return `<span class="muted">✅ 받음</span>`;
          if (open && (!premium || p.premium)) return `<button class="btn small green" data-act="claim-pass" data-arg="${i}:${premium ? 1 : 0}">${rewardText(r)}</button>`;
          return `<span class="muted">${rewardText(r)}</span>`;
        };
        return `<tr ${open ? '' : 'style="opacity:.55"'}><td><b>${i + 1}</b></td><td>${cell(false, f)}</td><td>${cell(true, pr)}</td></tr>`;
      }).join('')}
    </table>`;
}

export function openMembership(app: App): void {
  app.openModal({ id: 'membership', render: () => renderMembership(app), live: true });
}

function renderMembership(app: App): string {
  const g = app.game;
  const now = app.now();
  const member = g.isMember(now);
  return `<h2>💳 정회원 회비</h2>
    <div class="panel" style="background:linear-gradient(135deg,#ffe28a,#f0b31a);border-color:#c98f00;text-align:center">
      <div style="font-weight:900;font-size:18px">새벽 FC 정회원증</div>
      <div class="muted" style="color:#5a3a00">주간 구독 · 7일</div>
    </div>
    <ul style="line-height:1.8;font-weight:700">
      <li>✅ 가입 즉시 📞150 + 💎100</li>
      <li>✅ 매일 📞150 + 💎20 받기</li>
      <li>✅ 자동 스카우트 <b style="color:var(--green)">2배 속도</b></li>
    </ul>
    ${member ? `<p style="text-align:center">남은 기간: <b>${duration(g.state.membershipUntil - now)}</b></p>
      <button class="btn block ${g.state.daily.membershipClaimed ? 'gray' : 'green'}" data-act="member-daily" ${g.state.daily.membershipClaimed ? 'disabled' : ''}>${g.state.daily.membershipClaimed ? '오늘 보상 받음' : '오늘 보상 받기'}</button><p></p>` : ''}
    <button class="btn block" data-act="buy-member">${member ? '7일 연장' : '가입하기'} ${won(MEMBERSHIP_PRODUCT.price)}</button>`;
}

export function openSeasonEnd(app: App, s: MatchSummary): void {
  const e = s.seasonEnd!;
  app.openModal({
    id: 'season',
    render: () => `<div class="ending">
      <div class="trophy">${e.promoted ? '🎉' : e.rank <= 3 ? '🥉' : '📋'}</div>
      <h2>시즌 종료 · 최종 ${e.rank}위</h2>
      ${e.promoted
        ? `<p><b>${tierBadge(e.level)}로 승격!</b><br>더 강한 상대와 더 많은 수입이 기다립니다.</p><div class="rewards" style="justify-content:center">${rewardChips(e.reward ?? {})}</div>`
        : `<p>1위를 해야 승격할 수 있어요.<br>같은 리그에서 새 시즌을 시작합니다.</p><p class="muted">💡 스카우트 레벨을 올리고 더 좋은 선수를 영입하세요.</p>`}
      <p></p><button class="btn block" data-act="close">계속하기</button></div>`,
  });
}

export function openEnding(app: App): void {
  const s = app.state.stats;
  app.openModal({
    id: 'ending',
    render: () => `<div class="ending">
      <div class="trophy">🏆</div>
      <h2>세계 정상!</h2>
      <p>새벽 학교 운동장에서 공 차던 <b>${esc(app.state.teamName)}</b>가<br>슈퍼스타 리그 우승으로 세계 최고의 클럽이 됐습니다.<br>오늘 막걸리는 감독님이 쏩니다!</p>
      <div class="panel" style="text-align:left">
        <div>⚽ 경기 ${s.matches} · 승 ${s.wins} / 무 ${s.draws} / 패 ${s.losses}</div>
        <div>🥅 득점 ${s.goals} · ⬆️ 승격 ${s.promotions}회</div>
        <div>🔭 스카우트 ${app.state.scoutCount}명 · ✍️ 영입 ${s.signed}명</div>
      </div>
      <button class="btn block" data-act="close">계속 둘러보기</button>
      <p></p><button class="btn block gray" data-act="new-game">처음부터 다시 하기</button>
    </div>`,
  });
}

export function openOffline(app: App, r: OfflineReport): void {
  const stadium = app.game.stadiumPending(app.now());
  if (r.seconds < 60 && r.matches.length === 0) return;
  app.openModal({
    id: 'offline',
    render: () => `<h2>👋 다시 오셨네요!</h2>
      <p style="text-align:center">${duration(r.seconds * 1000)} 동안 자리를 비웠어요.</p>
      ${r.matches.length ? `<div class="panel"><h3>그동안 치른 경기</h3>${r.matches.map((m) => `<div class="row-between"><span>vs ${esc(m.opponentName)}</span><b>${m.myScore[0]} - ${m.myScore[1]} ${m.outcome === 'win' ? '승' : m.outcome === 'draw' ? '무' : '패'}</b></div>`).join('')}</div>` : ''}
      <div class="panel" style="text-align:center"><h3>🏟️ 운동장에 쌓인 수익</h3><b style="font-size:18px">💵 ${fmt(stadium.cash)} · 📞 ${stadium.contacts}</b></div>
      <button class="btn block green" data-act="offline-collect">수령하고 시작</button>`,
  });
}

export function openTutorial(app: App): void {
  app.openModal({
    id: 'tutorial',
    dismissable: false,
    render: () => `<h2>🌅 새벽 조기축구</h2>
      <p>새벽 동네 운동장에서 시작해 <b>세계 정상</b>까지!<br><span class="muted">지역 리그 → 3부 → 2부 → 세미프로 → 프로 → 엘리트 → 월드클래스 → 슈퍼스타</span></p>
      <ol style="line-height:1.7;padding-left:20px">
        <li><b>🔭 스카우트</b>를 누르면 연락처 1개로 선수 1명을 찾아요.</li>
        <li>지금 주전보다 좋으면 <b>영입</b>, 아니면 <b>방출</b>해서 회비를 받아요.</li>
        <li>경기는 자동으로 진행돼요. <b>리그 1위</b>를 하면 승격!</li>
        <li>회비로 <b>스카우트 레벨</b>을 올리면 더 좋은 선수가 나와요.</li>
        <li>🏟️ 운동장에 회비와 연락처가 계속 쌓여요. 자주 수령하세요.</li>
        <li>🎯 화면 위 <b>가이드</b>를 따라가면 보상을 받아요.</li>
      </ol>
      <button class="btn block green" data-act="tutorial-done">시작하기</button>`,
  });
}

function showCode(app: App, code: string): void {
  app.openModal({
    id: 'code',
    render: () => `<h2>저장 코드</h2><p class="muted">자동 복사가 안 돼서 직접 복사해주세요.</p><textarea id="export-code" rows="6" readonly style="width:100%;font:12px monospace">${esc(code)}</textarea>`,
  });
  app.root.querySelector<HTMLTextAreaElement>('#export-code')?.select();
}

function openSettings(app: App): void {
  app.openModal({
    id: 'settings',
    render: () => `<h2>⚙️ 설정</h2>
      <div class="panel"><h3>팀 이름</h3>
        <div class="row-between"><input id="team-name" maxlength="14" value="${esc(app.state.teamName)}" style="flex:1;font:inherit;padding:8px;border-radius:8px;border:2px solid var(--line)"><button class="btn small" data-act="rename">변경</button></div>
      </div>
      <div class="panel"><h3>기록</h3>
        <div class="muted">리그: ${TIERS[app.state.league.level].name} · 시즌 ${app.state.league.season}</div>
        <div class="muted">경기 ${app.state.stats.matches} · 승 ${app.state.stats.wins} · 승격 ${app.state.stats.promotions}</div>
        <div class="muted">스카우트 ${app.state.scoutCount}명</div>
      </div>
      <div class="panel"><div class="row-between"><h3 style="margin:0">🔊 효과음</h3><button class="btn small ${app.state.settings.sound ? 'green' : 'gray'}" data-act="toggle-sound">${app.state.settings.sound ? '켜짐' : '꺼짐'}</button></div></div>
      <div class="panel"><h3>저장 코드</h3>
        <p class="muted" style="margin:0 0 8px">다른 기기로 옮기거나 백업할 때 씁니다. 복사한 코드를 다른 기기의 ‘가져오기’에 붙여넣으세요.</p>
        <div class="btn-row"><button class="btn small" data-act="export-save">코드 복사</button><button class="btn small gray" data-act="import-open">가져오기</button></div>
      </div>
      <div class="btn-row"><button class="btn gray" data-act="tutorial">게임 방법</button><button class="btn gray" data-act="patch-notes">패치 노트</button></div><p></p>
      <p class="muted" style="text-align:center">새벽 조기축구 ${GAME_VERSION}</p>
      <button class="btn block red" data-act="new-game">처음부터 다시 하기</button>`,
  });
}

export function openMissions(app: App): void {
  app.openModal({ id: 'missions', render: () => renderMissions(app), live: true });
}

function renderMissions(app: App): string {
  const g = app.game;
  const ms = g.state.daily.missions;
  const allClaimed = ms.claimed.length >= DAILY_MISSIONS.length;
  return `<h2>📅 오늘의 미션</h2>
    <p class="muted" style="text-align:center;margin-top:-4px">매일 새벽 3시에 새로 시작됩니다</p>
    ${DAILY_MISSIONS.map((m) => {
      const cur = Math.min(ms.progress[m.id], m.target);
      const claimed = ms.claimed.includes(m.id);
      const done = cur >= m.target;
      return `<div class="panel" style="padding:10px;margin-bottom:8px">
        <div class="row-between"><b>${m.icon} ${m.name}</b>
          ${claimed ? '<span class="muted">✅ 받음</span>' : `<button class="btn small ${done ? 'green' : 'gray'}" data-act="claim-mission" data-arg="${m.id}" ${done ? '' : 'disabled'}>${rewardText(m.reward)}</button>`}
        </div>
        <div class="row-between" style="margin-top:6px"><div class="progress" style="flex:1"><i style="width:${(cur / m.target) * 100}%"></i></div><span class="muted">${cur}/${m.target}</span></div>
      </div>`;
    }).join('')}
    <div class="panel" style="text-align:center;background:linear-gradient(#fff3cf,#ffe28a);border-color:#e0b100">
      <b>🎁 전부 완료 보상</b><div class="rewards" style="justify-content:center;margin:6px 0">${rewardChips(DAILY_BONUS)}</div>
      ${ms.bonus ? '<span class="muted">✅ 받음</span>' : `<button class="btn small ${allClaimed ? 'gold' : 'gray'}" data-act="claim-bonus" ${allClaimed ? '' : 'disabled'}>받기 (${ms.claimed.length}/${DAILY_MISSIONS.length})</button>`}
    </div>`;
}

function openImport(app: App): void {
  app.openModal({
    id: 'import',
    render: () => `<h2>저장 코드 가져오기</h2>
      <p class="muted">다른 기기에서 복사한 코드를 붙여넣으세요. <b>지금 진행은 덮어써집니다.</b></p>
      <textarea id="import-code" rows="6" style="width:100%;font:12px monospace;border-radius:8px;border:2px solid var(--line);padding:8px"></textarea>
      <p></p><div class="btn-row"><button class="btn gray" data-act="close">취소</button><button class="btn red" data-act="import-ok">불러오기</button></div>`,
    actions: {
      'import-ok'(app) {
        const code = app.root.querySelector<HTMLTextAreaElement>('#import-code')?.value.trim() ?? '';
        const state = decodeSave(code);
        if (!state) return app.toast('코드가 올바르지 않아요. 처음부터 끝까지 복사했는지 확인하세요');
        app.replaceState(state);
        app.save(true);
        app.toast('📥 저장을 불러왔어요');
      },
    },
  });
}

/** 저장 코드: JSON을 UTF-8 base64로 */
export function encodeSave(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return 'JGC1.' + btoa(bin);
}

export function decodeSave(code: string): ReturnType<typeof deserialize> {
  try {
    if (!code.startsWith('JGC1.')) return null;
    const bin = atob(code.slice(5).replace(/\s+/g, ''));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return deserialize(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

function openPatchNotes(app: App): void {
  app.openModal({
    id: 'patch',
    render: () => `<h2>📰 패치 노트</h2>${PATCH_NOTES.map((n) => `<div class="panel"><h3>${esc(n.version)} <span class="muted">${esc(n.date)}</span></h3><ul style="margin:0;padding-left:18px;line-height:1.6">${n.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></div>`).join('')}`,
  });
}

export const SHARED_ACTIONS: Record<string, ActionHandler> = {
  'claim-mission'(app, arg) {
    const r = app.game.claimMission(arg as (typeof DAILY_MISSIONS)[number]['id']);
    if (r) {
      sfx('coin');
      app.toast(`📅 ${rewardText(r)}`);
    }
    app.renderModal(true);
    app.refresh();
  },
  'claim-bonus'(app) {
    const r = app.game.claimMissionBonus();
    if (r) {
      sfx('fanfare');
      app.toast(`🎁 ${rewardText(r)}`);
    }
    app.refresh();
  },
  'toggle-sound'(app) {
    app.state.settings.sound = !app.state.settings.sound;
    app.renderModal(true);
  },
  'export-save'(app) {
    const code = encodeSave(serialize(app.state));
    const done = () => app.toast('📋 저장 코드를 복사했어요');
    navigator.clipboard?.writeText(code).then(done, () => showCode(app, code)) ?? showCode(app, code);
  },
  'import-open'(app) {
    openImport(app);
  },
  'patch-notes'(app) {
    openPatchNotes(app);
  },
  settings(app) {
    openSettings(app);
  },
  rename(app) {
    const v = app.root.querySelector<HTMLInputElement>('#team-name')?.value ?? '';
    app.game.rename(v);
    app.closeModal();
    app.toast('팀 이름을 바꿨어요');
    app.refresh();
  },
  'new-game'(app) {
    app.openModal({
      id: 'confirm-reset',
      render: () => `<h2>정말 처음부터?</h2><p style="text-align:center">모든 진행이 사라집니다.</p>
        <div class="btn-row"><button class="btn gray" data-act="close">취소</button><button class="btn red" data-act="reset-ok">초기화</button></div>`,
      actions: {
        'reset-ok'(app) {
          app.newGame();
          openTutorial(app);
        },
      },
    });
  },
  tutorial(app) {
    app.closeModal();
    openTutorial(app);
  },
  'tutorial-done'(app) {
    app.state.seenTutorial = true;
    app.closeModal();
  },
  'offline-collect'(app) {
    const got = app.game.collectStadium(app.now());
    app.closeModal();
    app.toast(`🏟️ 💵+${fmt(got.cash)} 📞+${got.contacts}`);
    app.refresh();
  },
  'claim-pass'(app, arg) {
    const [step, premium] = arg.split(':').map(Number);
    const r = app.game.claimPass(step, premium === 1);
    if (r) app.toast(`🎟️ ${rewardText(r)}`);
    app.renderModal(true);
    app.refresh();
  },
  'buy-pass'(app) {
    app.confirmPurchase(PASS_PRODUCT.name, won(PASS_PRODUCT.price), () => {
      app.game.purchase(PASS_PRODUCT.id, app.now());
      app.toast('🎟️ 프리미엄 패스 활성화!');
    });
  },
  'buy-member'(app) {
    app.confirmPurchase(MEMBERSHIP_PRODUCT.name, won(MEMBERSHIP_PRODUCT.price), () => {
      app.game.purchase(MEMBERSHIP_PRODUCT.id, app.now());
      app.toast('💳 정회원 가입 완료!');
    });
  },
  'member-daily'(app) {
    if (app.game.claimMembershipDaily(app.now())) app.toast('💳 📞+150 💎+20');
    app.refresh();
  },
};
