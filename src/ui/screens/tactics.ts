import { SKILLS as SKILL_CFG } from '../../data/balance';
import { RESEARCH, TREES, type TreeId, researchCost } from '../../data/research';
import { EXTRA_SKILL_SLOT } from '../../data/shop';
import { MAX_SKILL_LEVEL, RARITY, SKILLS, SUMMON_RARITY_BY_LEVEL, shardsToLevel } from '../../data/skills';
import { STYLES, type TacticStyle } from '../../game/match';
import { traitById } from '../../data/traits';
import type { ActionHandler, App } from '../app';
import { duration, esc, fmt, won } from '../dom';

type Sub = 'style' | 'skills' | 'research';

function sub(app: App): Sub {
  return (app.sub.tactics as Sub) ?? 'style';
}

export function render(app: App): string {
  const mode = sub(app);
  return `<div class="page">
    <h2>📋 전술실</h2>
    <div class="segment" style="grid-template-columns:repeat(3,1fr);max-width:360px">
      <button class="${mode === 'style' ? 'on' : ''}" data-act="tsub" data-arg="style">경기 운영</button>
      <button class="${mode === 'research' ? 'on' : ''}" data-act="tsub" data-arg="research">전술 연구</button>
      <button class="${mode === 'skills' ? 'on' : ''}" data-act="tsub" data-arg="skills">팀 스킬</button>
    </div>
    ${mode === 'style' ? renderStyle(app) : mode === 'research' ? renderResearch(app) : renderSkills(app)}
  </div>`;
}

// ───────── 경기 운영 ─────────

function renderStyle(app: App): string {
  const g = app.game;
  const p = g.power();
  const cur = app.state.style;
  const mods = g.mods();
  const traits = app.state.squad.map((pl) => traitById(pl.trait)).filter((t): t is NonNullable<typeof t> => !!t);
  return `<p class="sub">다음 경기부터 적용됩니다. 상대가 강하면 버스를 세우고, 약하면 몰아치세요.</p>
    <div class="grid3">${(Object.keys(STYLES) as TacticStyle[]).map((k) => {
      const st = STYLES[k];
      return `<button class="tile ${cur === k ? 'active' : ''}" data-act="set-style" data-arg="${k}">
        <div class="big-ico">${st.icon}</div><div class="t">${st.name}</div><div class="muted">${st.desc}</div>
      </button>`;
    }).join('')}</div>
    <div class="panel" style="margin-top:12px"><h3>적용되는 라인 힘</h3>
      <div class="row-between"><span>⚔️ 공격</span><b>${Math.round(p.atk * STYLES[cur].atk)}</b></div>
      <div class="row-between"><span>⚙️ 미드</span><b>${Math.round(p.mid * STYLES[cur].mid)}</b></div>
      <div class="row-between"><span>🛡️ 수비</span><b>${Math.round(p.def * STYLES[cur].def)}</b></div>
    </div>
    <div class="panel"><h3>주전 특성 (${traits.length}명)</h3>
      ${traits.length ? traits.map((t) => `<div class="row-between"><span>${t.icon} ${esc(t.name)}</span><span class="muted">${esc(t.desc)}</span></div>`).join('') : '<p class="muted" style="margin:0">특성 있는 선수가 없어요. 높은 등급일수록 특성이 자주 붙어요.</p>'}
    </div>
    <div class="panel"><h3>경기 확률 보정 합계</h3>
      ${[
        ['패스 성공', mods.passAcc], ['중원 장악', mods.pressing], ['유효 슈팅', mods.finishing], ['파워슛', mods.powerShot],
        ['역습', mods.counter], ['중거리 시도', mods.longShot], ['선방', mods.gkSave], ['체력 유지', mods.stamina], ['세트피스', mods.setPiece],
      ].map(([n, v]) => `<div class="row-between"><span>${n}</span><b>+${Math.round((v as number) * 1000) / 10}%</b></div>`).join('')}
      <div class="row-between"><span>반칙·카드</span><b>-${Math.round(mods.discipline * 100)}%</b></div>
    </div>`;
}

// ───────── 전술 연구 ─────────

