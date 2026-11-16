import { Game } from '../game/game';
import { type GameState, newGameState } from '../game/state';
import { CloudSave, backupSave, clearLocal, saveLocal } from '../storage';
import { esc, fmt } from './dom';
import { pxIcon } from './icons';
import { pixelize } from './pixelEmoji';
import { BM_ACTIONS, kitColors, tickQuickBar } from './bm';
import { setCurrentKit } from './avatar';
import { teamKitFrom } from './pitch';
import { BroadcastView } from './broadcast';
import { duckMusic, setCrowd } from './sound';
import * as matchScreen from './screens/match';
import * as storeScreen from './screens/store';
import * as tacticsScreen from './screens/tactics';
import * as tournamentScreen from './screens/tournament';
import * as trainingScreen from './screens/training';
import { SHARED_ACTIONS, openOffline } from './shared';

export type TabId = 'tournament' | 'training' | 'match' | 'tactics' | 'store';

export type ActionHandler = (app: App, arg: string, el: HTMLElement) => void;

export interface Screen {
  render(app: App): string;
  actions: Record<string, ActionHandler>;
  /** 화면이 그려진 뒤 호출 (캔버스 붙이기 등) */
  mounted?(app: App): void;
  /** 250ms마다 호출 (숫자/타이머 갱신) */
  tick?(app: App, now: number): void;
}

const SCREENS: Record<TabId, Screen> = {
  tournament: tournamentScreen,
  training: trainingScreen,
  match: matchScreen,
  tactics: tacticsScreen,
  store: storeScreen,
};

const TABS: { id: TabId; icon: string; label: string }[] = [
  { id: 'tournament', icon: '🏆', label: '대회' },
  { id: 'training', icon: '👟', label: '훈련' },
  { id: 'match', icon: '⚽', label: '경기' },
  { id: 'tactics', icon: '📋', label: '전술' },
  { id: 'store', icon: '🏪', label: '상점' },
];

export interface ModalState {
  /** 같은 모달이 이미 떠 있는지 확인할 때 쓰는 이름 */
  id?: string;
  render: () => string;
  /** true면 tick마다 다시 그린다 */
  live?: boolean;
  /** .modal에 붙일 추가 클래스 (연출용) */
  cls?: string;
  /** false면 바깥을 눌러도 안 닫힌다 */
  dismissable?: boolean;
  onClose?: () => void;
  actions?: Record<string, ActionHandler>;
}

export class App {
  tab: TabId = 'match';
  readonly pitch = new BroadcastView();
  /** 탭 안의 하위 화면 상태(예: 전술 탭의 스킬/전술) */
  sub: Record<string, string> = {};
  private modalStack: ModalState[] = [];
  private lastModalHtml = '';
  /** 지금 화면에 그려진 창 (같은 창이면 다시 그릴 때 애니메이션을 재생하지 않는다) */
  private shownModal: ModalState | undefined;
  private lastSave = 0;
  private extraActions: Record<string, ActionHandler> = {};
  readonly cloud = new CloudSave();

  constructor(
    public readonly root: HTMLElement,
    public readonly game: Game,
  ) {
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('change', (e) => this.onClick(e));
  }

  now(): number {
    return Date.now();
  }

  get state() {
    return this.game.state;
  }

  // ───────── 렌더 ─────────

  render(): void {
    this.applyKit();
    // 떠 있는 창은 화면을 다시 그려도 그대로 둔다 (탭을 바꿀 때 창이 깜빡이지 않게)
    const keptModalRoot = this.root.querySelector('#modal-root');
    this.root.innerHTML = `
      ${this.renderTopbar()}
      <div class="content" id="content">${SCREENS[this.tab].render(this)}</div>
      <nav class="tabs">${TABS.map((t) => `
        <button class="tab ${t.id === this.tab ? 'active' : ''}" data-act="tab" data-arg="${t.id}">
          <span class="ico">${t.icon}</span>${t.label}
          ${this.tabHasDot(t.id) ? '<span class="dot"></span>' : ''}
        </button>`).join('')}
      </nav>
      <div id="modal-root"></div>`;
    pixelize(this.root);
    if (keptModalRoot) this.root.querySelector('#modal-root')?.replaceWith(keptModalRoot);
    else this.shownModal = undefined;
    SCREENS[this.tab].mounted?.(this);
    this.renderModal();
  }

