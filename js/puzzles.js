/* Puzzles ("Play like the pros"): a turn from a top-rated Showdown replay.
 * You see the board as the winning player saw it at the start of that turn,
 * pick what one of their Pokémon should do, then see what they actually did
 * and how the turn played out. Replays come from data/puzzles.json (the
 * highest-rated public replays per format, refreshed daily) and are loaded
 * from Showdown when played. */
(function () {
  'use strict';
  const VL = (window.VL = window.VL || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const DONE = 'vgclab-puzzles-done';

  let LIST = null, loading = null;
  const S = { tab: 'own', fmt: '', P: null, busy: false, answered: null, score: { right: 0, n: 0 }, err: '' };
  let done = {}; try { done = JSON.parse(localStorage.getItem(DONE) || '{}') || {}; } catch (e) { done = {}; }

  function load() { return loading || (loading = VL.files.get('puzzles').then(j => { LIST = (j && j.formats) || {}; return LIST; })); }
  const fmtName = (id) => (VL.fmtName ? VL.fmtName(id.replace(/bo3$/, '')) : id) + (/bo3$/.test(id) ? ' (best of 3)' : '');

  // every action each Pokémon chose, turn by turn, and the moves each one showed over the game
  function actions(log) {
    const acts = {}; const known = {}; let turn = 0, upkeep = false;
    // what each Pokémon showed, and on which turn (the opponent only knows what was shown before the puzzle's turn)
    const info = {}; const at = (key) => (info[key] = info[key] || { item: null, ability: null, moves: {} });
    const keyOf = (id) => { const m = String(id || '').match(/^(p[12])[a-c]?: (.+)$/); return m ? m[1] + ':' + m[2] : null; };
    const tag = (f, name) => { const x = f.find(y => y.startsWith(`[${name}]`)); return x ? x.slice(name.length + 2).trim() : ''; };
    for (const l of String(log).split('\n')) {
      const f = l.split('|'); const t = f[1];
      if (t === 'turn') { turn = +f[2]; upkeep = false; continue; }
      {
        const own = keyOf(f[2]); const of = keyOf(tag(f, 'of')); const src = tag(f, 'from');
        const set = (k, field, v) => { if (k && v && !at(k)[field]) at(k)[field] = { v, turn }; };
        if (t === '-item' && !/\[from\] (move|ability)/.test(l)) set(own, 'item', f[3]);
        if (t === '-enditem') set(own, 'item', f[3].replace(/^item: /, ''));
        if (t === '-ability') set(own, 'ability', f[3]);
        if (/^item: /.test(src)) set(of || own, 'item', src.slice(6));
        if (/^ability: /.test(src)) set(of || own, 'ability', src.slice(9));
        if (t === 'move' && own && !f.some(x => /^\[from\]/.test(x)) && f[3] !== 'Struggle') { const mv = at(own).moves; if (mv[f[3]] === undefined) mv[f[3]] = turn; }
      }
      if (t === 'upkeep') { upkeep = true; continue; }
      const m = String(f[2] || '').match(/^(p[12])([a-c]): (.+)$/); if (!m) continue;
      const key = m[1] + ':' + m[3], slot = m[1] + m[2];
      if (t === 'move' && turn >= 1) {
        if (f.some(x => /^\[from\]/.test(x)) || f[3] === 'Struggle') continue;
        (known[key] = known[key] || new Set()).add(f[3]);
        const tg = String(f[4] || '').match(/^(p[12])([a-c]): (.+)$/);
        (acts[turn] = acts[turn] || []).push({ slot, key, kind: 'move', move: f[3], target: tg ? tg[1] + ':' + tg[3] : '', spread: f.some(x => /^\[spread\]/.test(x)) });
      }
      if (t === 'switch' && turn >= 1 && !upkeep) (acts[turn] = acts[turn] || []).push({ slot, key, kind: 'switch', to: String(f[3] || '').split(',')[0] });
    }
    return { acts, known, info };
  }

  // a turn worth asking about: the winner's Pokémon chose something, and it had enough moves shown to make a real choice
  function choosePuzzle(data, raw) {
    const win = Object.keys(data.players).find(k => data.players[k] === data.winner); if (!win) return null;
    const cands = [];
    for (let n = 1; n < data.turns.length; n++) {
      const sn = data.turns[n - 1].snap; if (!sn) continue;
      for (const a of (raw.acts[n] || [])) {
        if (!a.slot.startsWith(win)) continue;
        const k = sn.active[a.slot]; if (!k || k !== a.key) continue;
        const moves = [...(raw.known[a.key] || [])]; if (moves.length < 3 && a.kind === 'move') continue;
        const bench = sn.order[win].filter(x => !Object.values(sn.active).includes(x) && !sn.mons[x].fnt);
        const unseen = data.preview[win].length - sn.order[win].length;
        if (a.kind === 'switch' && moves.length < 2) continue;
        cands.push({ n, a, win, moves: moves.slice(0, 4), canSwitch: bench.length > 0 || unseen > 0 });
      }
    }
    if (!cands.length) return null;
    // early-to-middle turns: real decisions, without a long watch to get there
    const early = cands.filter(c => c.n >= 2 && c.n <= 6 && c.n < data.turns.length - 1);
    const mid = cands.filter(c => c.n >= 2 && c.n < data.turns.length - 1);
    return pick(early.length ? early : mid.length ? mid : cands);
  }

  async function next() {
    if (S.busy) return;
    S.busy = true; S.err = ''; S.answered = null; S.P = null; render();
    const list = (LIST && LIST[S.fmt]) || [];
    for (let tries = 0; tries < 6 && !S.P; tries++) {
      // favour the higher-rated games and ones you haven't seen
      const fresh = list.filter(r => !done[r.id]); const pool = (fresh.length ? fresh : list).slice(0, 80);
      const r = pick(pool); if (!r) break;
      try {
        const res = await fetch(`https://replay.pokemonshowdown.com/${r.id}.json`); if (!res.ok) { done[r.id] = 1; continue; }
        const j = await res.json(); if (!j.log) continue;
        const data = VL.replay.parse(j.log); if (!data.ok || !data.winner) { done[r.id] = 1; continue; }
        const raw = actions(j.log); const c = choosePuzzle(data, raw); if (!c) { done[r.id] = 1; continue; }
        S.P = { r, data, raw, c }; S.stage = 'preview'; S.t = 0; S.tab = 'own'; S.after = false;
      } catch (e) { /* try another */ }
    }
    if (!S.P) S.err = 'Couldn\'t load a replay from Showdown. Check your connection and try again.';
    S.busy = false; render();
  }

  // ---------- drawing (the board itself is VL.battleView) ----------
  // both teams as the winner saw them at the start of the turn: their own team in full,
  // the opponent's only as far as it had been shown
  function teamPanel(data, raw, sn, side, own, n) {
    const keys = Object.keys(sn.mons).filter(k => k.startsWith(side + ':'));
    const allSeen = new Set(); Object.keys(raw.info).concat(Object.keys(raw.known)).forEach(k => { if (k.startsWith(side + ':')) allSeen.add(k); });
    const nameOf = (k) => (sn.mons[k] && sn.mons[k].name) || (data.turns[data.turns.length - 1].snap || sn).mons[k]?.name || k.split(':')[1];
    const baseOf = (x) => String(x || '').replace(/-(Mega|Mega-[XYZ]|Primal)$/i, '').split('-')[0];
    const active = new Set(Object.entries(sn.active).filter(([slot]) => slot.startsWith(side)).map(([, k]) => k));
    // own side: every Pokémon it used at any point in the game (the player knows its four)
    const last = data.turns[data.turns.length - 1].snap || sn;
    const used = own ? Object.keys(last.mons).filter(k => k.startsWith(side + ':')) : keys;
    const shownBase = new Set(used.map(k => baseOf(nameOf(k))));
    const rows = used.map(k => {
      const m = sn.mons[k]; const inf = raw.info[k] || { moves: {} };
      const vis = (x) => x && (own || x.turn < n);
      const mv = Object.entries(inf.moves || {}).filter(([, tn]) => own || tn < n).map(([x]) => x);
      const state = !m ? (own ? '<span class="pz-st back">In the back · 100%</span>' : '') : m.fnt ? '<span class="pz-st fnt">Fainted</span>' : active.has(k) ? `<span class="pz-st act">On the field · ${m.hp}%</span>` : `<span class="pz-st back">In the back · ${m.hp}%</span>`;
      return `<div class="pz-row ${m && m.fnt ? 'fnt' : ''}">${VL.sprite(nameOf(k), 'sm', false)}<div><div class="kv" style="gap:6px;flex-wrap:wrap"><b>${esc(nameOf(k))}</b>${state}</div>
        <div class="mini">Item: ${vis(inf.item) ? esc(inf.item.v) : 'not revealed'} · Ability: ${vis(inf.ability) ? esc(inf.ability.v) : 'not revealed'}</div>
        <div class="mini">${mv.length ? `Moves${own ? '' : ' seen'}: ${mv.map(esc).join(', ')}` : own ? 'No moves used this game' : 'No moves seen yet'}</div></div></div>`;
    });
    const rest = data.preview[side].filter(x => !shownBase.has(baseOf(x)));
    const restRow = rest.length ? `<div class="pz-row pz-rest"><div><div class="mini">${own ? 'Not used this game (left at team preview, or never sent in)' : 'Not seen yet: maybe in the back, maybe left at team preview'}</div>${VL.spriteRow(rest, 'sm')}<div class="mini">${rest.map(esc).join(', ')}</div></div></div>` : '';
    return `<div class="pz-team ${own ? 'own' : ''}">${rows.join('')}${restRow}</div>`;
  }

  const actText = (a, sn) => {
    const who = sn.mons[a.key] ? sn.mons[a.key].name : a.key.split(':')[1];
    if (a.kind === 'switch') return `${esc(who)} switched out for <b>${esc(a.to)}</b>`;
    const tg = a.spread ? ' on both targets' : a.target && a.target !== a.key && sn.mons[a.target] ? ` on ${esc(sn.mons[a.target].name)}` : '';
    return `${esc(who)} used <b>${esc(a.move)}</b>${tg}`;
  };

  function render() {
    const root = $('pz-root'); if (!root) return;
    if (!LIST) { root.innerHTML = '<p class="sub">Loading puzzles…</p>'; load().then(render); return; }
    const fmts = Object.keys(LIST).filter(f => LIST[f].length);
    if (!fmts.length) { root.innerHTML = '<div class="empty">No puzzles yet. They\'re added by the daily update.</div>'; return; }
    if (!S.fmt || !LIST[S.fmt]) { const cur = VL.curFormatId ? VL.curFormatId() : ''; S.fmt = fmts.includes(cur) ? cur : fmts.includes(cur + 'bo3') ? cur + 'bo3' : fmts[0]; }
    const head = `<div class="card"><div class="row" style="align-items:flex-end"><label for="pz-fmt">Format<select id="pz-fmt">${fmts.map(f => `<option value="${esc(f)}" ${f === S.fmt ? 'selected' : ''}>${esc(fmtName(f))} · ${LIST[f].length} games</option>`).join('')}</select></label>
      <div class="kv" style="gap:8px"><span class="pill m">${S.score.right}/${S.score.n} matched this session</span><button class="btn" id="pz-next" ${S.busy ? 'disabled' : ''}>${S.P ? 'Next puzzle' : 'Start'}</button></div></div></div>`;
    if (S.busy) { root.innerHTML = head + '<div class="card"><p class="sub">Loading a top-rated game from Showdown…</p></div>'; return; }
    if (S.err) { root.innerHTML = head + `<div class="card"><p class="sub">${esc(S.err)}</p></div>`; return; }
    if (!S.P) { root.innerHTML = head + `<div class="card"><p>Each puzzle is one of the highest-rated games on Showdown. You start at team preview as the player who won, watch the game turn by turn, and at one turn it stops and asks what you'd do. Then you see what they did and can watch the rest.</p><p class="sub">There isn't always one right answer. Matching a top player's choice is the goal, and the reveal shows why it worked.</p></div>`; return; }

    const { data, raw, c, r } = S.P; const opp = c.win === 'p1' ? 'p2' : 'p1';
    const sn = S.after ? data.turns[c.n].snap : data.turns[c.n - 1].snap; const snBefore = data.turns[c.n - 1].snap;
    const me = snBefore.mons[c.a.key];
    const prev = c.n > 1 ? data.turns[c.n - 1].events.filter(e => e.cls !== 'win') : data.turns[0].events;
    const right = c.a.kind === 'switch' ? 'switch' : 'move:' + c.a.move;
    const ans = S.answered;
    const mark = (v) => ans ? (v === right ? 'right' : v === ans ? 'wrong' : '') : '';
    const bench = snBefore.order[c.win].filter(k => !Object.values(snBefore.active).includes(k) && !snBefore.mons[k].fnt).map(k => snBefore.mons[k].name);
    const partner = (raw.acts[c.n] || []).filter(a => a.slot.startsWith(c.win) && a.key !== c.a.key);
    const evs = (list) => `<div class="rp-events bv-log">${list.map(e => `<div class="rp-ev ${e.cls || ''} ${e.side ? (e.side === c.win ? 'mine' : 'theirs') : ''}">${e.html}</div>`).join('')}</div>`;
    const who = `<div class="sub">${esc(data.players[c.win])} vs ${esc(data.players[opp])} · rated ${r.r} · you're playing as <b class="rp-n ${c.win}">${esc(data.players[c.win])}</b></div>`;
    const last = data.turns.length - 1;
    // progress through the game: preview, the turns before, the decision, the rest
    const dots = `<div class="pz-dots">${data.turns.map(t => `<i class="${t.n === c.n ? 'q' : ''} ${(S.stage === 'watch' || S.stage === 'post') && t.n === S.t ? 'on' : S.stage === 'decide' && t.n === c.n ? 'on' : ''} ${t.n < (S.stage === 'preview' ? 0 : S.stage === 'watch' ? S.t : S.stage === 'decide' ? c.n : S.t + 1) ? 'past' : ''}"></i>`).join('')}</div>`;
    if (S.stage === 'preview') {
      const grid = (side, mine) => `<div class="pz-pv ${mine ? 'own' : ''}"><div class="section-label">${mine ? 'Your team' : 'Their team'} · <span class="rp-n ${side}">${esc(data.players[side])}</span></div><div class="pz-pvgrid">${data.preview[side].map(n => `<div>${VL.sprite(n, 'md', false)}<span>${esc(n)}</span></div>`).join('')}</div></div>`;
      root.innerHTML = head + `<div class="card pz-card">${who}<h3 style="margin:6px 0 2px">Team preview</h3>
        <p class="sub">You'll watch this game from the start as <b>${esc(data.players[c.win])}</b>. On turn ${c.n} it stops and asks what <b>${esc(me.name)}</b> should do.</p>
        ${grid(c.win, true)}${grid(opp, false)}${dots}
        <div class="row" style="gap:8px"><button class="btn" data-pzgo="watch" style="flex:1">Watch from the start ▶</button><button class="btn ghost" data-pzgo="decide">Skip to the decision</button></div></div>`;
      return;
    }
    if (S.stage === 'watch' || S.stage === 'post') {
      const t = S.t; const T = data.turns[t]; const snT = T.snap || sn;
      const atEnd = S.stage === 'post' && t >= last;
      const nextLabel = S.stage === 'watch' ? (t + 1 >= c.n ? `Your decision: turn ${c.n} ▶` : 'Next turn ▶') : atEnd ? '' : 'Next turn ▶';
      root.innerHTML = head + `<div class="card pz-card">${who}
        ${VL.battleView(data, snT, { me: c.win, label: t === 0 ? 'After the leads' : `After turn ${t}` })}
        ${dots}
        <div class="pz-nav"><button class="btn ghost" data-pzgo="back">◀ Back</button>${nextLabel ? `<button class="btn" data-pzgo="fwd" style="flex:1">${nextLabel}</button>` : `<button class="btn" id="pz-next2" style="flex:1">Next puzzle</button>`}</div>
        <div class="section-label">${t === 0 ? 'Team preview and leads' : `What happened on turn ${t}`}</div>${evs(T.events)}
        ${atEnd ? `<p class="sub"><b>${esc(data.winner)}</b> won the game.</p>` : ''}
        ${S.stage === 'watch' ? '<p class="sub">Tip: use the ← and → keys on a computer.</p>' : ''}</div>`;
      return;
    }
    root.innerHTML = head + `<div class="card pz-card">
        ${who}
        ${VL.battleView(data, sn, { me: c.win, mark: S.after ? null : c.a.key, turn: S.after ? c.n + 1 : c.n })}
        ${(() => {
          // one panel at a time, right under the board, so the moves stay close
          const tabs = [['own', 'Your team'], ['opp', 'Their team'], ['last', c.n > 1 ? `Turn ${c.n - 1}` : 'Leads'], ['all', 'Whole game so far']];
          const body = S.tab === 'opp' ? teamPanel(data, raw, snBefore, opp, false, c.n)
            : S.tab === 'last' ? (prev.length ? evs(prev) : '<p class="sub">Nothing yet.</p>')
            : S.tab === 'all' ? data.turns.slice(0, c.n).map(t => `<div class="section-label">${t.n ? 'Turn ' + t.n : 'Leads'}</div>${evs(t.events)}`).join('')
            : teamPanel(data, raw, snBefore, c.win, true, c.n);
          return `<div class="pz-tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" data-pztab="${k}" aria-selected="${S.tab === k}">${l}</button>`).join('')}</div><div class="pz-tabbody">${body}</div>`;
        })()}
        ${ans ? `<div class="seg" role="group" style="margin-top:8px"><button type="button" data-pzview="before" aria-pressed="${!S.after}">Start of turn ${c.n}</button><button type="button" data-pzview="after" aria-pressed="${!!S.after}">After it</button></div>` : ''}
        <div class="bv-prompt">${ans ? (ans === right ? '✓ You matched the top player.' : 'The top player chose differently.') : `What will ${esc(me.name)} do?`}</div>
        ${VL.battleMoves(c.moves.map(mv => ({ name: mv, value: 'move:' + mv, cls: mark('move:' + mv), disabled: !!ans })), { fmt: S.fmt.replace(/bo3$/, '') })}
        ${c.canSwitch ? `<div class="bv-switch"><button type="button" class="bv-move switch ${mark('switch')}" data-pz="switch" ${ans ? 'disabled' : ''}><b>Switch out</b>${bench.length ? VL.spriteRow(bench, 'xs') : '<span>to a Pokémon in the back</span>'}</button></div>` : ''}
        ${!ans ? `<p class="sub">Only moves ${esc(me.name)} used during this game are shown. Speed, items and the rest of their sets aren't, just like a real battle.</p>
` : `
          <div class="explain"><b>What they did:</b> ${actText(c.a, snBefore)}${partner.length ? `, and ${partner.map(a => actText(a, snBefore)).join(', ')}` : ''}.
            <div class="section-label">How turn ${c.n} played out</div>${evs(data.turns[c.n].events)}
            <p class="sub">${esc(data.winner)} went on to win. <a href="https://replay.pokemonshowdown.com/${esc(r.id)}" target="_blank" rel="noopener">Watch the replay ↗</a> · <button class="linkbtn" id="pz-review">Open in Replay review</button></p></div>${S.change || ''}
          <div class="pz-nav"><button class="btn ghost" data-pzgo="post" style="flex:1">Keep watching ▶</button><button class="btn" id="pz-next2" style="flex:1">Next puzzle</button></div>`}
        ${!ans ? `<div class="pz-nav"><button class="btn ghost small" data-pzgo="rewatch">◀ Watch the turn before again</button></div>` : ''}
        ${dots}
      </div>`;
  }

  document.addEventListener('click', (e) => {
    const root = $('pz-root'); if (!root || !root.contains(e.target)) return;
    if (e.target.id === 'pz-next' || e.target.id === 'pz-next2') { S.after = false; next(); return; }
    const go = e.target.closest('[data-pzgo]'); if (go && S.P) { step(go.dataset.pzgo); return; }
    const tb = e.target.closest('[data-pztab]'); if (tb) { S.tab = tb.dataset.pztab; render(); return; }
    const v = e.target.closest('[data-pzview]'); if (v) { S.after = v.dataset.pzview === 'after'; render(); return; }
    if (e.target.id === 'pz-review' && S.P) { VL.replay.open(`https://replay.pokemonshowdown.com/${S.P.r.id}`); return; }
    const b = e.target.closest('[data-pz]'); if (!b || !S.P || S.answered) return;
    const c = S.P.c; const right = c.a.kind === 'switch' ? 'switch' : 'move:' + c.a.move; const ok = b.dataset.pz === right;
    S.answered = b.dataset.pz; S.score.n++; if (ok) S.score.right++;
    done[S.P.r.id] = 1; try { localStorage.setItem(DONE, JSON.stringify(done)); } catch (x) { /* ignore */ }
    VL.sound && VL.sound.play(ok ? 'right' : 'wrong');
    const changes = VL.progress ? VL.progress.apply([{ a: 'decisions', s: ok ? 1 : 0, d: 1450 }], { src: 'puzzle', label: 'Puzzle' }) : null;
    S.change = changes && VL.progress.changesHtml ? VL.progress.changesHtml(changes) : '';
    render();
  });
  // moving through the game
  function step(k) {
    const c = S.P.c; const last = S.P.data.turns.length - 1;
    if (k === 'watch') { S.stage = 'watch'; S.t = 0; }
    else if (k === 'decide') { S.stage = 'decide'; }
    else if (k === 'rewatch') { S.stage = 'watch'; S.t = Math.max(0, c.n - 1); }
    else if (k === 'post') { S.stage = 'post'; S.t = c.n; }
    else if (k === 'fwd') {
      if (S.stage === 'watch') { if (S.t + 1 >= c.n) S.stage = 'decide'; else S.t++; }
      else if (S.stage === 'post' && S.t < last) S.t++;
    } else if (k === 'back') {
      if (S.stage === 'watch') { if (S.t === 0) S.stage = 'preview'; else S.t--; }
      else if (S.stage === 'post') { if (S.t <= c.n) S.stage = 'decide'; else S.t--; }
    }
    render(); const card = document.querySelector('.pz-card'); if (card && card.getBoundingClientRect().top < 0) card.scrollIntoView();
  }
  document.addEventListener('keydown', (e) => {
    if (location.hash !== '#puzzles' || !S.P || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (e.key === 'ArrowRight' && (S.stage === 'watch' || S.stage === 'post' || S.stage === 'preview')) { e.preventDefault(); step(S.stage === 'preview' ? 'watch' : 'fwd'); }
    if (e.key === 'ArrowLeft' && (S.stage === 'watch' || S.stage === 'post')) { e.preventDefault(); step('back'); }
  });
  document.addEventListener('change', (e) => { if (e.target.id === 'pz-fmt') { S.fmt = e.target.value; S.P = null; S.answered = null; render(); } });

  VL.puzzles = { render, load, actions, choosePuzzle };
})();
