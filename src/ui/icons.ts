import type { Currency } from '../game/types';

// 손으로 찍은 픽셀 아이콘. 문자 한 칸 = 픽셀 하나, '.'은 투명.

interface Sprite {
  rows: string[];
  pal: Record<string, string>;
}

const SPRITES: Record<string, Sprite> = {
  cash: {
    pal: { k: '#173b20', g: '#49c35a', G: '#2f8f3e', l: '#9be6a3', w: '#ffffff' },
    rows: [
      '............',
      '............',
      'kkkkkkkkkkkk',
      'kgggggggggGk',
      'kglllgglllGk',
      'kgllwwwwllGk',
      'kglwwggwwlGk',
      'kgllwwwwllGk',
      'kglllgglllGk',
      'kgggggggggGk',
      'kkkkkkkkkkkk',
      '............',
    ],
  },
  contacts: {
    pal: { k: '#1b2a4a', b: '#8fc1ff', B: '#3a7be6' },
    rows: [
      '............',
      '..kkk.......',
      '.kbbbk......',
      '.kbBbk......',
      '..kbbk......',
      '...kbk......',
      '...kbbk.....',
      '....kbbk.kk.',
      '.....kbbkbbk',
      '......kbbBbk',
      '.......kbbk.',
      '........kk..',
    ],
  },
  gems: {
    pal: { k: '#2a1550', K: '#2a1550', p: '#a066ff', P: '#6a35c9' },
    rows: [
      '....kkkk....',
      '..kkppppkk..',
      '.kppPPPPppk.',
      '.kpPkkkPPpk.',
      'kppPkKkPPppk',
      'kpppkkkpppPk',
      'kPPpppppPPpk',
      'kpPPpkkpPppk',
      '.kpppkKkppk.',
      '.kPpppkpPPk.',
      '..kkppppkk..',
      '....kkkk....',
    ],
  },
  boards: {
    pal: { k: '#2b1a0c', n: '#a8723a', w: '#f4f6fb', b: '#3a7be6', s: '#c9d1e3' },
    rows: [
      '....kkkk....',
      '.kkksssskkk.',
      '.knnkkkknnk.',
      '.knwwwwwwnk.',
      '.knwbbbbwnk.',
      '.knwwwwwwnk.',
      '.knwbbbwwnk.',
      '.knwwwwwwnk.',
      '.knwbbbbwnk.',
      '.knwwwwwwnk.',
      '.knnnnnnnnk.',
      '.kkkkkkkkkk.',
    ],
  },
  whistles: {
    pal: { k: '#1d2433', s: '#d6dce8', S: '#8f99ad', r: '#e5484d' },
    rows: [
      '............',
      'rr..........',
      '..r.........',
      '...rkkkkkk..',
      '...kssssssk.',
      '..ksSsssssk.',
      '.ksSSsskkkk.',
      '.ksSSssk....',
      '.ksSSssk....',
      '..kssSk.....',
      '...kkk......',
      '............',
    ],
  },
  trophy: {
    pal: { k: '#3d2600', y: '#f5b81c', Y: '#c98a0b', l: '#ffe28a' },
    rows: [
      '..kkkkkkkkkk..',
      'kkkylyyyyyYkkk',
      'kyklyyyyyyYkyk',
      'kyklyyyyyyYkyk',
      '.kklyyyyyyYkk.',
      '...klyyyyYk...',
      '....kyyyYk....',
      '.....kyYk.....',
      '.....kyYk.....',
      '....kkyYkk....',
      '...kyyyyYYk...',
      '...kkkkkkkk...',
    ],
  },
  boot: {
    pal: { k: '#13234a', b: '#3a7be6', B: '#1f4fb8', w: '#ffffff' },
    rows: [
      '..............',
      '..kkkk........',
      '..kbbk........',
      '..kbwk........',
      '..kbbk........',
      '..kbwkkkk.....',
      '..kbbbbbbkk...',
      '.kbwbwbbbbbkk.',
      '.kbbbbbbbbbbbk',
      '.kBBBBBBBBBBBk',
      '..kwkkwkkwkkk.',
      '..............',
    ],
  },
  ball: {
    pal: { k: '#1b1f2a', w: '#ffffff' },
    rows: [
      '...kkkkkk...',
      '..kwwkkwwk..',
      '.kwwkkkkwwk.',
      'kwwwkkkkwwwk',
      'kwwwwkkwwwwk',
      'kkwwwwwwwwkk',
      'kkkwwwwwwkkk',
      'kwkkwwwwkkwk',
      'kwwkkwwkkwwk',
      '.kwwwkkwwwk.',
      '..kwwwwwwk..',
      '...kkkkkk...',
    ],
  },
  store: {
    pal: { k: '#1d2433', r: '#e5484d', w: '#ffffff', b: '#3a7be6' },
    rows: [
      '.kkkkkkkkkkkk.',
      'krrwwrrwwrrwwk',
      'krrwwrrwwrrwwk',
      'kkkkkkkkkkkkkk',
      '.krwkrwkrwkrk.',
      '.kwwwwwwwwwwk.',
      '.kwkkkwkkkkwk.',
      '.kwkbkwkbbkwk.',
      '.kwkbkwkbbkwk.',
      '.kwkbkwkkkkwk.',
      '.kwkkkwwwwwwk.',
      '.kkkkkkkkkkkk.',
    ],
  },
  gear: {
    pal: { k: '#1d2433', s: '#d6dce8', S: '#8f99ad' },
    rows: [
      '.....kk.....',
      '..kk.kk.kk..',
      '..kskssksk..',
      '...kssssk...',
      'kkkssSSsskkk',
      'kssSkkkkSssk',
      'kssSk..kSssk',
      'kkkssSSsskkk',
      '...kssssk...',
      '..kskssksk..',
      '..kk.kk.kk..',
      '.....kk.....',
    ],
  },
  scout: {
    pal: { k: '#13234a', b: '#8fc1ff', B: '#3a7be6', w: '#ffffff' },
    rows: [
      '................',
      '..kkkk....kkkk..',
      '.kBBBBk..kBBBBk.',
      '.kBBBBkkkkBBBBk.',
      'kBBBBBBkkBBBBBBk',
      'kbbbbbbkkbbbbbbk',
      'kbwwbbbkkbwwbbbk',
      'kbwbbbbkkbwbbbbk',
      'kbbbbbbkkbbbbbbk',
      '.kbbbbk..kbbbbk.',
      '..kkkk....kkkk..',
      '................',
    ],
  },
};

