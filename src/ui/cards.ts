import { TIERS } from '../data/balance';
import { KEY_STATS_2, KEY_STATS_3, POSITION_LABEL } from '../game/players';
import { type Player, STAT_KEYS, STAT_LABEL, type StatKey } from '../game/types';
import { avatarUrl } from './avatar';
import { esc, tierBadge } from './dom';

export function shortName(p: Player): string {
  return p.name.replace(/^'.*' /, '');
}

export function playerCard(p: Player, opts: { big?: boolean; act?: string; arg?: string; up?: boolean } = {}): string {
  const attrs = opts.act ? `data-act="${opts.act}" data-arg="${esc(opts.arg ?? '')}"` : '';
  return `<button class="card ${opts.big ? 'big' : ''}" style="--tier:${TIERS[p.tier].color}" ${attrs}>
    <div class="top"><span>${p.position}</span><span>${p.overall}</span></div>
    <img src="${avatarUrl(p.avatar)}" alt="">
    <div class="nm">${esc(shortName(p))}</div>
    ${opts.up ? '<span class="up">↑</span>' : ''}
  </button>`;
}

function statRow(key: StatKey, value: number, compare?: number): string {
  let arrow = '';
  if (compare !== undefined && compare !== value) arrow = value > compare ? '<span class="arrow-up">▲</span>' : '<span class="arrow-down">▼</span>';
  return `<div class="stat"><span>${STAT_LABEL[key]}</span><span class="bar"><i style="width:${value}%"></i></span><b>${value}</b>${arrow || '<span></span>'}</div>`;
}

/** 비교 팝업용: 핵심 능력치 2개 (full이면 6개) */
export function statBlock(p: Player, compare?: Player, full = false): string {
  const keys = full ? STAT_KEYS : KEY_STATS_2[p.position];
  return keys.map((k) => statRow(k, p.stats[k], compare?.stats[k])).join('');
}

export function summaryStats(p: Player): string {
  return KEY_STATS_3[p.position].map((k) => statRow(k, p.stats[k])).join('');
}

export function playerInfo(p: Player): string {
  return `<div style="font-weight:900;font-size:16px">${esc(p.name)}</div>
    <div>${tierBadge(p.tier)}</div>
    <div class="muted">${POSITION_LABEL[p.position]} · ${esc(p.job)} · ${p.age}세</div>`;
}
