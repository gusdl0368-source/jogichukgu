// 다른 사이트 안에 아주 작게 끼워져서(예: 게임 모음 사이트의 미리보기 창) 화면이 다 안 보일 때
// 전체 화면이나 큰 창으로 열도록 안내한다. "이대로 하기"를 누르면 이번 접속 동안은 다시 띄우지 않는다.

const MIN_H = 340;
const MIN_W = 280;
const SKIP_KEY = 'jogichukgu-small-ok';

function skipped(): boolean {
  try {
    return sessionStorage.getItem(SKIP_KEY) === '1';
  } catch {
    return false;
  }
}

export function watchSmallWindow(): void {
  const el = document.createElement('div');
  el.className = 'small-window';
  const canFull = !!document.fullscreenEnabled && !!document.documentElement.requestFullscreen;
  el.innerHTML = `
    <b>⚽ 화면이 조금 작아요</b>
    <p>${canFull ? '전체 화면으로 하면 경기장이 잘 보여요.' : '창을 크게 하거나 새 창으로 열면 경기장이 잘 보여요.'}</p>
    <div class="row">
      ${canFull ? '<button data-sw="full">전체 화면으로</button>' : ''}
      <button class="ghost" data-sw="skip">이대로 하기</button>
    </div>`;
  document.body.appendChild(el);

  const update = (): void => {
    const small = (window.innerHeight < MIN_H || window.innerWidth < MIN_W) && !skipped() && !document.fullscreenElement;
    el.classList.toggle('show', small);
  };
  el.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-sw]')?.dataset.sw;
    if (act === 'full') {
      document.documentElement.requestFullscreen().catch(() => {
        el.querySelector('p')!.textContent = '전체 화면이 막혀 있어요. 창을 크게 하거나 새 창으로 열어 주세요.';
      });
    } else if (act === 'skip') {
      try {
        sessionStorage.setItem(SKIP_KEY, '1');
      } catch {
        /* 저장이 막혀도 이번 화면에서는 닫는다 */
      }
      el.classList.remove('show');
      return;
    }
    update();
  });
  window.addEventListener('resize', update);
  document.addEventListener('fullscreenchange', update);
  update();
}
