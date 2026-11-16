import {
  ATTENDANCE, COLLECTION_SIZE, CREST_COLORS, CREST_ICONS, KITS, MAX_STADIUM_LEVEL, MAX_TRAIN, OFFERS, STADIUM_PER_LEVEL,
  STREAK_BONUS, WHEEL, WHEEL_AD_SPINS, WHEEL_GEM_COST, type KitDef, collectionKey, stadiumName,
} from '../data/bm';
import { ADS, TIERS, TRAVEL_FUND } from '../data/balance';
import { NATIONS } from '../data/nations';
import type { Avatar } from '../game/types';
import type { ActionHandler, App } from './app';
import { avatarUrl } from './avatar';
import { crestHtml, duration, esc, fmt, rewardChips, rewardText, won } from './dom';
import { confetti } from './effects';
import { sfx } from './sound';

// 리텐션·수익화 화면: 빠른 메뉴, 출석, 룰렛, 특가, 구단(도감·유니폼·엠블럼), 경기장 증축, 선수 훈련

const ui = {
  wheelAngle: 0,
  spinning: false,
  clubTab: 'collection' as 'collection' | 'records' | 'kit' | 'crest',
  crestIcon: '',
  crestColor: '',
};

// ───────── 빠른 메뉴 (메인 화면) ─────────

