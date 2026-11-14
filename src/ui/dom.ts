import { TIERS } from '../data/balance';
import { CURRENCY_ICON, type Currency, type Reward } from '../game/types';

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(s: string | number): string {
  return String(s).replace(/[&<>"']/g, (c) => ESC[c]);
}

/** 1234 → 1.2k, 3456789 → 3.5M */
export function fmt(n: number): string {
  const a = Math.abs(n);
  if (a < 1000) return String(Math.floor(n));
  const units: [number, string][] = [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'k'],
  ];
  for (const [v, u] of units) {
    if (a >= v) {
      const x = n / v;
      return `${x >= 100 ? Math.floor(x) : x.toFixed(1).replace(/\.0$/, '')}${u}`;
    }
  }
  return String(n);
}

export function won(price: number): string {
  return `₩${price.toLocaleString('ko-KR')}`;
}

export function pct(p: number, digits = 2): string {
  if (p === 0) return '0%';
  if (p < 0.01) return `${p.toFixed(3)}%`;
  return `${Number(p.toFixed(digits))}%`;
}

export function duration(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return `${m}분 ${sec}초`;
  return `${sec}초`;
}

export function rewardChips(r: Reward): string {
  return (Object.entries(r) as [Currency, number][])
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `<span class="chip">${CURRENCY_ICON[k]} ${fmt(v)}</span>`)
    .join('');
}

export function rewardText(r: Reward): string {
  return (Object.entries(r) as [Currency, number][])
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${CURRENCY_ICON[k]}${fmt(v)}`)
    .join(' ');
}

export function tierBadge(tier: number): string {
  const t = TIERS[tier];
  return `<span class="tier-badge" style="background:${t.color}">${esc(t.name)}</span>`;
}

export function crestHtml(c: { color: string; icon: string }, size = 30): string {
  return `<span class="crest" style="background:${c.color};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.55)}px">${c.icon}</span>`;
}