  /** 현재 탭 내용만 다시 그린다 (스크롤 위치 유지) */
  refresh(): void {
    this.applyKit();
    const content = this.root.querySelector<HTMLElement>('#content');
    if (!content) return this.render();
    const scroll = content.scrollTop;
    const top = this.root.querySelector('.topbar');
    if (top) top.outerHTML = this.renderTopbar();
    pixelize(this.root.querySelector('.topbar'));
    content.innerHTML = SCREENS[this.tab].render(this);
    pixelize(content);
    content.scrollTop = scroll;
    SCREENS[this.tab].mounted?.(this);
    this.root.querySelectorAll<HTMLElement>('.tab').forEach((el) => {
      const id = el.dataset.arg as TabId;
      const has = this.tabHasDot(id);
      const dot = el.querySelector('.dot');
      if (has && !dot) el.insertAdjacentHTML('beforeend', '<span class="dot"></span>');
      if (!has && dot) dot.remove();
    });
    this.renderModal(true);
  }

  private applyKit(): void {
    const k = this.game.kit();
    setCurrentKit(kitColors(k));
    this.pitch.myKit = teamKitFrom(k);
  }

  private renderTopbar(): string {
    const s = this.state;
    const w = s.wallet;
    return `<header class="topbar">
      <div class="season">시즌 ${s.league.season} · ${Math.min(s.league.round + 1, s.league.fixtures.length)}주차<small>${esc(s.teamName)}</small></div>
      <span class="chip">${pxIcon('cash')}<b id="w-cash">${fmt(w.cash)}</b></span>
      <span class="chip">${pxIcon('contacts')}<b id="w-contacts">${fmt(w.contacts)}</b></span>
      <span class="chip">${pxIcon('gems')}<b id="w-gems">${fmt(w.gems)}</b></span>
      <button class="icon-btn" data-act="settings">⚙️</button>
    </header>`;
  }

  /** 하단 탭의 빨간 점만 다시 그린다 */
  refreshTabDots(): void {
    this.root.querySelectorAll<HTMLElement>('.tab').forEach((el) => {
      const id = el.dataset.arg as TabId;
      const has = this.tabHasDot(id);
      const dot = el.querySelector('.dot');
      if (has && !dot) el.insertAdjacentHTML('beforeend', '<span class="dot"></span>');
      if (!has && dot) dot.remove();
    });
  }

  updateWallet(): void {
    const w = this.state.wallet;
    const set = (id: string, v: string) => {
      const el = this.root.querySelector(`#${id}`);
      if (el && el.textContent !== v) el.textContent = v;
    };
    set('w-cash', fmt(w.cash));
    set('w-contacts', fmt(w.contacts));
    set('w-gems', fmt(w.gems));
  }

  tabHasDot(id: TabId): boolean {
    const g = this.game;
    const now = this.now();
    // 첫 경기 두 판까지는 경기 탭만 안내한다 (처음부터 모든 탭에 빨간 점이 붙지 않게)
    if (g.state.stats.matches < 2 && id !== 'match') return false;
    switch (id) {
      case 'tournament':
        return g.tournamentTicketsLeft() > 0 || !!g.state.tournament.pendingReward;
      case 'training':
        return trainingScreen.anyEntries(g);
      case 'match':
        return !!g.state.pending;
      case 'tactics':
        return g.canStartAnyResearch() || Object.keys(g.state.skills.owned).some((k) => g.canUpgradeSkill(k)) || g.state.wallet.whistles >= 200;
      case 'store':
        return !g.state.daily.freeGems || (g.isMember(now) && !g.state.daily.membershipClaimed) || g.activeOffers(now).length > 0;
      default:
        return false;
    }
  }

  // ───────── 모달 / 토스트 ─────────

  openModal(m: ModalState): void {
    this.modalStack.push({ dismissable: true, ...m });
    this.renderModal(true);
  }

  closeModal(): void {
    const m = this.modalStack.pop();
    this.renderModal(true);
    m?.onClose?.();
  }

  hasModal(): boolean {
    return this.modalStack.length > 0;
  }

