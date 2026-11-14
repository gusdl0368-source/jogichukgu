import { ADS, ECONOMY, incomeMult } from '../../data/balance';
import { GEM_ITEMS, GEM_PACKS, MEMBERSHIP_PRODUCT, PASS_PRODUCT, SPONSORS, dailyDeals } from '../../data/shop';
import type { AdKind } from '../../game/game';
import type { ActionHandler, App } from '../app';
import { esc, fmt, rewardChips, rewardText, won } from '../dom';
import { openMembership, openPass } from '../shared';

export function render(app: App): string {
  const g = app.game;
  const s = g.state;
  const now = app.now();
  const deals = dailyDeals(s.daily.deals.set, s.league.level);
  const lvMult = incomeMult(s.league.level);
  const ads: { kind: AdKind; label: string }[] = [
    { kind: 'cash', label: `💵 +${fmt(ADS.cash * lvMult)}` },
    { kind: 'contacts', label: `📞 +${ADS.contacts}` },
    { kind: 'gems', label: `💎 +${ADS.gems}` },
  ];
  return `<div class="page" style="background:#efe9ff">
    <h2>🏪 구단 매점</h2>
    <p class="sub">프로토타입: 결제 버튼은 실제 결제 없이 바로 지급됩니다</p>

    <div class="panel" style="background:#2a3346;color:#fff;border-color:#1d2433">
      <h3>🪑 벤치 휴식 (광고 보상)</h3>
      <p class="muted" style="color:#c4cbe0;margin:0 0 8px">벤치에서 잠깐 쉬면 보상을 받아요. 하루 ${ADS.dailyLimit}번씩.</p>
      <div class="grid3">${ads.map((a) => `<button class="btn small green" data-act="ad" data-arg="${a.kind}" ${g.adsLeft(a.kind) <= 0 ? 'disabled' : ''}>📺 ${g.adsLeft(a.kind)}/${ADS.dailyLimit}<br>${a.label}</button>`).join('')}</div>
    </div>

    <div class="grid2">
      <button class="tile" data-act="open-member" style="background:linear-gradient(#ffe28a,#f0b31a);border-color:#c98f00">
        <div class="big-ico">💳</div><div class="t">정회원 회비</div><div class="muted" style="color:#5a3a00">${g.isMember(now) ? '가입 중' : won(MEMBERSHIP_PRODUCT.price)}</div>
      </button>
      <button class="tile" data-act="open-pass" style="background:linear-gradient(#cdb6ff,#8d62ec);border-color:#6a3fd0;color:#fff">
        <div class="big-ico">🎟️</div><div class="t">시즌 회비 패스</div><div style="font-size:12px">${s.pass.premium ? '프리미엄 활성' : won(PASS_PRODUCT.price)}</div>
      </button>
    </div>

    <div class="banner-title">오늘의 특가</div>
    <p class="sub" style="margin-top:-4px">세 개를 모두 사면 새 특가 세 개가 열려요!</p>
    ${deals.map((d, i) => `<div class="panel deal">
      <div><b>${esc(d.name)}</b><div class="rewards" style="margin-top:4px">${rewardChips(d.reward)}</div></div>
      ${s.daily.deals.bought[i] ? '<span class="muted">구매 완료</span>' : `<button class="btn small" data-act="buy" data-arg="${d.id}" data-name="${esc(d.name)}" data-price="${d.price}">${won(d.price)}</button>`}
    </div>`).join('')}

    <div class="banner-title">💎 젬</div>
    <div class="grid3">
      <button class="tile" data-act="free-gems" ${s.daily.freeGems ? 'disabled' : ''}>
        ${s.daily.freeGems ? '' : '<span class="dot" style="top:4px;right:4px"></span>'}
        <div class="big-ico">💎</div><div class="t">${ECONOMY.dailyFreeGems}</div><div class="btn small ${s.daily.freeGems ? 'gray' : 'green'}">${s.daily.freeGems ? '내일 또' : '무료'}</div>
      </button>
      ${GEM_PACKS.map((p) => `<button class="tile" data-act="buy" data-arg="${p.id}" data-name="${esc(p.name)}" data-price="${p.price}">
        <div class="big-ico">💎</div><div class="t">${fmt(p.gems)}</div><div class="btn small">${won(p.price)}</div>
      </button>`).join('')}
    </div>

    <div class="banner-title">💎 젬으로 사기</div>
    <div class="grid2">${GEM_ITEMS.map((it) => `<button class="tile" data-act="gem-item" data-arg="${it.id}">
      <div class="big-ico">${it.icon}</div><div class="t" style="font-size:13px">${esc(it.name)}</div>
      <div class="btn small ${s.wallet.gems >= it.gems ? 'green' : 'gray'}">💎 ${it.gems}</div>
    </button>`).join('')}</div>

    <div class="banner-title">🤝 동네 스폰서</div>
    ${SPONSORS.map((sp) => `<div class="panel deal">
      <div><b>${sp.icon} ${esc(sp.name)}</b><div class="muted">${esc(sp.desc ?? '')}</div></div>
      ${s.sponsors.includes(sp.id) ? '<b style="color:var(--green)">계약 중</b>' : `<button class="btn small" data-act="buy" data-arg="${sp.id}" data-name="${esc(sp.name)}" data-price="${sp.price}">${won(sp.price)}</button>`}
    </div>`).join('')}
  </div>`;
}

export const actions: Record<string, ActionHandler> = {
  ad(app, arg) {
    app.playAd(() => {
      const r = app.game.watchAd(arg as AdKind);
      if (r) app.toast(`📺 ${rewardText(r)}`);
    });
  },
  buy(app, arg, el) {
    app.confirmPurchase(el.dataset.name ?? arg, won(Number(el.dataset.price)), () => {
      if (app.game.purchase(arg, app.now())) app.toast('🎁 지급 완료!');
    });
  },
  'free-gems'(app) {
    if (app.game.claimFreeGems()) app.toast(`💎 +${ECONOMY.dailyFreeGems}`);
    app.refresh();
  },
  'gem-item'(app, arg) {
    const r = app.game.buyGemItem(arg);
    if (!r) return app.toast('💎 젬이 부족해요');
    app.toast(`🎁 ${rewardText(r)}`);
    app.refresh();
  },
  'open-member'(app) {
    openMembership(app);
  },
  'open-pass'(app) {
    openPass(app);
  },
};
