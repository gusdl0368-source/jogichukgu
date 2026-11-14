import { Game } from './game/game';
import { SAVE_KEY, deserialize, newGameState } from './game/state';
import { App } from './ui/app';
import * as matchScreen from './ui/screens/match';
import { openEnding, openOffline, openTutorial } from './ui/shared';

function load(): Game {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch {
    // 저장소를 못 쓰는 환경: 새 게임
  }
  const state = deserialize(raw) ?? newGameState(Date.now());
  return new Game(state);
}

const game = load();
const now = Date.now();
game.ensureDaily(now);
game.tickResearch(now);
const report = game.catchUp(now);

const app = new App(document.getElementById('app')!, game);
app.render();
app.save();

if (!game.state.seenTutorial) openTutorial(app);
else if (game.state.champion) openEnding(app);
else openOffline(app, report);
matchScreen.resumePending(app);

setInterval(() => app.tick(), 250);

function frame(t: number): void {
  matchScreen.draw(app, t);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') app.save();
  else {
    // 돌아오면 그동안 끝난 경기를 처리
    const r = game.catchUp(Date.now());
    if (r.matches.length) {
      app.refresh();
      openOffline(app, r);
    }
  }
});
window.addEventListener('pagehide', () => app.save());

// 개발 중 콘솔에서 상태를 볼 수 있게
(window as unknown as { game: Game }).game = game;