  /** 맨 위 모달의 렌더 함수가 같은지(같은 종류 모달이 이미 떠 있는지) 확인용 태그 */
  topModal(): ModalState | undefined {
    return this.modalStack[this.modalStack.length - 1];
  }

  renderModal(_force = false): void {
    const root = this.root.querySelector('#modal-root');
    if (!root) return;
    let m = this.topModal();
    // 내용이 사라진 창(예: 대기 선수가 없어진 비교 창)은 닫는다. 닫을 수 없는 빈 창이 화면을 막지 않게.
    while (m && !m.render().trim()) {
      this.modalStack.pop();
      m = this.topModal();
    }
    if (!m) {
      root.innerHTML = '';
      this.shownModal = undefined;
      this.lastModalHtml = '';
      return;
    }
    const inner = `${m.dismissable ? '<button class="close-x" data-act="close">✕</button>' : ''}${m.render()}`;
    const cls = `modal ${m.cls ?? ''}`;
    const html = `${m.dismissable}|${cls}|${inner}`;
    const same = m === this.shownModal;
    // 같은 창이고 내용도 그대로면 건드리지 않는다 (등장 애니메이션이 다시 돌며 깜빡이지 않게)
    if (same && html === this.lastModalHtml) return;
    let overlay = root.querySelector<HTMLElement>(':scope > .overlay');
    const prevModal = root.querySelector<HTMLElement>('.modal');
    const prevScroll = prevModal?.scrollTop ?? 0;
    if (!overlay) {
      // 창이 하나도 없다가 처음 뜰 때만 배경이 서서히 어두워진다
      root.innerHTML = '<div class="overlay"></div>';
      overlay = root.querySelector<HTMLElement>('.overlay')!;
    }
    overlay.dataset.act = m.dismissable ? 'overlay' : '';
    if (same && prevModal) {
      // 같은 창의 내용만 바뀜: 창 틀은 그대로 두고 안쪽만 갈아끼운다
      prevModal.className = cls;
      prevModal.innerHTML = inner;
      pixelize(prevModal);
      prevModal.scrollTop = prevScroll;
    } else {
      // 다른 창으로 바뀜(겹친 창이 닫히거나 새 창이 뜸): 배경은 유지하고 창만 교체
      const el = document.createElement('div');
      el.className = cls;
      el.innerHTML = inner;
      overlay.replaceChildren(el);
      pixelize(el);
    }
    this.shownModal = m;
    this.lastModalHtml = html;
  }

  toast(msg: string): void {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    pixelize(el);
    this.root.appendChild(el);
    setTimeout(() => el.remove(), 1900);
  }

  /** 가짜 광고: 잠깐 화면을 덮었다가 보상 콜백 */
  playAd(onDone: () => void): void {
    const el = document.createElement('div');
    el.className = 'overlay';
    el.style.zIndex = '90';
    el.innerHTML = `<div class="modal" style="text-align:center"><h2>📺 광고 재생 중…</h2><p class="muted">체험판이라 실제 광고 대신 잠깐 기다립니다.</p><div class="progress"><i id="ad-bar" style="width:0%;transition:width 1.4s linear"></i></div></div>`;
    pixelize(el);
    this.root.appendChild(el);
    requestAnimationFrame(() => {
      const bar = el.querySelector<HTMLElement>('#ad-bar');
      if (bar) bar.style.width = '100%';
    });
    setTimeout(() => {
      el.remove();
      onDone();
      this.save();
      this.refresh();
    }, 1500);
  }

  /** 가짜 결제 확인 */
  confirmPurchase(name: string, price: string, onOk: () => void): void {
    this.openModal({
      render: () => `<h2>구매 확인</h2>
        <p style="text-align:center"><b>${esc(name)}</b><br>${esc(price)}</p>
        <p class="muted" style="text-align:center">체험판이라 실제 결제 없이 바로 지급됩니다.</p>
        <div class="btn-row"><button class="btn gray" data-act="close">취소</button><button class="btn green" data-act="confirm-ok">구매</button></div>`,
      actions: {
        'confirm-ok': (app) => {
          app.closeModal();
          onOk();
          app.save();
          app.refresh();
        },
      },
    });
  }

