/* Study: knowledge drills with spaced repetition, and reference views.
 * Everything is generated from data/dex.json, so new games and Pokémon
 * show up as soon as the data file updates. */
(function () {
  'use strict';
  const VL = (window.VL = window.VL || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rand = (n) => Math.floor(Math.random() * n);
  const pick = (a) => a[rand(a.length)];
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const toId = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  // ---------- data helpers ----------
  const D = (VL.D = {
    dex: null,
    byId: new Map(),
    byName: new Map(),
    load(dex) {
      this.dex = dex;
      dex.species.forEach((s, i) => { this.byId.set(s.id, i); this.byName.set(toId(s.n), i); });
    },
    allFormats() { return this.dex ? this.dex.formats : []; },
    // only the formats for the play style picked at the top (doubles or singles)
    formats() { const all = this.allFormats(); const want = !(VL.isSingles && VL.isSingles()); const f = all.filter(x => !!x.doubles === want); return f.length ? f : all; },
    format(id) { const f = this.formats(); return f.find(x => x.id === id) || f.find(x => x.current) || f[0]; },
    mon(i, fmt) {
      const s = this.dex.species[i]; if (!s) return null;
      const ov = fmt && fmt.overrides && fmt.overrides[i];
      return ov ? { ...s, ...(ov.s ? { s: ov.s } : {}), ...(ov.t ? { t: ov.t } : {}), ...(ov.a ? { a: ov.a } : {}), i } : { ...s, i };
    },
    // item and ability text as it reads in this format's game
    item(id, fmt) { const it = this.dex.items[id]; if (!it) return null; const d = fmt && fmt.itd && fmt.itd[id]; return d ? { ...it, d } : it; },
    ability(id, fmt) { const ab = this.dex.abilities[id]; if (!ab) return null; const d = fmt && fmt.abd && fmt.abd[id]; return d ? { ...ab, d } : ab; },
    // the Mega or Primal form a Pokémon becomes holding this item, or null
    megaOf(rec, item) {
      if (!rec || !item) return null; const it = String(item).toLowerCase().replace(/[^a-z0-9]/g, '');
      const k = this.dex.species.findIndex(x => x.mg && x.ri && x.ri.toLowerCase().replace(/[^a-z0-9]/g, '') === it && (x.bo === rec.n || (!x.bo && x.b === (rec.b || rec.n))));
      return k >= 0 ? k : null;
    },
    // a move as it works in this format's game (power, type, category and priority changed over the years)
    move(id, fmt) {
      const k = String(id || '').toLowerCase().replace(/[^a-z0-9]/g, ''); const m = this.dex.moves[k]; if (!m) return null;
      const ov = fmt && fmt.mv && fmt.mv[k];
      return ov ? { ...m, ...ov } : m;
    },
    // priority moves that exist in this format, with this game's priority
    prio(fmt) {
      const ids = fmt && fmt.pm ? fmt.pm : Object.keys(this.dex.priorityMoves);
      return ids.map(id => { const t = this.dex.priorityMoves[id]; if (!t) return null; const m = this.move(id, fmt); return { ...t, id, p: m ? m.p || 0 : t.p }; }).filter(x => x && x.p);
    },
    find(name) { const i = this.byName.get(toId(name)); return i === undefined ? -1 : i; },
    chart(fmt) { return this.dex.typeCharts[fmt ? fmt.chart : this.dex.typeCharts.length - 1] || this.dex.typeCharts[0]; },
    eff(chart, atk, types) { return types.reduce((m, t) => m * (chart.eff[atk] && chart.eff[atk][t] !== undefined ? chart.eff[atk][t] : 1), 1); },
    pool(fmt, kind) {
      if (kind === 'all') return this.dex.species.map((s, i) => i).filter(i => this.dex.species[i].fe);
      if (kind === 'meta') {
        const names = VL.meta ? VL.meta.topNames(fmt && fmt.id, 50) : [];
        return names.map(n => this.find(n)).filter(i => i >= 0);
      }
      if (kind === 'logs') {
        const seen = new Set();
        for (const g of VL.store.list('games')) for (const n of (g.opp || [])) { const i = this.find(n); if (i >= 0) seen.add(i); }
        for (const g of VL.store.list('games')) for (const n of String(g.mylead || '').split(',').concat(String(g.myback || '').split(','))) { const i = this.find(n.trim()); if (i >= 0) seen.add(i); }
        return [...seen];
      }
      const legal = fmt ? fmt.species : [];
      return kind === 'legal' ? legal.slice() : legal.filter(i => this.dex.species[i].fe);
    },
    // Level 50 Speed. Champions has no IVs (always perfect); mainline "min" uses 0 IVs.
    speed(base, spread, fmt) {
      switch (spread) {
        case 'max+': return Math.floor((base + 52) * 1.1);
        case 'max': return base + 52;
        case 'none': return base + 20;
        case 'min-': return Math.floor(((fmt && fmt.noIVs) ? base + 20 : base + 5) * 0.9);
        default: return base + 20;
      }
    },
  });
  const SPREADS = { 'max+': 'max Speed, + nature', 'max': 'max Speed, neutral nature', 'none': 'no Speed investment', 'min-': 'minimum Speed, − nature' };

  // ---------- state ----------
  const S = { view: 'drills', quiz: null };
  const fmtId = () => $('st-format').value;
  const curFmt = () => D.format(fmtId());
  const poolKind = () => $('st-pool').value;
  const typesHtml = (t) => t.map(x => `<span class="ty ${esc(x)}">${esc(x)}</span>`).join(' ');
  const mult = (m) => m === 0.25 ? '¼×' : m === 0.5 ? '½×' : m + '×';

  // ---------- drills ----------
  const DRILLS = [
    { id: 'typemon', name: 'Type vs Pokémon', desc: 'How effective is an attacking type against a real Pokémon\'s typing?' },
    { id: 'weakness', name: 'Find the weakness', desc: 'Pick the type that hits a Pokémon super effectively.' },
    { id: 'typebasic', name: 'Type chart basics', desc: 'One attacking type into one defending type.' },
    { id: 'basespeed', name: 'Base Speed', desc: 'Recall the base Speed of Pokémon in the pool.' },
    { id: 'whofirst', name: 'Who moves first?', desc: 'Two Pokémon, real spreads, speed control in play. Same-priority moves.' },
    { id: 'items', name: 'Items', desc: 'What does this held item do?' },
    { id: 'abilities', name: 'Abilities', desc: 'What does this ability do?' },
    { id: 'priority', name: 'Priority', desc: 'What priority bracket is this move in?' },
    { id: 'mechanics', name: 'Mechanics', desc: 'Damage modifiers, durations, status and the battle gimmick, for this game.' },
    { id: 'commonsets', name: 'Common sets', desc: 'How the 50 most-used Pokémon are usually built: items, abilities and moves.' },
    { id: 'notebook', name: 'My game plans', desc: 'Flashcards from your matchup notebook. Recall your plan, then check it.' },
  ];
  function mechCards(fmt) {
    const champ = fmt && fmt.mod && fmt.mod.startsWith('champions');
    const gen = fmt ? fmt.gen : 9;
    const dbl = fmt ? !!fmt.doubles : true;
    return VL.MECHANICS.map((c, i) => ({ ...c, i })).filter(c => gen >= (c.min || 1) && (!c.max || gen <= c.max) && (c.champ === 'only' ? champ : c.champ === 'not' ? !champ : true) && (c.dbl ? dbl : c.sgl ? !dbl : true));
  }

  // ---------- helpers for harder questions ----------
  // c.level: 1 = Standard, 2 = Hard, 3 = Expert
  const lvl = (c) => (c && c.level) || 1;
  const STOP = new Set('the a an of to and or is if by in on its it this that for with when from at be as are user users holder holders pokemon move moves turn turns target targets has have can not all any each one their this'.split(' '));
  const words = (s) => new Set(String(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)));
  // the n descriptions that share the most words with desc: wrong answers that sound right
  function similar(desc, pool, n) {
    const w = words(desc); const seen = new Set([desc]); const out = [];
    const scored = pool.filter(d => d && d !== desc).map(d => { const x = words(d); let s = 0; for (const t of x) if (w.has(t)) s++; return [d, s / Math.sqrt(x.size + 1) + Math.random() * 0.35]; }).sort((a, b) => b[1] - a[1]);
    for (const [d] of scored) { if (seen.has(d)) continue; seen.add(d); out.push(d); if (out.length >= n) break; }
    return out;
  }
  // items a Pokémon must hold (Mega Stones, Orbs, Masks) or that nearly every copy runs give the answer away
  function forcedItem(mon, item, share) {
    if (share >= 92) return true;
    const base = String(mon).split('-')[0].toLowerCase(); const it = String(item).toLowerCase();
    return it.includes(base) || (/-mega/i.test(mon) && /ite( [xyz])?$/.test(it)) || /( orb| mask| drive| memory| plate|rusted |griseous )/.test(' ' + it + ' ');
  }
  const ABIL_IMMUNE = { levitate: { Ground: 0 }, eartheater: { Ground: 0 }, flashfire: { Fire: 0 }, wellbakedbody: { Fire: 0 }, waterabsorb: { Water: 0 }, stormdrain: { Water: 0 }, dryskin: { Water: 0 }, voltabsorb: { Electric: 0 }, lightningrod: { Electric: 0 }, motordrive: { Electric: 0 }, sapsipper: { Grass: 0 }, thickfat: { Fire: 0.5, Ice: 0.5 }, heatproof: { Fire: 0.5 }, waterbubble: { Fire: 0.5 }, purifyingsalt: { Ghost: 0.5 } };
  const COMMON_PRIO = new Set(['protect', 'detect', 'fakeout', 'quickattack', 'extremespeed', 'trickroom', 'helpinghand', 'followme', 'ragepowder', 'suckerpunch', 'aquajet', 'bulletpunch', 'machpunch', 'iceshard', 'shadowsneak', 'endure', 'wideguard', 'quickguard']);
  const nearDeltas = (level) => level >= 2 ? [-1, 1, -2, 2, -3, 3, -4, 4, -5, 5, -6, 6, -8, 8, -10, 10] : [-25, -20, -15, -10, -5, 5, 10, 15, 20, 25];
  function closeNumbers(right, level, min) {
    const set = new Set([right]);
    const cand = level >= 2 ? nearDeltas(level).slice(0, level >= 3 ? 8 : 12) : nearDeltas(level);
    for (const d of shuffle(cand)) { const v = right + d; if (v >= (min ?? 1)) set.add(v); if (set.size >= 4) break; }
    return shuffle([...set]);
  }

  // each generator: keys(ctx) -> array of keys; make(key, ctx) -> question or null
  const GEN = {
    typebasic: {
      keys: (c) => { const t = c.chart.types; const k = []; for (const a of t) for (const d of t) k.push(a + '>' + d); return k; },
      make(key, c) {
        const [a, d] = key.split('>'); const m = D.eff(c.chart, a, [d]);
        return { q: `${typesHtml([a])} attacking into ${typesHtml([d])}`, opts: [0, 0.5, 1, 2].map(v => ({ label: mult(v), ok: v === m })), six: false,
          ex: `${a} → ${d} is <b>${mult(m)}</b>.` };
      },
    },
    typemon: {
      keys: (c) => { const k = []; for (const i of c.pool) for (const a of c.chart.types) k.push(i + '|' + a); return k; },
      make(key, c) {
        const [i, a] = key.split('|'); const p = D.mon(+i, c.fmt); if (!p) return null;
        let m = D.eff(c.chart, a, p.t);
        // Hard and Expert: dual types, mostly answers other than neutral
        if (lvl(c) >= 2 && (p.t.length < 2 || (m === 1 && Math.random() < 0.75))) return null;
        let abil = '';
        if (lvl(c) >= 3 && p.a && p.a.length === 1) { const im = ABIL_IMMUNE[toId(p.a[0])]; if (im && im[a] !== undefined) { abil = p.a[0]; m *= im[a]; } }
        const parts = p.t.map(t => `${a} → ${t}: ${mult(D.eff(c.chart, a, [t]))}`).join(', ');
        return { q: `${typesHtml([a])} attack into <b>${esc(p.n)}</b>${abil ? ` (ability: ${esc(abil)})` : ''}`, ctx: typesHtml(p.t), opts: [0, 0.25, 0.5, 1, 2, 4].map(v => ({ label: mult(v), ok: v === m })), six: true,
          ex: `${esc(parts)}.${abil ? ` ${esc(abil)} changes it.` : ''} Together: <b>${mult(m)}</b>.${abil ? '' : ' Abilities aren\'t counted here.'}` };
      },
    },
    weakness: {
      keys: (c) => c.pool.map(String),
      make(key, c) {
        const p = D.mon(+key, c.fmt); if (!p) return null;
        const t = c.chart.types; const eff = (a) => D.eff(c.chart, a, p.t);
        const se = t.filter(a => eff(a) >= 2), neutral = t.filter(a => eff(a) === 1), resist = t.filter(a => eff(a) < 1), four = t.filter(a => eff(a) >= 4);
        const list = se.map(a => `${a} ${mult(eff(a))}`).join(', ');
        const exAll = `${esc(p.n)} takes super effective damage from <b>${esc(list || 'nothing')}</b> and resists or ignores ${esc(resist.map(a => `${a} ${mult(eff(a))}`).join(', ') || 'nothing')}.`;
        const kinds = ['se'];
        if (lvl(c) >= 2) { if (four.length && se.length >= 3) kinds.push('four', 'four'); if (resist.length && neutral.length + se.length >= 3) kinds.push('resist', 'resist'); }
        if (lvl(c) >= 3) kinds.push('count', 'count');
        const k = pick(kinds);
        if (k === 'four') {
          const right = pick(four); const wrong = shuffle(se.filter(a => eff(a) === 2)).concat(shuffle(neutral)).slice(0, 3);
          if (wrong.length < 3) return null;
          return { q: `Which type does <b>4×</b> damage to <b>${esc(p.n)}</b>?`, ctx: typesHtml(p.t), opts: shuffle([right, ...wrong]).map(a => ({ label: typesHtml([a]), ok: a === right })), html: true, ex: exAll };
        }
        if (k === 'resist') {
          const right = pick(resist); const wrong = shuffle(neutral).slice(0, 2).concat(shuffle(se)).slice(0, 3);
          if (wrong.length < 3) return null;
          return { q: `Which of these does <b>${esc(p.n)}</b> resist or ignore?`, ctx: typesHtml(p.t), opts: shuffle([right, ...wrong]).map(a => ({ label: typesHtml([a]), ok: a === right })), html: true, ex: exAll };
        }
        if (k === 'count') {
          const n = se.length; const set = new Set([n]); let d = 1;
          while (set.size < 4) { if (Math.random() < 0.5 && n - d >= 0) set.add(n - d); else set.add(n + d); if (set.size < 4 && n - d >= 0 && Math.random() < 0.5) set.add(n - d); d++; }
          return { q: `How many attacking types hit <b>${esc(p.n)}</b> super effectively?`, ctx: typesHtml(p.t), opts: shuffle([...set].slice(0, 4)).map(v => ({ label: String(v), ok: v === n })), ex: exAll };
        }
        if (!se.length) return null;
        const right = pick(se);
        // Hard: wrong answers are neutral hits, which feel right more often than resisted ones
        const wrongPool = lvl(c) >= 2 ? neutral : t.filter(a => eff(a) <= 1);
        if (wrongPool.length < 3) return null;
        return { q: `Which type hits <b>${esc(p.n)}</b> super effectively?`, ctx: typesHtml(p.t), opts: shuffle([right, ...shuffle(wrongPool).slice(0, 3)]).map(a => ({ label: typesHtml([a]), ok: a === right })), html: true, ex: exAll };
      },
    },
    basespeed: {
      keys: (c) => c.pool.map(String),
      make(key, c) {
        const p = D.mon(+key, c.fmt); if (!p) return null;
        const b = p.s[5];
        const tiers = ['none', 'max', 'max+'].map(k => `${SPREADS[k]}: ${D.speed(b, k, c.fmt)}`).join(' · ');
        if (lvl(c) >= 3 && Math.random() < 0.6) {
          const k = pick(['max+', 'max+', 'none', 'max']); const v = D.speed(b, k, c.fmt);
          return { q: `What is <b>${esc(p.n)}</b>'s Speed at Level 50 with <b>${SPREADS[k]}</b>?`, ctx: typesHtml(p.t), opts: closeNumbers(v, 3).map(x => ({ label: String(x), ok: x === v })),
            ex: `Base ${b}. At Level 50: ${esc(tiers)}.${c.fmt && c.fmt.noIVs ? ' This game has no individual values.' : ''}` };
        }
        return { q: `What is <b>${esc(p.n)}</b>'s base Speed?`, ctx: typesHtml(p.t), opts: closeNumbers(b, lvl(c)).map(v => ({ label: String(v), ok: v === b })),
          ex: `Base <b>${b}</b>. At Level 50: ${esc(tiers)}.` };
      },
    },
    whofirst: {
      keys: (c) => c.pool.map(String),
      make(key, c) {
        const gen = c.fmt ? c.fmt.gen : 9; const L = lvl(c);
        const para = gen >= 7 ? 0.5 : 0.25;
        for (let tries = 0; tries < 60; tries++) {
          const A = D.mon(+key, c.fmt); const B = D.mon(pick(c.pool), c.fmt);
          if (!A || !B || A.i === B.i) continue;
          const sa = pick(Object.keys(SPREADS)), sb = pick(Object.keys(SPREADS));
          const all = ['tailwindA', 'tailwindB', 'tr', 'paraA', 'paraB', 'scarfA', 'scarfB', 'plusA', 'icyB'];
          let conds = L >= 3 ? shuffle(all).slice(0, 2) : L >= 2 ? [pick(all)] : [pick(['none', 'none', ...all, 'tr'])];
          if (conds.includes('tailwindA') && conds.includes('tailwindB')) continue;
          conds = conds.filter(x => x !== 'none');
          const text = { tailwindA: `Tailwind is up on ${A.n}'s side`, tailwindB: `Tailwind is up on ${B.n}'s side`, tr: 'Trick Room is up', paraA: `${A.n} is paralyzed`, paraB: `${B.n} is paralyzed`, scarfA: `${A.n} holds a Choice Scarf`, scarfB: `${B.n} holds a Choice Scarf`, plusA: `${A.n} is at +1 Speed`, icyB: `${B.n} was hit by Icy Wind (−1 Speed)` };
          let va = D.speed(A.s[5], sa, c.fmt), vb = D.speed(B.s[5], sb, c.fmt);
          const base = [va, vb];
          // stat changes and items apply before Tailwind and paralysis
          if (conds.includes('plusA')) va = Math.floor(va * 1.5); if (conds.includes('icyB')) vb = Math.floor(vb * 2 / 3);
          if (conds.includes('scarfA')) va = Math.floor(va * 1.5); if (conds.includes('scarfB')) vb = Math.floor(vb * 1.5);
          if (conds.includes('tailwindA')) va *= 2; if (conds.includes('tailwindB')) vb *= 2;
          if (conds.includes('paraA')) va = Math.floor(va * para); if (conds.includes('paraB')) vb = Math.floor(vb * para);
          const exact = conds.every(x => x === 'tr');
          if (!exact && Math.abs(va - vb) <= 2) continue;
          // Hard and Expert: close calls only
          if (L >= 2 && Math.abs(va - vb) > Math.max(va, vb) * (L >= 3 ? 0.1 : 0.15)) continue;
          const tr = conds.includes('tr');
          const tie = va === vb;
          const first = tie ? 'tie' : ((va > vb) !== tr ? 'A' : 'B');
          const opts = [{ label: `${esc(A.n)} first`, ok: first === 'A' }, { label: `${esc(B.n)} first`, ok: first === 'B' }, { label: 'Speed tie (random)', ok: first === 'tie' }];
          const condText = conds.length ? conds.map(x => text[x]).join('. ') + '.' : 'No speed control.';
          const ex = `${esc(A.n)} (base ${A.s[5]}, ${SPREADS[sa]}) = ${base[0]}${va !== base[0] ? ` → <b>${va}</b>` : ''}. ${esc(B.n)} (base ${B.s[5]}, ${SPREADS[sb]}) = ${base[1]}${vb !== base[1] ? ` → <b>${vb}</b>` : ''}.${tr ? ' Trick Room: slower moves first.' : ''}${c.fmt && c.fmt.noIVs ? ' This game has no individual values, so minimum Speed still has perfect ones.' : ''}`;
          return { q: `Who moves first?`, ctx: `<div><b>${esc(A.n)}</b>: ${SPREADS[sa]}</div><div><b>${esc(B.n)}</b>: ${SPREADS[sb]}</div><div class="sub">${esc(condText)} Level 50, both using a same-priority move.</div>`, opts, html: true, stack: true, ex };
        }
        return null;
      },
    },
    items: {
      // Mega Stones, Orbs, Memories and other items locked to one Pokémon name the answer, so they're left out
      keys: (c) => (c.fmt ? c.fmt.items : Object.keys(D.dex.items)).filter(id => D.item(id, c.fmt) && !/If held by an? |Mega Evolve|Primal Reversion|Ultra Burst|Z-Move/i.test(D.item(id, c.fmt).d)),
      make(key, c) {
        const it = D.item(key, c.fmt); if (!it) return null;
        const keys = GEN.items.keys(c).filter(k => k !== key && D.item(k, c.fmt).d !== it.d);
        if (lvl(c) >= 3 && Math.random() < 0.5) {
          // Expert: the effect is given, pick the item, from items that sound alike
          const descs = similar(it.d, keys.map(k => D.item(k, c.fmt).d), 3);
          const names = descs.map(d => keys.find(k => D.item(k, c.fmt).d === d)).filter(Boolean).map(k => D.item(k, c.fmt).n);
          if (names.length < 3) return null;
          return { q: `Which item does this? <i>${esc(it.d)}</i>`, opts: shuffle([{ label: it.n, ok: true }, ...names.map(n => ({ label: n, ok: false }))]), ex: `<b>${esc(it.n)}</b>: ${esc(it.d)}` };
        }
        const pool = [...new Set(keys.map(k => D.item(k, c.fmt).d))];
        const others = lvl(c) >= 2 ? similar(it.d, pool, 3) : shuffle(pool).slice(0, 3);
        if (others.length < 3) return null;
        return { q: `What does <b>${esc(it.n)}</b> do?`, opts: shuffle([{ label: it.d, ok: true }, ...others.map(d => ({ label: d, ok: false }))]), long: true, ex: `<b>${esc(it.n)}</b>: ${esc(it.d)}` };
      },
    },
    abilities: {
      keys: (c) => { const s = new Set(); for (const i of c.pool) for (const a of (D.mon(i, c.fmt).a || [])) s.add(toId(a)); return [...s].filter(k => D.ability(k, c.fmt)); },
      make(key, c) {
        const ab = D.ability(key, c.fmt); if (!ab) return null;
        const keys = GEN.abilities.keys(c).concat(Object.keys(D.dex.abilities)).filter(k => k !== key && D.ability(k, c.fmt) && D.ability(k, c.fmt).d !== ab.d);
        const who = c.pool.map(i => D.mon(i, c.fmt)).filter(p => (p.a || []).some(a => toId(a) === key)).slice(0, 5).map(p => p.n);
        const ex = `<b>${esc(ab.n)}</b>: ${esc(ab.d)}${who.length ? `<br><span class="sub">Seen on: ${esc(who.join(', '))}</span>` : ''}`;
        if (lvl(c) >= 3 && Math.random() < 0.5) {
          const uniq = [...new Set(keys)];
          const descs = similar(ab.d, uniq.map(k => D.ability(k, c.fmt).d), 3);
          const names = descs.map(d => uniq.find(k => D.ability(k, c.fmt).d === d)).filter(Boolean).map(k => D.ability(k, c.fmt).n);
          if (names.length < 3) return null;
          return { q: `Which ability does this? <i>${esc(ab.d)}</i>`, opts: shuffle([{ label: ab.n, ok: true }, ...names.map(n => ({ label: n, ok: false }))]), ex };
        }
        const pool = [...new Set(keys.map(k => D.ability(k, c.fmt).d))];
        const others = lvl(c) >= 2 ? similar(ab.d, pool, 3) : shuffle(pool.slice(0, 400)).slice(0, 3);
        if (others.length < 3) return null;
        return { q: `What does <b>${esc(ab.n)}</b> do?`, opts: shuffle([{ label: ab.d, ok: true }, ...others.map(d => ({ label: d, ok: false }))]), long: true, ex };
      },
    },
    priority: {
      keys: (c) => D.prio(c.fmt).map(m => m.id).filter(k => lvl(c) < 2 || !COMMON_PRIO.has(k)),
      make(key, c) {
        const m = D.prio(c.fmt).find(x => x.id === key); if (!m) return null;
        const vals = new Set([m.p]);
        const order = [-7, -6, -5, -4, -3, -1, 1, 2, 3, 4, 5].filter(v => v !== m.p).sort((x, y) => Math.abs(x - m.p) - Math.abs(y - m.p));
        for (const v of (lvl(c) >= 2 ? order.slice(0, 4) : shuffle(order.slice(0, 5)))) { if (vals.size >= 4) break; vals.add(v); }
        const fmtP = (v) => (v > 0 ? '+' : '') + v;
        return { q: `What priority is <b>${esc(m.n)}</b>?`, ctx: `${typesHtml([m.t])} <span class="pill m">${esc(m.c)}</span>`, opts: [...vals].sort((a, b) => b - a).map(v => ({ label: fmtP(v), ok: v === m.p })), ex: `<b>${esc(m.n)}</b> is <b>${fmtP(m.p)}</b>. ${esc(m.d)}` };
      },
    },
    mechanics: {
      keys: (c) => { const all = mechCards(c.fmt); const hard = all.filter(x => x.hard); return (lvl(c) >= 2 && hard.length >= 10 ? hard : all).map(x => String(x.i)); },
      make(key) {
        const card = VL.MECHANICS[+key]; if (!card) return null;
        const opts = shuffle([{ label: card.a, ok: true }, ...card.w.map(w => ({ label: w, ok: false }))]);
        return { q: esc(card.q), opts, long: true, ex: esc(card.ex) };
      },
    },
  };

  GEN.commonsets = {
    keys: (c) => { const e = VL.meta && VL.meta.forFormat(c.fmt && c.fmt.id); return e ? e.mons.slice(0, 50).map(m => m.n) : []; },
    make(key, c) {
      const e = VL.meta.forFormat(c.fmt.id); const m = VL.meta.get(e, key); if (!m) return null;
      const L = lvl(c);
      const others = e.mons.slice(0, 60).filter(x => x.n !== m.n);
      const users = (mv) => e.mons.filter(x => x.moves.some(y => y[0] === mv)).length;
      const pct = (arr, n) => arr.slice(0, n).map(x => `${x[0]} ${Math.round(x[1])}%`).join(', ');
      // no giveaways: forced items, signature moves, and (above Standard) Protect
      const items = m.items.filter(x => x[0] !== 'No item');
      const okItem = items[0] && items[0][1] >= 20 && !forcedItem(m.n, items[0][0], items[0][1]);
      const moves = m.moves.filter(x => users(x[0]) > 1 && !(L >= 2 && /^(Protect|Detect)$/.test(x[0])));
      const kinds = [];
      if (okItem) kinds.push('item', 'item');
      if (m.abilities.length > 1 && m.abilities[1][1] >= (L >= 2 ? 3 : 0) && m.abilities[0][1] - m.abilities[1][1] >= 5) kinds.push('ability');
      if (moves.length >= 4) kinds.push('move', 'move');
      if (L >= 3 && moves.length >= 4) kinds.push('notmove', 'notmove');
      const natures = [...new Set((m.spreads || []).map(s => String(s[0]).split(':')[0]))];
      if (L >= 3 && natures.length >= 2) kinds.push('nature');
      if (!kinds.length) return null;
      const k = pick(kinds);
      if (k === 'item') {
        const right = items[0][0];
        // wrong answers must trail the right one clearly, so there's one correct answer
        let wrong = L >= 2 ? items.slice(1, 4).filter(x => x[1] >= 4 && x[1] <= items[0][1] - 5).map(x => x[0]) : [];
        const fill = shuffle([...new Set(others.map(x => x.items[0] && x.items[0][0]).filter(x => x && x !== right && x !== 'No item' && !forcedItem('', x, 0) && !wrong.includes(x)))]);
        wrong = wrong.concat(fill).slice(0, 3);
        if (wrong.length < 3) return null;
        return { q: `What item does <b>${esc(m.n)}</b> hold most often?`, opts: shuffle([{ label: right, ok: true }, ...wrong.map(x => ({ label: x, ok: false }))]), ex: `Most common items: ${esc(pct(items, 4))}.` };
      }
      if (k === 'ability') {
        return { q: `Which ability does <b>${esc(m.n)}</b> run most often?`, opts: shuffle(m.abilities.filter((a, i) => i === 0 || a[1] <= m.abilities[0][1] - 5).map((a, i) => ({ label: a[0], ok: i === 0 }))), ex: `${esc(pct(m.abilities, 3))}.` };
      }
      if (k === 'nature') {
        const counts = {}; for (const s of m.spreads) { const n = String(s[0]).split(':')[0]; counts[n] = (counts[n] || 0) + s[1]; }
        const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]); const right = ranked[0][0];
        if (ranked[1] && ranked[0][1] - ranked[1][1] < 5) return null; // too close to call
        const wrong = ranked.slice(1).map(x => x[0]).concat(shuffle(['Adamant', 'Jolly', 'Modest', 'Timid', 'Bold', 'Calm', 'Careful', 'Impish', 'Brave', 'Quiet', 'Sassy', 'Relaxed'])).filter((x, i, a) => x !== right && a.indexOf(x) === i).slice(0, 3);
        return { q: `What is <b>${esc(m.n)}</b>'s most common nature?`, opts: shuffle([{ label: right, ok: true }, ...wrong.map(x => ({ label: x, ok: false }))]), ex: `Most common spreads: ${esc(m.spreads.slice(0, 3).map(s => `${VL.meta.spreadText(s[0], c.fmt.mod.startsWith('champions'))} (${Math.round(s[1])}%)`).join('; '))}.` };
      }
      if (k === 'notmove') {
        const mine = new Set(m.moves.map(x => x[0]));
        const decoy = shuffle([...new Set(others.flatMap(x => x.moves.slice(0, 6).map(y => y[0])).filter(x => !mine.has(x) && users(x) > 1))]).find(x => { const mv = D.move(x, c.fmt); return mv && (m.n && D.find(m.n) >= 0 ? D.mon(D.find(m.n), c.fmt).t.includes(mv.t) || mv.c === 'S' : true); });
        if (!decoy) return null;
        const real = shuffle(moves.slice(0, 6)).slice(0, 3).map(x => x[0]);
        return { q: `Which of these does <b>${esc(m.n)}</b> NOT usually run?`, opts: shuffle([{ label: decoy, ok: true }, ...real.map(x => ({ label: x, ok: false }))]), ex: `Its usual moves: ${esc(pct(m.moves, 6))}.` };
      }
      // most-used move: Hard and Expert compare it against its own other moves
      const right = moves[0][0];
      let wrong;
      if (L >= 2) wrong = moves.slice(1, 7).filter(x => x[1] >= 8 && x[1] <= moves[0][1] - 5).map(x => x[0]);
      else { const mine = new Set(m.moves.map(x => x[0])); wrong = [...new Set(others.flatMap(x => x.moves.slice(0, 4).map(y => y[0])).filter(x => !mine.has(x)))]; }
      wrong = shuffle(wrong).slice(0, 3);
      if (wrong.length < 3) return null;
      return { q: `Which of these moves does <b>${esc(m.n)}</b> use ${L >= 2 ? 'the most' : 'most'}?`, opts: shuffle([{ label: right, ok: true }, ...wrong.map(x => ({ label: x, ok: false }))]), ex: `Its most common moves: ${esc(pct(m.moves, 6))}.` };
    },
  };
  GEN.notebook = {
    keys: () => VL.store.list('matchups').filter(m => m.plan || m.lead || m.bring).map(m => m.id),
    make(key) {
      const m = VL.store.get('matchups', key); if (!m) return null;
      const parts = [m.plan && `<b>Plan:</b> ${esc(m.plan)}`, m.lead && `<b>Lead:</b> ${esc(m.lead)}`, m.bring && `<b>Bring:</b> ${esc(m.bring)}`, m.calcs && `<b>Calcs:</b> ${esc(m.calcs)}`].filter(Boolean).join('<br>');
      return { q: `What's your plan against <b>${esc(m.name)}</b>?`, flash: true, opts: [{ label: 'I remembered it', ok: true }, { label: 'I didn\'t', ok: false }], ex: parts };
    },
  };

  function ctxFor() {
    const fmt = curFmt(); const level = +($('st-level') && $('st-level').value) || 1;
    let pool = D.pool(fmt, poolKind());
    if (!pool.length) pool = D.pool(fmt, 'fe');
    return { fmt, chart: D.chart(fmt), pool, level };
  }
  function drillStats(id) { return VL.store.get('drills', id) || { n: 0, c: 0, miss: {}, h: [] }; }
  function recentAcc(st) { const h = st.h || []; if (!h.length) return null; return Math.round(100 * h.reduce((a, b) => a + b, 0) / h.length); }

  function nextQuestion(id, ctx, used) {
    const st = drillStats(id);
    const gen = GEN[id];
    const keys = gen.keys(ctx);
    if (!keys.length) return null;
    const keySet = new Set(keys);
    const missed = Object.entries(st.miss || {}).filter(([k, n]) => n > 0 && keySet.has(k) && !used.has(k));
    for (let t = 0; t < 40; t++) {
      let key;
      if (missed.length && Math.random() < 0.4) {
        const total = missed.reduce((a, [, n]) => a + n, 0); let r = Math.random() * total;
        for (const [k, n] of missed) { r -= n; if (r <= 0) { key = k; break; } }
        key = key || missed[0][0];
      } else key = pick(keys);
      if (used.has(key) && t < 30) continue;
      const q = gen.make(key, ctx);
      if (q) { q.key = key; return q; }
    }
    return null;
  }

  function startQuiz(id) {
    const ctx = ctxFor();
    const n = Math.min(10, GEN[id].keys(ctx).length);
    S.quiz = { id, ctx, n, i: 0, results: [], used: new Set(), cur: null, answered: false, upd: { miss: {} } };
    nextQ();
    $('quiz-wrap').hidden = false;
    $('drill-list').hidden = true;
    $('quiz-wrap').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  function nextQ() {
    const z = S.quiz;
    if (z.i >= z.n) return finishQuiz();
    z.cur = nextQuestion(z.id, z.ctx, z.used);
    if (!z.cur) { z.n = z.i; return finishQuiz(); }
    z.used.add(z.cur.key); z.answered = false; z.revealed = false;
    renderQuiz();
  }
  function answer(idx) {
    const z = S.quiz; if (!z || z.answered) return;
    z.answered = true;
    const ok = !!z.cur.opts[idx].ok;
    z.results.push(ok ? 1 : 0);
    z.upd.miss[z.cur.key] = (z.upd.miss[z.cur.key] || 0) + (ok ? -1 : 2);
    z.i++;
    renderQuiz(idx);
  }
  function finishQuiz() {
    const z = S.quiz;
    if (z.results.length) {
      const st = drillStats(z.id);
      const miss = { ...(st.miss || {}) };
      for (const [k, d] of Object.entries(z.upd.miss)) { const v = Math.max(0, (miss[k] || 0) + d); if (v) miss[k] = v; else delete miss[k]; }
      const trimmed = Object.fromEntries(Object.entries(miss).sort((a, b) => b[1] - a[1]).slice(0, 300));
      const h = (st.h || []).concat(z.results).slice(-100);
      VL.store.put('drills', z.id, { n: (st.n || 0) + z.results.length, c: (st.c || 0) + z.results.reduce((a, b) => a + b, 0), miss: trimmed, h, last: Date.now() });
      VL.markDone && VL.markDone('drill');
    }
    const right = z.results.reduce((a, b) => a + b, 0);
    $('quiz-wrap').innerHTML = `<div class="card-head"><h3>${esc(DRILLS.find(d => d.id === z.id).name)}: ${right} / ${z.results.length}</h3></div>
      <p class="sub">Questions you missed will come back more often in future rounds.</p>
      <div class="row"><button class="btn" id="qz-again">Another round</button><button class="btn ghost" id="qz-done">Back to drills</button></div>`;
    $('qz-again').onclick = () => startQuiz(z.id);
    $('qz-done').onclick = closeQuiz;
    $('qz-again').focus();
  }
  function closeQuiz() { S.quiz = null; $('quiz-wrap').hidden = true; $('drill-list').hidden = false; renderDrillList(); }
  function renderQuiz(chosen) {
    const z = S.quiz, q = z.cur;
    const prog = Array.from({ length: z.n }, (_, i) => `<span class="${i < z.results.length ? (z.results[i] ? 'r' : 'w') : i === z.results.length ? 'c' : ''}"></span>`).join('');
    if (q.flash && !z.answered && !z.revealed) {
      $('quiz-wrap').innerHTML = `<div class="card-head"><h3>${esc(DRILLS.find(d => d.id === z.id).name)}</h3><button class="linkbtn" id="qz-quit">End round</button></div>
        <div class="progress">${prog}</div><div class="quiz"><div class="q">${q.q}</div><p class="sub">Say your plan out loud or in your head, then check it.</p>
        <div class="row"><button class="btn" id="qz-reveal">Show my plan</button></div></div>`;
      $('qz-reveal').onclick = () => { z.revealed = true; renderQuiz(); };
      $('qz-quit').onclick = () => { z.n = z.results.length; finishQuiz(); };
      $('qz-reveal').focus();
      return;
    }
    const opts = q.opts.map((o, i) => {
      let cls = 'opt';
      if (z.answered) { if (o.ok) cls += ' right'; else if (i === chosen) cls += ' wrong'; }
      return `<button class="${cls}" data-opt="${i}" ${z.answered ? 'disabled' : ''}>${q.html ? o.label : esc(o.label)}</button>`;
    }).join('');
    $('quiz-wrap').innerHTML = `
      <div class="card-head"><h3>${esc(DRILLS.find(d => d.id === z.id).name)}</h3><button class="linkbtn" id="qz-quit">End round</button></div>
      <div class="progress">${prog}</div>
      <div class="quiz">
        <div class="q">${q.q}</div>
        ${q.ctx ? `<div class="ctx" style="${q.stack ? 'flex-direction:column;align-items:flex-start;gap:2px' : ''}">${q.ctx}</div>` : ''}
        <div class="opts ${q.six ? 'six' : ''}" style="${q.long ? 'grid-template-columns:1fr' : ''}">${opts}</div>
        ${q.flash && !z.answered ? `<div class="explain">${q.ex}</div>` : ''}
        ${z.answered ? `<div class="explain">${q.flash ? (q.opts[chosen] && q.opts[chosen].ok ? '<b style="color:var(--win)">Nice.</b> ' : '<b style="color:var(--loss)">It\'ll come back soon.</b> ') : (q.opts[chosen] && q.opts[chosen].ok ? '<b style="color:var(--win)">Correct.</b> ' : '<b style="color:var(--loss)">Not quite.</b> ')}${q.ex}</div>
          <div class="row" style="justify-content:flex-end"><button class="btn" id="qz-next">${z.i >= z.n ? 'See results' : 'Next'}</button></div>` : ''}
      </div>`;
    $('quiz-wrap').querySelectorAll('[data-opt]').forEach(b => b.onclick = () => answer(+b.dataset.opt));
    $('qz-quit').onclick = () => { z.n = z.results.length; finishQuiz(); };
    if (z.answered) { $('qz-next').onclick = nextQ; $('qz-next').focus(); }
  }
  document.addEventListener('keydown', e => {
    if (!S.quiz || $('quiz-wrap').hidden || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    const z = S.quiz;
    if (!z.answered && /^[1-6]$/.test(e.key) && z.cur && +e.key <= z.cur.opts.length) { e.preventDefault(); answer(+e.key - 1); }
  });

  function renderDrillList() {
    const ctx = ctxFor();
    $('drill-list').innerHTML = DRILLS.map(d => {
      const st = drillStats(d.id); const acc = recentAcc(st);
      const avail = GEN[d.id].keys(ctx).length;
      const due = Object.values(st.miss || {}).filter(n => n > 0).length;
      return `<button class="drill-card" data-drill="${d.id}" ${avail ? '' : 'disabled'}>
        <h4>${esc(d.name)}</h4><span class="sub">${esc(d.desc)}</span>
        <span class="meter"><span style="width:${acc ?? 0}%"></span></span>
        <span class="acc">${acc === null ? 'Not tried yet' : `${acc}% recent · ${st.n} answered`}${due ? ` · ${due} to review` : ''}</span>
      </button>`;
    }).join('');
  }
  $('drill-list').addEventListener('click', e => { const b = e.target.closest('[data-drill]'); if (b && !b.disabled) startQuiz(b.dataset.drill); });

  // ---------- reference views ----------
  function defensive(chart, types) {
    const g = { '4': [], '2': [], '0.5': [], '0.25': [], '0': [] };
    for (const a of chart.types) { const m = D.eff(chart, a, types); if (g[String(m)]) g[String(m)].push(a); }
    return g;
  }
  function renderDex() {
    const q = $('dex-q').value.trim();
    const out = $('dex-out');
    if (!q) { out.innerHTML = '<p class="sub">Type a name. Stats and typing follow the study format you picked.</p>'; return; }
    let i = D.find(q);
    if (i < 0) {
      const hits = D.dex.species.map((s, k) => [s, k]).filter(([s]) => toId(s.n).includes(toId(q))).slice(0, 12);
      out.innerHTML = hits.length ? `<div class="chips">${hits.map(([s]) => `<button class="chip" data-dexpick="${esc(s.n)}">${esc(s.n)}</button>`).join('')}</div>` : '<p class="sub">No match.</p>';
      return;
    }
    const fmt = curFmt(); const p = D.mon(i, fmt); const chart = D.chart(fmt);
    const legal = fmt.species.includes(i);
    const names = ['HP', 'Attack', 'Defense', 'Special Attack', 'Special Defense', 'Speed'];
    const bars = p.s.map((v, k) => `<span>${names[k]}</span><span class="num">${v}</span><span class="tr"><span style="width:${Math.min(100, v / 2)}%"></span></span>`).join('');
    const g = defensive(chart, p.t);
    const row = (lbl, arr) => arr.length ? `<div class="kv"><span class="sub" style="width:44px">${lbl}</span>${typesHtml(arr)}</div>` : '';
    const sp = ['min-', 'none', 'max', 'max+'].map(k => `<td class="num">${D.speed(p.s[5], k, fmt)}</td>`).join('');
    out.innerHTML = `<div class="grid2" style="margin-top:12px">
      <div style="display:flex;flex-direction:column;gap:10px">
        <div class="kv"><h3>${esc(p.n)}</h3>${typesHtml(p.t)} <span class="pill ${legal ? 'w' : 'm'}">${legal ? 'legal in ' + esc(fmt.name) : 'not legal in ' + esc(fmt.name)}</span></div>
        <div class="statbars">${bars}<span>Total</span><span class="num">${p.s.reduce((a, b) => a + b, 0)}</span><span></span></div>
        <table class="list"><thead><tr><th>Speed at Level 50</th><th>Min −</th><th>None</th><th>Max</th><th>Max +</th></tr></thead><tbody><tr><td></td>${sp}</tr></tbody></table>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <b>Abilities</b>
        ${(p.a || []).map(a => { const ab = D.ability(toId(a), fmt); return `<div><b>${esc(a)}</b><div class="sub">${esc(ab ? ab.d : '')}</div></div>`; }).join('')}
        <b style="margin-top:6px">Takes damage</b>
        ${row('4×', g['4'])}${row('2×', g['2'])}${row('½×', g['0.5'])}${row('¼×', g['0.25'])}${row('0×', g['0'])}
        <span class="sub">Type chart only. Abilities like Levitate change this.</span>
      </div></div>`;
  }
  $('dex-out').addEventListener('click', e => { const b = e.target.closest('[data-dexpick]'); if (b) { $('dex-q').value = b.dataset.dexpick; renderDex(); } });

  function renderSpeed() {
    const fmt = curFmt(); const ctx = ctxFor();
    const q = toId($('sp-q').value); const lo = +$('sp-min').value || 0, hi = +$('sp-max').value || 999;
    const para = fmt.gen >= 7 ? 0.5 : 0.25;
    const rows = ctx.pool.map(i => D.mon(i, fmt)).filter(p => p && p.s[5] >= lo && p.s[5] <= hi && (!q || toId(p.n).includes(q))).sort((a, b) => b.s[5] - a.s[5] || a.n.localeCompare(b.n)).slice(0, 500);
    $('sp-note').textContent = `${rows.length} Pokémon at Level 50 in ${fmt.name}. ${fmt.noIVs ? 'This game has no individual values, so every column assumes perfect ones.' : 'Minimum uses 0 individual values; the rest assume 31.'} Scarf, Tailwind and paralysis columns use max Speed with a + nature.`;
    $('sp-table').innerHTML = `<table class="list"><thead><tr><th>Pokémon</th><th>Base</th><th>Min −</th><th>None</th><th>Max</th><th>Max +</th><th>Scarf</th><th>Tailwind</th><th>Paralyzed</th></tr></thead><tbody>${rows.map(p => {
      const mp = D.speed(p.s[5], 'max+', fmt);
      return `<tr><td>${esc(p.n)}</td><td class="num">${p.s[5]}</td><td class="num">${D.speed(p.s[5], 'min-', fmt)}</td><td class="num">${D.speed(p.s[5], 'none', fmt)}</td><td class="num">${D.speed(p.s[5], 'max', fmt)}</td><td class="num"><b>${mp}</b></td><td class="num">${Math.floor(mp * 1.5)}</td><td class="num">${mp * 2}</td><td class="num">${Math.floor(mp * para)}</td></tr>`;
    }).join('')}</tbody></table>`;
  }

  function renderTypes() {
    const chart = D.chart(curFmt()); const t = chart.types;
    const cell = (m) => `<td class="${m === 2 ? 'x2' : m === 0.5 ? 'x05' : m === 0 ? 'x0' : ''}">${m === 1 ? '' : m === 0.5 ? '½' : m}</td>`;
    $('tc-table').innerHTML = `<table class="chart"><thead><tr><th></th>${t.map(d => `<th class="colh">${esc(d)}</th>`).join('')}</tr></thead><tbody>${t.map(a => `<tr><th class="rowh"><span class="ty ${esc(a)}">${esc(a)}</span></th>${t.map(d => cell(chart.eff[a][d])).join('')}</tr>`).join('')}</tbody></table>`;
  }

  function renderItems() {
    const fmt = curFmt();
    const qi = $('it-q').value.trim().toLowerCase(), qa = $('ab-q').value.trim().toLowerCase();
    const items = fmt.items.map(id => D.item(id, fmt)).filter(Boolean).filter(it => !qi || it.n.toLowerCase().includes(qi) || it.d.toLowerCase().includes(qi));
    $('it-out').innerHTML = items.slice(0, 300).map(it => `<div class="it"><b>${esc(it.n)}</b><span>${esc(it.d)}</span></div>`).join('') || '<p class="sub">No match.</p>';
    const abs = GEN.abilities.keys(ctxFor()).map(k => D.ability(k, ctxFor().fmt)).filter(Boolean).sort((a, b) => a.n.localeCompare(b.n)).filter(a => !qa || a.n.toLowerCase().includes(qa) || a.d.toLowerCase().includes(qa));
    $('ab-out').innerHTML = abs.slice(0, 400).map(a => `<div class="it"><b>${esc(a.n)}</b><span>${esc(a.d)}</span></div>`).join('') || '<p class="sub">No match.</p>';
  }

  function renderPriority() {
    const by = {};
    for (const m of D.prio(ctxFor().fmt)) (by[m.p] ||= []).push(m);
    const keys = Object.keys(by).map(Number).sort((a, b) => b - a);
    $('pr-out').innerHTML = keys.map(p => `<div style="padding:10px 0;border-top:1px solid var(--line)"><b class="num">${p > 0 ? '+' : ''}${p}</b> <span class="sub">${by[p].length} moves</span><div class="chips" style="margin-top:6px">${by[p].sort((a, b) => a.n.localeCompare(b.n)).map(m => `<span class="chip" title="${esc(m.d)}" style="cursor:default">${esc(m.n)}</span>`).join('')}</div></div>`).join('') +
      '<p class="sub">Prankster adds +1 to status moves, Gale Wings +1 to Flying moves at full HP, and Grassy Glide gets +1 in Grassy Terrain.</p>';
  }

  function setView(v) {
    S.view = v;
    document.querySelectorAll('[data-sv]').forEach(b => b.setAttribute('aria-pressed', b.dataset.sv === v));
    document.querySelectorAll('.sv').forEach(el => { el.hidden = el.id !== 'sv-' + v; });
    render();
  }
  document.querySelectorAll('[data-sv]').forEach(b => b.onclick = () => setView(b.dataset.sv));

  function render() {
    if (!D.dex) return;
    const fmt = curFmt(); const ctx = ctxFor();
    $('st-meta').textContent = `${fmt.game} · ${fmt.doubles ? 'Doubles' : 'Singles'} · Gen ${fmt.gen} mechanics · Gimmick: ${fmt.gimmick} · ${ctx.pool.length} Pokémon in the pool${poolKind() === 'logs' && !D.pool(fmt, 'logs').length ? ' (no logged Pokémon yet, so using fully evolved)' : ''}`;
    if (S.view === 'drills' && !S.quiz) renderDrillList();
    if (S.view === 'dex') renderDex();
    if (S.view === 'speed') renderSpeed();
    if (S.view === 'types') renderTypes();
    if (S.view === 'items') renderItems();
    if (S.view === 'priority') renderPriority();
    if (S.view === 'glossary' && VL.renderGlossary) VL.renderGlossary();
  }
  for (const id of ['st-format', 'st-pool', 'st-level']) $(id).addEventListener('change', () => { if (S.quiz) closeQuiz(); render(); });
  $('dex-q').addEventListener('input', renderDex);
  for (const id of ['sp-q', 'sp-min', 'sp-max']) $(id).addEventListener('input', renderSpeed);
  for (const id of ['it-q', 'ab-q']) $(id).addEventListener('input', renderItems);

  VL.study = {
    render,
    DRILLS,
    // used by the Test page: questions without spaced repetition
    ctxFor(fmtId, poolKind, level) {
      const fmt = D.format(fmtId); let pool = D.pool(fmt, poolKind);
      if (pool.length < 12) pool = D.pool(fmt, 'fe');
      return { fmt, chart: D.chart(fmt), pool, level: level || 1 };
    },
    hasQuestions(kind, ctx) { return GEN[kind].keys(ctx).length > 0; },
    randomQuestion(kind, ctx, used) {
      const keys = GEN[kind].keys(ctx).filter(k => !used.has(kind + ':' + k));
      for (let t = 0; t < 40 && keys.length; t++) { const k = pick(keys); const q = GEN[kind].make(k, ctx); if (q && !q.flash) { q.key = k; return q; } }
      return null;
    },
    accuracy(id) { return recentAcc(drillStats(id)); },
    fill(selectedFormat) {
      const sel = $('st-format');
      const cur = selectedFormat || sel.value;
      sel.innerHTML = D.formats().map(f => `<option value="${esc(f.id)}">${esc(f.name)} · ${esc(f.game)}${f.current ? ' (current)' : ''}</option>`).join('');
      sel.value = D.format(cur).id;
    },
  };
})();