function renderResearch(app: App): string {
  const g = app.game;
  const now = app.now();
  const active = g.state.research.active;
  const node = active ? RESEARCH.find((n) => n.id === active.id)! : null;
  return `<p class="sub">작전판 📋 ${fmt(g.state.wallet.boards)} · 연구는 한 번에 하나만 진행됩니다</p>
    ${node && active ? `<div class="panel" style="border-color:var(--gold)">
      <div class="row-between"><b>${node.icon} ${node.name} Lv.${g.researchLevel(node.id) + 1} 연구 중</b><span id="research-left" class="chip" style="background:#fff3cf;color:#5a3a00">⏱ ${duration(active.endsAt - now)}</span></div>
      <p></p><button class="btn block gold" data-act="rush">💎 ${g.rushCost(now)}개로 바로 완료</button>
    </div>` : ''}
    <div class="grid3">${TREES.map((t) => `
      <button class="tile" data-act="tree" data-arg="${t.id}">
        <div class="big-ico">${t.icon}</div><div class="t">${t.name}</div>
        <div class="muted">${Math.round(g.treeProgress(t.id) * 100)}% 완료</div>
        <div class="progress"><i style="width:${g.treeProgress(t.id) * 100}%"></i></div>
      </button>`).join('')}
    </div>
    <div class="panel" style="margin-top:12px"><h3>현재 효과</h3>${renderEffects(app)}</div>`;
}

function renderEffects(app: App): string {
  const g = app.game;
  const lines = RESEARCH.filter((n) => g.researchLevel(n.id) > 0).map((n) => {
    const v = g.researchLevel(n.id) * n.perLevel;
    const shown = n.effect === 'offlineCap' ? `+${v}시간` : `+${Math.round(v * 100)}%`;
    return `<div class="row-between"><span>${n.icon} ${n.desc}</span><b>${shown}</b></div>`;
  });
  return lines.join('') || '<p class="muted">아직 연구한 항목이 없어요. 작전판은 훈련 캠프의 운동장 족구에서 얻습니다.</p>';
}

function renderTree(app: App, tree: TreeId): string {
  const g = app.game;
  const t = TREES.find((x) => x.id === tree)!;
  const busy = !!g.state.research.active;
  return `<h2>${t.icon} ${t.name}</h2><p class="muted" style="text-align:center;margin-top:-6px">${t.desc} · 📋 ${fmt(g.state.wallet.boards)}</p>
    ${RESEARCH.filter((n) => n.tree === tree).map((n) => {
      const lv = g.researchLevel(n.id);
      const unlocked = g.researchUnlocked(n.id);
      const maxed = lv >= n.maxLevel;
      const cost = researchCost(n, lv);
      const isActive = g.state.research.active?.id === n.id;
      const req = n.requires ? RESEARCH.find((r) => r.id === n.requires!.id)! : null;
      const per = n.effect === 'offlineCap' ? `+${n.perLevel}시간` : `+${Math.round(n.perLevel * 100)}%`;
      return `<div class="panel ${unlocked ? '' : 'locked'}" style="${unlocked ? '' : 'opacity:.55'}">
        <div class="row-between"><b>${n.icon} ${n.name}</b><span class="chip" style="background:#e9edf4;color:var(--ink)">${lv}/${n.maxLevel}</span></div>
        <div class="muted">${n.desc} ${per} / 레벨</div>
        <div class="progress" style="margin:6px 0"><i style="width:${(lv / n.maxLevel) * 100}%"></i></div>
        ${maxed ? '<b style="color:var(--green)">완료</b>'
          : !unlocked ? `<span class="muted">🔒 ${req?.name} Lv.${n.requires!.level} 필요</span>`
          : isActive ? '<b style="color:#d08a00">연구 중…</b>'
          : `<button class="btn small block ${busy || g.state.wallet.boards < cost.boards ? 'gray' : 'green'}" data-act="research" data-arg="${n.id}">📋 ${fmt(cost.boards)} · ⏱ ${cost.minutes}분</button>`}
      </div>`;
    }).join('')}`;
}

// ───────── 팀 스킬 ─────────