/** 빠른 메뉴용 짧은 남은 시간: 71시간 → 71h, 59분 → 59m */
function shortLeft(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

export function renderQuickBar(app: App): string {
  const g = app.game;
  const now = app.now();
  const s = app.state;
  const offer = g.activeOffers(now)[0];
  const items: { act: string; icon: string; label: string; dot: boolean; cls?: string; id?: string }[] = [
    { act: 'qb-attend', icon: '📅', label: '출석', dot: g.attendanceAvailable(now) },
    { act: 'missions', icon: '📝', label: '미션', dot: g.missionsClaimable() > 0 },
    { act: 'qb-wheel', icon: '🎡', label: '룰렛', dot: g.wheelSpinsLeft().free },
    ...(offer ? [{ act: 'qb-offer', icon: '🎁', label: shortLeft(offer.endsAt - now), dot: true, cls: 'hot', id: 'qb-offer-time' }] : []),
    { act: 'pass', icon: '🎟️', label: '패스', dot: g.passClaimable() > 0 },
    { act: 'membership', icon: '💳', label: '정회원', dot: g.isMember(now) && !s.daily.membershipClaimed },
    { act: 'qb-club', icon: '🛡️', label: '구단', dot: !!g.nextCollectionMilestone() && g.collectionCount() >= g.nextCollectionMilestone()!.count },
  ];
  return `<div class="quickbar">${items
    .map((i) => `<button class="qb ${i.cls ?? ''}" data-act="${i.act}"><span class="qb-ico">${i.icon}</span><span ${i.id ? `id="${i.id}"` : ''}>${esc(i.label)}</span>${i.dot ? '<span class="dot"></span>' : ''}</button>`)
    .join('')}</div>`;
}

export function tickQuickBar(app: App, now: number): void {
  const el = app.root.querySelector('#qb-offer-time');
  const offer = app.game.activeOffers(now)[0];
  if (el && offer) el.textContent = shortLeft(offer.endsAt - now);
}

// ───────── 출석 ─────────

export function openAttendance(app: App): void {
  if (app.topModal()?.id === 'attend') return;
  app.openModal({ id: 'attend', render: () => renderAttendance(app) });
}

function renderAttendance(app: App): string {
  const a = app.state.attendance;
  const can = app.game.attendanceAvailable(app.now());
  return `<h2>📅 출석 보상</h2>
    <p class="muted" style="text-align:center;margin-top:-4px">매일 들어오면 받아요 · 연속 ${a.streak}일 · 누적 ${a.total}일<br>7일 연속 출석마다 추가 ${rewardText(STREAK_BONUS)}</p>
    <div class="attend">${ATTENDANCE.map((r, i) => {
      const done = i < a.day || (!can && a.day === 0 && a.total > 0);
      const today = can && i === a.day;
      return `<div class="att-day ${done ? 'done' : ''} ${today ? 'today' : ''} ${i === 6 ? 'big' : ''}">
        <div class="att-n">${i + 1}일</div><div class="rewards">${rewardChips(r)}</div>${done ? '<div class="att-check">✅</div>' : ''}
      </div>`;
    }).join('')}</div>
    <p></p>
    <button class="btn block ${can ? 'green' : 'gray'}" data-act="attend-claim" ${can ? '' : 'disabled'}>${can ? '오늘 보상 받기' : '내일 또 만나요'}</button>`;
}

// ───────── 행운 룰렛 ─────────

export function openWheel(app: App): void {
  app.openModal({ id: 'wheel', render: () => renderWheel(app) });
}

function renderWheel(app: App): string {
  const g = app.game;
  const left = g.wheelSpinsLeft();
  const n = WHEEL.length;
  const slice = 360 / n;
  const grad = WHEEL.map((s, i) => `${s.color} ${i * slice}deg ${(i + 1) * slice}deg`).join(',');
  return `<h2>🎡 행운 룰렛</h2>
    <p class="muted" style="text-align:center;margin-top:-4px">매일 무료 1번 · 광고 ${WHEEL_AD_SPINS}번 · 그다음은 젬</p>
    <div class="wheel-wrap">
      <div class="wheel-pointer"></div>
      <div class="wheel" id="wheel" style="background:conic-gradient(${grad});transform:rotate(${ui.wheelAngle}deg)">
        ${WHEEL.map((s, i) => `<span class="wheel-label" style="transform:rotate(${i * slice + slice / 2}deg) translateY(-78px)">${esc(s.label)}</span>`).join('')}
      </div>
      <div class="wheel-hub"></div>
    </div>
    <div class="grid3">
      <button class="btn small ${left.free ? 'green' : 'gray'}" data-act="spin" data-arg="free" ${left.free && !ui.spinning ? '' : 'disabled'}>무료</button>
      <button class="btn small gold" data-act="spin" data-arg="ad" ${left.ads > 0 && !ui.spinning ? '' : 'disabled'}>📺 ${left.ads}/${WHEEL_AD_SPINS}</button>
      <button class="btn small" data-act="spin" data-arg="gem" ${!ui.spinning && g.state.wallet.gems >= WHEEL_GEM_COST ? '' : 'disabled'}>💎 ${WHEEL_GEM_COST}</button>
    </div>
    <p class="muted" style="text-align:center">확률: ${WHEEL.map((s) => `${esc(s.label)} ${Math.round((s.weight / WHEEL.reduce((a, b) => a + b.weight, 0)) * 1000) / 10}%`).join(' · ')}</p>`;
}

function doSpin(app: App, kind: 'free' | 'ad' | 'gem'): void {
  const r = app.game.spinWheel(kind);
  if (!r) return app.toast('지금은 돌릴 수 없어요');
  ui.spinning = true;
  const slice = 360 / WHEEL.length;
  const center = r.index * slice + slice / 2;
  const target = (360 - center) % 360;
  const cur = ((ui.wheelAngle % 360) + 360) % 360;
  ui.wheelAngle += 360 * 5 + ((target - cur + 360) % 360);
  app.renderModal(true);
  const wheel = app.root.querySelector<HTMLElement>('#wheel');
  if (wheel) {
    wheel.style.transition = 'none';
    wheel.style.transform = `rotate(${ui.wheelAngle - 360 * 5 - ((target - cur + 360) % 360)}deg)`;
    requestAnimationFrame(() => {
      wheel.style.transition = 'transform 2.6s cubic-bezier(0.15, 0.85, 0.25, 1)';
      wheel.style.transform = `rotate(${ui.wheelAngle}deg)`;
    });
  }
  sfx('scout');
  setTimeout(() => {
    ui.spinning = false;
    const big = WHEEL[r.index].weight <= 8;
    sfx(big ? 'fanfare' : 'coin');
    if (big) confetti(app.root, 90);
    app.toast(`🎡 ${WHEEL[r.index].label}! ${rewardText(r.reward)}`);
    app.save();
    app.renderModal(true);
    app.updateWallet();
  }, 2700);
}

// ───────── 한정 특가 ─────────

/** 특가 창. id를 주면 그 특가를(승격 직후엔 승격 패키지), 없으면 가장 먼저 생긴 특가를 보여 준다 */
export function openOffer(app: App, id?: keyof typeof OFFERS): void {
  const pick = (): ReturnType<typeof app.game.activeOffers>[number] | undefined => {
    const list = app.game.activeOffers(app.now());
    return (id && list.find((x) => x.id === id)) || list[0];
  };
  if (!pick()) return;
  app.openModal({ id: 'offer', render: () => renderOffer(app, pick()), live: true, cls: 'offer-modal' });
}

function renderOffer(app: App, o: ReturnType<typeof app.game.activeOffers>[number] | undefined): string {
  const now = app.now();
  if (!o) return '';
  const def = OFFERS[o.id];
  return `<div class="offer">
    <div class="offer-ribbon">${esc(def.value)}</div>
    <h2>🎁 ${esc(def.name)}</h2>
    <p style="text-align:center;margin:0 0 6px"><b>${esc(def.desc)}</b></p>
    <p class="offer-timer">⏰ <span>${duration(o.endsAt - now)}</span> 남음</p>
    <div class="rewards" style="justify-content:center;margin:10px 0 14px">${rewardChips(def.reward(app.state.league.level))}</div>
    <button class="btn block gold" data-act="buy-offer" data-arg="${o.id}">${won(def.price)} 구매하기</button>
  </div>`;
}

/** 처음 켰을 때 띄울 팝업들 (출석 → 특가 순서로 쌓인다) */
export function startupPopups(app: App): void {
  const now = app.now();
  if (!app.state.seenTutorial) return;
  if (app.game.activeOffers(now).some((o) => o.id === 'comeback')) openOffer(app, 'comeback');
  if (app.game.attendanceAvailable(now)) openAttendance(app);
}

// ───────── 스카우트 출장비: 회비로 연락처 ─────────

export function renderTravelFund(app: App): string {
  const g = app.game;
  const left = g.travelFundLeft();
  const cost = g.travelFundCost();
  const can = left > 0 && app.state.wallet.cash >= cost;
  return `<div class="panel travel-fund">
      <div class="row-between"><h3 style="margin:0">🚌 스카우트 출장비</h3><span class="muted">오늘 ${left}/${TRAVEL_FUND.dailyLimit}</span></div>
      <p class="muted" style="margin:4px 0 8px">회비로 다른 동네까지 선수를 보러 가요. 살수록 출장비가 올라가고, 매일 새벽 3시에 초기화돼요.</p>
      <button class="btn block ${can ? 'green' : 'gray'}" data-act="travel-fund" ${can ? '' : 'disabled'}>${left <= 0 ? '오늘은 다 다녀왔어요' : `💵 ${fmt(cost)} → 📞 +${TRAVEL_FUND.contacts}`}</button>
    </div>`;
}

/** 연락처가 떨어졌을 때: 연락처를 구할 수 있는 방법을 한곳에 모아 보여준다 */
export function openNoContacts(app: App): void {
  app.openModal({
    id: 'no-contacts',
    live: true,
    render: () => {
      const g = app.game;
      const p = g.stadiumPending(app.now());
      return `<h2>📞 연락처가 떨어졌어요</h2>
        <p class="muted" style="text-align:center;margin-top:-4px">스카우트 1번에 연락처 1개가 들어요.</p>
        <div class="panel"><div class="row-between"><div><b>🏟️ 운동장 수익</b><div class="muted">지금 연락처 ${p.contacts}개 쌓임</div></div><button class="btn small ${p.contacts > 0 ? '' : 'gray'}" data-act="collect" ${p.contacts > 0 ? '' : 'disabled'}>수령</button></div></div>
        <div class="panel"><div class="row-between"><div><b>📺 광고 보고 받기</b><div class="muted">📞 +${ADS.contacts} · 오늘 ${g.adsLeft('contacts')}/${ADS.dailyLimit}</div></div><button class="btn small green" data-act="ad" data-arg="contacts" ${g.adsLeft('contacts') <= 0 ? 'disabled' : ''}>보기</button></div></div>
        ${renderTravelFund(app)}`;
    },
  });
}

// ───────── 구단: 도감 · 유니폼 · 엠블럼 ─────────

export function openClub(app: App, tab: typeof ui.clubTab = 'collection'): void {
  ui.clubTab = tab;
  ui.crestIcon = app.state.crest.icon;
  ui.crestColor = app.state.crest.color;
  app.openModal({ id: 'club', render: () => renderClub(app) });
}

function renderClub(app: App): string {
  const t = ui.clubTab;
  return `<h2>🛡️ ${esc(app.state.teamName)}</h2>
    <div class="segment" style="grid-template-columns:repeat(4,1fr);max-width:380px">
      <button class="${t === 'collection' ? 'on' : ''}" data-act="club-tab" data-arg="collection">도감</button>
      <button class="${t === 'records' ? 'on' : ''}" data-act="club-tab" data-arg="records">기록실</button>
      <button class="${t === 'kit' ? 'on' : ''}" data-act="club-tab" data-arg="kit">유니폼</button>
      <button class="${t === 'crest' ? 'on' : ''}" data-act="club-tab" data-arg="crest">엠블럼</button>
    </div>
    ${t === 'collection' ? renderCollection(app) : t === 'records' ? renderRecords(app) : t === 'kit' ? renderKits(app) : renderCrest(app)}`;
}

function renderRecords(app: App): string {
  const h = app.game.history();
  const st = app.state.stats;
  const current = [...app.state.squad].filter((p) => (p.goals ?? 0) > 0).sort((a, b) => (b.goals ?? 0) - (a.goals ?? 0)).slice(0, 3);
  const seasons = [...h.seasons].reverse();
  return `<div class="panel records-sum">
      <div><b>${st.matches}</b><span>경기</span></div>
      <div><b>${st.wins}</b><span>승</span></div>
      <div><b>${st.goals}</b><span>득점</span></div>
      <div><b>${st.promotions}</b><span>승격</span></div>
    </div>
    <div class="panel"><h3>👑 레전드</h3>
      ${h.legends.length
        ? `<div class="legend-list">${h.legends.slice(0, 10).map((l, i) => `<div class="legend-row"><span class="rk">${i + 1}</span><img class="px" src="${avatarUrl(l.avatar)}" alt="" width="34" height="34"><div class="who"><b>${esc(l.name)}</b><small>${l.position} · ${TIERS[l.tier].name} · 시즌 ${l.season}까지</small></div><span class="g">${l.goals}골</span></div>`).join('')}</div>`
        : `<p class="muted" style="margin:0">${LEGEND_HINT}</p>`}
      ${current.length ? `<p class="muted" style="margin:10px 0 0">지금 팀의 골잡이: ${current.map((p) => `${esc(p.name)} ${p.goals}골`).join(' · ')}</p>` : ''}
    </div>
    <div class="panel"><h3>📜 시즌 기록</h3>
      ${seasons.length
        ? `<div class="season-list">${seasons.slice(0, 20).map((r) => `<div class="season-row ${r.promoted ? 'up' : ''}">
            <div class="sr-top"><b>시즌 ${r.season}</b> <span>${TIERS[r.level].icon} ${TIERS[r.level].name}</span> <span class="rank">${r.rank}위${r.promoted ? ' ⬆️ 승격' : ''}</span></div>
            <div class="sr-sub">${r.won}승 ${r.drawn}무 ${r.lost}패${r.topScorer ? ` · 득점왕 ${esc(r.topScorer.name)} ${r.topScorer.goals}골` : ''}${r.rival ? ` · 🔥${esc(r.rival.name)} ${r.rival.won}승${r.rival.drawn}무${r.rival.lost}패` : ''}</div>
          </div>`).join('')}</div>`
        : '<p class="muted" style="margin:0">첫 시즌이 끝나면 여기에 순위와 득점왕이 기록돼요.</p>'}
    </div>`;
}

const LEGEND_HINT = '한 선수가 우리 팀에서 5골 이상 넣고 떠나면 레전드로 남아요. 정든 골잡이를 보낼 때도 기록은 남습니다.';

function renderCollection(app: App): string {
  const g = app.game;
  const seen = new Set(app.state.collection.seen);
  const next = g.nextCollectionMilestone();
  const count = g.collectionCount();
  const canClaim = !!next && count >= next.count;
  return `<div class="panel" style="text-align:center">
      <b style="font-size:18px">${count} / ${COLLECTION_SIZE}</b> <span class="muted">국적×등급 발견</span>
      <div class="progress" style="margin:6px 0"><i style="width:${(count / COLLECTION_SIZE) * 100}%"></i></div>
      <div class="muted">도감 보너스: 팀 파워 +${Math.round(g.collectionPower() * 1000) / 10}%</div>
      ${next ? `<p style="margin:8px 0 6px">다음 보상 (${next.count}칸): ${rewardText(next.reward)} + 팀 파워 +${next.power * 100}%</p>
        <button class="btn small ${canClaim ? 'gold' : 'gray'}" data-act="collection-claim" ${canClaim ? '' : 'disabled'}>${canClaim ? '보상 받기' : `${next.count - count}칸 남음`}</button>` : '<p><b>도감 완성!</b></p>'}
    </div>
    <div class="dex">
      <div class="dex-row dex-head"><span></span>${TIERS.map((tt) => `<i style="background:${tt.color}" title="${esc(tt.name)}"></i>`).join('')}</div>
      ${NATIONS.map((n) => `<div class="dex-row"><span title="${esc(n.name)}">${n.flag}</span>${TIERS.map((tt) => `<i class="${seen.has(collectionKey(n.code, tt.id)) ? 'on' : ''}" style="--c:${tt.color}"></i>`).join('')}</div>`).join('')}
    </div>
    <p class="muted" style="text-align:center">스카우트한 선수의 국적과 등급이 기록돼요. 방출해도 기록은 남습니다.</p>`;
}

const SAMPLE: Avatar = { skin: 1, hair: 1, hairStyle: 0, beard: 0, brow: 0, mouth: 1, acc: 0 };

function renderKits(app: App): string {
  const c = app.state.cosmetics;
  return `<p class="muted" style="text-align:center;margin-top:0">고르면 모든 선수 카드와 경기장에 바로 반영돼요.</p>
    <div class="grid2">${KITS.map((k) => {
      const owned = c.owned.includes(k.id);
      const on = c.kit === k.id;
      return `<div class="tile ${on ? 'active' : ''}">
        <img src="${avatarUrl(SAMPLE, kitColors(k))}" width="60" height="60" style="image-rendering:pixelated;background:${k.main}33;border-radius:8px" alt="">
        <div class="t">${esc(k.name)}</div>
        ${on ? '<span class="muted">착용 중</span>'
          : owned ? `<button class="btn small" data-act="kit-equip" data-arg="${k.id}">입기</button>`
          : `<button class="btn small ${app.state.wallet.gems >= k.gems ? 'green' : 'gray'}" data-act="kit-buy" data-arg="${k.id}">💎 ${k.gems}</button>`}
      </div>`;
    }).join('')}</div>`;
}

export function kitColors(k: KitDef): { main: string; dark: string; light: string; trim: string } {
  return { main: k.main, dark: k.dark, light: k.light, trim: k.trim };
}

function renderCrest(app: App): string {
  const cost = app.game.crestChangeCost();
  return `<div style="display:flex;justify-content:center;margin:6px 0 12px">${crestHtml({ icon: ui.crestIcon, color: ui.crestColor }, 72)}</div>
    <div class="panel"><h3>그림</h3><div class="pick">${CREST_ICONS.map((i) => `<button class="pick-btn ${i === ui.crestIcon ? 'on' : ''}" data-act="crest-icon" data-arg="${i}">${i}</button>`).join('')}</div></div>
    <div class="panel"><h3>색</h3><div class="pick">${CREST_COLORS.map((c) => `<button class="pick-btn ${c === ui.crestColor ? 'on' : ''}" data-act="crest-color" data-arg="${c}" style="background:${c}"></button>`).join('')}</div></div>
    <button class="btn block ${app.state.wallet.gems >= cost ? 'green' : 'gray'}" data-act="crest-apply">${cost === 0 ? '무료로 바꾸기 (첫 변경)' : `💎 ${cost}로 바꾸기`}</button>`;
}

// ───────── 경기장 증축 / 선수 훈련 (기존 창에 붙는 부분) ─────────

export function renderStadiumUpgrade(app: App): string {
  const g = app.game;
  const lv = app.state.stadiumLevel;
  const max = lv >= MAX_STADIUM_LEVEL;
  const cost = g.stadiumUpgradeCost();
  return `<div class="panel" style="margin-top:12px">
    <div class="row-between"><h3 style="margin:0">🏗️ 경기장 증축</h3><span class="chip" style="background:#e9edf4;color:var(--ink)">Lv.${lv} ${esc(stadiumName(lv))}</span></div>
    <p class="muted" style="margin:6px 0 8px">레벨마다 회비 수입 +${STADIUM_PER_LEVEL.cash * 100}% · 오프라인 누적 +${STADIUM_PER_LEVEL.capHours}시간</p>
    ${max ? '<b>최고 레벨!</b>' : `<button class="btn block ${app.state.wallet.cash >= cost ? 'green' : 'gray'}" data-act="stadium-up">💵 ${fmt(cost)} → Lv.${lv + 1} ${esc(stadiumName(lv + 1))}</button>`}
  </div>`;
}

export function renderTraining(app: App, slot: number): string {
  const p = app.state.squad[slot];
  const t = p.train ?? 0;
  const max = t >= MAX_TRAIN;
  const cost = app.game.trainCost(slot);
  return `<div class="panel">
    <div class="row-between"><h3 style="margin:0">🏋️ 특별 훈련</h3><span class="train-stars">${'★'.repeat(t)}${'☆'.repeat(MAX_TRAIN - t)}</span></div>
    <p class="muted" style="margin:6px 0 8px">회비로 모든 능력치 +1 (최대 ${MAX_TRAIN}번). 리그가 높을수록, 많이 할수록 비싸요.</p>
    ${max ? '<b>훈련 완료!</b>' : `<button class="btn block ${app.state.wallet.cash >= cost ? 'green' : 'gray'}" data-act="train" data-arg="${slot}">💵 ${fmt(cost)} 훈련하기</button>`}
  </div>`;
}

// ───────── 액션 ─────────

export const BM_ACTIONS: Record<string, ActionHandler> = {
  'qb-attend'(app) {
    openAttendance(app);
  },
  'attend-claim'(app) {
    const r = app.game.claimAttendance(app.now());
    if (!r) return;
    sfx(r.day === 6 || r.bonus ? 'fanfare' : 'coin');
    if (r.day === 6 || r.bonus) confetti(app.root, 90);
    app.toast(`📅 ${r.day + 1}일차 ${rewardText(r.reward)}${r.bonus ? ` + 연속 보너스 ${rewardText(STREAK_BONUS)}` : ''}`);
    app.closeModal();
    app.refresh();
  },
  'qb-wheel'(app) {
    openWheel(app);
  },
  spin(app, arg) {
    if (ui.spinning) return;
    if (arg === 'ad') app.playAd(() => doSpin(app, 'ad'));
    else doSpin(app, arg as 'free' | 'gem');
  },
  'qb-offer'(app) {
    openOffer(app);
  },
  'buy-offer'(app, arg) {
    const def = OFFERS[arg as keyof typeof OFFERS];
    app.confirmPurchase(def.name, won(def.price), () => {
      if (app.game.purchase(`offer_${arg}`, app.now())) {
        sfx('fanfare');
        confetti(app.root, 120);
        app.toast(`🎁 ${def.name} 지급 완료!`);
        if (app.topModal()?.id === 'offer') app.closeModal();
      }
    });
  },
  'travel-fund'(app) {
    const r = app.game.buyTravelFund();
    if (!r) return app.toast('💵 회비가 모자라요');
    sfx('coin');
    app.toast(`🚌 출장 다녀왔어요! 📞+${r.contacts}`);
    app.save();
    app.refresh();
  },
  'qb-club'(app) {
    openClub(app);
  },
  'club-tab'(app, arg) {
    ui.clubTab = arg as typeof ui.clubTab;
    app.renderModal(true);
  },
  'collection-claim'(app) {
    const r = app.game.claimCollection();
    if (r) {
      sfx('fanfare');
      app.toast(`📖 도감 보상 ${rewardText(r)}`);
    }
    app.renderModal(true);
    app.refresh();
  },
  'kit-buy'(app, arg) {
    if (!app.game.buyKit(arg)) return app.toast('💎 젬이 부족해요');
    sfx('fanfare');
    app.toast('👕 새 유니폼!');
    app.refresh();
  },
  'kit-equip'(app, arg) {
    app.game.equipKit(arg);
    sfx('sign');
    app.refresh();
  },
  'crest-icon'(app, arg) {
    ui.crestIcon = arg;
    app.renderModal(true);
  },
  'crest-color'(app, arg) {
    ui.crestColor = arg;
    app.renderModal(true);
  },
  'crest-apply'(app) {
    if (!app.game.setCrest(ui.crestIcon, ui.crestColor)) return app.toast('💎 젬이 부족해요');
    sfx('sign');
    app.toast('🛡️ 엠블럼을 바꿨어요');
    app.refresh();
  },
  'stadium-up'(app) {
    if (!app.game.upgradeStadium(app.now())) return app.toast('💵 회비가 부족해요');
    sfx('fanfare');
    app.toast(`🏗️ 경기장 Lv.${app.state.stadiumLevel} ${stadiumName(app.state.stadiumLevel)}!`);
    app.refresh();
  },
  train(app, arg) {
    const slot = Number(arg);
    const before = app.game.power().total;
    if (!app.game.trainPlayer(slot)) return app.toast('💵 회비가 부족해요');
    sfx('sign');
    const diff = Math.round((app.game.power().total - before) * 10) / 10;
    app.toast(`🏋️ 훈련 완료! 팀 파워 +${diff}`);
    app.refresh();
  },
};
