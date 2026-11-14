import type { Avatar } from '../game/types';

// 20x20 픽셀 초상화를 그려서 dataURL로 캐시한다. 외부 이미지 없이 선수마다 다른 얼굴.
// 왼쪽 위에서 빛이 온다고 보고 오른쪽과 턱 아래에 그림자를 넣는다.

export const SKIN = ['#f7d7b8', '#ecbf96', '#d39a6a', '#a8714a', '#6f472c'];
export const HAIR = ['#1c1a1f', '#3e2618', '#6e4524', '#b07a35', '#e2bf68', '#8f8f96', '#ececec'];
const ACC = ['', '#ffffff', '#e5484d', '#f5b81c'];
export const KIT = { main: '#2f6fed', dark: '#1f4fb8', light: '#5b8ff5', trim: '#ffffff' };

const cache = new Map<string, string>();

type KitColors = { main: string; dark: string; light: string; trim: string };
let currentKit: KitColors = KIT;

/** 구단 유니폼을 바꾸면 모든 초상화에 반영된다 */
export function setCurrentKit(k: KitColors): void {
  currentKit = k;
}

export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + amt)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/** 예전 저장에 없는 얼굴 정보는 다른 값에서 정해지게 한다 (같은 선수는 늘 같은 얼굴) */
function extra(a: Avatar): { brow: number; mouth: number; acc: number } {
  const h = a.skin * 7 + a.hair * 13 + a.hairStyle * 17 + a.beard * 23;
  return { brow: a.brow ?? h % 3, mouth: a.mouth ?? (h >> 2) % 4, acc: a.acc ?? 0 };
}

