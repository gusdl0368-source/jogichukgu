import { Game } from './game/game';
import { newGameState } from './game/state';
import { loadBackup, loadLocal } from './storage';
import { App } from './ui/app';
import * as matchScreen from './ui/screens/match';
import { connectCloud, openEnding, openOffline, openTutorial } from './ui/shared';
import { setCrowd, setMusicEnabled, setSoundEnabled, setVibrateEnabled, updateMusic } from './ui/sound';
import { startupPopups } from './ui/bm';
import { showTitle } from './ui/title';
import { watchSmallWindow } from './ui/smallWindow';

async function boot(): Promise<void> {
  // localStorage가 비었으면(다른 게임이 지웠거나 새 기기) IndexedDB 백업에서 되살린다
  const local = loadLocal();
  const restored = local ? null : await loadBackup();
  const game = new Game(local ?? restored ?? newGameState(Date.now()));
  const now = Date.now();
  game.ensureDaily(now);
  game.tickResearch(now);
  const report = game.catchUp(now);

  setSoundEnabled(() => game.state.settings.sound);
  setMusicEnabled(() => game.state.settings.music !== false);
  setVibrateEnabled(() => game.state.settings.vibrate !== false);
  const app = new App(document.getElementById('app')!, game);
  app.render();
  app.save();
  watchSmallWindow();

  showTitle(() => {
    if (restored) app.toast('💾 지워진 저장을 백업에서 되살렸어요');
    // 창은 나중에 연 것이 위에 뜬다: 출석·특가는 맨 밑, 그 위에 "다시 오셨네요", 맨 위에 보던 스카우트 비교
    startupPopups(app);
    if (!game.state.seenTutorial) openTutorial(app);
    else if (game.state.champion) openEnding(app);
    else openOffline(app, report);
    matchScreen.resumePending(app);
  });

  // claude.ai에서 열렸고 이미 계정 저장을 허락했으면 이어서 쓴다 (처음엔 설정에서 직접 켠다)
  void connectCloud(app, false);

  setInterval(() => app.tick(), 250);

  function frame(t: number): void {
    matchScreen.draw(app, t);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      app.save(true);
      setCrowd(0, 0);
      updateMusic();
    }
    else {
      updateMusic();
      // 돌아오면 그동안 끝난 경기를 처리
      const r = game.catchUp(Date.now());
      if (r.matches.length) {
        app.refresh();
        openOffline(app, r);
      }
    }
  });
  window.addEventListener('pagehide', () => app.save(true));

  // 베타: 예상 못 한 오류는 화면에 짧게 보여준다 (멈춘 것처럼 보이지 않게, 제보할 수 있게)
  window.addEventListener('error', (e) => app.reportError(e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => app.reportError(e.reason));

  // 개발 중 콘솔에서 상태를 볼 수 있게
  (window as unknown as { game: Game }).game = game;
}

void boot();
