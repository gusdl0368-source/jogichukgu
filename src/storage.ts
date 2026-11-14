import { SAVE_KEY, type GameState, deserialize, serialize } from './game/state';

// 저장은 두 곳에 한다.
// 1) 브라우저 localStorage: 항상, 즉시 (빠른 시작용 캐시)
// 2) claude.ai 아티팩트로 열었을 때만: 보는 사람 전용 db 문서 (기기를 바꿔도 이어하기)
// 2)가 안 되는 환경(로컬 개발, 로그인 안 함, 보기 전용 권한)에서는 1)만 쓴다.

interface DocRef {
  get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
  set(data: Record<string, unknown>): Promise<void>;
}
interface DbNs {
  doc(path: string): DocRef;
}
interface UserNs {
  id(): Promise<string | null>;
}
interface ClaudeHost {
  use(name: string): Promise<unknown>;
}

const CLOUD_MIN_INTERVAL_MS = 30_000;

export function loadLocal(): GameState | null {
  try {
    return deserialize(localStorage.getItem(SAVE_KEY));
  } catch {
    return null;
  }
}

export function saveLocal(state: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, serialize(state));
  } catch {
    // 시크릿 모드 등 저장소가 막힌 환경에서도 게임은 계속 돈다
  }
}

export function clearLocal(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // 무시
  }
}

/** 시간이 지나면 저절로 바뀌는 값은 빼고 비교한다 (안 바뀌었으면 쓰지 않으려고) */
function fingerprint(state: GameState): string {
  return serialize({ ...state, lastActive: 0 });
}

export class CloudSave {
  private ref: DocRef | null = null;
  private lastPrint = '';
  private lastWrite = 0;
  private writing = false;
  private disabled = false;
  private pending: GameState | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  get ready(): boolean {
    return !!this.ref && !this.disabled;
  }

  /** 클라우드 저장을 연결하고, 있으면 저장된 상태를 돌려준다 */
  async connect(): Promise<GameState | null> {
    const host = (window as unknown as { claude?: ClaudeHost }).claude;
    if (!host?.use) return null;
    try {
      const [db, user] = (await Promise.all([host.use('db'), host.use('user')])) as [DbNs | null, UserNs | null];
      if (!db || !user) return null;
      const id = await user.id();
      if (!id) return null;
      this.ref = db.doc(`data/users/${id}/save`);
      const snap = await withTimeout(this.ref.get(), 10_000);
      const body = snap?.exists ? snap.data() : undefined;
      const state = typeof body?.json === 'string' ? deserialize(body.json) : null;
      if (state) this.lastPrint = fingerprint(state);
      return state;
    } catch {
      this.ref = null;
      return null;
    }
  }

  /** 바뀐 게 있으면 저장한다. 30초에 한 번까지만 쓴다. force면 바로 */
  save(state: GameState, force = false): void {
    if (!this.ready) return;
    this.pending = state;
    const wait = force ? 0 : Math.max(0, this.lastWrite + CLOUD_MIN_INTERVAL_MS - Date.now());
    if (this.timer) {
      if (!force) return;
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, wait);
  }

  private async flush(): Promise<void> {
    const state = this.pending;
    if (!state || !this.ref || this.writing) return;
    const print = fingerprint(state);
    if (print === this.lastPrint) return;
    this.writing = true;
    try {
      await this.ref.set({ json: serialize(state), savedAt: Date.now() });
      this.lastPrint = print;
      this.lastWrite = Date.now();
    } catch (e) {
      // 보기 전용 권한 등으로 거절되면 이번 방문 동안은 브라우저 저장만 쓴다
      const code = (e as { code?: string })?.code;
      if (code !== 'unavailable' && code !== 'resource_exhausted') this.disabled = true;
    } finally {
      this.writing = false;
    }
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}
