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
    formats() { return this.dex ? this.dex.formats : []; },
    format(id) { const f = this.formats(); return f.find(x => x.id === id) || f.find(x => x.current && x.doubles) || f[0]; },
    mon(i, fmt) {
      const s = this.dex.species[i]; if (!s) return null;
      const ov = fmt && fmt.overrides && fmt.overrides[i];
      return ov ? { ...s, ...(ov.s ? { s: ov.s } : {}), ...(ov.t ? { t: ov.t } : {}), i } : { ...s, i };
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
    return VL.MECHANICS.map((c, i) => ({ ...c, i })).filter(c => gen >= (c.min || 1) && (!c.max || gen <= c.max) && (c.champ === 'only' ? champ : c.champ === 'not' ? !champ : true));
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
        const m = D.eff(c.chart, a, p.t);
        const parts = p.t.map(t => `${a} → ${t}: ${mult(D.eff(c.chart, a, [t]))}`).join(', ');
        return { q: `${typesHtml([a])} attack into <b>${esc(p.n)}</b>`, ctx: typesHtml(p.t), opts: [0, 0.25, 0.5, 1, 2, 4].map(v => ({ label: mult(v), ok: v === m })), six: true,
          ex: `${esc(parts)}. Together: <b>${mult(m)}</b>. Abilities like Levitate or Flash Fire aren't counted here.` };
      },
    },
    weakness: {
      keys: (c) => c.pool.map(String),
      make(key, c) {
        const p = D.mon(+key, c.fmt); if (!p) return null;
        const t = c.chart.types;
        const se = t.filter(a => D.eff(c.chart, a, p.t) >= 2);
        const not = t.filter(a => D.eff(c.chart, a, p.t) <= 1);
        if (!se.length || not.length < 3) return null;
        const right = pick(se);
        const opts = shuffle([right, ...shuffle(not).slice(0, 3)]).map(a => ({ label: typesHtml([a]), ok: a === right, raw: a }));
        const list = se.map(a => `${a} ${mult(D.eff(c.chart, a, p.t))}`).join(', ');
        return { q: `Which type hits <b>${esc(p.n)}</b> super effectively?`, ctx: typesHtml(p.t), opts, html: true,
          ex: `${esc(p.n)} is weak to: <b>${esc(list)}</b>.` };
      },
    },
    basespeed: {
      keys: (c) => c.pool.map(String),
      make(key, c) {
        const p = D.mon(+key, c.fmt); if (!p) return null;
        const b = p.s[5];
        const near = new Set([b]);
        const cand = shuffle([-25, -20, -15, -10, -5, 5, 10, 15, 20, 25]).map(d => b + d).filter(v => v > 0);
        for (const v of cand) { if (near.size >= 4) break; near.add(v); }
        const opts = shuffle([...near]).map(v => ({ label: String(v), ok: v === b }));
        const tiers = ['none', 'max', 'max+'].map(k => `${SPREADS[k]}: ${D.speed(b, k, c.fmt)}`).join(' · ');
        return { q: `What is <b>${esc(p.n)}</b>'s base Speed?`, ctx: typesHtml(p.t), opts,
          ex: `Base <b>${b}</b>. At Level 50: ${esc(tiers)}.` };
      },
    },
    whofirst: {
      keys: (c) => c.pool.map(String),
      make(key, c) {
        const gen = c.fmt ? c.fmt.gen : 9;
        for (let tries = 0; tries < 30; tries++) {
          const A = D.mon(+key, c.fmt); const B = D.mon(pick(c.pool), c.fmt);
          if (!A || !B || A.i === B.i) continue;
          const sa = pick(Object.keys(SPREADS)), sb = pick(Object.keys(SPREADS));
          const cond = pick(['none', 'none', 'tailwindA', 'tailwindB', 'tr', 'tr', 'paraA', 'paraB', 'scarfA', 'scarfB', 'plusA', 'icyB']);
          const condText = { none: 'No speed control.', tailwindA: `Tailwind is up on ${A.n}'s side.`, tailwindB: `Tailwind is up on ${B.n}'s side.`, tr: 'Trick Room is up.', paraA: `${A.n} is paralyzed.`, paraB: `${B.n} is paralyzed.`, scarfA: `${A.n} holds a Choice Scarf.`, scarfB: `${B.n} holds a Choice Scarf.`, plusA: `${A.n} is at +1 Speed.`, icyB: `${B.n} was hit by Icy Wind (−1 Speed).` }[cond];
          let va = D.speed(A.s[5], sa, c.fmt), vb = D.speed(B.s[5], sb, c.fmt);
          const base = [va, vb];
          const para = gen >= 7 ? 0.5 : 0.25;
          if (cond === 'tailwindA') va *= 2; if (cond === 'tailwindB') vb *= 2;
          if (cond === 'paraA') va = Math.floor(va * para); if (cond === 'paraB') vb = Math.floor(vb * para);
          if (cond === 'scarfA') va = Math.floor(va * 1.5); if (cond === 'scarfB') vb = Math.floor(vb * 1.5);
          if (cond === 'plusA') va = Math.floor(va * 1.5); if (cond === 'icyB') vb = Math.floor(vb * 2 / 3);
          const tie = va === vb;
          // Without modifiers the numbers are exact. With Scarf, Tailwind, paralysis or
          // stat stages the game's rounding can move a stat by a point, so skip close calls.
          const exact = cond === 'none' || cond === 'tr';
          if (!exact && Math.abs(va - vb) <= 2) continue;
          const tr = cond === 'tr';
          const first = tie ? 'tie' : ((va > vb) !== tr ? 'A' : 'B');
          const opts = [{ label: `${esc(A.n)} first`, ok: first === 'A' }, { label: `${esc(B.n)} first`, ok: first === 'B' }, { label: 'Speed tie (random)', ok: first === 'tie' }];
          const ex = `${esc(A.n)} (base ${A.s[5]}, ${SPREADS[sa]}) = ${base[0]}${va !== base[0] ? ` → <b>${va}</b>` : ''}. ${esc(B.n)} (base ${B.s[5]}, ${SPREADS[sb]}) = ${base[1]}${vb !== base[1] ? ` → <b>${vb}</b>` : ''}.${tr ? ' Trick Room: slower moves first.' : ''}${c.fmt && c.fmt.noIVs ? ' This game has no individual values, so minimum Speed still has perfect ones.' : ''}`;
          return { q: `Who moves first?`, ctx: `<div><b>${esc(A.n)}</b>: ${SPREADS[sa]}</div><div><b>${esc(B.n)}</b>: ${SPREADS[sb]}</div><div class="sub">${esc(condText)} Level 50, both using a same-priority move.</div>`, opts, html: true, stack: true, ex };
        }
        return null;
      },
    },
    items: {
      keys: (c) => (c.fmt ? c.fmt.items : Object.keys(D.dex.items)).filter(id => D.dex.items[id]),
      make(key, c) {
        const it = D.dex.items[key]; if (!it) return null;
        const others = shuffle(GEN.items.keys(c).filter(k => k !== key && D.dex.items[k].d !== it.d)).slice(0, 3).map(k => D.dex.items[k].d);
        const opts = shuffle([{ label: it.d, ok: true }, ...others.map(d => ({ label: d, ok: false }))]);
        return { q: `What does <b>${esc(it.n)}</b> do?`, opts, long: true, ex: `<b>${esc(it.n)}</b>: ${esc(it.d)}` };
      },
    },
    abilities: {
      keys: (c) => { const s = new Set(); for (const i of c.pool) for (const a of (D.mon(i, c.fmt).a || [])) s.add(toId(a)); return [...s].filter(k => D.dex.abilities[k]); },
      make(key, c) {
        const ab = D.dex.abilities[key]; if (!ab) return null;
        const others = shuffle(GEN.abilities.keys(c).filter(k => k !== key && D.dex.abilities[k].d !== ab.d)).slice(0, 3).map(k => D.dex.abilities[k].d);
        if (others.length < 3) return null;
        const opts = shuffle([{ label: ab.d, ok: true }, ...others.map(d => ({ label: d, ok: false }))]);
        const who = c.pool.map(i => D.mon(i, c.fmt)).filter(p => (p.a || []).some(a => toId(a) === key)).slice(0, 5).map(p => p.n);
        return { q: `What does <b>${esc(ab.n)}</b> do?`, opts, long: true, ex: `<b>${esc(ab.n)}</b>: ${esc(ab.d)}${who.length ? `<br><span class="sub">Seen on: ${esc(who.join(', '))}</span>` : ''}` };
      },
    },
    priority: {
      keys: () => Object.keys(D.dex.priorityMoves),
      make(key) {
        const m = D.dex.priorityMoves[key]; if (!m) return null;
        const vals = new Set([m.p]);
        for (const v of shuffle([-7, -6, -5, -4, -3, -1, 1, 2, 3, 4, 5].filter(v => v !== m.p).sort((x, y) => Math.abs(x - m.p) - Math.abs(y - m.p)).slice(0, 5))) { if (vals.size >= 4) break; vals.add(v); }
        const fmtP = (v) => (v > 0 ? '+' : '') + v;
        const opts = [...vals].sort((a, b) => b - a).map(v => ({ label: fmtP(v), ok: v === m.p }));
        return { q: `What priority is <b>${esc(m.n)}</b>?`, ctx: `${typesHtml([m.t])} <span class="pill m">${esc(m.c)}</span>`, opts, ex: `<b>${esc(m.n)}</b> is <b>${fmtP(m.p)}</b>. ${esc(m.d)}` };
      },
    },
    mechanics: {
      keys: (c) => mechCards(c.fmt).map(x => String(x.i)),
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
      const others = e.mons.slice(0, 60).filter(x => x.n !== m.n);
      const kinds = [];
      if (m.items[0] && m.items[0][1] >= 25 && m.items[0][0] !== 'No item') kinds.push('item');
      if (m.abilities.length > 1 && m.abilities[0][1] >= 60) kinds.push('ability');
      if (m.moves.length >= 4) kinds.push('move');
      if (!kinds.length) return null;
      const k = pick(kinds);
      if (k === 'item') {
        const right = m.items[0][0]; const pool = [...new Set(others.map(x => x.items[0] && x.items[0][0]).filter(x => x && x !== right && x !== 'No item' && !m.items.some(i => i[0] === x)))];
        if (pool.length < 3) return null;
        return { q: `What item does <b>${esc(m.n)}</b> hold most often?`, opts: shuffle([{ label: right, ok: true }, ...shuffle(pool).slice(0, 3).map(x => ({ label: x, ok: false }))]),
          ex: `Most common items: ${esc(m.items.slice(0, 3).map(x => `${x[0]} ${Math.round(x[1])}%`).join(', '))}.` };
      }
      if (k === 'ability') {
        return { q: `Which ability does <b>${esc(m.n)}</b> run most often?`, opts: shuffle(m.abilities.map((a, i) => ({ label: a[0], ok: i === 0 }))),
          ex: `${esc(m.abilities.map(x => `${x[0]} ${Math.round(x[1])}%`).join(', '))}.` };
      }
      const right = m.moves[0][0]; const mine = new Set(m.moves.map(x => x[0]));
      const pool = [...new Set(others.flatMap(x => x.moves.slice(0, 4).map(y => y[0])).filter(x => !mine.has(x)))];
      if (pool.length < 3) return null;
      return { q: `Which of these moves does <b>${esc(m.n)}</b> use most?`, opts: shuffle([{ label: right, ok: true }, ...shuffle(pool).slice(0, 3).map(x => ({ label: x, ok: false }))]),
        ex: `Its most common moves: ${esc(m.moves.slice(0, 5).map(x => `${x[0]} ${Math.round(x[1])}%`).join(', '))}.` };
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
    const fmt = curFmt();
    let pool = D.pool(fmt, poolKind());
    if (!pool.length) pool = D.pool(fmt, 'fe');
    return { fmt, chart: D.chart(fmt), pool };
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
        ${(p.a || []).map(a => { const ab = D.dex.abilities[toId(a)]; return `<div><b>${esc(a)}</b><div class="sub">${esc(ab ? ab.d : '')}</div></div>`; }).join('')}
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
    const items = fmt.items.map(id => D.dex.items[id]).filter(Boolean).filter(it => !qi || it.n.toLowerCase().includes(qi) || it.d.toLowerCase().includes(qi));
    $('it-out').innerHTML = items.slice(0, 300).map(it => `<div class="it"><b>${esc(it.n)}</b><span>${esc(it.d)}</span></div>`).join('') || '<p class="sub">No match.</p>';
    const abs = GEN.abilities.keys(ctxFor()).map(k => D.dex.abilities[k]).filter(Boolean).sort((a, b) => a.n.localeCompare(b.n)).filter(a => !qa || a.n.toLowerCase().includes(qa) || a.d.toLowerCase().includes(qa));
    $('ab-out').innerHTML = abs.slice(0, 400).map(a => `<div class="it"><b>${esc(a.n)}</b><span>${esc(a.d)}</span></div>`).join('') || '<p class="sub">No match.</p>';
  }

  function renderPriority() {
    const by = {};
    for (const m of Object.values(D.dex.priorityMoves)) (by[m.p] ||= []).push(m);
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
  for (const id of ['st-format', 'st-pool']) $(id).addEventListener('change', () => { if (S.quiz) closeQuiz(); render(); });
  $('dex-q').addEventListener('input', renderDex);
  for (const id of ['sp-q', 'sp-min', 'sp-max']) $(id).addEventListener('input', renderSpeed);
  for (const id of ['it-q', 'ab-q']) $(id).addEventListener('input', renderItems);

  VL.study = {
    render,
    DRILLS,
    accuracy(id) { return recentAcc(drillStats(id)); },
    fill(selectedFormat) {
      const sel = $('st-format');
      const cur = selectedFormat || sel.value;
      sel.innerHTML = D.formats().map(f => `<option value="${esc(f.id)}">${esc(f.name)} · ${esc(f.game)}${f.current ? ' (current)' : ''}</option>`).join('');
      sel.value = D.format(cur).id;
    },
  };
})();
