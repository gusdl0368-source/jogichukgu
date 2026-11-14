import { Game } from './game/game';
import { newGameState } from './game/state';
import { loadLocal } from './storage';
import { App } from './ui/app';
import * as matchScreen from './ui/screens/match';
import { openEnding, openOffline, openTutorial } from './ui/shared';
import { setSoundEnabled } from './ui/sound';

const game = new Game(loadLocal() ?? newGameState(Date.now()));
const now = Date.now();
game.ensureDaily(now);
game.tickResearch(now);
const report = game.catchUp(now);

setSoundEnabled(() => game.state.settings.sound);
const app = new App(document.getElementById('app')!, game);
app.render();
app.save();

if (!game.state.seenTutorial) openTutorial(app);
else if (game.state.champion) openEnding(app);
else openOffline(app, report);
matchScreen.resumePending(app);

// claude.ai에서 열렸으면 내 계정 저장을 불러온다. 이 기기 것보다 새로우면 그걸로 이어한다.
void app.cloud.connect().then((remote) => {
  if (remote && remote.lastActive > game.state.lastActive + 1000) {
    app.replaceState(remote);
    const r = game.catchUp(Date.now());
    app.refresh();
    if (game.state.champion) openEnding(app);
    else openOffline(app, r);
    matchScreen.resumePending(app);
    app.toast('☁️ 저장된 진행을 불러왔어요');
  }
  app.save(true);
});

setInterval(() => app.tick(), 250);

function frame(t: number): void {
  matchScreen.draw(app, t);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') app.save(true);
  else {
    // 돌아오면 그동안 끝난 경기를 처리
    const r = game.catchUp(Date.now());
    if (r.matches.length) {
      app.refresh();
      openOffline(app, r);
    }
  }
});
window.addEventListener('pagehide', () => app.save(true));

// 개발 중 콘솔에서 상태를 볼 수 있게
(window as unknown as { game: Game }).game = game;