function renderSkills(app: App): string {
  const g = app.game;
  const sk = g.state.skills;
  const slots = g.skillSlots();
  const lvl = g.summonLevel();
  const steps = SKILL_CFG.summonLevelSteps;
  const nextStep = steps[lvl];
  const rates = SUMMON_RARITY_BY_LEVEL[lvl];
  return `<p class="sub">호루라기 📯 ${fmt(g.state.wallet.whistles)} · 경기 중 확률을 올려줍니다</p>
    <div class="panel" style="background:#e5f5e8;border-color:#9ad3a8">
      <div class="row-between"><b>장착 중 ${sk.equipped.length}/${slots}</b>${sk.extraSlot ? '' : `<button class="btn small gold" data-act="buy-slot">슬롯 +1 ${won(EXTRA_SKILL_SLOT.price)}</button>`}</div>
      <div class="grid3" style="margin-top:8px;grid-template-columns:repeat(${Math.max(3, slots)},1fr)">
        ${Array.from({ length: slots }, (_, i) => {
          const id = sk.equipped[i];
          const def = id ? SKILLS.find((s) => s.id === id)! : null;
          return def ? `<button class="tile" data-act="skill" data-arg="${def.id}" style="border-color:${RARITY[def.rarity].color}"><div class="big-ico">${def.icon}</div><div class="t" style="font-size:12px">${def.name}</div><div class="muted">Lv.${sk.owned[def.id].level}</div></button>`
            : '<div class="tile" style="opacity:.6"><div class="big-ico">➕</div><div class="muted">빈 슬롯</div></div>';
        }).join('')}
      </div>
    </div>
    <div class="grid3">${SKILLS.map((d) => {
      const o = sk.owned[d.id];
      if (!o) return `<div class="tile locked"><div class="big-ico" style="filter:grayscale(1)">${d.icon}</div><div class="t" style="font-size:12px">${d.name}</div><div class="muted">미보유</div></div>`;
      const need = shardsToLevel(o.level);
      const canUp = g.canUpgradeSkill(d.id);
      return `<button class="tile ${sk.equipped.includes(d.id) ? 'active' : ''}" data-act="skill" data-arg="${d.id}" style="border-color:${RARITY[d.rarity].color}">
        ${canUp ? '<span class="dot" style="top:4px;right:4px"></span>' : ''}
        <div class="big-ico">${d.icon}</div><div class="t" style="font-size:12px">${d.name}</div>
        <div class="muted">Lv.${o.level} · ${o.level >= MAX_SKILL_LEVEL ? 'MAX' : `${o.shards}/${need}`}</div>
      </button>`;
    }).join('')}</div>
    <p></p>
    <button class="btn block" data-act="upgrade-all">모두 레벨업</button><p></p>
    <div class="panel">
      <div class="row-between"><b>소환 레벨 ${lvl + 1}</b><span class="muted">${nextStep ? `다음 레벨까지 ${nextStep - sk.summonCount}회` : '최고 레벨'}</span></div>
      <div class="muted">일반 ${rates[0]}% · <span style="color:${RARITY[1].color}">희귀 ${rates[1]}%</span> · <span style="color:${RARITY[2].color}">영웅 ${rates[2]}%</span></div>
      <p></p>
      <div class="btn-row">
        <button class="btn green" data-act="summon" data-arg="1" ${g.state.wallet.whistles >= SKILL_CFG.summonCost ? '' : 'disabled'}>소환 x1 📯${SKILL_CFG.summonCost}</button>
        <button class="btn green" data-act="summon" data-arg="10" ${g.state.wallet.whistles >= SKILL_CFG.summonCost * 10 ? '' : 'disabled'}>소환 x10 📯${fmt(SKILL_CFG.summonCost * 10)}</button>
      </div>
      <p class="muted" style="margin-bottom:0">호루라기는 훈련 캠프의 승부차기 내기에서 얻습니다.</p>
    </div>`;
}

