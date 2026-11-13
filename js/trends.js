/* The overview at the top of Today: recent results and trends from your own
 * data (games, ratings, tests), plus what's moving in the game (meta movers,
 * latest news, next event). */
(function () {
  'use strict';
  const VL = (window.VL = window.VL || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = (w, n) => (n ? Math.round(100 * w / n) : 0);
  const arrow = (d, unit) => d === null || d === undefined || isNaN(d) ? '' : d === 0 ? `<span class="mini">no change</span>` : `<span class="mini ${d > 0 ? 'good-t' : 'bad-t'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d)}${unit || ''}</span>`;

  // for things where less is better (mistakes)
  const arrowBad = (d) => d === 0 ? '<span class="mini">same as before</span>' : `<span class="mini ${d < 0 ? 'good-t' : 'bad-t'}">${d < 0 ? '▼ less often' : '▲ more often'}</span>`;
  function spark(vals, color) {
    if (vals.length < 2) return '';
    const W = 160, H = 36, lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
    const pts = vals.map((v, i) => `${(i * W / (vals.length - 1)).toFixed(1)},${(H - 3 - (v - lo) * (H - 6) / span).toFixed(1)}`).join(' ');
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Trend line from ${vals[0]} to ${vals[vals.length - 1]}"><polyline points="${pts}" fill="none" stroke="${color || 'var(--accent)'}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  }

  function render() {
    const root = $('td-trends'); if (!root || !VL.store) return;
    const store = VL.store; const fid = VL.curFormatId ? VL.curFormatId() : '';
    const TAG = Object.fromEntries(VL.ALLTAGS || []);
    const all = store.list('games').sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const g = all.filter(x => x.fmt === fid); const use = g.length >= 5 ? g : all; const scope = g.length >= 5 ? VL.fmtName(fid) : 'all formats';
    const cards = [];

    // ---- results ----
    if (use.length) {
      const last = use.slice(0, 20), prev = use.slice(20, 40);
      const w = last.filter(x => x.result === 'W').length; const wr = pct(w, last.length);
      const pwr = prev.length >= 5 ? pct(prev.filter(x => x.result === 'W').length, prev.length) : null;
      const rated = use.filter(x => Number.isFinite(x.rating)).slice(0, 30).reverse().map(x => x.rating);
      let streak = 0; for (const x of use) { if (x.result === use[0].result) streak++; else break; }
      cards.push(`<div class="card td-card"><div class="card-head"><h3>Your last ${last.length} game${last.length === 1 ? '' : 's'}</h3><a class="sub" href="#review">${esc(scope)} · Review</a></div>
        <div class="td-big"><span class="num">${wr}%</span><span class="sub">win rate (${w}–${last.length - w})</span>${pwr !== null ? arrow(wr - pwr, ' points vs the 20 before') : ''}</div>
        <div class="td-strip" aria-label="Most recent results, newest first">${last.map(x => `<i class="${x.result === 'W' ? 'w' : 'l'}" title="${x.result === 'W' ? 'Win' : 'Loss'}${x.day ? ' · ' + esc(x.day) : ''}"></i>`).join('')}</div>
        <div class="kv" style="justify-content:space-between"><span class="sub">${streak >= 2 ? `${streak} ${use[0].result === 'W' ? 'wins' : 'losses'} in a row` : 'Newest on the left'}</span>${rated.length >= 2 ? `<span class="kv"><span class="sub">Ladder rating ${rated[rated.length - 1]}</span>${arrow(rated[rated.length - 1] - rated[0])}${spark(rated)}</span>` : ''}</div></div>`);

      // ---- mistakes and problem Pokémon ----
      const losses = use.filter(x => x.result === 'L'); const recentL = losses.slice(0, 15), olderL = losses.slice(15, 30);
      const count = (list) => { const c = {}; for (const x of list) for (const t of (x.tags || [])) c[t] = (c[t] || 0) + 1; return c; };
      const rc = count(recentL), oc = count(olderL);
      const tags = Object.entries(rc).filter(([t]) => t !== 'luck').sort((a, b) => b[1] - a[1]).slice(0, 3);
      const mons = {}; for (const x of use.slice(0, 30)) for (const p of (x.opp || [])) { const k = p; (mons[k] ||= { n: 0, l: 0 }); mons[k].n++; if (x.result === 'L') mons[k].l++; }
      const beat = Object.entries(mons).filter(([, v]) => v.n >= 2 && v.l >= 2).sort((a, b) => (b[1].l / b[1].n - a[1].l / a[1].n) || b[1].l - a[1].l).slice(0, 4);
      cards.push(`<div class="card td-card"><div class="card-head"><h3>What's costing you</h3><a class="sub" href="#skills">Skills</a></div>
        ${tags.length ? `<div class="td-rows">${tags.map(([t, n]) => { const share = pct(n, recentL.length), was = olderL.length >= 5 ? pct(oc[t] || 0, olderL.length) : null; return `<div><span>${esc(TAG[t] || t)}</span><span class="num">${n} of ${recentL.length} losses</span>${was !== null ? arrowBad(share - was) : ''}</div>`; }).join('')}</div>` : `<p class="sub">${losses.length ? 'Tag what went wrong when you log a loss, and the patterns show up here.' : 'No losses logged yet.'}</p>`}
        ${beat.length ? `<div class="section-label">Pokémon beating you lately</div><div class="td-mons">${beat.map(([n, v]) => `<span class="td-mon">${VL.sprite(n, 'sm', false)}<span>${esc(n)}<br><span class="mini">lost ${v.l} of ${v.n}</span></span></span>`).join('')}</div>` : ''}</div>`);
    } else {
      cards.push(`<div class="card td-card"><div class="card-head"><h3>Your results</h3></div><p class="sub">Once you log a few games, this shows your win rate, streaks, rating line, the mistakes costing you the most and the Pokémon you keep losing to.</p><div class="row"><a class="btn small" href="#log">Log a game</a></div></div>`);
    }

    // ---- knowledge ----
    const hist = store.list('ratinghist').sort((a, b) => (a.t || 0) - (b.t || 0));
    const tests = store.list('tests').sort((a, b) => (b.ts || 0) - (a.ts || 0));
    if (hist.length && VL.progress) {
      const ov = (h) => VL.progress.overallOf(h.areas || {});
      const series = hist.map(ov).filter(v => v !== null).map(Math.round);
      const now = series.length ? series[series.length - 1] : null;
      const weekAgo = Date.now() - 7 * 864e5; const before = hist.filter(h => h.t <= weekAgo).map(ov).filter(v => v !== null).pop();
      const base = before !== undefined ? Math.round(before) : (series.length ? series[0] : null);
      const cur = hist[hist.length - 1].areas || {}; const old = (hist.filter(h => h.t <= weekAgo).pop() || hist[0]).areas || {};
      const moves = (VL.progress.AREAS || []).map(a => ({ n: a.n, d: cur[a.id] && old[a.id] ? Math.round(cur[a.id][0] - old[a.id][0]) : null, r: cur[a.id] ? Math.round(cur[a.id][0]) : null })).filter(x => x.r !== null);
      const best = moves.filter(x => x.d).sort((a, b) => b.d - a.d)[0], worst = moves.filter(x => x.d).sort((a, b) => a.d - b.d)[0];
      const weakest = moves.slice().sort((a, b) => a.r - b.r)[0];
      cards.push(`<div class="card td-card"><div class="card-head"><h3>Your knowledge</h3><a class="sub" href="#progress">Progress</a></div>
        <div class="td-big">${now !== null ? `<span class="num">${now}</span><span class="sub">overall rating · ${esc(VL.progress.rankOf(now))}${VL.progress.nextRank && VL.progress.nextRank(now) ? ` (${VL.progress.nextRank(now).gap} to ${esc(VL.progress.nextRank(now).name)})` : ''}</span>${arrow(now - base, before !== undefined ? ' this week' : ' since you started')}` : '<span class="sub">Answer 10 questions in one area to get an overall rating.</span>'}${spark(series.slice(-30), 'var(--win)')}</div>
        <div class="td-rows">${best && best.d > 0 ? `<div><span>Most improved</span><span>${esc(best.n)}</span>${arrow(best.d)}</div>` : ''}${worst && worst.d < 0 && worst !== best ? `<div><span>Slipping</span><span>${esc(worst.n)}</span>${arrow(worst.d)}</div>` : ''}${weakest ? `<div><span>Lowest area</span><span>${esc(weakest.n)}</span><span class="num mini">${weakest.r}</span></div>` : ''}
        ${tests.length ? `<div><span>Last test</span><span>${esc(tests[0].label || 'Test')}</span><span class="kv"><span class="num">${tests[0].pct}%</span>${tests[1] ? arrow(tests[0].pct - tests[1].pct, ' points') : ''}</span></div>` : ''}</div></div>`);
    } else {
      cards.push(`<div class="card td-card"><div class="card-head"><h3>Your knowledge</h3></div><p class="sub">Play a training game or take a test and your ratings start here, with what's improving and what's slipping.</p><div class="row"><a class="btn small" href="#games">Play a game</a><a class="btn ghost small" href="#test">Take a test</a></div></div>`);
    }

    // ---- the game right now ----
    const bits = [];
    const mv = VL.meta && VL.meta.movers ? VL.meta.movers(fid, 3) : null;
    if (mv && (mv.up.length || mv.down.length)) {
      const chip = (x) => `<span class="td-mon">${VL.sprite(x.n, 'sm', false)}<span>${esc(x.n)}<br><span class="mini ${x.d > 0 ? 'good-t' : 'bad-t'}">${x.d > 0 ? '▲ +' : '▼ −'}${Math.abs(x.d).toFixed(1)}</span></span></span>`;
      bits.push(`<div class="section-label">Meta movers this month</div><div class="td-mons">${mv.up.map(chip).join('')}${mv.down.map(chip).join('')}</div>`);
    }
    if (VL.news && VL.news.isReady()) {
      const items = VL.news.items().filter(it => it.k !== 'app').slice(0, 4);
      if (items.length) bits.push(`<div class="section-label">Latest</div><div class="td-rows news">${items.map(it => `<div><span class="pill ${VL.news.kinds[it.k][1]}">${esc(VL.news.kinds[it.k][0])}</span><span>${it.u ? `<a href="${esc(it.u)}" target="_blank" rel="noopener noreferrer">${esc(it.t)} ↗</a>` : esc(it.t)}</span><span class="mini">${esc(VL.news.niceDay(it.d))}</span></div>`).join('')}</div>`);
      const next = VL.upcoming().find(e => VL.news.daysUntil(e.d) >= 0);
      if (next) { const k = VL.news.daysUntil(next.d); bits.push(`<div class="kv td-next"><span class="sub">Next up</span><b>${esc(next.n)}</b><span class="mini">${k === 0 ? 'today' : k === 1 ? 'tomorrow' : `in ${k} days`}</span></div>`); }
    }
    if (bits.length) cards.push(`<div class="card td-card"><div class="card-head"><h3>The game right now</h3><a class="sub" href="#news">News${VL.news && VL.news.unread() ? ' <span class="pill w">new</span>' : ''}</a></div>${bits.join('')}</div>`);

    root.innerHTML = `<div class="td-grid">${cards.join('')}</div>`;
  }
  VL.trends = { render };
  VL.onNews = () => { if (VL.D && VL.D.dex) render(); };
})();
