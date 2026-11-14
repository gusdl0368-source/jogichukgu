import type { Avatar } from '../game/types';

// 16x16 픽셀 얼굴을 그려서 dataURL로 캐시한다. 외부 이미지 없이 선수마다 다른 얼굴.

const SKIN = ['#f6d3b3', '#e8b98f', '#c98f62', '#a06a42', '#6e4528'];
const HAIR = ['#1b1b1b', '#3b2416', '#6b4423', '#a8742f', '#d9b25a', '#8c8c8c', '#e8e8e8'];
const SHIRT = '#2f6fed';
const SHIRT_DARK = '#1f4fb8';

const cache = new Map<string, string>();

export function avatarUrl(a: Avatar): string {
  const key = `${a.skin}-${a.hair}-${a.hairStyle}-${a.beard}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const g = c.getContext('2d')!;
  const px = (x: number, y: number, w: number, h: number, color: string) => {
    g.fillStyle = color;
    g.fillRect(x, y, w, h);
  };
  const skin = SKIN[a.skin];
  const hair = HAIR[a.hair];

  // 어깨와 유니폼
  px(2, 13, 12, 3, SHIRT);
  px(3, 12, 10, 1, SHIRT);
  px(6, 12, 4, 2, '#ffffff');
  px(7, 12, 2, 1, skin);
  px(2, 15, 12, 1, SHIRT_DARK);
  // 목
  px(6, 11, 4, 1, skin);
  // 얼굴
  px(4, 3, 8, 8, skin);
  px(3, 5, 1, 3, skin);
  px(12, 5, 1, 3, skin);
  // 눈, 눈썹, 입
  px(5, 6, 2, 1, '#ffffff');
  px(9, 6, 2, 1, '#ffffff');
  px(6, 6, 1, 1, '#1b1b1b');
  px(9, 6, 1, 1, '#1b1b1b');
  px(5, 5, 2, 1, hair);
  px(9, 5, 2, 1, hair);
  px(7, 8, 2, 1, shade(skin));
  px(6, 9, 4, 1, '#9b4b44');

  // 머리 모양
  switch (a.hairStyle) {
    case 0: // 짧은 머리
      px(4, 2, 8, 2, hair);
      px(3, 3, 1, 2, hair);
      px(12, 3, 1, 2, hair);
      break;
    case 1: // 스포츠머리
      px(4, 2, 8, 1, hair);
      px(4, 3, 8, 1, shade(hair));
      break;
    case 2: // 곱슬
      px(3, 1, 10, 3, hair);
      px(2, 2, 1, 4, hair);
      px(13, 2, 1, 4, hair);
      px(4, 1, 1, 1, shade(hair));
      px(8, 1, 1, 1, shade(hair));
      break;
    case 3: // 대머리 (옆머리만)
      px(3, 5, 1, 2, hair);
      px(12, 5, 1, 2, hair);
      px(5, 3, 2, 1, '#ffffff33');
      break;
    case 4: // 장발
      px(3, 1, 10, 3, hair);
      px(2, 3, 2, 7, hair);
      px(12, 3, 2, 7, hair);
      break;
    default: // 가르마
      px(4, 2, 8, 2, hair);
      px(3, 3, 2, 3, hair);
      px(8, 2, 1, 1, shade(hair));
      break;
  }

  if (a.beard === 1) {
    px(4, 9, 8, 2, hair);
    px(6, 9, 4, 1, '#9b4b44');
  } else if (a.beard === 2) {
    px(5, 8, 6, 1, hair);
  }

  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

function shade(hex: string): string {
  const n = parseInt(hex.slice(1, 7), 16);
  const r = Math.max(0, ((n >> 16) & 255) - 40);
  const g = Math.max(0, ((n >> 8) & 255) - 40);
  const b = Math.max(0, (n & 255) - 40);
  return `rgb(${r},${g},${b})`;
}