function renderSkillModal(app: App, id: string): string {
  const g = app.game;
  const d = SKILLS.find((s) => s.id === id)!;
  const o = g.state.skills.owned[id];
  const equipped = g.state.skills.equipped.includes(id);
  const cur = o.level * d.perLevel * 100;
  const next = (o.level + 1) * d.perLevel * 100;
  return `<div style="text-align:center"><div style="font-size:60px">${d.icon}</div>
    <h2 style="margin-bottom:2px">${d.name}</h2><span class="tier-badge" style="background:${RARITY[d.rarity].color}">${RARITY[d.rarity].name}</span>
    <p>${d.desc} <b>+${Math.round(cur)}%</b>${o.level < MAX_SKILL_LEVEL ? ` <span style="color:var(--green)">(다음 +${Math.round(next)}%)</span>` : ''}</p>
    <p class="muted">Lv.${o.level} · 조각 ${o.shards}/${shardsToLevel(o.level)}</p></div>
    <div class="btn-row">
      <button class="btn ${g.canUpgradeSkill(id) ? '' : 'gray'}" data-act="skill-up" data-arg="${id}">레벨업</button>
      <button class="btn ${equipped ? 'red' : 'gold'}" data-act="equip" data-arg="${id}">${equipped ? '해제' : '장착'}</button>
    </div>`;
}

export function tick(app: App, now: number): void {
  const el = app.root.querySelector('#research-left');
  const a = app.state.research.active;
  if (el && a) el.textContent = `⏱ ${duration(a.endsAt - now)}`;
}

export const actions: Record<string, ActionHandler> = {
  'set-style'(app, arg) {
    app.game.setStyle(arg as TacticStyle);
    app.toast(`${STYLES[arg as TacticStyle].icon} ${STYLES[arg as TacticStyle].name}로 바꿨어요`);
    app.refresh();
  },
  tsub(app, arg) {
    app.sub.tactics = arg;
    app.refresh();
  },
  tree(app, arg) {
    app.openModal({ id: 'tree', render: () => renderTree(app, arg as TreeId) });
  },
  research(app, arg) {
    const g = app.game;
    if (g.state.research.active) return app.toast('이미 다른 연구가 진행 중이에요');
    if (!g.startResearch(arg, app.now())) return app.toast('📋 작전판이 부족해요');
    app.toast('🔬 연구 시작!');
    app.closeModal();
    app.refresh();
  },
  rush(app) {
    if (!app.game.rushResearch(app.now())) return app.toast('💎 젬이 부족해요');
    app.toast('🔬 연구 완료!');
    app.refresh();
  },
  summon(app, arg) {
    const n = Number(arg);
    const got: string[] = [];
    for (let i = 0; i < n; i++) {
      const id = app.game.summonSkill();
      if (!id) break;
      got.push(id);
    }
    if (!got.length) return app.toast('📯 호루라기가 부족해요');
    app.openModal({
      id: 'summon',
      render: () => `<h2>✨ 소환 결과</h2><div class="grid3">${got.map((id) => {
        const d = SKILLS.find((s) => s.id === id)!;
        return `<div class="tile" style="border-color:${RARITY[d.rarity].color}"><div class="big-ico">${d.icon}</div><div class="t" style="font-size:12px">${esc(d.name)}</div><div class="muted" style="color:${RARITY[d.rarity].color}">${RARITY[d.rarity].name}</div></div>`;
      }).join('')}</div><p></p><button class="btn block" data-act="close">확인</button>`,
    });
    app.refresh();
  },
  skill(app, arg) {
    app.openModal({ id: 'skill', render: () => renderSkillModal(app, arg) });
  },
  'skill-up'(app, arg) {
    if (!app.game.upgradeSkill(arg)) return app.toast('조각이 부족해요');
    app.toast('⬆️ 스킬 레벨업!');
    app.renderModal(true);
    app.refresh();
  },
  'upgrade-all'(app) {
    const n = app.game.upgradeAllSkills();
    app.toast(n ? `⬆️ ${n}번 레벨업!` : '레벨업할 스킬이 없어요');
    app.refresh();
  },
  equip(app, arg) {
    if (!app.game.toggleEquip(arg)) return app.toast('슬롯이 꽉 찼어요');
    app.closeModal();
    app.refresh();
  },
  'buy-slot'(app) {
    app.confirmPurchase(EXTRA_SKILL_SLOT.name, won(EXTRA_SKILL_SLOT.price), () => {
      app.game.purchase(EXTRA_SKILL_SLOT.id, app.now());
      app.toast('➕ 스킬 슬롯 추가!');
    });
  },
};
