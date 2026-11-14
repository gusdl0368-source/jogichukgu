import { HAND_DRAWN, spriteUrl } from './icons';

// 화면의 이모지를 픽셀 아이콘으로 바꾼다.
// 손으로 찍은 아이콘이 있으면 그걸 쓰고, 없으면 이모지를 16px로 작게 그린 뒤
// 반투명 픽셀을 없애고(또렷하게) 검은 외곽선을 둘러 픽셀 아트처럼 만든다.

const SIZE = 16;
const OUTLINE = [29, 36, 51];
const cache = new Map<string, string | null>();
const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('ko', { granularity: 'grapheme' }) : null;

function emojiUrl(emoji: string): string | null {
  const key = emoji.replace(/️/g, '');
  if (cache.has(key)) return cache.get(key)!;
  const hand = HAND_DRAWN[key];
  if (hand) {
    const url = spriteUrl(hand);
    cache.set(key, url);
    return url;
  }
  const url = rasterize(emoji);
  cache.set(key, url);
  return url;
}

function rasterize(emoji: string): string | null {
  try {
    const src = document.createElement('canvas');
    src.width = SIZE;
    src.height = SIZE;
    const g = src.getContext('2d', { willReadFrequently: true })!;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `${SIZE - 3}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    g.fillText(emoji, SIZE / 2, SIZE / 2 + 1);
    const img = g.getImageData(0, 0, SIZE, SIZE);
    const d = img.data;
    let any = false;
    // 반투명 가장자리를 없애고 색을 살짝 단순화한다
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 110) {
        d[i + 3] = 0;
        continue;
      }
      any = true;
      d[i + 3] = 255;
      for (let c = 0; c < 3; c++) d[i + c] = Math.round(d[i + c] / 24) * 24;
    }
    if (!any) return null;
    // 1px 외곽선을 두른다 (위아래좌우)
    const out = document.createElement('canvas');
    out.width = SIZE + 2;
    out.height = SIZE + 2;
    const o = out.getContext('2d')!;
    const res = o.createImageData(SIZE + 2, SIZE + 2);
    const r = res.data;
    const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < SIZE && y < SIZE && d[(y * SIZE + x) * 4 + 3] > 0;
    for (let y = -1; y <= SIZE; y++) {
      for (let x = -1; x <= SIZE; x++) {
        const j = ((y + 1) * (SIZE + 2) + (x + 1)) * 4;
        if (solid(x, y)) {
          const i = (y * SIZE + x) * 4;
          r[j] = d[i];
          r[j + 1] = d[i + 1];
          r[j + 2] = d[i + 2];
          r[j + 3] = 255;
        } else if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) {
          r[j] = OUTLINE[0];
          r[j + 1] = OUTLINE[1];
          r[j + 2] = OUTLINE[2];
          r[j + 3] = 255;
        }
      }
    }
    o.putImageData(res, 0, 0);
    return out.toDataURL();
  } catch {
    return null;
  }
}

function graphemes(text: string): string[] {
  if (segmenter) return Array.from(segmenter.segment(text), (s) => s.segment);
  return Array.from(text);
}

/** root 아래 글자 속 이모지를 픽셀 아이콘 <img>로 바꾼다 */
export function pixelize(root: Node | null): void {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const p = n.parentElement;
      if (!p || p.closest('textarea, input, canvas, script, style, [data-nopx]')) return NodeFilter.FILTER_REJECT;
      return EMOJI.test(n.nodeValue ?? '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    const frag = document.createDocumentFragment();
    let buf = '';
    for (const ch of graphemes(node.nodeValue ?? '')) {
      if (!EMOJI.test(ch)) {
        buf += ch;
        continue;
      }
      const url = emojiUrl(ch);
      if (!url) {
        buf += ch;
        continue;
      }
      if (buf) frag.appendChild(document.createTextNode(buf));
      buf = '';
      const img = document.createElement('img');
      img.className = 'pe';
      img.src = url;
      img.alt = ch;
      img.draggable = false;
      frag.appendChild(img);
    }
    if (buf) frag.appendChild(document.createTextNode(buf));
    node.replaceWith(frag);
  }
}