  // ───────── 이벤트 ─────────

  private onClick(e: Event): void {
    const target = e.target as HTMLElement;
    const el = target.closest<HTMLElement>('[data-act]');
    if (!el || !this.root.contains(el)) return;
    const act = el.dataset.act!;
    if (!act) return;
    if (e.type === 'change' && el.tagName !== 'INPUT' && el.tagName !== 'SELECT') return;
    if (e.type === 'click' && (el.tagName === 'INPUT' || el.tagName === 'SELECT')) return;
    if (act === 'overlay' && target !== el) return;
    this.handle(act, el.dataset.arg ?? '', el);
  }

  handle(act: string, arg: string, el: HTMLElement): void {
    if (act === 'tab') {
      if (arg !== 'match') { setCrowd(0, 0); duckMusic(1); }
      this.tab = arg as TabId;
      this.render();
      // 자동 스카우트가 다른 탭에 있을 때 찾아 둔 선수가 있으면 경기 탭에서 보여준다
      if (this.tab === 'match') matchScreen.resumePending(this);
      return;
    }
    if (act === 'close' || act === 'overlay') {
      this.closeModal();
      return;
    }
    const modalAct = this.topModal()?.actions?.[act];
    const handler =
      modalAct ??
      SCREENS[this.tab].actions[act] ??
      this.extraActions[act] ??
      SHARED_ACTIONS[act] ??
      BM_ACTIONS[act] ??
      // 다른 탭에서 띄운 창의 버튼일 수도 있다 (예: 자동 스카우트 중 탭을 옮긴 경우)
      Object.values(SCREENS).find((s) => s.actions[act])?.actions[act];
    if (!handler) {
      console.warn('unknown action', act);
      return;
    }
    try {
      handler(this, arg, el);
    } catch (e) {
      this.reportError(e);
    }
    this.save();
    this.updateWallet();
  }

  private lastError = 0;

  /** 베타용: 오류를 화면에 짧게 보여주고, 닫을 수 없는 빈 창이 남지 않게 정리한다 */
  reportError(e: unknown): void {
    console.error(e);
    const now = Date.now();
    if (now - this.lastError < 3000) return;
    this.lastError = now;
    const msg = e instanceof Error ? e.message : String(e);
    this.toast(`⚠️ 오류: ${msg.slice(0, 60)}`);
  }

  registerActions(actions: Record<string, ActionHandler>): void {
    Object.assign(this.extraActions, actions);
  }

  // ───────── 루프 / 저장 ─────────

  tick(): void {
    const now = this.now();
    // 화면이 켜진 채로 시간이 크게 건너뛰었으면(노트북 덮개를 닫았다 연 경우 등) 돌아온 것으로 보고 정산한다
    if (now - this.game.state.lastActive > 60_000 && !this.game.state.champion) {
      const r = this.game.catchUp(now);
      if (this.tab === 'match') this.refresh();
      openOffline(this, r);
    }
    this.game.ensureDaily(now);
    const done = this.game.tickResearch(now);
    if (done) {
      this.toast('🔬 연구 완료!');
      if (this.tab === 'tactics') this.refresh();
    }
    matchScreen.lifecycle(this, now);
    if (this.tab === 'match') tickQuickBar(this, now);
    try {
      SCREENS[this.tab].tick?.(this, now);
    } catch (e) {
      this.reportError(e);
    }
    this.updateWallet();
    const m = this.topModal();
    if (m?.live) this.renderModal();
    this.game.state.lastActive = now;
    if (now - this.lastSave > 5000) this.save();
  }

  save(force = false): void {
    this.lastSave = this.now();
    saveLocal(this.game.state);
    backupSave(this.game.state, force);
    this.cloud.save(this.game.state, force);
  }

  /** 다른 기기의 저장이나 새 게임으로 상태를 통째로 바꾼다 */
  replaceState(state: GameState): void {
    while (this.hasModal()) this.closeModal();
    matchScreen.stopAuto();
    this.game.state = state;
    this.game.ensureDaily(this.now());
    this.game.tickResearch(this.now());
    this.render();
  }

  newGame(): void {
    clearLocal();
    this.replaceState(newGameState(this.now()));
    this.save(true);
  }
}