export function avatarUrl(a: Avatar, kit: KitColors = currentKit): string {
  const key = `${a.skin}-${a.hair}-${a.hairStyle}-${a.beard}-${a.brow}-${a.mouth}-${a.acc}-${kit.main}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 20;
  c.height = 20;
  const g = c.getContext('2d')!;
  drawAvatar(g, a, kit);
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

export function drawAvatar(g: CanvasRenderingContext2D, a: Avatar, kit: KitColors = KIT): void {
  const r = (x: number, y: number, w: number, h: number, color: string) => {
    g.fillStyle = color;
    g.fillRect(x, y, w, h);
  };
  const { brow, mouth, acc } = extra(a);
  const skin = SKIN[a.skin] ?? SKIN[0];
  const skinD = shade(skin, -38);
  const skinDD = shade(skin, -70);
  const line = shade(skin, -110);
  const hair = HAIR[a.hair] ?? HAIR[0];
  const hairD = shade(hair, -40);
  const hairL = shade(hair, 45);

  // 유니폼과 어깨
  r(1, 16, 18, 4, kit.main);
  r(3, 15, 14, 1, kit.main);
  r(1, 16, 2, 4, kit.dark);
  r(17, 16, 2, 4, kit.dark);
  r(4, 17, 3, 1, kit.light);
  r(0, 17, 1, 3, line);
  r(19, 17, 1, 3, line);
  r(2, 15, 1, 1, line);
  r(17, 15, 1, 1, line);
  r(3, 14, 14, 1, line);
  // 목과 깃
  r(7, 12, 6, 4, skin);
  r(7, 12, 6, 1, skinDD);
  r(12, 13, 1, 3, skinD);
  r(7, 15, 1, 2, kit.trim);
  r(12, 15, 1, 2, kit.trim);
  r(8, 16, 1, 1, kit.trim);
  r(11, 16, 1, 1, kit.trim);
  r(9, 17, 2, 1, kit.trim);
  r(8, 15, 4, 1, skin);
  r(9, 16, 2, 1, skin);

  // 긴 머리는 얼굴 뒤로
  if (a.hairStyle === 4) {
    r(3, 4, 14, 11, hairD);
    r(4, 4, 12, 10, hair);
  }

  // 얼굴 외곽선과 피부
  r(5, 2, 10, 1, line);
  r(4, 3, 1, 10, line);
  r(15, 3, 1, 10, line);
  r(5, 13, 10, 1, line);
  r(5, 3, 10, 10, skin);
  // 귀
  r(3, 7, 1, 3, line);
  r(16, 7, 1, 3, line);
  r(4, 7, 1, 3, skin);
  r(15, 7, 1, 3, skinD);
  // 그림자 (오른쪽, 턱)
  r(13, 4, 2, 9, skinD);
  r(5, 12, 10, 1, skinD);
  r(14, 12, 1, 1, skinDD);
  r(6, 4, 1, 2, shade(skin, 22));

  // 눈썹
  const browC = a.hairStyle === 3 && a.hair >= 5 ? hairD : hairD;
  if (brow === 0) {
    r(6, 6, 3, 1, browC);
    r(11, 6, 3, 1, browC);
  } else if (brow === 1) {
    r(6, 5, 3, 2, browC);
    r(11, 5, 3, 2, browC);
  } else {
    r(6, 6, 2, 1, browC);
    r(8, 7, 1, 1, browC);
    r(12, 6, 2, 1, browC);
    r(11, 7, 1, 1, browC);
  }
  // 눈
  r(6, 8, 2, 1, '#ffffff');
  r(11, 8, 2, 1, '#ffffff');
  r(7, 8, 1, 1, '#1b1b22');
  r(11, 8, 1, 1, '#1b1b22');
  r(6, 7, 2, 1, brow === 2 ? skin : skin);
  // 코
  r(9, 9, 2, 1, skinD);
  r(10, 10, 1, 1, skinDD);
  // 입
  const lip = '#8a3434';
  if (mouth === 0) r(8, 11, 4, 1, lip);
  else if (mouth === 1) {
    r(8, 11, 4, 1, lip);
    r(7, 10, 1, 1, lip);
    r(12, 10, 1, 1, lip);
  } else if (mouth === 2) {
    r(8, 11, 4, 1, '#ffffff');
    r(8, 12, 4, 1, lip);
  } else {
    r(9, 11, 2, 1, lip);
  }

  // 수염
  if (a.beard === 1) {
    for (let x = 6; x <= 13; x += 2) r(x, 12, 1, 1, skinDD);
    for (let x = 7; x <= 12; x += 2) r(x, 11, 1, 1, skinDD);
  } else if (a.beard === 2) {
    r(5, 10, 10, 3, hair);
    r(5, 13, 10, 1, hairD);
    r(8, 11, 4, 1, lip);
    r(13, 10, 2, 3, hairD);
  } else if (a.beard === 3) {
    r(8, 10, 4, 1, hair);
    r(7, 10, 1, 1, hairD);
    r(12, 10, 1, 1, hairD);
  } else if (a.beard === 4) {
    r(8, 12, 4, 2, hair);
    r(9, 14, 2, 1, hairD);
  }

  // 머리 모양
  switch (a.hairStyle) {
    case 0: // 짧은 머리
      r(5, 1, 10, 1, hairD);
      r(4, 2, 12, 3, hair);
      r(4, 5, 1, 2, hair);
      r(15, 5, 1, 2, hairD);
      r(6, 2, 3, 1, hairL);
      break;
    case 1: // 스포츠머리
      r(5, 2, 10, 1, hairD);
      r(5, 3, 10, 1, shade(hair, 15));
      r(5, 4, 1, 2, hairD);
      r(14, 4, 1, 2, hairD);
      break;
    case 2: // 가르마 + 앞머리
      r(5, 1, 10, 1, hairD);
      r(4, 2, 12, 3, hair);
      r(4, 5, 5, 1, hair);
      r(4, 5, 1, 3, hair);
      r(15, 4, 1, 3, hairD);
      r(10, 2, 1, 2, hairD);
      r(5, 2, 3, 1, hairL);
      break;
    case 3: // 대머리 (옆머리만)
      r(4, 6, 1, 3, hair);
      r(15, 6, 1, 3, hairD);
      r(7, 3, 2, 1, shade(skin, 40));
      break;
    case 4: // 장발
      r(5, 1, 10, 1, hairD);
      r(4, 2, 12, 3, hair);
      r(4, 5, 2, 8, hair);
      r(14, 5, 2, 8, hairD);
      r(6, 2, 3, 1, hairL);
      break;
    case 5: // 곱슬/아프로
      r(4, 0, 12, 1, hairD);
      r(3, 1, 14, 5, hair);
      r(2, 2, 1, 5, hairD);
      r(17, 2, 1, 5, hairD);
      r(3, 6, 1, 2, hair);
      r(16, 6, 1, 2, hairD);
      for (const [x, y] of [[5, 2], [8, 1], [11, 3], [14, 2], [6, 4], [13, 4]]) r(x, y, 1, 1, hairL);
      for (const [x, y] of [[4, 3], [10, 2], [15, 4], [7, 3]]) r(x, y, 1, 1, hairD);
      break;
    case 6: // 모히칸
      r(5, 3, 10, 1, shade(skin, -20));
      r(8, 0, 4, 4, hair);
      r(8, 0, 4, 1, hairD);
      r(9, 1, 1, 2, hairL);
      break;
    case 7: // 삐죽 머리
      r(4, 2, 12, 3, hair);
      for (let x = 4; x <= 14; x += 2) r(x, 1, 1, 1, hair);
      for (let x = 5; x <= 15; x += 2) r(x, 0, 1, 2, hairD);
      r(4, 5, 1, 2, hair);
      r(15, 5, 1, 2, hairD);
      r(6, 3, 2, 1, hairL);
      break;
    case 8: // 묶은 머리 (똥머리)
      r(5, 1, 10, 1, hairD);
      r(4, 2, 12, 3, hair);
      r(8, -1, 4, 2, hair);
      r(8, 0, 4, 1, hairD);
      r(4, 5, 1, 2, hair);
      r(15, 5, 1, 2, hairD);
      break;
    default: // 바가지 머리
      r(5, 1, 10, 1, hairD);
      r(4, 2, 12, 4, hair);
      r(4, 6, 1, 2, hair);
      r(15, 6, 1, 2, hairD);
      r(4, 5, 12, 1, hairD);
      r(6, 2, 4, 1, hairL);
      break;
  }

  // 헤어밴드
  if (acc > 0) {
    r(4, 4, 12, 1, ACC[acc]);
    r(15, 4, 1, 1, shade(ACC[acc], -60));
  }
}
