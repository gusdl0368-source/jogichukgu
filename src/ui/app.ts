import { Game } from '../game/game';
import { SAVE_KEY, serialize } from '../game/state';
import { esc, fmt } from './dom';
import { PitchView } from './pitch';
import * as matchScreen from './screens/match';
import * as storeScreen from './screens/store';
import * as tacticsScreen from './screens/tactics';
import * as tournamentScreen from './screens/tournament';
import * as trainingScreen from './screens/training';
import { SHARED_ACTIONS } from './shared';

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
  /** false면 바깥을 눌러도 안 닫힌다 */
  dismissable?: boolean;
  onClose?: () => void;
  actions?: Record<string, ActionHandler>;
}

export class App {
  tab: TabId = 'match';
  readonly pitch = new PitchView();
  /** 탭 안의 하위 화면 상태(예: 전술 탭의 스킬/전술) */
  sub: Record<string, string> = {};
  private modalStack: ModalState[] = [];
  private lastModalHtml = '';
  private lastSave = 0;
  private extraActions: Record<string, ActionHandler> = {};

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
    SCREENS[this.tab].mounted?.(this);
    this.lastModalHtml = '';
    this.renderModal();
  }

  /** 현재 탭 내용만 다시 그린다 (스크롤 위치 유지) */
  refresh(): void {
    const content = this.root.querySelector<HTMLElement>('#content');
    if (!content) return this.render();
    const scroll = content.scrollTop;
    const top = this.root.querySelector('.topbar');
    if (top) top.outerHTML = this.renderTopbar();
    content.innerHTML = SCREENS[this.tab].render(this);
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

  private renderTopbar(): string {
    const s = this.state;
    const w = s.wallet;
    return `<header class="topbar">
      <div class="season">시즌 ${s.league.season} · ${Math.min(s.league.round + 1, 9)}주차<small>${esc(s.teamName)}</small></div>
      <span class="chip" id="w-cash">💵 ${fmt(w.cash)}</span>
      <span class="chip" id="w-contacts">📞 ${fmt(w.contacts)}</span>
      <span class="chip" id="w-gems">💎 ${fmt(w.gems)}</span>
      <button class="icon-btn" data-act="settings">⚙️</button>
    </header>`;
  }

  updateWallet(): void {
    const w = this.state.wallet;
    const set = (id: string, v: string) => {
      const el = this.root.querySelector(`#${id}`);
      if (el && el.textContent !== v) el.textContent = v;
    };
    set('w-cash', `💵 ${fmt(w.cash)}`);
    set('w-contacts', `📞 ${fmt(w.contacts)}`);
    set('w-gems', `💎 ${fmt(w.gems)}`);
  }

  tabHasDot(id: TabId): boolean {
    const g = this.game;
    const now = this.now();
    switch (id) {
      case 'tournament':
        return g.tournamentTicketsLeft() > 0 || !!g.state.tournament.pendingReward;
      case 'training':
        return trainingScreen.anyEntries(g);
      case 'tactics':
        return !g.state.research.active || Object.keys(g.state.skills.owned).some((k) => g.canUpgradeSkill(k)) || g.state.wallet.whistles >= 200;
      case 'store':
        return !g.state.daily.freeGems || (g.isMember(now) && !g.state.daily.membershipClaimed);
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

  renderModal(force = false): void {
    const root = this.root.querySelector('#modal-root');
    if (!root) return;
    const m = this.topModal();
    const html = m
      ? `<div class="overlay" data-act="${m.dismissable ? 'overlay' : ''}"><div class="modal">${m.dismissable ? '<button class="close-x" data-act="close">✕</button>' : ''}${m.render()}</div></div>`
      : '';
    if (!force && html === this.lastModalHtml) return;
    const prevScroll = root.querySelector('.modal')?.scrollTop ?? 0;
    root.innerHTML = html;
    const modal = root.querySelector('.modal');
    if (modal) modal.scrollTop = prevScroll;
    this.lastModalHtml = html;
  }

  toast(msg: string): void {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    this.root.appendChild(el);
    setTimeout(() => el.remove(), 1900);
  }

  /** 가짜 광고: 잠깐 화면을 덮었다가 보상 콜백 */
  playAd(onDone: () => void): void {
    const el = document.createElement('div');
    el.className = 'overlay';
    el.style.zIndex = '90';
    el.innerHTML = `<div class="modal" style="text-align:center"><h2>📺 광고 재생 중…</h2><p class="muted">프로토타입이라 실제 광고 대신 잠깐 기다립니다.</p><div class="progress"><i id="ad-bar" style="width:0%;transition:width 1.4s linear"></i></div></div>`;
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
        <p class="muted" style="text-align:center">프로토타입이라 실제 결제 없이 바로 지급됩니다.</p>
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
      this.tab = arg as TabId;
      this.render();
      return;
    }
    if (act === 'close' || act === 'overlay') {
      this.closeModal();
      return;
    }
    const modalAct = this.topModal()?.actions?.[act];
    const handler = modalAct ?? SCREENS[this.tab].actions[act] ?? this.extraActions[act] ?? SHARED_ACTIONS[act];
    if (!handler) {
      console.warn('unknown action', act);
      return;
    }
    handler(this, arg, el);
    this.save();
    this.updateWallet();
  }

  registerActions(actions: Record<string, ActionHandler>): void {
    Object.assign(this.extraActions, actions);
  }

  // ───────── 루프 / 저장 ─────────

  tick(): void {
    const now = this.now();
    this.game.ensureDaily(now);
    const done = this.game.tickResearch(now);
    if (done) {
      this.toast('🔬 연구 완료!');
      if (this.tab === 'tactics') this.refresh();
    }
    matchScreen.lifecycle(this, now);
    SCREENS[this.tab].tick?.(this, now);
    this.updateWallet();
    const m = this.topModal();
    if (m?.live) this.renderModal();
    this.game.state.lastActive = now;
    if (now - this.lastSave > 5000) this.save();
  }

  save(): void {
    this.lastSave = this.now();
    try {
      localStorage.setItem(SAVE_KEY, serialize(this.game.state));
    } catch {
      // 저장소가 막힌 환경(시크릿 모드 등)에서도 게임은 계속 돈다
    }
  }
}

