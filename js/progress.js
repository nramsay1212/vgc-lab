/* Ratings and progress. Every game answer and test question updates a
 * rating for its skill area, the way puzzle ratings work in chess:
 * beating hard questions moves you up more than easy ones, and missing easy
 * ones costs more than missing hard ones. A snapshot is saved after every
 * game and test so improvement can be charted over time. */
(function () {
  'use strict';
  const VL = (window.VL = window.VL || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = VL.store;

  const AREAS = [
    { id: 'types', n: 'Type matchups', how: 'Type Rush, and type questions on tests', play: ['types', 'rush'], test: 'types' },
    { id: 'speed', n: 'Speed', how: 'Speed Duel, Speed Sort, and speed questions on tests', play: ['duel', 'spread'], test: 'speed' },
    { id: 'order', n: 'Priority and turn order', how: 'Turn Order, and priority questions on tests', play: ['order', 'normal'], test: 'order' },
    { id: 'damage', n: 'Damage', how: 'Damage Guess', play: ['damage', 'guess'] },
    { id: 'items', n: 'Items and abilities', how: 'Item and ability questions on tests', test: 'items' },
    { id: 'mechanics', n: 'Mechanics', how: 'Mechanics questions on tests', test: 'mechanics' },
    { id: 'meta', n: 'Meta knowledge', how: 'Common sets questions on tests', test: 'meta' },
  ];
  const COLORS = { types: '#6E79E8', speed: '#F2683C', order: '#3FB6A8', damage: '#E2B340', items: '#D46BA8', mechanics: '#4CB782', meta: '#5AA9E6', overall: 'var(--ink)' };
  const START = 1000, PROVISIONAL = 10;
  const RANKS = [[1800, 'Champion'], [1600, 'Master'], [1400, 'Expert'], [1200, 'Ace Trainer'], [1000, 'Trainer'], [0, 'Novice']];
  const rankOf = (r) => (RANKS.find(([min]) => r >= min) || RANKS[RANKS.length - 1])[1];
  // the title above the one you have, and how far away it is
  const nextRank = (r) => { const up = RANKS.slice().reverse().find(([min]) => min > r); return up ? { name: up[1], gap: Math.ceil(up[0] - r) } : null; };
  // every title and where you sit on the ladder (there's no cap: the hardest questions keep counting)
  function ladderHtml(r) {
    const asc = RANKS.slice().reverse();
    return `<div class="rank-ladder">${asc.map(([min, n], i) => { const top = asc[i + 1] ? asc[i + 1][0] : null; const here = r !== null && r >= min && (top === null || r < top);
      return `<div class="rk ${here ? 'here' : r !== null && r >= min ? 'past' : ''}"><b>${esc(n)}</b><span class="mini">${top === null ? min + '+' : `${min}–${top - 1}`}</span></div>`; }).join('')}</div>`;
  }

  function current() { return (store.get('ratings', 'current') || {}).areas || {}; }
  // Only current formats count toward your ratings. Older formats are practice: you can still play,
  // study and take tests in them, but they don't move your ratings (2009 speed tiers say nothing
  // about how ready you are for today's ladder). A format the data doesn't know counts.
  function counts(fid) { const all = VL.D && VL.D.dex ? VL.D.allFormats() : []; const f = all.find(x => x.id === fid); return !f || !!f.current; }
  function practiceNote(fid) {
    if (!fid || counts(fid)) return '';
    const all = VL.D && VL.D.dex ? VL.D.allFormats() : []; const f = all.find(x => x.id === fid);
    const now = all.filter(x => x.current && !!x.doubles === !!(f && f.doubles)).map(x => x.name).join(' or ');
    return `${f ? f.name : 'This'} is an older format, so it's practice only: it doesn't change your ratings or your saved scores.${now ? ` Switch to ${now} for results that count.` : ''}`;
  }
  // only the areas that still exist: ratings from removed games (like Nature Rush's natures) stay saved but don't count
  function overallOf(areas) {
    const live = new Set(AREAS.map(a => a.id));
    const rs = Object.entries(areas).filter(([k, a]) => live.has(k) && a && a[1] >= PROVISIONAL).map(([, a]) => a[0]);
    return rs.length ? rs.reduce((x, y) => x + y, 0) / rs.length : null;
  }
  const asPairs = (areas) => Object.fromEntries(Object.entries(areas).map(([k, v]) => [k, [v.r, v.n]]));

  /* results: [{ a: area id, d: difficulty rating, s: score 0..1 }]
   * info: { src: 'game' | 'test', label, points } */
  function apply(results, info) {
    if (!results || !results.length) return null;
    if (info && info.fmt && !counts(info.fmt)) return { practice: info.fmt };
    const cur = JSON.parse(JSON.stringify(current()));
    const ovBefore = overallOf(asPairs(cur));
    const before = {};
    for (const res of results) {
      const a = cur[res.a] || { r: START, n: 0 };
      if (!(res.a in before)) before[res.a] = Math.round(a.r);
      if (res.perf != null) {
        // a whole game: move part of the way toward how you played, at most 60 points
        const k = a.n < PROVISIONAL ? 0.5 : a.n < 60 ? 0.25 : 0.15;
        a.r = Math.max(100, a.r + Math.max(-60, Math.min(60, k * (res.perf - a.r))));
        a.n += res.n || 1;
      } else {
        const K = a.n < 30 ? 40 : 20;
        const E = 1 / (1 + Math.pow(10, (res.d - a.r) / 400));
        a.r = Math.max(100, a.r + K * (Math.max(0, Math.min(1, res.s)) - E));
        a.n++;
      }
      cur[res.a] = a;
    }
    for (const k of Object.keys(cur)) cur[k].r = Math.round(cur[k].r * 10) / 10;
    store.put('ratings', 'current', { areas: cur });
    store.put('ratinghist', VL.newId('h'), { t: Date.now(), src: info.src, label: info.label || '', points: info.points || 0, areas: asPairs(cur) });
    const changes = Object.keys(before).map(k => ({ a: k, from: before[k], to: Math.round(cur[k].r), n: cur[k].n }));
    // a new title: celebrate once the result screen's own sound has finished
    const ovAfter = overallOf(asPairs(cur));
    if (ovBefore !== null && ovAfter !== null && ovAfter > ovBefore) {
      const idx = (r) => RANKS.findIndex(([min]) => r >= min);
      if (idx(ovAfter) < idx(ovBefore)) setTimeout(() => { VL.sound && VL.sound.play('best'); VL.toast && VL.toast(`New title: ${rankOf(ovAfter)}! Your overall rating is ${Math.round(ovAfter)}.`); }, 1300);
    }
    return changes;
  }
  function changesHtml(changes) {
    if (changes && changes.practice) return `<p class="sub practice-note">${esc(practiceNote(changes.practice))}</p>`;
    if (!changes || !changes.length) return '';
    return `<div><div class="section-label">Rating change</div><div class="kv">${changes.map(c => {
      const d = c.to - c.from; const ar = AREAS.find(x => x.id === c.a);
      return `<span class="pill ${d > 0 ? 'w' : d < 0 ? 'l' : 'm'}">${esc(ar ? ar.n : c.a)} ${c.from} → ${c.to} (${d > 0 ? '+' : ''}${d})</span>`;
    }).join(' ')}</div>${changes.some(c => c.n < PROVISIONAL) ? '<p class="sub">Ratings with fewer than 10 answers are provisional and move a lot. They settle down as you play.</p>' : ''}</div>`;
  }

  // ---------- page ----------
  const hist = () => store.list('ratinghist').sort((a, b) => a.t - b.t);
  function weekStart(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }
  function valueAt(h, area) { const v = h.areas && h.areas[area]; return v ? v[0] : null; }
  function ratingAgo(area, days) {
    const cut = Date.now() - days * 864e5; const H = hist().filter(h => h.t <= cut);
    if (!H.length) return null; const last = H[H.length - 1];
    return area === 'overall' ? overallOf(last.areas || {}) : valueAt(last, area);
  }

  function lineChart(series, opts) {
    const pts = series.flatMap(s => s.pts);
    if (pts.length < 2) return '<div class="empty">Play a few games or take a test, and your ratings over time will appear here.</div>';
    const W = Math.max(640, Math.min(2600, ($('pg-chart') && $('pg-chart').clientWidth) || ((document.querySelector('.wrap') || {}).clientWidth || 1050) - 90)), H = 280, pl = 46, pr = 190, pt = 14, pb = 28;
    const t0 = Math.min(...pts.map(p => p.t)), t1 = Math.max(...pts.map(p => p.t)) || t0 + 1;
    let lo = Math.min(...pts.map(p => p.v)), hi = Math.max(...pts.map(p => p.v));
    const span = Math.max(hi - lo, 60); const step = span > 600 ? 200 : span > 240 ? 100 : 50;
    lo = Math.floor((lo - 10) / step) * step; hi = Math.ceil((hi + 10) / step) * step;
    const x = (t) => pl + (W - pl - pr) * (t1 === t0 ? 0.5 : (t - t0) / (t1 - t0));
    const y = (v) => pt + (H - pt - pb) * (1 - (v - lo) / (hi - lo));
    let g = ''; for (let v = lo; v <= hi; v += step) g += `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    const fmtD = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    g += `<text x="${pl}" y="${H - 8}">${fmtD(t0)}</text><text x="${W - pr}" y="${H - 8}" text-anchor="end">${fmtD(t1)}</text>`;
    const labels = [];
    const lines = series.filter(s => s.pts.length).map(s => {
      const d = s.pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
      const last = s.pts[s.pts.length - 1];
      labels.push({ y: y(last.v), text: `${s.name} ${Math.round(last.v)}`, c: s.c });
      return `<path d="${d}" fill="none" stroke="${s.c}" stroke-width="${s.thick ? 2.6 : 1.8}" stroke-linejoin="round" stroke-linecap="round" ${s.thick ? '' : 'opacity=".9"'}/><circle cx="${x(last.t)}" cy="${y(last.v)}" r="3.5" fill="${s.c}"/>`;
    }).join('');
    // spread end labels so they don't overlap
    labels.sort((a, b) => a.y - b.y); for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 13) labels[i].y = labels[i - 1].y + 13;
    const lab = labels.map(l => `<text x="${W - pr + 8}" y="${l.y + 4}" style="fill:${l.c};font-weight:500">${esc(l.text)}</text>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(opts.label)}">${g}${lines}${lab}</svg>`;
  }
  function spark(vals, c) {
    if (vals.length < 2) return '';
    const W = 120, H = 32; const lo = Math.min(...vals), hi = Math.max(...vals); const span = Math.max(hi - lo, 20);
    const d = vals.map((v, i) => `${i ? 'L' : 'M'}${(W * i / (vals.length - 1)).toFixed(1)},${(H - 3 - (H - 6) * (v - lo) / span).toFixed(1)}`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"><path d="${d}" fill="none" stroke="${c}" stroke-width="1.8"/></svg>`;
  }

  function render() {
    if (!$('p-progress')) return;
    const cur = current(); const H = hist();
    const ov = overallOf(Object.fromEntries(Object.entries(cur).map(([k, v]) => [k, [v.r, v.n]])));
    const ov30 = ratingAgo('overall', 30);
    const now = Date.now(); const wk = weekStart(now);
    const ptsWeek = H.filter(h => h.t >= wk).reduce((a, h) => a + (h.points || 0), 0);
    const ptsAll = H.reduce((a, h) => a + (h.points || 0), 0);
    const tests = store.list('tests').sort((a, b) => b.ts - a.ts);
    $('pg-tiles').innerHTML = [
      ['Overall rating', ov === null ? '–' : Math.round(ov), ov === null ? 'Needs 10 answers in at least one area' : rankOf(ov) + (nextRank(ov) ? ` · ${nextRank(ov).gap} to ${nextRank(ov).name}` : '') + (ov30 !== null ? ` · ${ov - ov30 >= 0 ? '+' : ''}${Math.round(ov - ov30)} in 30 days` : '')],
      ['Points this week', ptsWeek, 'From games and tests'],
      ['Points all time', ptsAll, `${H.length} games and tests`],
      ['Tests taken', tests.length, tests.length ? `Last: ${tests[0].pct}% (${grade(tests[0].pct)})` : 'Take one on the Test page'],
    ].map(([k, v, s]) => `<div class="tile"><div class="k">${esc(k)}</div><div class="v ${k === 'Overall rating' ? 'hot' : ''}">${esc(v)}</div><div class="mini">${esc(s)}</div></div>`).join('');
    const lad = $('pg-ladder'); if (lad) lad.innerHTML = ladderHtml(ov === null ? null : ov);

    // area cards
    $('pg-areas').innerHTML = AREAS.map(a => {
      const c = cur[a.id]; const r = c ? Math.round(c.r) : null; const ago = ratingAgo(a.id, 30);
      const vals = H.map(h => valueAt(h, a.id)).filter(v => v !== null).slice(-30);
      return `<div class="nb-card areacard" style="border-top:2px solid ${COLORS[a.id]}">
        <div class="h"><b>${esc(a.n)}</b>${r !== null ? `<span class="pill ${c.n >= PROVISIONAL ? 'n' : 'm'}">${c.n >= PROVISIONAL ? rankOf(r) : 'provisional'}</span>` : ''}</div>
        <div class="kv" style="justify-content:space-between"><span class="num" style="font-size:26px;font-weight:600">${r ?? '–'}</span>${spark(vals, COLORS[a.id])}</div>
        <span class="mini">${r === null ? 'Not rated yet' : `${c.n} answers${ago !== null ? ` · ${r - ago >= 0 ? '+' : ''}${Math.round(r - ago)} in 30 days` : ''}${c.n < PROVISIONAL ? ` · ${PROVISIONAL - c.n} more to settle` : ''}`}</span>
        <span class="sub">Rated by: ${esc(a.how)}</span>
        <div class="kv">${a.play ? `<button class="btn ghost small" data-pgplay="${a.play[0]}" data-mode="${a.play[1]}">Play</button>` : ''}${a.go ? `<a class="btn ghost small" href="#${a.go}">Practice</a>` : ''}${a.test ? `<button class="btn ghost small" data-pgtest="${a.test}">Take a test on this</button>` : ''}</div>
      </div>`;
    }).join('');

    // chart
    const sel = $('pg-series').value || 'all';
    const series = [];
    const oPts = H.map(h => ({ t: h.t, v: overallOf(h.areas || {}) })).filter(p => p.v !== null);
    if (sel === 'all' || sel === 'overall') series.push({ name: 'Overall', c: COLORS.overall, pts: oPts, thick: true });
    for (const a of AREAS) if (sel === 'all' || sel === a.id) series.push({ name: a.n, c: COLORS[a.id], pts: H.map(h => ({ t: h.t, v: valueAt(h, a.id) })).filter(p => p.v !== null) });
    $('pg-chart').innerHTML = lineChart(series, { label: 'Ratings over time' });

    // weekly points
    const weeks = []; for (let i = 11; i >= 0; i--) weeks.push(wk - i * 7 * 864e5);
    const wp = weeks.map(w => H.filter(h => h.t >= w && h.t < w + 7 * 864e5).reduce((a, h) => a + (h.points || 0), 0));
    const maxp = Math.max(1, ...wp);
    $('pg-weeks').innerHTML = `<div class="weekbars">${weeks.map((w, i) => `<div class="wb"><span class="num mini">${wp[i] || ''}</span><span class="bar3" style="height:${Math.round(100 * wp[i] / maxp)}%"></span><span class="mini">${new Date(w).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}</span></div>`).join('')}</div><p class="sub">Points per week, starting Mondays. This shows effort; ratings show skill.</p>`;

    // tests
    $('pg-tests').innerHTML = tests.length ? `<table class="list"><thead><tr><th>Date</th><th>Test</th><th>Score</th><th>Grade</th><th>Time</th><th></th></tr></thead><tbody>${tests.slice(0, 30).map(t => `<tr><td class="mono">${new Date(t.ts).toLocaleDateString()}</td><td>${esc(t.label)}<br><span class="sub">${esc(t.fmtName || '')}</span>${t.practice || (t.fmt && (t.ts || 0) >= RULE_START && !counts(t.fmt)) ? ' <span class="pill m" title="Older format: didn\'t change your ratings">Practice</span>' : ''}</td><td class="num">${t.correct}/${t.n} (${t.pct}%)</td><td><span class="pill ${t.pct >= 80 ? 'w' : t.pct >= 60 ? 'n' : 'l'}">${grade(t.pct)}</span></td><td class="num">${Math.floor(t.secs / 60)}:${String(t.secs % 60).padStart(2, '0')}</td><td>${(t.misses || []).length ? `<button class="linkbtn" data-pgrev="${esc(t.id)}">Review misses</button>` : ''}</td></tr><tr hidden data-pgrevrow="${esc(t.id)}"><td colspan="6"><div class="misses">${(t.misses || []).map(m => `<div class="miss">${m.q}<br><span class="sub">You: ${m.yours} · Correct: <b>${m.right}</b></span>${m.ex ? `<br><span class="sub">${m.ex}</span>` : ''}</div>`).join('')}</div></td></tr>`).join('')}</tbody></table>`
      : '<div class="empty">No tests yet. Your first one sets a baseline to measure improvement against.</div>';

    // game trends
    // only games and modes that still exist (old scores from removed games, like Nature Rush, stay saved but hidden)
    const live = (r) => { const [gid, mode] = r.id.split(':'); const g = (VL.arcadeGames || []).find(x => x.id === gid); return !!(g && g.modes.some(x => x[0] === mode)); };
    const ar = store.list('arcade').filter(live);
    $('pg-games').innerHTML = ar.length ? `<div class="cards">${ar.sort((a, b) => (b.plays || 0) - (a.plays || 0)).map(r => {
      const [gid, mode] = r.id.split(':'); const g = (VL.arcadeGames || []).find(x => x.id === gid); const m = g && g.modes.find(x => x[0] === mode);
      const sc = (r.hist || []).map(h => h.s);
      return `<div class="nb-card"><div class="h"><b>${esc(g ? g.name : gid)}</b><span class="mini">${esc(m ? m[1] : mode)}</span></div><div class="kv" style="justify-content:space-between"><span><span class="num" style="font-size:20px">${r.best || 0}</span> <span class="mini">best</span></span>${spark(sc.slice(-20), 'var(--accent)')}</div><span class="mini">${r.plays || 0} play${(r.plays || 0) === 1 ? '' : 's'} · last ${sc.length ? sc[sc.length - 1] : '–'}</span></div>`;
    }).join('')}</div>` : '<div class="empty">Play some games and your scores will show up here.</div>';
  }
  function grade(p) { return p >= 90 ? 'A' : p >= 80 ? 'B' : p >= 70 ? 'C' : p >= 60 ? 'D' : 'F'; }

  $('pg-series').addEventListener('change', render);
  $('p-progress').addEventListener('click', e => {
    const pl = e.target.closest('[data-pgplay]'); if (pl) { location.hash = 'games'; setTimeout(() => VL.arcade.start(pl.dataset.pgplay, pl.dataset.mode), 80); return; }
    const t = e.target.closest('[data-pgtest]'); if (t) { location.hash = 'test'; setTimeout(() => VL.test && VL.test.startArea(t.dataset.pgtest), 80); return; }
    const rv = e.target.closest('[data-pgrev]'); if (rv) { const row = document.querySelector(`[data-pgrevrow="${rv.dataset.pgrev}"]`); if (row) row.hidden = !row.hidden; }
  });

  const ratingOf = (a) => { const c = current()[a]; return c ? Math.round(c.r) : null; };

  // ---------- take back what older-format tests did to your ratings ----------
  // Before this rule, a test in an older format moved the same ratings as everything else. Each such test
  // left a snapshot in the rating history; the difference from the snapshot before it is exactly what the
  // test changed. That difference comes off your current ratings and every later snapshot, and the
  // snapshot is removed, so this runs once per test (and again only if a synced device brings an old one).
  const RULE_START = Date.UTC(2026, 10, 21, 17, 0); // when "only current formats count" began
  function undoOlderFormats() {
    if (!VL.D || !VL.D.dex) return;
    // Only tests from before this rule, and only in formats that were never current while the app has
    // existed (everything before Pokémon Champions). Tests taken in Reg M-C stay counted for good, even
    // after a newer regulation takes over; from now on older-format tests never touch ratings at all.
    const all = VL.D.allFormats();
    const wasCurrent = (fid) => { const f = all.find(x => x.id === fid); return !f || String(f.mod || '').startsWith('champions'); };
    const bad = store.list('tests').filter(t => t.fmt && (t.ts || 0) < RULE_START && !wasCurrent(t.fmt));
    if (!bad.length) return;
    const H = hist(); const cur = JSON.parse(JSON.stringify(current())); let changed = false;
    for (const t of bad) {
      const i = H.findIndex(h => h.src === 'test' && h.label === t.label && h.t >= (t.ts || 0) - 2000 && h.t <= (t.ts || 0) + 10000);
      if (i < 0) continue;
      const prev = i > 0 ? (H[i - 1].areas || {}) : {};
      const delta = {};
      for (const [k, v] of Object.entries(H[i].areas || {})) { const [pr, pn] = prev[k] || [START, 0]; if (v[0] !== pr || v[1] !== pn) delta[k] = [v[0] - pr, v[1] - pn]; }
      for (const [k, [dr, dn]] of Object.entries(delta)) {
        if (!cur[k]) continue;
        cur[k].n = Math.max(0, (cur[k].n || 0) - dn); cur[k].r = Math.max(100, Math.round((cur[k].r - dr) * 10) / 10);
        if (!cur[k].n) delete cur[k];
      }
      for (const later of H.slice(i + 1)) {
        const areas = { ...(later.areas || {}) };
        for (const [k, [dr, dn]] of Object.entries(delta)) { if (!areas[k]) continue; const n = Math.max(0, areas[k][1] - dn); if (n) areas[k] = [Math.max(100, Math.round((areas[k][0] - dr) * 10) / 10), n]; else delete areas[k]; }
        const rec = { ...later, areas }; delete rec.id; delete rec.u; store.put('ratinghist', later.id, rec); later.areas = areas;
      }
      store.del('ratinghist', H[i].id); H.splice(i, 1); changed = true;
    }
    if (changed) store.put('ratings', 'current', { areas: cur });
  }
  let undoT = null; const undoSoon = () => { clearTimeout(undoT); undoT = setTimeout(() => { try { undoOlderFormats(); } catch (e) { console.error(e); } }, 400); };
  store.onChange((fromSync) => { if (fromSync) undoSoon(); });
  (function waitDex() { if (VL.D && VL.D.dex) store.ready.then(undoSoon); else setTimeout(waitDex, 300); })();

  // a line under each format menu (Study, Games, Test) when an older format is picked
  function syncNotes() {
    for (const id of ['st-format', 'ar-format', 'te-format']) {
      const sel = $(id); if (!sel) continue;
      let n = $(id + '-note'); const lab = sel.closest('label');
      if (!n && lab) { n = document.createElement('p'); n.id = id + '-note'; n.className = 'sub practice-note'; lab.insertAdjacentElement('afterend', n); }
      if (n) { const t = practiceNote(sel.value); n.textContent = t; n.hidden = !t; }
    }
  }
  document.addEventListener('change', (e) => { if (/^(st|ar|te)-format$/.test(e.target.id)) syncNotes(); });
  window.addEventListener('hashchange', () => setTimeout(syncNotes, 120));
  setTimeout(syncNotes, 1500);
  VL.progress = { AREAS, apply, ratingOf, changesHtml, render, rankOf, nextRank, grade, overallOf, current, counts, practiceNote, undoOlderFormats, syncNotes };
})();
