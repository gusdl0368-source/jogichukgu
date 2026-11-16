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
interface PermissionsNs {
  state(): Promise<Record<string, string>>;
}
interface ClaudeHost {
  use(name: string): Promise<unknown>;
}

export type CloudStatus = 'off' | 'on' | 'unavailable';

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
  void idb('readwrite', (st) => st.delete(SAVE_KEY));
}

// ───────── 백업: IndexedDB ─────────
// 게임 모음 사이트처럼 여러 게임이 한 주소를 같이 쓰면, 다른 게임이 localStorage를 통째로 비울 수 있다.
// 그래서 IndexedDB에 한 벌 더 저장해 두고, localStorage가 비어 있으면 여기서 되살린다.

const BACKUP_DB = 'jogichukgu';
const BACKUP_STORE = 'save';
const BACKUP_MIN_INTERVAL_MS = 20_000;
let lastBackup = 0;

function idb<T>(mode: IDBTransactionMode, run: (st: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open(BACKUP_DB, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(BACKUP_STORE);
      open.onerror = () => resolve(undefined);
      open.onsuccess = () => {
        try {
          const db = open.result;
          const req = run(db.transaction(BACKUP_STORE, mode).objectStore(BACKUP_STORE));
          req.onsuccess = () => {
            resolve(req.result);
            db.close();
          };
          req.onerror = () => {
            resolve(undefined);
            db.close();
          };
        } catch {
          resolve(undefined);
        }
      };
    } catch {
      resolve(undefined);
    }
  });
}

export function backupSave(state: GameState, force = false): void {
  const now = Date.now();
  if (!force && now - lastBackup < BACKUP_MIN_INTERVAL_MS) return;
  lastBackup = now;
  const data = serialize(state);
  void idb('readwrite', (st) => st.put(data, SAVE_KEY));
}

/** 백업을 읽는다. 오래 걸리면(막힌 환경) 포기하고 null */
export function loadBackup(timeoutMs = 800): Promise<GameState | null> {
  const read = idb<unknown>('readonly', (st) => st.get(SAVE_KEY)).then((v) =>
    typeof v === 'string' ? deserialize(v) : null,
  );
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), timeoutMs));
  return Promise.race([read, timeout]).catch(() => null);
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

  status: CloudStatus = 'off';

  get ready(): boolean {
    return !!this.ref && !this.disabled;
  }

  /**
   * 클라우드 저장을 연결하고, 있으면 저장된 상태를 돌려준다.
   * ask가 false면(페이지를 열 때) 이미 허락받은 경우에만 연결한다.
   * 권한 확인 창은 사용자가 '계정 저장 켜기'를 눌렀을 때만 뜨게 한다.
   */
  async connect(ask: boolean): Promise<GameState | null> {
    const host = (window as unknown as { claude?: ClaudeHost }).claude;
    if (!host?.use) {
      this.status = 'unavailable';
      return null;
    }
    try {
      if (!ask) {
        const perms = (await withTimeout(host.use('permissions'), 10_000)) as PermissionsNs | null;
        const states = perms ? await withTimeout(perms.state(), 5_000) : null;
        if (!states || !('db' in states)) {
          this.status = 'unavailable';
          return null;
        }
        if (states.db !== 'granted' || (states.user && states.user !== 'granted')) {
          this.status = 'off';
          return null;
        }
      }
      const [db, user] = (await Promise.all([host.use('db'), host.use('user')])) as [DbNs | null, UserNs | null];
      if (!db || !user) {
        this.status = 'unavailable';
        return null;
      }
      const id = await user.id();
      if (!id) {
        this.status = 'unavailable';
        return null;
      }
      this.ref = db.doc(`data/users/${id}/save`);
      this.status = 'on';
      const snap = await withTimeout(this.ref.get(), 10_000);
      const body = snap?.exists ? snap.data() : undefined;
      const state = typeof body?.json === 'string' ? deserialize(body.json) : null;
      if (state) this.lastPrint = fingerprint(state);
      return state;
    } catch {
      this.ref = null;
      this.status = 'unavailable';
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
      if (code !== 'unavailable' && code !== 'resource_exhausted') {
        this.disabled = true;
        this.status = 'unavailable';
      }
    } finally {
      this.writing = false;
    }
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}
