/* Games: fast, scored practice for knowledge that has to be instant.
 * Speed Duel, Speed Sort, Turn Order, Damage Guess and Type Rush.
 * Every game ends with a review of the misses, with the real numbers. */
(function () {
  'use strict';
  const VL = (window.VL = window.VL || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toId = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const rand = (n) => Math.floor(Math.random() * n);
  const pick = (a) => a[rand(a.length)];
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const ty = (t) => `<span class="ty ${esc(t)}">${esc(t)}</span>`;
  const mult = (m) => m === 0.25 ? '¼×' : m === 0.5 ? '½×' : m + '×';
  const D = () => VL.D;

  const GAMES = [
    { id: 'duel', name: 'Speed Duel', desc: 'Two Pokémon. Tap the one that moves first. 60 seconds, as many as you can.', modes: [['base', 'Base Speed'], ['spread', 'Real spreads'], ['control', 'With speed control']] },
    { id: 'sort', name: 'Speed Sort', desc: 'Put 5 Pokémon in order from fastest to slowest. 5 rounds.', modes: [['base', 'Base Speed'], ['spread', 'Real spreads'], ['tr', 'Under Trick Room']] },
    { id: 'order', name: 'Turn Order', desc: 'Four Pokémon pick their moves. Tap them in the order they\'ll act: priority first, then Speed. 8 rounds.', modes: [['normal', 'Standard'], ['field', 'With Tailwind and Trick Room']] },
    { id: 'damage', name: 'Damage Guess', desc: 'A real attack with common sets. Guess how much it does before the calculator tells you. 8 rounds.', modes: [['guess', 'Guess the %']] },
    { id: 'types', name: 'Type Rush', desc: 'Attacking type into a real Pokémon\'s typing. 60 seconds, keep the streak going.', modes: [['rush', '60 seconds']] },
  ];

  // Each answer updates the rating for its skill area. Harder levels count for more.
  const AREA = { duel: 'speed', sort: 'speed', order: 'order', damage: 'damage', types: 'types' };
  const DIFF = { duel: { base: 1000, spread: 1200, control: 1400 }, sort: { base: 1050, spread: 1250, tr: 1300 }, order: { normal: 1300, field: 1450 }, damage: { guess: 1300 }, types: { rush: 1100 } };
  const rate = (s) => { if (G) G.res.push({ a: AREA[G.id], d: DIFF[G.id][G.mode], s }); };

  // ---------- settings: format and pool ----------
  const fmt = () => D().format($('ar-format').value || (VL.curFormatId && VL.curFormatId()));
  function pool() {
    const f = fmt(); const kind = $('ar-pool').value;
    let p = D().pool(f, kind);
    if (p.length < 12) p = D().pool(f, 'fe');
    return p;
  }
  const SPREADS = { 'max+': 'max Speed, + nature', 'max': 'max Speed, neutral', 'none': 'no Speed investment', 'min-': 'minimum Speed, − nature' };
  // the most common spread for a Pokémon in the meta, as a Speed number
  function commonSpeed(p, f) {
    const e = VL.meta.forFormat(f.id); const m = VL.meta.get(e, p.n);
    if (!m || !m.spreads[0]) return null;
    const [nat, nums] = m.spreads[0][0].split(':'); if (!nums) return null;
    const inv = +nums.split('/')[5] || 0; const champ = f.mod && f.mod.startsWith('champions');
    const plus = { timid: 1, hasty: 1, jolly: 1, naive: 1 }[toId(nat)], minus = { brave: 1, relaxed: 1, quiet: 1, sassy: 1 }[toId(nat)];
    const raw = champ ? p.s[5] + 20 + inv : Math.floor((2 * p.s[5] + 31 + Math.floor(inv / 4)) * 50 / 100) + 5;
    return { v: Math.floor(raw * (plus ? 1.1 : minus ? 0.9 : 1)), label: `${nat}, ${inv} Speed ${champ ? 'Stat Points' : 'effort values'} (most common)` };
  }
  function speedSet(p, f, mode) {
    if (mode === 'base') return { v: p.s[5], label: `base ${p.s[5]}`, base: true };
    const c = Math.random() < 0.6 ? commonSpeed(p, f) : null;
    if (c) return c;
    const k = pick(Object.keys(SPREADS));
    return { v: D().speed(p.s[5], k, f), label: SPREADS[k] };
  }

  // ---------- shared play state ----------
  let G = null; let timer = null;
  const area = () => $('ar-play');
  function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }
  function header(extra) {
    const g = GAMES.find(x => x.id === G.id);
    return `<div class="card-head"><h3>${esc(g.name)} <span class="sub">${esc(g.modes.find(m => m[0] === G.mode)[1])}</span></h3><div class="kv">${extra || ''}<button class="linkbtn" id="ar-quit">End game</button></div></div>`;
  }
  function bindQuit() { const q = $('ar-quit'); if (q) q.onclick = () => finish(); }
  function start(id, mode) {
    stopTimer();
    G = { id, mode, score: 0, streak: 0, best: 0, n: 0, right: 0, misses: [], round: 0, t0: Date.now(), res: [] };
    $('ar-list').hidden = true; area().hidden = false;
    ({ duel: duelNext, sort: sortNext, order: orderNext, damage: damageNext, types: typesNext })[id]();
    if (id === 'duel' || id === 'types') {
      G.left = 60;
      timer = setInterval(() => { G.left--; const el = $('ar-time'); if (el) el.textContent = G.left; if (G.left <= 0) finish(); }, 1000);
    }
    area().scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  function scoreHit(ok, miss) {
    G.n++; rate(ok ? 1 : 0);
    if (ok) { G.right++; G.streak++; G.best = Math.max(G.best, G.streak); G.score += 10 + Math.min(G.streak, 10) * 2; }
    else { G.streak = 0; if (miss) G.misses.push(miss); }
  }
  function finish() {
    stopTimer(); if (!G) return;
    const g = GAMES.find(x => x.id === G.id);
    const key = G.id + ':' + G.mode;
    const rec = VL.store.get('arcade', key) || { best: 0, plays: 0, hist: [] };
    const isBest = G.score > (rec.best || 0);
    if (G.n) VL.store.put('arcade', key, { best: Math.max(rec.best || 0, G.score), plays: (rec.plays || 0) + 1, hist: (rec.hist || []).concat([{ s: G.score, a: G.n ? Math.round(100 * G.right / G.n) : 0, t: Date.now() }]).slice(-30) });
    if (G.n && VL.markDone) VL.markDone('drill');
    const changes = G.n && VL.progress ? VL.progress.apply(G.res, { src: 'game', label: `${g.name} · ${g.modes.find(m => m[0] === G.mode)[1]}`, points: G.score }) : null;
    const acc = G.n ? Math.round(100 * G.right / G.n) : 0;
    area().innerHTML = `<div class="card-head"><h3>${esc(g.name)}: ${G.score} points</h3>${isBest && G.n ? '<span class="pill w">New best</span>' : `<span class="pill m">Best ${rec.best || 0}</span>`}</div>
      <div class="tiles"><div class="tile"><div class="k">Correct</div><div class="v">${G.right}/${G.n}</div></div><div class="tile"><div class="k">Accuracy</div><div class="v">${acc}%</div></div><div class="tile"><div class="k">Best streak</div><div class="v hot">${G.best}</div></div><div class="tile"><div class="k">Points</div><div class="v">${G.score}</div></div></div>
      ${VL.progress ? VL.progress.changesHtml(changes) : ''}
      ${G.misses.length ? `<div><div class="section-label">Review your misses</div><div class="misses">${G.misses.slice(0, 25).map(m => `<div class="miss">${m}</div>`).join('')}</div></div>` : (G.n ? '<p class="sub">No misses. Try a harder level.</p>' : '')}
      <div class="row"><button class="btn" id="ar-again">Play again</button><button class="btn ghost" id="ar-back">All games</button></div>`;
    $('ar-again').onclick = () => start(G.id, G.mode);
    $('ar-back').onclick = close;
    G = { ...G, done: true };
  }
  function close() { stopTimer(); G = null; area().hidden = true; $('ar-list').hidden = false; renderList(); }

  // ---------- Speed Duel ----------
  function duelNext() {
    const f = fmt(); const P = pool(); const gen = f.gen;
    for (let t = 0; t < 60; t++) {
      const A = D().mon(pick(P), f), B = D().mon(pick(P), f); if (!A || !B || A.i === B.i) continue;
      const sa = speedSet(A, f, G.mode === 'base' ? 'base' : 'spread'), sb = speedSet(B, f, G.mode === 'base' ? 'base' : 'spread');
      let va = sa.v, vb = sb.v, cond = 'none', condText = '';
      if (G.mode === 'control') {
        cond = pick(['twA', 'twB', 'tr', 'tr', 'parA', 'parB', 'scarfA', 'scarfB', 'plusA', 'icyB']);
        const para = gen >= 7 ? 0.5 : 0.25;
        ({ twA: () => { va *= 2; condText = `Tailwind on ${A.n}'s side`; }, twB: () => { vb *= 2; condText = `Tailwind on ${B.n}'s side`; }, tr: () => { condText = 'Trick Room is up'; }, parA: () => { va = Math.floor(va * para); condText = `${A.n} is paralyzed`; }, parB: () => { vb = Math.floor(vb * para); condText = `${B.n} is paralyzed`; }, scarfA: () => { va = Math.floor(va * 1.5); condText = `${A.n} holds Choice Scarf`; }, scarfB: () => { vb = Math.floor(vb * 1.5); condText = `${B.n} holds Choice Scarf`; }, plusA: () => { va = Math.floor(va * 1.5); condText = `${A.n} is at +1 Speed`; }, icyB: () => { vb = Math.floor(vb * 2 / 3); condText = `${B.n} was hit by Icy Wind`; } })[cond]();
        if (Math.abs(va - vb) <= 2) continue;
      }
      const tr = cond === 'tr';
      const ans = va === vb ? 'tie' : ((va > vb) !== tr ? 'A' : 'B');
      if (ans === 'tie' && Math.random() < 0.7) continue; // ties are rare, keep them rare
      G.cur = { A, B, sa, sb, va, vb, ans, tr, condText };
      return renderDuel();
    }
  }
  function renderDuel(flash) {
    const c = G.cur;
    const card = (p, s, side) => `<button class="duelcard ${flash ? (c.ans === side ? 'right' : flash === side ? 'wrong' : '') : ''}" data-duel="${side}" ${flash ? 'disabled' : ''}>
      ${VL.sprite(p, 'md', false)}<b>${esc(p.n)}</b><span class="kv">${p.t.map(ty).join(' ')}</span><span class="sub">${esc(s.base ? 'Base Speed' : s.label)}</span>
      ${flash ? `<span class="num big2">${side === 'A' ? c.va : c.vb}</span>` : ''}</button>`;
    area().innerHTML = `${header(`<span class="pill n">⏱ <span id="ar-time">${G.left ?? 60}</span>s</span><span class="pill m">${G.score} pts</span>${G.streak > 1 ? `<span class="pill w">streak ${G.streak}</span>` : ''}`)}
      <p class="q2">${c.tr ? 'Trick Room is up. ' : ''}Who moves first?${c.condText && !c.tr ? ` <span class="sub">${esc(c.condText)}.</span>` : ''}</p>
      <div class="duel">${card(c.A, c.sa, 'A')}<span class="vs">or</span>${card(c.B, c.sb, 'B')}</div>
      <div class="row" style="justify-content:center"><button class="btn ghost small" data-duel="tie" ${flash ? 'disabled' : ''}>Speed tie</button></div>
      <p class="sub" style="text-align:center">On a keyboard: ← left, → right, ↓ tie. Level 50, same-priority moves.</p>`;
    bindQuit();
  }
  function duelAnswer(side) {
    if (!G || G.id !== 'duel' || G.lock) return;
    const c = G.cur; const ok = side === c.ans;
    scoreHit(ok, `<b>${esc(c.A.n)}</b> ${c.va} vs <b>${esc(c.B.n)}</b> ${c.vb}${c.condText ? ` (${esc(c.condText)})` : ''}. ${c.ans === 'tie' ? 'Speed tie.' : `${esc(c.ans === 'A' ? c.A.n : c.B.n)} moves first.`} <span class="sub">${esc(c.A.n)}: ${esc(c.sa.label)} · ${esc(c.B.n)}: ${esc(c.sb.label)}</span>`);
    G.lock = true; renderDuel(side);
    setTimeout(() => { G && (G.lock = false); if (G && !G.done) duelNext(); }, ok ? 450 : 1300);
  }

  // ---------- Speed Sort ----------
  function sortNext() {
    if (G.round >= 5) return finish();
    G.round++;
    const f = fmt(); const P = pool();
    for (let t = 0; t < 80; t++) {
      const ids = shuffle(P).slice(0, 5); const mons = ids.map(i => D().mon(i, f));
      const sets = mons.map(p => speedSet(p, f, G.mode === 'base' ? 'base' : 'spread'));
      const vals = sets.map(s => s.v); if (new Set(vals).size < 5) continue;
      G.cur = { mons, sets, picked: [] }; return renderSort();
    }
  }
  function sortCorrect() { const c = G.cur; const idx = c.mons.map((m, i) => i).sort((a, b) => c.sets[b].v - c.sets[a].v); return G.mode === 'tr' ? idx.reverse() : idx; }
  function renderSort(done) {
    const c = G.cur; const correct = sortCorrect();
    area().innerHTML = `${header(`<span class="pill m">Round ${G.round}/5</span><span class="pill m">${G.score} pts</span>`)}
      <p class="q2">${G.mode === 'tr' ? 'Trick Room is up. Tap them in the order they move: <b>slowest first</b>.' : 'Tap them in order from <b>fastest</b> to <b>slowest</b>.'}</p>
      <div class="sortgrid">${c.mons.map((p, i) => { const pos = c.picked.indexOf(i); const ok = done && correct[pos] === i;
        return `<button class="duelcard ${done ? (ok ? 'right' : 'wrong') : pos >= 0 ? 'chosen' : ''}" data-sort="${i}" ${done || pos >= 0 ? 'disabled' : ''}>${pos >= 0 ? `<span class="order">${pos + 1}</span>` : ''}${VL.sprite(p, 'md', false)}<b>${esc(p.n)}</b><span class="sub">${esc(G.mode === 'base' ? 'Base Speed' : c.sets[i].label)}</span>${done ? `<span class="num big2">${c.sets[i].v}</span>` : ''}</button>`; }).join('')}</div>
      ${done ? `<div class="explain">Correct order: ${correct.map(i => `${esc(c.mons[i].n)} (${c.sets[i].v})`).join(' → ')}</div><div class="row" style="justify-content:flex-end"><button class="btn" id="ar-next">${G.round >= 5 ? 'See results' : 'Next round'}</button></div>`
        : `<div class="row" style="justify-content:flex-end"><button class="btn ghost small" id="ar-undo" ${c.picked.length ? '' : 'disabled'}>Undo</button></div>`}`;
    bindQuit();
    if (done) { $('ar-next').onclick = sortNext; $('ar-next').focus(); }
    else $('ar-undo').onclick = () => { c.picked.pop(); renderSort(); };
  }
  function sortTap(i) {
    const c = G.cur; if (c.picked.includes(i)) return; c.picked.push(i);
    if (c.picked.length < 5) return renderSort();
    const correct = sortCorrect(); let hits = 0; c.picked.forEach((x, k) => { if (correct[k] === x) hits++; });
    G.n += 5; G.right += hits; G.score += hits * 10 + (hits === 5 ? 20 : 0);
    c.picked.forEach((x, k) => rate(correct[k] === x ? 1 : 0));
    if (hits === 5) { G.streak++; G.best = Math.max(G.best, G.streak); } else { G.streak = 0; G.misses.push(`Round ${G.round}: you had ${hits}/5 in place. Correct: ${correct.map(i => `${esc(c.mons[i].n)} ${c.sets[i].v}`).join(' → ')}`); }
    renderSort(true);
  }

  // ---------- Turn Order ----------
  const SKIP_ABIL = ['prankster', 'triage', 'galewings', 'stall', 'quickdraw', 'myceliummight'];
  function orderNext() {
    if (G.round >= 8) return finish();
    G.round++;
    const f = fmt(); const P = pool(); const dex = D().dex;
    for (let t = 0; t < 120; t++) {
      const ids = shuffle(P).slice(0, 4); const mons = ids.map(i => D().mon(i, f));
      if (mons.some(p => (p.a || []).some(a => SKIP_ABIL.includes(toId(a))))) continue;
      const e = VL.meta.forFormat(f.id);
      const acts = mons.map((p, k) => {
        // moves this Pokémon actually uses (meta), so the scenarios are realistic
        const m = VL.meta.get(e, p.n);
        const known = m ? m.moves.map(x => D().move(x[0], f)).filter(x => x && x.n !== 'Grassy Glide') : [];
        const prioOpts = known.filter(x => x.p); if (!prioOpts.length) prioOpts.push(D().move('protect', f));
        let atkOpts = known.filter(x => !x.p && x.c !== 'S');
        if (!atkOpts.length) atkOpts = Object.keys(dex.moves).map(id => D().move(id, f)).filter(x => p.t.includes(x.t) && x.bp >= 80 && !x.p && x.c !== 'S').slice(0, 3);
        const mv = (Math.random() < 0.45 || !atkOpts.length) ? pick(prioOpts) : pick(atkOpts);
        const sp = speedSet(p, f, 'spread');
        return { p, mv, side: k < 2 ? 'Your side' : 'Their side', sp, prio: (mv && mv.p) || 0, v: sp.v };
      });
      if (acts.some(a => !a.mv)) continue;
      let tw = null, tr = false;
      if (G.mode === 'field') { const r = rand(4); if (r === 0) tw = 'Your side'; else if (r === 1) tw = 'Their side'; else if (r === 2) tr = true; }
      if (acts.filter(a => a.mv.n === 'Trick Room').length > 0 && tr) continue;
      acts.forEach(a => { a.eff = tw === a.side ? a.v * 2 : a.v; });
      // no near-ties inside the same priority bracket
      let bad = false; for (let x = 0; x < 4; x++) for (let y = x + 1; y < 4; y++) if (acts[x].prio === acts[y].prio && Math.abs(acts[x].eff - acts[y].eff) <= 2) bad = true;
      if (bad) continue;
      const order = acts.map((a, i) => i).sort((x, y) => (acts[y].prio - acts[x].prio) || (tr ? acts[x].eff - acts[y].eff : acts[y].eff - acts[x].eff));
      G.cur = { acts, order, tw, tr, picked: [] };
      return renderOrder();
    }
  }
  function renderOrder(done) {
    const c = G.cur;
    const fp = (v) => v > 0 ? '+' + v : String(v);
    area().innerHTML = `${header(`<span class="pill m">Round ${G.round}/8</span><span class="pill m">${G.score} pts</span>`)}
      <p class="q2">Tap the four Pokémon in the order they act this turn.${c.tr ? ' <b>Trick Room is up.</b>' : ''}${c.tw ? ` <b>Tailwind is up on ${c.tw.toLowerCase()}.</b>` : ''}</p>
      <div class="sortgrid four">${c.acts.map((a, i) => { const pos = c.picked.indexOf(i); const ok = done && c.order[pos] === i;
        return `<button class="duelcard ${done ? (ok ? 'right' : 'wrong') : pos >= 0 ? 'chosen' : ''}" data-ord="${i}" ${done || pos >= 0 ? 'disabled' : ''}>${pos >= 0 ? `<span class="order">${pos + 1}</span>` : ''}<span class="mini">${esc(a.side)}</span>${VL.sprite(a.p, 'md', false)}<b>${esc(a.p.n)}</b><span>uses <b>${esc(a.mv.n)}</b></span><span class="sub">${esc(a.sp.label)}</span>${done ? `<span class="mini">Priority ${fp(a.prio)} · Speed ${a.eff}${a.eff !== a.v ? ' (Tailwind)' : ''}</span>` : ''}</button>`; }).join('')}</div>
      ${done ? `<div class="explain">Order: ${c.order.map(i => `${esc(c.acts[i].p.n)} (${esc(c.acts[i].mv.n)}, ${fp(c.acts[i].prio)}, ${c.acts[i].eff})`).join(' → ')}. Higher priority always goes first; within a bracket, ${c.tr ? 'Trick Room makes the slower Pokémon go first' : 'the faster Pokémon goes first'}.</div><div class="row" style="justify-content:flex-end"><button class="btn" id="ar-next">${G.round >= 8 ? 'See results' : 'Next round'}</button></div>`
        : `<div class="row" style="justify-content:flex-end"><button class="btn ghost small" id="ar-undo" ${c.picked.length ? '' : 'disabled'}>Undo</button></div>`}`;
    bindQuit();
    if (done) { $('ar-next').onclick = orderNext; $('ar-next').focus(); }
    else $('ar-undo').onclick = () => { c.picked.pop(); renderOrder(); };
  }
  function orderTap(i) {
    const c = G.cur; if (c.picked.includes(i)) return; c.picked.push(i);
    if (c.picked.length < 4) return renderOrder();
    const ok = c.picked.every((x, k) => c.order[k] === x);
    scoreHit(ok, `Round ${G.round}: ${c.order.map(i2 => `${esc(c.acts[i2].p.n)} (${esc(c.acts[i2].mv.n)}, priority ${c.acts[i2].prio > 0 ? '+' : ''}${c.acts[i2].prio}, Speed ${c.acts[i2].eff})`).join(' → ')}${c.tr ? ' · Trick Room' : ''}${c.tw ? ' · Tailwind on ' + esc(c.tw.toLowerCase()) : ''}`);
    if (ok) G.score += 20;
    renderOrder(true);
  }

  // ---------- Damage Guess ----------
  function damageNext() {
    if (G.round >= 8) return finish();
    const f = fmt(); const e = VL.meta.forFormat(f.id);
    if (!e) { area().innerHTML = `${header()}<div class="empty">Damage Guess uses the common sets from the Meta page, and there are no usage stats for ${esc(f.name)} yet. Pick a current format above.</div>`; bindQuit(); return; }
    area().innerHTML = `${header()}<p class="sub">Loading the calculator…</p>`; bindQuit();
    VL.calc.engine().then(() => {
      const C = window.calc; const champ = f.mod.startsWith('champions'); const g = C.Generations.get(champ ? 0 : f.gen);
      const top = e.mons.slice(0, 40); const dex = D().dex;
      const build = (m) => {
        const [nat, nums] = (m.spreads[0] ? m.spreads[0][0] : 'Hardy:0/0/0/0/0/0').split(':');
        const ev = (nums || '0/0/0/0/0/0').split('/').map(Number); const evs = { hp: ev[0], atk: ev[1], def: ev[2], spa: ev[3], spd: ev[4], spe: ev[5] };
        const item = m.items[0] && m.items[0][0] !== 'No item' ? m.items[0][0] : undefined;
        let name = m.n; const stones = C.MEGA_STONES && item && C.MEGA_STONES[item]; if (stones && stones[name]) name = stones[name];
        return { poke: new C.Pokemon(g, name, { level: 50, nature: nat, evs, item, ability: m.abilities[0] && m.abilities[0][0] }), nat, ev, item, ability: m.abilities[0] && m.abilities[0][0], name };
      };
      for (let t = 0; t < 40; t++) {
        const am = pick(top), dm = pick(top); if (am === dm) continue;
        const moves = am.moves.map(x => D().move(x[0], f)).filter(x => x && x.c !== 'S' && x.bp >= 40);
        if (!moves.length) continue;
        const mv = pick(moves);
        try {
          const A = build(am), Dd = build(dm);
          const r = C.calculate(g, A.poke, Dd.poke, new C.Move(g, mv.n), new C.Field({ gameType: f.doubles ? 'Doubles' : 'Singles' }));
          const [lo, hi] = r.range(); const hp = Dd.poke.maxHP(); if (!hi) continue;
          G.round++;
          let ko = ''; try { ko = r.kochance().text || ''; } catch (x) { ko = ''; }
          G.cur = { A, Dd, am, dm, mv, lo: Math.round(1000 * lo / hp) / 10, hi: Math.round(1000 * hi / hp) / 10, ko: ko.replace(/OHKO/g, 'one-hit knockout').replace(/(\d)HKO/g, '$1-hit knockout'), spread: f.doubles && mv.sp, champ };
          return renderDamage();
        } catch (x) { /* try another pairing */ }
      }
      area().innerHTML = `${header()}<div class="empty">Couldn't build a matchup. Try again.</div>`; bindQuit();
    }).catch(() => { area().innerHTML = `${header()}<div class="empty">The calculator didn't load. Check your connection.</div>`; bindQuit(); });
  }
  function setLine(x, champ) {
    const names = ['HP', 'Attack', 'Defense', 'Special Attack', 'Special Defense', 'Speed'];
    const inv = x.ev.map((v, i) => v ? `${v} ${names[i]}` : null).filter(Boolean).join(', ');
    return `${esc(x.nat)} nature · ${esc(inv || 'no investment')}${champ ? '' : ' (effort values)'} · ${esc(x.item || 'no item')} · ${esc(x.ability || '')}`;
  }
  function renderDamage(guess) {
    const c = G.cur; const done = guess !== undefined;
    const v = done ? guess : (G.lastGuess ?? 50);
    area().innerHTML = `${header(`<span class="pill m">Round ${G.round}/8</span><span class="pill m">${G.score} pts</span>`)}
      <div class="vsrow">${VL.sprite(c.A.name, 'lg', false)}<span class="mini">attacks</span>${VL.sprite(c.Dd.name, 'lg', false)}</div><p class="q2"><b>${esc(c.A.name)}</b> uses <b>${esc(c.mv.n)}</b> on <b>${esc(c.Dd.name)}</b>. How much of its HP does it take?</p>
      <div class="grid2"><div class="explain"><b>${esc(c.A.name)}</b><br><span class="sub">${setLine(c.A, c.champ)}</span></div><div class="explain"><b>${esc(c.Dd.name)}</b><br><span class="sub">${setLine(c.Dd, c.champ)}</span></div></div>
      <p class="sub">Level 50, ${c.spread ? 'doubles, hitting both opponents (spread damage)' : 'no field effects'}, full HP, no stat changes. Both use their most common set.</p>
      <div class="dmgslider"><input type="range" min="0" max="150" step="1" value="${v}" id="ar-dmg" ${done ? 'disabled' : ''} aria-label="Your damage guess in percent"><div class="row" style="justify-content:space-between"><span class="mini">0%</span><b class="num" id="ar-dmgv">${v}%${v >= 100 ? ' (knocked out)' : ''}</b><span class="mini">150%</span></div>
        ${done ? `<div class="dmgtrack"><span class="band" style="left:${Math.min(100, c.lo / 1.5)}%;width:${Math.max(0.7, Math.min(100, c.hi / 1.5) - Math.min(100, c.lo / 1.5))}%"></span><span class="mark" style="left:${Math.min(100, guess / 1.5)}%"></span></div>` : ''}</div>
      ${done ? `<div class="explain"><b>Actual: ${c.lo}–${c.hi}%.</b> ${esc(c.ko ? c.ko[0].toUpperCase() + c.ko.slice(1) : '')}. You guessed ${guess}%, ${G.lastPts} points.</div><div class="row" style="justify-content:flex-end"><button class="btn" id="ar-next">${G.round >= 8 ? 'See results' : 'Next attack'}</button></div>`
        : `<div class="row" style="justify-content:flex-end"><button class="btn" id="ar-lock">Lock in guess</button></div>`}`;
    bindQuit();
    if (done) { $('ar-next').onclick = damageNext; $('ar-next').focus(); return; }
    $('ar-dmg').oninput = (e) => { const x = +e.target.value; $('ar-dmgv').textContent = x + '%' + (x >= 100 ? ' (knocked out)' : ''); };
    $('ar-lock').onclick = () => {
      const x = +$('ar-dmg').value; G.lastGuess = x;
      const dist = x < c.lo ? c.lo - x : x > c.hi ? x - c.hi : 0;
      const pts = Math.max(0, Math.round(100 - dist * 4)); G.lastPts = pts;
      G.n++; G.score += pts; rate(pts / 100); if (dist <= 5) { G.right++; G.streak++; G.best = Math.max(G.best, G.streak); } else { G.streak = 0; G.misses.push(`${esc(c.A.name)} ${esc(c.mv.n)} into ${esc(c.Dd.name)}: actual ${c.lo}–${c.hi}%, you guessed ${x}%.`); }
      renderDamage(x);
    };
  }

  // ---------- Type Rush ----------
  function typesNext() {
    const f = fmt(); const P = pool(); const chart = D().chart(f);
    const p = D().mon(pick(P), f); const a = pick(chart.types);
    G.cur = { p, a, m: D().eff(chart, a, p.t), chart };
    renderTypes();
  }
  function renderTypes(flash) {
    const c = G.cur;
    area().innerHTML = `${header(`<span class="pill n">⏱ <span id="ar-time">${G.left ?? 60}</span>s</span><span class="pill m">${G.score} pts</span>${G.streak > 1 ? `<span class="pill w">streak ${G.streak}</span>` : ''}`)}
      <div class="vsrow">${VL.sprite(c.p, 'lg', false)}</div><p class="q2">${ty(c.a)} into <b>${esc(c.p.n)}</b> ${c.p.t.map(ty).join(' ')}</p>
      <div class="opts six">${[0, 0.25, 0.5, 1, 2, 4].map((v, i) => `<button class="opt ${flash !== undefined ? (v === c.m ? 'right' : v === flash ? 'wrong' : '') : ''}" data-ty="${v}" ${flash !== undefined ? 'disabled' : ''}>${i + 1}. ${mult(v)}</button>`).join('')}</div>
      <p class="sub" style="text-align:center">Keys 1–6 answer. Type chart only, abilities not counted.</p>`;
    bindQuit();
  }
  function typesAnswer(v) {
    if (!G || G.id !== 'types' || G.lock) return;
    const c = G.cur; const ok = v === c.m;
    scoreHit(ok, `${ty(c.a)} into ${esc(c.p.n)} (${c.p.t.map(ty).join(' ')}) is <b>${mult(c.m)}</b>: ${c.p.t.map(t => `${esc(c.a)} → ${esc(t)} ${mult(D().eff(c.chart, c.a, [t]))}`).join(', ')}`);
    G.lock = true; renderTypes(v);
    setTimeout(() => { G && (G.lock = false); if (G && !G.done) typesNext(); }, ok ? 350 : 1400);
  }

  // ---------- input ----------
  $('ar-play').addEventListener('click', e => {
    if (!G || G.done) return;
    const d = e.target.closest('[data-duel]'); if (d) return duelAnswer(d.dataset.duel);
    const s = e.target.closest('[data-sort]'); if (s) return sortTap(+s.dataset.sort);
    const o = e.target.closest('[data-ord]'); if (o) return orderTap(+o.dataset.ord);
    const t = e.target.closest('[data-ty]'); if (t) return typesAnswer(+t.dataset.ty);
  });
  document.addEventListener('keydown', e => {
    if (!G || G.done || $('p-games').classList.contains('on') === false) return;
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && document.activeElement.type !== 'range') return;
    if (G.id === 'duel') { if (e.key === 'ArrowLeft') { e.preventDefault(); duelAnswer('A'); } if (e.key === 'ArrowRight') { e.preventDefault(); duelAnswer('B'); } if (e.key === 'ArrowDown') { e.preventDefault(); duelAnswer('tie'); } }
    if (G.id === 'types' && /^[1-6]$/.test(e.key)) { e.preventDefault(); typesAnswer([0, 0.25, 0.5, 1, 2, 4][+e.key - 1]); }
  });

  // ---------- list ----------
  function renderList() {
    if (!D().dex) return;
    const fs = $('ar-format'); const cur = fs.value || (VL.curFormatId && VL.curFormatId());
    fs.innerHTML = D().formats().map(f => `<option value="${esc(f.id)}">${esc(f.name)} · ${esc(f.game)}</option>`).join(''); fs.value = D().format(cur).id;
    if (!$('ar-pool').dataset.init) { $('ar-pool').dataset.init = '1'; if (VL.meta.forFormat(fs.value)) $('ar-pool').value = 'meta'; }
    $('ar-list').innerHTML = GAMES.map(g => `<div class="drill-card gamecard"><h4>${esc(g.name)}</h4><span class="sub">${esc(g.desc)}</span>
      <div class="kv" style="margin-top:4px">${g.modes.map(([m, l]) => { const r = VL.store.get('arcade', g.id + ':' + m); return `<button class="btn ${g.modes.length === 1 ? '' : 'ghost'} small" data-play="${g.id}" data-mode="${m}">${esc(l)}${r && r.best ? ` · best ${r.best}` : ''}</button>`; }).join('')}</div></div>`).join('');
  }
  $('ar-list').addEventListener('click', e => { const b = e.target.closest('[data-play]'); if (b) start(b.dataset.play, b.dataset.mode); });
  $('ar-format').addEventListener('change', () => { if (G && !G.done) close(); renderList(); });
  $('ar-pool').addEventListener('change', () => { if (G && !G.done) close(); });

  VL.arcadeGames = GAMES;
  VL.arcade = { render() { if (!G || G.done) renderList(); }, stop: stopTimer, start };
})();
