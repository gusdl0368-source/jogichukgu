import { MEMBERSHIP, TIERS } from '../data/balance';
import { MEMBERSHIP_PRODUCT, PASS_PRODUCT, PASS_STEPS, passReward } from '../data/shop';
import type { OfflineReport } from '../game/game';
import { type MatchSummary, deserialize, serialize } from '../game/state';
import { DAILY_BONUS, DAILY_MISSIONS } from '../data/missions';
import { GAME_VERSION, PATCH_NOTES } from '../data/version';
import { sfx, updateMusic } from './sound';
import { resumePending } from './screens/match';
import { BM_ACTIONS, openOffer } from './bm';
import type { ActionHandler, App } from './app';
import { duration, esc, fmt, rewardChips, rewardText, tierBadge, won } from './dom';

// 여러 화면에서 같이 쓰는 모달과 액션

/** 계정 저장 연결. ask면 권한 확인 창이 뜰 수 있다(사용자가 버튼을 눌렀을 때만). */
export async function connectCloud(app: App, ask: boolean): Promise<void> {
  const remote = await app.cloud.connect(ask);
  if (remote && remote.lastActive > app.state.lastActive + 1000) {
    app.replaceState(remote);
    const r = app.game.catchUp(Date.now());
    app.refresh();
    if (app.state.champion) openEnding(app);
    else openOffline(app, r);
    resumePending(app);
    app.toast('☁️ 계정에 저장된 진행을 불러왔어요');
  }
  if (app.cloud.status === 'on') app.save(true);
  if (ask) {
    app.toast(app.cloud.status === 'on' ? '☁️ 계정 저장이 켜졌어요' : '☁️ 이 화면에서는 계정 저장을 쓸 수 없어요 (브라우저에 저장돼요)');
    app.renderModal(true);
  }
}

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
      <li>✅ 매일 📞${MEMBERSHIP.dailyContacts} + 💎${MEMBERSHIP.dailyGems} 받기</li>
      <li>✅ 정회원 스카우트망: 확률이 <b style="color:var(--green)">스카우트 레벨 +${MEMBERSHIP.scoutLevelBonus}</b>처럼</li>
      <li>✅ 운동장 연락처 <b style="color:var(--green)">${MEMBERSHIP.stadiumContactsMult}배 속도</b>, 회비 +${MEMBERSHIP.stadiumCashBonus * 100}%</li>
      <li>✅ 오프라인 누적 +${MEMBERSHIP.capHours}시간 · 자동 스카우트 ${MEMBERSHIP.autoScoutSpeedMult}배 속도</li>
    </ul>
    ${member ? `<p style="text-align:center">남은 기간: <b>${duration(g.state.membershipUntil - now)}</b></p>
      <button class="btn block ${g.state.daily.membershipClaimed ? 'gray' : 'green'}" data-act="member-daily" ${g.state.daily.membershipClaimed ? 'disabled' : ''}>${g.state.daily.membershipClaimed ? '오늘 보상 받음' : '오늘 보상 받기'}</button><p></p>` : ''}
    <button class="btn block" data-act="buy-member">${member ? '7일 연장' : '가입하기'} ${won(MEMBERSHIP_PRODUCT.price)}</button>`;
}

export function openSeasonEnd(app: App, s: MatchSummary): void {
  const e = s.seasonEnd!;
  // 승격 패키지는 시즌 종료 창 밑에 깔아 두고, 닫으면 보이게
  if (e.promoted) openOffer(app, 'promotion');
  app.openModal({
    id: 'season',
    render: () => `<div class="ending">
      <div class="trophy">${e.promoted ? '🎉' : e.rank <= 3 ? '🥉' : '📋'}</div>
      <h2>시즌 종료 · 최종 ${e.rank}위</h2>
      ${e.promoted
        ? `<p><b>${tierBadge(e.level)}로 승격!</b><br>더 강한 상대와 더 많은 수입이 기다립니다.</p><div class="rewards" style="justify-content:center">${rewardChips(e.reward ?? {})}</div>`
        : `<p>1위를 해야 승격할 수 있어요.<br>같은 리그에서 새 시즌을 시작합니다.</p><p class="muted">💡 스카우트 레벨을 올리고 더 좋은 선수를 영입하세요.</p>`}
      ${e.rival ? `<p class="muted" style="margin:6px 0 0">🔥 라이벌 ${esc(e.rival.name)} 상대 ${e.rival.won}승 ${e.rival.drawn}무 ${e.rival.lost}패</p>` : ''}
      ${e.topScorer ? `<div class="top-scorer">👑 시즌 팀 득점왕 <b>${esc(e.topScorer.name)}</b> ${e.topScorer.goals}골</div>` : ''}
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
      <div class="btn-row"><button class="btn" data-act="offline-collect">수령</button><button class="btn gold" data-act="offline-double" ${app.game.offlineDoubleLeft() > 0 ? '' : 'disabled'}>📺 2배로 받기</button></div>`,
  });
}

export function openTutorial(app: App): void {
  app.openModal({
    id: 'tutorial',
    dismissable: false,
    render: () => `<h2>🌅 새벽 조기축구</h2>
      <p class="tut-lead">동네 운동장에서 시작해 <b>세계 정상</b>까지!</p>
      <div class="tut-steps">
        <div class="tut-step"><span class="tut-n">1</span><span class="tut-ic">🔭</span><div><b>스카우트</b><small>연락처 1개로 선수 1명을 찾아요</small></div></div>
        <div class="tut-step"><span class="tut-n">2</span><span class="tut-ic">✍️</span><div><b>영입 또는 방출</b><small>주전보다 좋으면 영입, 아니면 팔아서 회비</small></div></div>
        <div class="tut-step"><span class="tut-n">3</span><span class="tut-ic">🏆</span><div><b>경기는 자동</b><small>리그 1위로 승격, 8단계를 올라 세계 정상</small></div></div>
      </div>
      <p class="muted tut-tip">🎯 막히면 화면 위 <b>가이드</b>를 따라가세요. 보상도 줘요.</p>
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
      <div class="panel settings-toggles">
        <div class="row-between"><h3 style="margin:0">🔊 소리 전체</h3><button class="btn small ${app.state.settings.sound ? 'green' : 'gray'}" data-act="toggle-sound">${app.state.settings.sound ? '켜짐' : '꺼짐'}</button></div>
        <div class="row-between"><h3 style="margin:0">🎵 배경음악</h3><button class="btn small ${app.state.settings.music !== false ? 'green' : 'gray'}" data-act="toggle-music">${app.state.settings.music !== false ? '켜짐' : '꺼짐'}</button></div>
        <div class="row-between"><h3 style="margin:0">📳 진동</h3><button class="btn small ${app.state.settings.vibrate !== false ? 'green' : 'gray'}" data-act="toggle-vibrate">${app.state.settings.vibrate !== false ? '켜짐' : '꺼짐'}</button></div>
      </div>
      <div class="panel"><div class="row-between"><h3 style="margin:0">☁️ 계정 저장</h3>${
        app.cloud.status === 'on' ? '<b style="color:var(--green)">켜짐</b>'
        : app.cloud.status === 'unavailable' ? '<span class="muted">이 화면에선 안 돼요</span>'
        : '<button class="btn small" data-act="cloud-on">켜기</button>'}</div>
        <p class="muted" style="margin:6px 0 0">켜면 다른 기기에서도 이어서 할 수 있어요. 끄면 이 브라우저에만 저장돼요.</p></div>
      <div class="panel"><h3>저장 코드</h3>
        <p class="muted" style="margin:0 0 8px">다른 기기로 옮기거나 백업할 때 씁니다. 복사한 코드를 다른 기기의 ‘가져오기’에 붙여넣으세요. 브라우저 기록을 지우면 저장도 사라지니, 가끔 복사해 두면 안전해요.</p>
        <div class="btn-row"><button class="btn small" data-act="export-save">코드 복사</button><button class="btn small gray" data-act="import-open">가져오기</button></div>
      </div>
      <div class="btn-row"><button class="btn gray" data-act="tutorial">게임 방법</button><button class="btn gray" data-act="patch-notes">패치 노트</button></div>
      <div class="btn-row" style="margin-top:8px"><button class="btn gray" data-act="credits">만든 이야기</button></div><p></p>
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
  ...BM_ACTIONS,
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
  'cloud-on'(app) {
    void connectCloud(app, true);
  },
  'toggle-sound'(app) {
    app.state.settings.sound = !app.state.settings.sound;
    updateMusic();
    app.renderModal(true);
  },
  'toggle-music'(app) {
    app.state.settings.music = app.state.settings.music === false;
    updateMusic();
    app.renderModal(true);
  },
  'toggle-vibrate'(app) {
    app.state.settings.vibrate = app.state.settings.vibrate === false;
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
  credits(app) {
    app.openModal({
      id: 'credits',
      render: () => `<h2>🌅 만든 이야기</h2>
        <div class="panel"><h3>새벽 조기축구</h3>
          <p style="margin:0">새벽 6시 학교 운동장에서 공을 차던 동네 아저씨들이 선수를 모으고 모아 세계 정상까지 올라가는 이야기입니다.
          한 손으로, 짧게 자주 즐길 수 있게 만들었어요.</p></div>
        <div class="panel"><h3>이렇게 만들었어요</h3>
          <ul style="margin:0;padding-left:18px;line-height:1.7">
            <li>그림 파일 없이 <b>코드로 그린 픽셀아트</b> (선수 얼굴 수천 가지 조합, 경기장, 아이콘)</li>
            <li>소리 파일 없이 <b>실시간 합성한 효과음</b>과 관중 함성</li>
            <li>경기 결과를 먼저 계산하고, 그 기록대로 <b>중계 화면이 실제 축구처럼 재생</b>돼요</li>
            <li>밸런스는 <b>시뮬레이터로 엔딩까지 수십 번 자동 플레이</b>해 보며 맞췄어요</li>
            <li>설치 없이 웹에서 바로, 저장은 이 기기에 자동</li>
          </ul></div>
        <div class="panel"><h3>사용한 글꼴</h3>
          <p class="muted" style="margin:0">Black Han Sans, Jua (Google Fonts, SIL Open Font License 1.1)</p></div>
        <p class="muted" style="text-align:center">${GAME_VERSION}</p>`,
    });
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
  'offline-double'(app) {
    app.playAd(() => {
      const got = app.game.collectStadium(app.now());
      app.game.doubleOffline(got);
      if (app.topModal()?.id === 'offline') app.closeModal();
      app.toast(`📺 2배! 💵+${fmt(got.cash * 2)} 📞+${got.contacts * 2}`);
    });
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
