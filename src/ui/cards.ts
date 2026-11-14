import { TIERS } from '../data/balance';
import { KEY_STATS_2, KEY_STATS_3, POSITION_LABEL } from '../game/players';
import { type Player, STAT_KEYS, STAT_LABEL, type StatKey } from '../game/types';
import { nationByCode } from '../data/nations';
import { traitById } from '../data/traits';
import { avatarUrl, shade } from './avatar';
import { esc, tierBadge } from './dom';

/** 카드 배경용 등급 색 3단 (밝게, 기본, 어둡게) */
export function tierVars(tier: number): string {
  const c = TIERS[tier].color;
  return `--tier:${c};--tier-l:${shade(c, 55)};--tier-d:${shade(c, -55)}`;
}

export function shortName(p: Player): string {
  return p.name.replace(/^'.*' /, '');
}

export function playerCard(p: Player, opts: { big?: boolean; act?: string; arg?: string; up?: boolean } = {}): string {
  const trait = traitById(p.trait);
  const attrs = opts.act ? `data-act="${opts.act}" data-arg="${esc(opts.arg ?? '')}"` : '';
  return `<button class="card ${opts.big ? 'big' : ''} ${p.tier >= 5 ? 'holo' : ''} ${p.tier >= 8 ? 'legend' : ''}" style="${tierVars(p.tier)}" ${attrs}>
    <div class="top"><span>${p.position}</span><span>${p.overall}</span></div>
    <img src="${avatarUrl(p.avatar)}" alt="">
    <span class="flag">${nationByCode(p.nation).flag}</span>
    ${trait ? `<span class="trait" title="${esc(trait.name)}">${trait.icon}</span>` : ''}
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
  const n = nationByCode(p.nation);
  const t = traitById(p.trait);
  return `<div style="font-weight:900;font-size:16px">${esc(p.name)}</div>
    <div>${tierBadge(p.tier)}</div>
    <div class="muted">${n.flag} ${n.name} · ${POSITION_LABEL[p.position]} · ${esc(p.job)} · ${p.age}세</div>
    ${t ? `<div class="trait-line">${t.icon} <b>${esc(t.name)}</b> <span class="muted">${esc(t.desc)} ${t.effect === 'discipline' ? `${Math.round(t.value * 100)}%↓` : `+${Math.round(t.value * 1000) / 10}%`}</span></div>` : ''}`;
}