const cache = new Map<string, string>();

export function spriteUrl(name: string): string {
  const hit = cache.get(name);
  if (hit) return hit;
  const s = SPRITES[name];
  const c = document.createElement('canvas');
  c.width = s.rows[0].length;
  c.height = s.rows.length;
  const g = c.getContext('2d')!;
  s.rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const color = s.pal[ch];
      if (!color) return;
      g.fillStyle = color;
      g.fillRect(x, y, 1, 1);
    });
  });
  const url = c.toDataURL();
  cache.set(name, url);
  return url;
}

/** 픽셀 아이콘 <img>. size는 화면 픽셀 높이 */
export function pxIcon(name: Currency | 'scout' | 'trophy' | 'boot' | 'ball' | 'store' | 'gear', size = 18): string {
  const s = SPRITES[name];
  const w = Math.round((s.rows[0].length / s.rows.length) * size);
  return `<img class="px" src="${spriteUrl(name)}" width="${w}" height="${size}" alt="">`;
}

/** 손으로 찍은 아이콘이 있는 이모지 (나머지는 pixelEmoji가 자동 변환) */
export const HAND_DRAWN: Record<string, string> = {
  '🏆': 'trophy',
  '👟': 'boot',
  '⚽': 'ball',
  '📋': 'boards',
  '🏪': 'store',
  '⚙': 'gear',
  '💵': 'cash',
  '📞': 'contacts',
  '💎': 'gems',
  '📯': 'whistles',
  '🔭': 'scout',
};
