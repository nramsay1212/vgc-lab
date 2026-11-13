/* VGC Lab main app: training log, review, skills, formats, notebook,
 * roadmap, teams and settings. Study lives in study.js, storage in store.js. */
(function () {
  'use strict';
  const VL = window.VL;
  const D = VL.D;
  const store = VL.store;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const cap = (s) => s.trim().replace(/\s+/g, ' ').split(' ').map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
  const splitMons = (s) => String(s || '').split(/[,/\n]+/).map(x => cap(x)).filter(Boolean);
  const pct = (w, n) => n ? Math.round(100 * w / n) : 0;
  const TAGMAP = Object.fromEntries(VL.TAGS);

  VL.toast = function (msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(VL.toast._t); VL.toast._t = setTimeout(() => t.classList.remove('on'), 1800); };
  function banner(msg) { const b = $('banner'); if (msg) { b.textContent = msg; b.hidden = false; } else b.hidden = true; }

  // ---------- profile and format ----------
  const profile = () => store.get('meta', 'profile') || {};
  function putProfile(patch) { const p = { ...profile(), ...patch }; delete p.id; delete p.u; store.put('meta', 'profile', p); }
  function curFormatId() {
    const p = profile();
    if (p.format === 'custom' && p.customFormat) return 'custom:' + p.customFormat;
    return D.dex ? D.format(p.format).id : (p.format || '');
  }
  function fmtName(id) {
    if (!id) return 'Unknown format';
    if (id.startsWith('custom:')) return id.slice(7);
    const f = D.dex && D.dex.formats.find(x => x.id === id);
    return f ? f.name : id;
  }
  VL.curFormatId = curFormatId;
  VL.fmtName = fmtName;
  function fmtGame(id) { const f = D.dex && D.dex.formats.find(x => x.id === id); return f ? f.game : ''; }
  const games = () => store.list('games').sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const teams = () => store.list('teams').sort((a, b) => (b.ts || 0) - (a.ts || 0));

  function monStats(list) {
    const m = {};
    for (const g of list) for (const p of (g.opp || [])) { const k = p.toLowerCase(); (m[k] ||= { name: p, n: 0, w: 0 }); m[k].n++; if (g.result === 'W') m[k].w++; }
    return Object.values(m);
  }
  function recordVs(name, list) {
    const k = name.toLowerCase(); let n = 0, w = 0;
    for (const g of list) if ((g.opp || []).some(p => k.includes(p.toLowerCase()) || p.toLowerCase().includes(k))) { n++; if (g.result === 'W') w++; }
    return { n, w };
  }
  function streak() {
    const done = new Set(store.list('days').filter(d => VL.SESSION.slice(0, 6).filter(s => d.done && d.done[s.id]).length >= 3).map(d => d.id));
    let n = 0; const d = new Date();
    if (!done.has(dayKey(d))) d.setDate(d.getDate() - 1);
    while (done.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  VL.markDone = function (task) {
    const key = dayKey(); const day = store.get('days', key) || { done: {} };
    if (day.done && day.done[task]) return;
    store.put('days', key, { done: { ...(day.done || {}), [task]: true } });
  };

  // ---------- header ----------
  function renderHeader() {
    const g = games();
    $('cd-games').textContent = g.length;
    $('cd-formats').textContent = new Set(g.map(x => x.fmt).filter(Boolean)).size;
    $('cd-streak').textContent = streak();
    $('cd-drills').textContent = store.list('drills').reduce((a, d) => a + (d.n || 0), 0);
  }

  // ---------- today ----------
  function fillFormatSelect() {
    if (!D.dex) return;
    const sel = $('fmt-select'); const p = profile();
    sel.innerHTML = D.formats().map(f => `<option value="${esc(f.id)}">${esc(f.name)} · ${esc(f.game)}${f.current ? ' (current)' : ''}</option>`).join('') + '<option value="custom">A game not listed yet…</option>';
    sel.value = p.format === 'custom' ? 'custom' : D.format(p.format).id;
  }
  function renderToday() {
    const p = profile();
    $('focus-text').textContent = p.focus || 'No focus set yet. Pick one habit to drill in every game this week.';
    if (document.activeElement !== $('focus-input')) $('focus-input').value = p.focus || '';
    const g = games(); const fid = curFormatId();
    const inFmt = g.filter(x => x.fmt === fid);
    const rated = inFmt.filter(x => Number.isFinite(x.rating));
    const f = D.dex && !fid.startsWith('custom:') ? D.format(fid) : null;
    $('fmt-view').innerHTML = `<div style="font-size:17px;font-weight:600">${esc(fmtName(fid))}</div>
      <div class="sub">${esc(f ? `${f.game} · ${f.doubles ? 'Doubles' : 'Singles'} · ${f.gimmick}` : 'Not in the Pokémon data yet. Logging still works.')}</div>
      <div class="grid3" style="margin-top:6px">
        <div><div class="sub">Current rating</div><div class="num" style="font-size:20px">${rated.length ? rated[0].rating : '–'}</div></div>
        <div><div class="sub">Games this format</div><div class="num" style="font-size:20px">${inFmt.length}</div></div>
        <div><div class="sub">Season goal</div><div style="font-size:16px;font-weight:600">${esc(p.goal || 'Not set')}</div></div>
      </div>`;
    $('fmt-goal').value = p.goal || ''; $('fmt-peak').value = p.peak ?? 2000;

    const key = dayKey(); const day = store.get('days', key) || { done: {} };
    const todayGames = g.filter(x => x.day === key); const w = todayGames.filter(x => x.result === 'W').length;
    $('today-date').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    $('today-games').textContent = todayGames.length ? `${todayGames.length} logged today · ${w}–${todayGames.length - w}` : 'No games logged today';
    const threats = monStats(g.slice(0, 60)).filter(m => m.n >= 2).sort((a, b) => (a.w / a.n) - (b.w / b.n) || b.n - a.n).slice(0, 3).map(m => m.name);
    let weakest = null;
    for (const d of VL.study.DRILLS) { const a = VL.study.accuracy(d.id); if (a !== null && (weakest === null || a < weakest.a)) weakest = { a, n: d.name }; }
    const desc = {
      warm: threats.length ? `Run your main attacks into ${threats.map(esc).join(', ')}, the Pokémon beating you most lately, and check who outspeeds whom.` : 'Pick 3 threats you see a lot. Run your main attacks into them in a damage calc and check who outspeeds whom. After a few logged games this fills in from your losses.',
      drill: weakest ? `One round in the Study tab. Your weakest drill right now is ${esc(weakest.n)} (${weakest.a}%).` : 'One round in the Study tab. Start with Type vs Pokémon.',
    };
    $('checklist').innerHTML = VL.SESSION.map(s => {
      const on = !!(day.done && day.done[s.id]);
      return `<li class="${on ? 'done' : ''}"><input type="checkbox" id="ck-${s.id}" data-ck="${s.id}" ${on ? 'checked' : ''}>
        <label for="ck-${s.id}" style="color:inherit;font-size:inherit;font-weight:inherit"><span class="t">${esc(s.t)}<span class="meta">${esc(s.m)}</span></span><span class="d">${desc[s.id] || s.d}</span></label></li>`;
    }).join('');
  }

  // ---------- log ----------
  function teamOptions(sel, first) {
    const cur = sel.value;
    sel.innerHTML = `<option value="">${first}</option>` + teams().slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
    sel.value = cur;
  }
  function fillDatalist() {
    if (!D.dex) return;
    const fid = curFormatId();
    const f = fid.startsWith('custom:') ? null : D.format(fid);
    const idx = f ? f.species.filter(i => !D.dex.species[i].mg) : D.dex.species.map((s, i) => i).filter(i => D.dex.species[i].fe && !D.dex.species[i].mg);
    $('dl-mons').innerHTML = idx.map(i => `<option value="${esc(D.dex.species[i].n)}">`).join('');
  }
  function renderLog() {
    teamOptions($('lf-team'), '(not set)');
    $('log-fmt').textContent = 'Format: ' + fmtName(curFormatId());
    const g = games();
    $('recent-count').textContent = g.length ? `${g.length} total` : '';
    if (!g.length) { $('recent').innerHTML = '<div class="empty">No games yet. Log your next game above and it shows up here.</div>'; return; }
    const tname = Object.fromEntries(teams().map(t => [t.id, t.name]));
    $('recent').innerHTML = `<table class="list"><thead><tr><th></th><th>Date</th><th>Their team</th><th>Leads (mine / theirs)</th><th>Tags</th><th>Note</th><th></th></tr></thead><tbody>${
      g.slice(0, 40).map(x => `<tr>
        <td><span class="pill ${x.result === 'W' ? 'w' : 'l'}">${x.result}</span></td>
        <td class="mono" style="white-space:nowrap">${esc((x.day || '').slice(5))}${Number.isFinite(x.rating) ? `<br><span class="sub">${x.rating}</span>` : ''}<br><span class="sub">${esc(x.fmtName || fmtName(x.fmt))}</span></td>
        <td>${esc((x.opp || []).join(', ')) || '<span class="sub">–</span>'}${x.arch ? `<br><span class="sub">${esc(x.arch)}</span>` : ''}${x.team && tname[x.team] ? `<br><span class="sub">with ${esc(tname[x.team])}</span>` : ''}</td>
        <td>${esc(x.mylead || '–')} / ${esc(x.opplead || '–')}</td>
        <td>${(x.tags || []).map(t => `<span class="pill m">${esc(TAGMAP[t] || t)}</span>`).join(' ')}</td>
        <td style="max-width:280px">${esc(x.note || '')}${x.turn ? ` <span class="sub">(T${x.turn})</span>` : ''}</td>
        <td><button class="linkbtn" data-delgame="${esc(x.id)}">Delete</button></td></tr>`).join('')
    }</tbody></table>`;
  }

  // ---------- review ----------
  function fillScope() {
    const sel = $('rv-scope'); const cur = sel.value || 'cur';
    const fmts = [...new Set(games().map(g => g.fmt).filter(Boolean))];
    sel.innerHTML = `<option value="cur">Current format</option><option value="all">All games</option><option value="30">Last 30 days</option>` + fmts.filter(f => f !== curFormatId()).map(f => `<option value="f:${esc(f)}">${esc(fmtName(f))}</option>`).join('');
    sel.value = [...sel.options].some(o => o.value === cur) ? cur : 'cur';
  }
  function scoped() {
    const s = $('rv-scope').value; const g = games();
    if (s === 'cur') return g.filter(x => x.fmt === curFormatId());
    if (s === '30') { const cut = Date.now() - 30 * 864e5; return g.filter(x => (x.ts || 0) >= cut); }
    if (s.startsWith('f:')) return g.filter(x => x.fmt === s.slice(2));
    return g;
  }
  function barList(rows, { acc = false, fmt } = {}) {
    if (!rows.length) return '';
    const max = Math.max(...rows.map(r => r.v), 1);
    return `<div class="bars">${rows.map(r => `<div class="bar"><span>${r.label}</span><span class="track"><span class="fill ${acc ? 'acc' : ''}" style="display:block;width:${Math.round(100 * r.v / max)}%"></span></span><span class="n">${fmt ? fmt(r) : r.v}</span></div>`).join('')}</div>`;
  }
  const wrRows = (groups) => groups.map(([label, { n, w }]) => ({ label: esc(label), v: pct(w, n), n, w })).sort((a, b) => a.v - b.v);
  function ratingChart(list) {
    const pts = list.filter(x => Number.isFinite(x.rating)).slice().reverse();
    if (pts.length < 2) return '<div class="empty">Add "Rating after" to a few games to see your rating line.</div>';
    const W = 900, H = 200, pl = 44, pr = 14, pt = 12, pb = 24;
    const ys = pts.map(p => p.rating); let lo = Math.min(...ys), hi = Math.max(...ys);
    const span = Math.max(hi - lo, 40); const step = span > 400 ? 100 : span > 160 ? 50 : 20;
    lo = Math.floor((lo - 5) / step) * step; hi = Math.ceil((hi + 5) / step) * step;
    const x = i => pl + (W - pl - pr) * i / (pts.length - 1);
    const y = v => pt + (H - pt - pb) * (1 - (v - lo) / (hi - lo));
    let grid = ''; for (let v = lo; v <= hi; v += step) grid += `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.rating).toFixed(1)}`).join('');
    const last = pts[pts.length - 1];
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Rating over ${pts.length} games, latest ${last.rating}">${grid}
      <path d="${line}L${x(pts.length - 1)},${H - pb}L${pl},${H - pb}Z" fill="var(--accent)" opacity=".12"/><path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linejoin="round"/>
      <circle cx="${x(pts.length - 1)}" cy="${y(last.rating)}" r="4.5" fill="var(--accent)"/>
      <text x="${Math.min(x(pts.length - 1), W - pr - 4)}" y="${Math.max(y(last.rating) - 10, 12)}" text-anchor="end" style="fill:var(--ink);font-weight:500">${last.rating}</text>
      <text x="${pl}" y="${H - 6}">game 1</text><text x="${W - pr}" y="${H - 6}" text-anchor="end">game ${pts.length}</text></svg>`;
  }
  function renderReview() {
    fillScope();
    const list = scoped();
    const n = list.length, w = list.filter(x => x.result === 'W').length;
    const last20 = list.slice(0, 20), w20 = last20.filter(x => x.result === 'W').length;
    const losses = list.filter(x => x.result === 'L'); const tagged = losses.filter(x => (x.tags || []).length).length;
    $('rv-tiles').innerHTML = [['Games', n], ['Win rate', n ? pct(w, n) + '%' : '–'], ['Last 20', last20.length ? pct(w20, last20.length) + '%' : '–'], ['Losses tagged', losses.length ? pct(tagged, losses.length) + '%' : '–']]
      .map(([k, v]) => `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
    $('rv-chart').innerHTML = ratingChart(list);
    const tc = {}; for (const g of losses) for (const t of (g.tags || [])) tc[t] = (tc[t] || 0) + 1;
    const tagRows = Object.entries(tc).sort((a, b) => b[1] - a[1]).map(([t, v]) => ({ label: esc(TAGMAP[t] || t), v }));
    $('rv-tags').innerHTML = tagRows.length ? barList(tagRows, { fmt: r => `${r.v} · ${pct(r.v, losses.length)}%` }) + `<p class="sub">Percent of ${losses.length} losses. Bad luck is included so you can see how often it really decides games.</p>`
      : '<div class="empty">Tag your losses when you log them. The biggest bar here is usually your next weekly focus.</div>';
    const mons = monStats(list).filter(m => m.n >= 3).sort((a, b) => (a.w / a.n) - (b.w / b.n) || b.n - a.n).slice(0, 8);
    $('rv-mons').innerHTML = mons.length ? `<div class="bars">${mons.map(m => `<div class="bar"><span>${esc(m.name)} <button class="linkbtn" style="text-decoration:none;color:var(--accent)" data-addnb="${esc(m.name)}">+ notebook</button></span><span class="track"><span class="fill acc" style="display:block;width:${pct(m.w, m.n)}%"></span></span><span class="n">${pct(m.w, m.n)}% · ${m.n}</span></div>`).join('')}</div><p class="sub">Your win rate in games where they brought it to team preview, and how many games.</p>`
      : '<div class="empty">Fill in "Their 6" when you log. After a dozen games this shows which Pokémon you lose to most.</div>';
    const arch = {}; for (const g of list) { if (!g.arch) continue; (arch[g.arch] ||= { n: 0, w: 0 }); arch[g.arch].n++; if (g.result === 'W') arch[g.arch].w++; }
    const ar = wrRows(Object.entries(arch));
    $('rv-arch').innerHTML = ar.length ? barList(ar, { acc: true, fmt: r => `${r.v}% · ${r.n}` }) : '<div class="empty">Set "Their style" when you log to see which archetypes you struggle with.</div>';
    const leads = {}; for (const g of list) { if (!g.mylead) continue; const k = splitMons(g.mylead).sort().join(' + '); if (!k) continue; (leads[k] ||= { n: 0, w: 0 }); leads[k].n++; if (g.result === 'W') leads[k].w++; }
    const lr = wrRows(Object.entries(leads).filter(([, v]) => v.n >= 3));
    $('rv-leads').innerHTML = lr.length ? barList(lr, { acc: true, fmt: r => `${r.v}% · ${r.n}` }) : '<div class="empty">Log your lead to see which openings win for you.</div>';
    renderInsights(list);
    const reps = store.list('reports').sort((a, b) => (b.ts || 0) - (a.ts || 0));
    $('coach-past-wrap').hidden = !reps.length;
    const sel = $('coach-past'); const cur = sel.value;
    sel.innerHTML = reps.map(r => `<option value="${esc(r.id)}">${esc(new Date(r.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }))} · ${r.games} games</option>`).join('');
    if (cur && reps.some(r => r.id === cur)) sel.value = cur;
    const r = reps.find(x => x.id === sel.value) || reps[0];
    $('coach-out').innerHTML = r ? md(r.text) : '';
  }
  function renderInsights(list) {
    const asc = list.slice().sort((a, b) => (a.ts || 0) - (b.ts || 0));
    if (asc.length < 15) { $('rv-insights').innerHTML = `<div class="empty" style="grid-column:1/-1">Needs about 15 logged games (you have ${asc.length}). Then this shows whether you play worse late in a session or at certain times of day.</div>`; return; }
    let idx = 0, prev = 0; const bySess = {}, byTime = {};
    const sbin = (i) => i <= 3 ? 'Games 1–3 of a session' : i <= 6 ? 'Games 4–6' : i <= 9 ? 'Games 7–9' : 'Game 10 and later';
    const tbin = (h) => h >= 5 && h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : h < 22 ? 'Evening' : 'Late night';
    for (const g of asc) {
      idx = (g.ts - prev > 90 * 60 * 1000) ? 1 : idx + 1; prev = g.ts;
      const s = sbin(idx); (bySess[s] ||= { n: 0, w: 0 }).n++; if (g.result === 'W') bySess[s].w++;
      const t = tbin(new Date(g.ts).getHours()); (byTime[t] ||= { n: 0, w: 0 }).n++; if (g.result === 'W') byTime[t].w++;
    }
    const order = (obj, keys) => keys.filter(k => obj[k] && obj[k].n >= 3).map(k => ({ label: esc(k), v: pct(obj[k].w, obj[k].n), n: obj[k].n }));
    const a = order(bySess, ['Games 1–3 of a session', 'Games 4–6', 'Games 7–9', 'Game 10 and later']);
    const b = order(byTime, ['Morning', 'Afternoon', 'Evening', 'Late night']);
    $('rv-insights').innerHTML = `<div><div class="section-label">By game number in a session</div>${barList(a, { acc: true, fmt: r => `${r.v}% · ${r.n}` }) || '<p class="sub">Not enough games yet.</p>'}</div>
      <div><div class="section-label">By time of day</div>${barList(b, { acc: true, fmt: r => `${r.v}% · ${r.n}` }) || '<p class="sub">Not enough games yet.</p>'}</div>
      <p class="sub" style="grid-column:1/-1">A session ends after 90 minutes without a logged game. If your win rate drops in later games, that's your cue to stop a ladder block earlier.</p>`;
  }
  function md(text) {
    const lines = esc(text || '').split('\n'); let out = '', list = null;
    const inline = s => s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    const close = () => { if (list) { out += `</${list}>`; list = null; } };
    for (const raw of lines) {
      const l = raw.trim(); let m;
      if (!l) { close(); continue; }
      if ((m = l.match(/^#{1,4}\s+(.*)/))) { close(); out += `<h4>${inline(m[1])}</h4>`; }
      else if ((m = l.match(/^[-*•]\s+(.*)/))) { if (list !== 'ul') { close(); out += '<ul>'; list = 'ul'; } out += `<li>${inline(m[1])}</li>`; }
      else if ((m = l.match(/^\d+[.)]\s+(.*)/))) { if (list !== 'ol') { close(); out += '<ol>'; list = 'ol'; } out += `<li>${inline(m[1])}</li>`; }
      else { close(); out += `<p>${inline(l)}</p>`; }
    }
    close(); return out;
  }
  function coachPrompt() {
    const p = profile(); const fid = curFormatId();
    const list = games().filter(g => g.fmt === fid).slice(0, 50);
    const all = list.length ? list : games().slice(0, 50);
    const tname = Object.fromEntries(teams().map(t => [t.id, t.name]));
    const rows = all.map(g => [g.day, g.result, g.type, g.rating ?? '', g.team ? tname[g.team] || '' : '', g.arch || '', (g.opp || []).join('/'), g.mylead || '', g.opplead || '', (g.tags || []).map(t => TAGMAP[t] || t).join('; '), g.turn ? 'T' + g.turn : '', (g.note || '').replace(/\s+/g, ' ').slice(0, 220)].join(' | ')).join('\n');
    const nb = store.list('matchups').filter(m => !m.fmt || m.fmt === fid).map(m => `- ${m.name}: ${(m.plan || '').replace(/\s+/g, ' ').slice(0, 160)}`).join('\n') || '(empty)';
    const sk = (store.get('meta', 'skills') || {}).ratings || {};
    const skills = VL.SKILLS.map(s => `${s.name}: ${sk[s.id] ? sk[s.id] + '/5' : 'not rated'}`).join('; ');
    const drills = VL.study.DRILLS.map(d => { const a = VL.study.accuracy(d.id); return a === null ? null : `${d.name} ${a}%`; }).filter(Boolean).join(', ') || 'none yet';
    const prev = store.list('reports').sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
    const f = D.dex && !fid.startsWith('custom:') ? D.format(fid) : null;
    return `You are an experienced Pokémon VGC coach. Review my recent game logs and give me a weekly review.

Context:
- Format: ${fmtName(fid)}${f ? ` (${f.game}, ${f.doubles ? 'doubles' : 'singles'}, gimmick: ${f.gimmick})` : ''}.
- Me: reached high Master Ball and peaked around rank ${p.peak ?? 2000} on Scarlet/Violet ladder. Long-term goal: win a World Championship someday, in whatever game is current. I want skills that carry across formats, not just this one. Teambuilding is on the back burner.
- This week's focus: ${p.focus || '(none set)'}
- Season goal: ${p.goal || '(none set)'}
- My self-rated skills: ${skills}
- Recent drill accuracy: ${drills}

Game log, newest first. Columns: date | result | type | rating after | my team | their style | their 6 | my lead | their lead | mistake tags | key turn | note
${rows || '(no games logged)'}

Matchup notebook:
${nb}
${prev ? `\nLast review said (excerpt): ${prev.text.slice(0, 600).replace(/\s+/g, ' ')}` : ''}

Write the review in this order, with short markdown headings and bullets:
1. **Next week's focus**: one specific habit, plus one concrete drill to practice it.
2. **Patterns**: the 3 most important patterns in the data. Cite counts from the log (for example "5 of 9 losses tagged Gimmick timing"). Separate decision errors from bad luck and team matchup problems.
3. **Skill check**: where my self-ratings don't match what the log shows.
4. **Matchups to write up**: up to 3 Pokémon or archetypes to add to the notebook, each with a one-line starting plan.
5. **Last focus**: one or two lines on whether the logs show progress on this week's focus.

Rules: be direct and specific. Only state numbers you can count in the log. Don't invent damage calcs or usage stats. If there are fewer than 10 games or most fields are empty, say what to log more carefully and keep it short. Under 450 words.`;
  }

  // ---------- skills ----------
  function renderSkills() {
    const ratings = (store.get('meta', 'skills') || {}).ratings || {};
    const losses = games().filter(g => g.result === 'L').slice(0, 50);
    $('sk-basis').textContent = losses.length ? `Based on your last ${losses.length} losses` : 'Log and tag losses to fill in the red bars';
    $('sk-list').innerHTML = VL.SKILLS.map(s => {
      const hits = s.tags.length ? losses.filter(g => (g.tags || []).some(t => s.tags.includes(t))).length : 0;
      const share = losses.length ? pct(hits, losses.length) : 0;
      const r = ratings[s.id] || 0;
      const accs = (s.study || []).map(id => { const a = VL.study.accuracy(id); const d = VL.study.DRILLS.find(x => x.id === id); return a === null ? null : `${d.name} ${a}%`; }).filter(Boolean);
      return `<div class="skill"><div><h4>${esc(s.name)}</h4><p>${s.what}</p><p class="drill">Practice: ${esc(s.drill)}</p>${accs.length ? `<p class="sub">Drill accuracy: ${esc(accs.join(' · '))}</p>` : ''}</div>
        <div class="skill-side"><div class="dots" role="group" aria-label="Rate ${esc(s.name)}">${[1, 2, 3, 4, 5].map(v => `<button data-skill="${s.id}" data-v="${v}" class="${v <= r ? 'on' : ''}" aria-label="${v} of 5">${v}</button>`).join('')}</div>
        ${s.tags.length ? `<div class="costbar" title="${hits} of ${losses.length} losses"><span style="width:${share}%"></span></div><span class="sub">${losses.length ? `${hits} of ${losses.length} losses` : 'no losses logged'}</span>` : `<span class="sub">${s.id === 'formats' ? 'See the Formats tab' : ''}</span>`}</div></div>`;
    }).join('');
  }

  // ---------- formats ----------
  function renderFormats() {
    const g = games(); const by = {};
    for (const x of g) { const k = x.fmt || 'unknown'; (by[k] ||= []).push(x); }
    const rows = Object.entries(by).map(([f, list]) => {
      const asc = list.slice().sort((a, b) => (a.ts || 0) - (b.ts || 0));
      const first = asc.slice(0, 20), after = asc.slice(20);
      const wr = (l) => l.length ? pct(l.filter(x => x.result === 'W').length, l.length) + '%' : '–';
      const best = Math.max(0, ...list.filter(x => Number.isFinite(x.rating)).map(x => x.rating));
      const tc = {}; for (const x of list) if (x.result === 'L') for (const t of (x.tags || [])) tc[t] = (tc[t] || 0) + 1;
      const top = Object.entries(tc).sort((a, b) => b[1] - a[1])[0];
      return { f, n: list.length, first: wr(first), after: wr(after), best: best || '–', top: top ? TAGMAP[top[0]] : '–', start: asc[0].day };
    }).sort((a, b) => (b.start || '').localeCompare(a.start || ''));
    $('fm-table').innerHTML = rows.length ? `<table class="list"><thead><tr><th>Format</th><th>Games</th><th>First 20</th><th>After</th><th>Best rating</th><th>Top mistake</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(fmtName(r.f))}<br><span class="sub">${esc(fmtGame(r.f))}</span></td><td class="num">${r.n}</td><td class="num">${r.first}</td><td class="num">${r.after}</td><td class="num">${r.best}</td><td>${esc(r.top)}</td></tr>`).join('')}</tbody></table>`
      : '<div class="empty">Your formats appear here as you log games.</div>';
    const fid = curFormatId();
    $('pb-fmt').textContent = fmtName(fid); $('rc-fmt').textContent = fmtName(fid);
    const pb = (store.get('playbook', fid) || {}).done || {};
    $('playbook').innerHTML = VL.PLAYBOOK.map(([id, t, d]) => `<li class="${pb[id] ? 'done' : ''}"><input type="checkbox" id="pb-${id}" data-pb="${id}" ${pb[id] ? 'checked' : ''}><label for="pb-${id}" style="color:inherit;font-size:inherit;font-weight:inherit"><span class="t">${esc(t)}</span><span class="d">${esc(d)}</span></label></li>`).join('');
    const rc = store.get('recaps', fid) || {};
    for (const k of ['won', 'miss', 'next']) if (document.activeElement !== $('rc-' + k)) $('rc-' + k).value = rc[k] || '';
    const past = store.list('recaps').filter(r => r.id !== fid && (r.won || r.miss || r.next));
    $('rc-past').innerHTML = past.length ? '<b style="font-size:14px">Past recaps</b>' + past.map(r => `<details class="why" style="padding:10px 12px"><summary>${esc(fmtName(r.id))}</summary>${r.won ? `<p><b>Won:</b> ${esc(r.won)}</p>` : ''}${r.miss ? `<p><b>Misjudged:</b> ${esc(r.miss)}</p>` : ''}${r.next ? `<p><b>Next time:</b> ${esc(r.next)}</p>` : ''}</details>`).join('') : '';
  }

  // ---------- notebook ----------
  function renderNotebook() {
    teamOptions($('nb-team'), 'Any team');
    const tname = Object.fromEntries(teams().map(t => [t.id, t.name]));
    const fid = curFormatId(); const showAll = $('nb-filter').value === 'all';
    const items = store.list('matchups').filter(m => showAll || !m.fmt || m.fmt === fid).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const g = games();
    $('nb-list').innerHTML = items.length ? items.map(m => {
      const r = recordVs(m.name, g.filter(x => !m.fmt || x.fmt === m.fmt));
      return `<div class="nb-card"><div class="h"><h4>${esc(m.name)}</h4><span>${r.n ? `<span class="pill ${r.w * 2 >= r.n ? 'w' : 'l'}">${r.w}–${r.n - r.w}</span>` : '<span class="pill m">no games yet</span>'}</span></div>
        <span class="sub">${esc(m.fmt ? fmtName(m.fmt) : 'Any format')}${m.team && tname[m.team] ? ' · with ' + esc(tname[m.team]) : ''}</span>
        <dl>${m.plan ? `<dt>Plan</dt><dd>${esc(m.plan)}</dd>` : ''}${m.lead ? `<dt>Lead</dt><dd>${esc(m.lead)}</dd>` : ''}${m.bring ? `<dt>Bring</dt><dd>${esc(m.bring)}</dd>` : ''}${m.calcs ? `<dt>Calcs</dt><dd>${esc(m.calcs)}</dd>` : ''}</dl>
        <div class="row" style="justify-content:flex-end"><button class="linkbtn" data-editnb="${esc(m.id)}">Edit</button><button class="linkbtn" data-delnb="${esc(m.id)}">Delete</button></div></div>`;
    }).join('') : '<div class="empty">No matchups yet. Start with the top of "Toughest Pokémon" in Review, or the archetype you dread seeing at team preview.</div>';
  }

  // ---------- roadmap ----------
  function renderRoadmap() {
    const ms = (store.get('meta', 'milestones') || {}).done || {};
    const total = games().length; const fmts = new Set(games().map(g => g.fmt).filter(Boolean)).size;
    const typeAcc = VL.study.accuracy('typemon');
    const auto = { m100: total >= 100, mfmt3: fmts >= 3, mtypes: typeAcc !== null && typeAcc >= 95 && ((VL.store.get('drills', 'typemon') || {}).h || []).length >= 50, ...(VL.plan ? Object.fromEntries(Object.entries(VL.plan.autoMilestones()).filter(([, v]) => v)) : {}) };
    const isDone = (id) => !!(ms[id] || auto[id]);
    let curStage = VL.STAGES.findIndex(s => !s.ms.every(isDone)); if (curStage < 0) curStage = VL.STAGES.length - 1;
    $('stages').innerHTML = VL.STAGES.map((s, i) => `<div class="stage ${i === curStage ? 'cur' : ''}"><span class="sn">${i + 1}</span><div><h4>${esc(s.n)} ${i < curStage ? '<span class="pill w">done</span>' : i === curStage ? '<span class="pill n">you are here</span>' : ''}</h4><p>${esc(s.d)}</p></div></div>`).join('');
    const extra = { m100: ` <span class="meta">${Math.min(total, 100)}/100</span>`, mfmt3: ` <span class="meta">${Math.min(fmts, 3)}/3</span>`, mtypes: typeAcc !== null ? ` <span class="meta">${typeAcc}%</span>` : '' };
    $('milestones').innerHTML = VL.MILESTONES.map(([id, label]) => `<li class="${isDone(id) ? 'done' : ''}"><input type="checkbox" id="ms-${id}" data-ms="${id}" ${isDone(id) ? 'checked' : ''} ${auto[id] ? 'disabled' : ''}><label for="ms-${id}" style="color:inherit;font-size:inherit;font-weight:inherit"><span class="t">${esc(label)}${extra[id] || ''}</span></label></li>`).join('');
    const today = dayKey(); let nextShown = false;
    $('timeline').innerHTML = VL.EVENTS.map(([d, name, note]) => {
      const past = d < today; let chip = '';
      if (!past && !nextShown) { chip = '<span class="pill n">next</span>'; nextShown = true; } else if (past) chip = '<span class="pill m">done</span>';
      const dt = new Date(d + 'T12:00:00'); const days = Math.round((dt - new Date()) / 864e5);
      return `<div class="ev ${past ? 'past' : ''}"><span class="date">${dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span><span><span class="name">${esc(name)}</span>${note ? `<br><span class="sub">${esc(note)}</span>` : ''}</span><span>${chip}${!past ? ` <span class="sub mono">${days}d</span>` : ''}</span></div>`;
    }).join('');
  }

  // ---------- teams ----------
  function renderTeams() {
    const g = games();
    $('tm-list').innerHTML = teams().length ? teams().map(t => {
      const gs = g.filter(x => x.team === t.id); const w = gs.filter(x => x.result === 'W').length;
      return `<div class="card"><div class="card-head"><h4>${esc(t.name)}</h4>${gs.length ? `<span class="pill ${w * 2 >= gs.length ? 'w' : 'l'}">${w}–${gs.length - w} · ${pct(w, gs.length)}%</span>` : '<span class="pill m">no games yet</span>'}</div>
        ${t.src ? `<span class="sub">${esc(t.src)}</span>` : ''}${t.paste ? `<pre class="paste">${esc(t.paste)}</pre>` : ''}
        ${t.why ? `<div><b style="font-size:13px">Why it works</b><div class="sub" style="white-space:pre-wrap">${esc(t.why)}</div></div>` : ''}
        ${t.weak ? `<div><b style="font-size:13px">Struggles with</b><div class="sub" style="white-space:pre-wrap">${esc(t.weak)}</div></div>` : ''}
        <div class="row" style="justify-content:flex-end"><button class="linkbtn" data-copyteam="${esc(t.id)}">Copy paste</button><button class="linkbtn" data-editteam="${esc(t.id)}">Edit</button><button class="linkbtn" data-delteam="${esc(t.id)}">Delete</button></div></div>`;
    }).join('') : '<div class="empty">No teams saved yet.</div>';
  }

  // ---------- settings ----------
  VL.onSync = function (status, message) {
    for (const id of ['syncdot', 'syncdot2']) { const el = $(id); el.className = 'syncdot ' + (status === 'ok' ? 'ok' : status === 'err' ? 'err' : status === 'busy' ? 'busy' : ''); el.textContent = message || (status === 'off' ? 'Not synced' : ''); }
    $('sy-status').textContent = status === 'err' ? message : '';
  };
  function renderSettings() {
    const has = !!VL.sync.token();
    $('sy-token').placeholder = has ? 'Token saved on this device' : 'github_pat_...';
    $('sy-forget').hidden = !has; $('sy-now').hidden = !has;
    if (D.dex) {
      const d = D.dex; const when = new Date(d.generated);
      $('data-info').innerHTML = `${d.species.length.toLocaleString()} Pokémon, ${d.formats.length} formats, ${Object.keys(d.items).length} items and ${Object.keys(d.abilities).length} abilities, from <a href="${esc(d.source.url)}" target="_blank" rel="noopener">${esc(d.source.name)}</a>${d.source.commit ? ` (${esc(d.source.commit)})` : ''}. Last updated ${when.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}. The data refreshes automatically every week, so new games, Pokémon and items appear on their own.`;
    }
  }

  // ---------- render all ----------
  let queued = false;
  function renderAll() {
    if (queued) return; queued = true;
    requestAnimationFrame(() => {
      queued = false;
      const inside = (id) => { const el = $(id); return el && el.contains(document.activeElement) && document.activeElement !== document.body; };
      renderHeader(); renderToday(); renderLog(); renderReview(); renderSkills(); renderFormats(); renderNotebook(); renderRoadmap(); renderTeams(); renderSettings();
      VL.study.render();
      if (VL.teamcheck) VL.teamcheck.render();
      if (VL.plan && !inside('op-list')) VL.plan.render();
      if (VL.companion && location.hash === '#companion' && !inside('cp-live')) VL.companion.render();
      if (VL.meta.render && location.hash === '#meta' && !inside('mt-detail')) VL.meta.render();
    });
  }
  store.onChange(renderAll);

  // ---------- routing ----------
  const TABS = ['today', 'log', 'companion', 'review', 'study', 'meta', 'calc', 'predict', 'skills', 'formats', 'notebook', 'teamcheck', 'teams', 'tournaments', 'opponents', 'roadmap', 'settings'];
  function route() {
    const h = location.hash.replace('#', ''); const tab = TABS.includes(h) ? h : 'today';
    const was = document.querySelector('.panel.on');
    for (const t of TABS) $('p-' + t).classList.toggle('on', t === tab);
    document.querySelectorAll('.nav a, .side-foot a, .bottombar a, .sheet a').forEach(a => { if (a.getAttribute('href') === '#' + tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    VL.closeSheet();
    if (was && was.id !== 'p-' + tab) window.scrollTo(0, 0);
    if (tab === 'calc' && VL.calc) VL.calc.render();
    if (tab === 'companion' && VL.companion) VL.companion.render();
    if (tab === 'meta' && VL.meta.render) VL.meta.render();
    document.title = (tab === 'today' ? '' : $('p-' + tab).querySelector('.page-head h1').textContent + ' · ') + 'Toxicroak VGC Lab';
  }
  // phone "More" sheet
  VL.closeSheet = function () { $('sheet').hidden = true; $('sheet-back').hidden = true; $('more-btn').setAttribute('aria-expanded', 'false'); };
  $('more-btn').onclick = () => { const open = $('sheet').hidden; $('sheet').hidden = !open; $('sheet-back').hidden = !open; $('more-btn').setAttribute('aria-expanded', String(open)); };
  $('sheet-back').onclick = VL.closeSheet;
  // theme (saved per device)
  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('vgclab-theme', t); } catch (e) { /* ignore */ }
    document.querySelectorAll('[data-theme-set]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.themeSet === t)));
    const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#08090A';
  }
  document.querySelectorAll('[data-theme-set]').forEach(b => b.onclick = () => applyTheme(b.dataset.themeSet));
  applyTheme(document.documentElement.dataset.theme || 'dark');
  // N = log a game (when not typing)
  document.addEventListener('keydown', e => {
    if (e.key.toLowerCase() !== 'n' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || !$('tour').hidden) return;
    e.preventDefault(); location.hash = 'log'; setTimeout(() => $('lf-w').focus(), 50);
  });
  window.addEventListener('hashchange', route);

  // ---------- events ----------
  $('focus-edit').onclick = () => { $('focus-form').hidden = !$('focus-form').hidden; if (!$('focus-form').hidden) $('focus-input').focus(); };
  $('focus-save').onclick = () => { putProfile({ focus: $('focus-input').value.trim() }); $('focus-form').hidden = true; VL.toast('Focus saved'); };
  $('focus-input').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('focus-save').click(); } });
  $('fmt-edit').onclick = () => { $('fmt-form').hidden = !$('fmt-form').hidden; };
  $('fmt-save').onclick = () => {
    const v = $('fmt-select').value; const peak = parseInt($('fmt-peak').value, 10);
    const patch = { goal: $('fmt-goal').value.trim(), peak: Number.isFinite(peak) ? peak : null };
    if (v === 'custom') {
      const name = $('fmt-custom') ? $('fmt-custom').value.trim() : '';
      if (!name) { VL.toast('Type the format name first'); return; }
      Object.assign(patch, { format: 'custom', customFormat: name });
    } else Object.assign(patch, { format: v });
    putProfile(patch); $('fmt-form').hidden = true; fillDatalist(); VL.study.fill(v === 'custom' ? '' : v); VL.toast('Saved');
  };
  $('fmt-select').addEventListener('change', () => {
    let box = $('fmt-custom-wrap');
    if ($('fmt-select').value === 'custom') {
      if (!box) { box = document.createElement('label'); box.id = 'fmt-custom-wrap'; box.htmlFor = 'fmt-custom'; box.innerHTML = 'Format name<input type="text" id="fmt-custom" placeholder="For example: Generation 10 VGC Regulation A">'; $('fmt-select').parentElement.after(box); }
      box.hidden = false; $('fmt-custom').value = profile().customFormat || ''; $('fmt-custom').focus();
    } else if (box) box.hidden = true;
  });
  $('checklist').addEventListener('change', e => {
    const id = e.target.dataset.ck; if (!id) return;
    const key = dayKey(); const day = store.get('days', key) || { done: {} };
    store.put('days', key, { done: { ...(day.done || {}), [id]: e.target.checked } });
  });

  let lfResult = null;
  function setResult(r) { lfResult = r; $('lf-w').setAttribute('aria-pressed', r === 'W'); $('lf-l').setAttribute('aria-pressed', r === 'L'); }
  $('lf-w').onclick = () => setResult('W'); $('lf-l').onclick = () => setResult('L');
  $('lf-tags').innerHTML = VL.TAGS.map(([id, l]) => `<button type="button" class="chip" data-tag="${id}" aria-pressed="false">${esc(l)}</button>`).join('');
  $('lf-tags').addEventListener('click', e => { const b = e.target.closest('[data-tag]'); if (b) b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'); });
  $('log-form').addEventListener('submit', e => {
    e.preventDefault();
    if (!lfResult) { $('lf-msg').textContent = 'Pick WIN or LOSS first.'; return; }
    const rating = parseInt($('lf-rating').value, 10), turn = parseInt($('lf-turn').value, 10); const fid = curFormatId();
    store.put('games', VL.newId('g'), {
      ts: Date.now(), day: dayKey(), fmt: fid, fmtName: fmtName(fid), result: lfResult,
      type: $('lf-type').value, rating: Number.isFinite(rating) ? rating : null, team: $('lf-team').value || null,
      arch: $('lf-arch').value || null, opp: splitMons($('lf-opp').value).slice(0, 6),
      mylead: splitMons($('lf-mylead').value).join(', '), myback: splitMons($('lf-myback').value).join(', '),
      opplead: splitMons($('lf-opplead').value).join(', '), turn: Number.isFinite(turn) ? turn : null,
      tags: [...document.querySelectorAll('#lf-tags [aria-pressed=true]')].map(b => b.dataset.tag), note: $('lf-note').value.trim(),
      oppName: $('lf-oppname').value.trim() || null, source: pendingSource || null,
    });
    if ($('lf-oppname').value.trim() && VL.plan) VL.plan.ensureOpponent($('lf-oppname').value.trim());
    pendingSource = null;
    const res = lfResult; setResult(null);
    for (const f of ['lf-opp', 'lf-mylead', 'lf-myback', 'lf-opplead', 'lf-turn', 'lf-note', 'lf-arch', 'lf-oppname']) $(f).value = '';
    document.querySelectorAll('#lf-tags [aria-pressed=true]').forEach(b => b.setAttribute('aria-pressed', 'false'));
    $('lf-msg').textContent = 'Saved. Next game.';
    VL.markDone('log');
    VL.toast(res === 'W' ? 'Win logged' : 'Loss logged');
  });
  VL.armDelete = armDelete;
  function armDelete(btn, run) {
    if (btn.dataset.armed) { run(); return; }
    btn.dataset.armed = '1'; const old = btn.textContent; btn.textContent = 'Confirm';
    setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = old; } }, 3000);
  }
  // ---------- fill the log form from the battle companion or a replay ----------
  let pendingSource = null;
  VL.prefillLog = function (o) {
    location.hash = 'log';
    setResult(o.result || null);
    if (o.opp) $('lf-opp').value = o.opp.join(', ');
    if (o.opplead) $('lf-opplead').value = o.opplead.join(', ');
    if (o.mylead) $('lf-mylead').value = o.mylead.join(', ');
    if (o.myback) $('lf-myback').value = o.myback.join(', ');
    if (o.oppName) $('lf-oppname').value = o.oppName;
    if (o.team) $('lf-team').value = o.team;
    if (o.note) $('lf-note').value = o.note;
    if (o.rating) $('lf-rating').value = o.rating;
    pendingSource = o.source || null;
    $('lf-msg').textContent = 'Filled in for you. Add your tags and what you\'d do differently, then save.';
    setTimeout(() => { window.scrollTo(0, 0); }, 30);
  };
  function parseReplay(log, me) {
    const lines = String(log || '').split('\n');
    const players = {}, team = { p1: [], p2: [] }, leads = { p1: [], p2: [] }, seen = { p1: [], p2: [] };
    let turn = 0, winner = '', format = '';
    const sp = (s) => String(s || '').split(',')[0].trim().replace(/-\*$/, '');
    for (const l of lines) {
      const f = l.split('|');
      if (f[1] === 'player' && f[3]) players[f[2]] = f[3];
      else if (f[1] === 'poke') team[f[2]] && team[f[2]].push(sp(f[3]));
      else if (f[1] === 'turn') turn = +f[2];
      else if (f[1] === 'win') winner = f[2];
      else if (f[1] === 'gametype' || f[1] === 'tier') { if (f[1] === 'tier') format = f[2]; }
      else if (f[1] === 'switch' || f[1] === 'drag') {
        const side = (f[2] || '').slice(0, 2); const name = sp(f[3]).replace(/-Mega(-[XYZ])?$/, '');
        if (!seen[side]) continue;
        if (!seen[side].includes(name)) seen[side].push(name);
        if (turn === 0 && !leads[side].includes(name)) leads[side].push(name);
      }
    }
    const meName = String(me || '').trim().toLowerCase();
    let mine = Object.keys(players).find(k => players[k].toLowerCase() === meName);
    if (!mine) return { error: Object.keys(players).length ? `Couldn't tell which player you were. The players were ${Object.values(players).join(' and ')}. Type your username exactly.` : 'That doesn\'t look like a Showdown battle log.' };
    const opp = mine === 'p1' ? 'p2' : 'p1';
    return { result: winner ? (winner.toLowerCase() === meName ? 'W' : 'L') : null, opp: team[opp].length ? team[opp] : seen[opp], opplead: leads[opp], mylead: leads[mine], myback: seen[mine].filter(n => !leads[mine].includes(n)), oppName: players[opp], turns: turn, format };
  }
  function importReplay(log, url) {
    const me = $('rp-me').value.trim(); try { localStorage.setItem('vgclab-sdname', me); } catch (e) { /* ignore */ }
    const r = parseReplay(log, me);
    if (r.error) { $('rp-msg').textContent = r.error; return; }
    VL.prefillLog({ ...r, note: `Imported from ${url || 'a pasted Showdown log'}. Lasted ${r.turns} turns.`, source: url || 'showdown-log' });
    $('rp-msg').textContent = 'Imported. Check the form above.';
  }
  try { $('rp-me').value = localStorage.getItem('vgclab-sdname') || ''; } catch (e) { /* ignore */ }
  $('rp-go').onclick = async () => {
    let url = $('rp-url').value.trim(); if (!url) { $('rp-msg').textContent = 'Paste a replay link first.'; return; }
    url = url.replace(/[?#].*$/, '').replace(/\.(json|log)$/, '');
    if (!/^https:\/\/replay\.pokemonshowdown\.com\//.test(url)) { $('rp-msg').textContent = 'That isn\'t a Showdown replay link. They start with https://replay.pokemonshowdown.com/'; return; }
    $('rp-msg').textContent = 'Loading…';
    try { const j = await (await fetch(url + '.json')).json(); importReplay(j.log, url); }
    catch (e) { $('rp-msg').textContent = 'Couldn\'t load that replay. Use the paste option below instead.'; }
  };
  $('rp-logo').onclick = () => importReplay($('rp-log').value, '');

  $('recent').addEventListener('click', e => { const id = e.target.dataset.delgame; if (id) armDelete(e.target, () => store.del('games', id)); });

  $('rv-scope').onchange = renderAll;
  $('rv-mons').addEventListener('click', e => { const n = e.target.dataset.addnb; if (!n) return; location.hash = 'notebook'; clearNb(); $('nb-name').value = n; $('nb-plan').focus(); });
  $('coach-copy').onclick = async () => {
    const text = coachPrompt();
    try { await navigator.clipboard.writeText(text); VL.toast('Prompt copied. Paste it into Claude.'); }
    catch (err) { $('coach-paste').value = text; $('coach-paste').select(); VL.toast('Couldn\'t copy. The prompt is in the box below; copy it from there.'); }
  };
  $('coach-save').onclick = () => {
    const text = $('coach-paste').value.trim(); if (!text) { VL.toast('Paste Claude\'s review first'); return; }
    const id = VL.newId('r'); store.put('reports', id, { ts: Date.now(), games: games().length, text }); $('coach-paste').value = ''; VL.toast('Review saved');
    setTimeout(() => { $('coach-past').value = id; renderAll(); }, 50);
  };
  $('coach-past').onchange = () => { const r = store.get('reports', $('coach-past').value); if (r) $('coach-out').innerHTML = md(r.text); };

  $('sk-list').addEventListener('click', e => {
    const b = e.target.closest('[data-skill]'); if (!b) return;
    const cur = (store.get('meta', 'skills') || {}).ratings || {};
    store.put('meta', 'skills', { ratings: { ...cur, [b.dataset.skill]: +b.dataset.v } });
  });
  $('playbook').addEventListener('change', e => {
    const id = e.target.dataset.pb; if (!id) return; const fid = curFormatId();
    const cur = (store.get('playbook', fid) || {}).done || {};
    store.put('playbook', fid, { done: { ...cur, [id]: e.target.checked } });
  });
  $('rc-save').onclick = () => { store.put('recaps', curFormatId(), { won: $('rc-won').value.trim(), miss: $('rc-miss').value.trim(), next: $('rc-next').value.trim() }); VL.toast('Recap saved'); };
  $('milestones').addEventListener('change', e => {
    const id = e.target.dataset.ms; if (!id) return;
    const cur = (store.get('meta', 'milestones') || {}).done || {};
    store.put('meta', 'milestones', { done: { ...cur, [id]: e.target.checked } });
  });

  let nbEditing = null;
  function clearNb() { nbEditing = null; for (const f of ['nb-name', 'nb-plan', 'nb-lead', 'nb-bring', 'nb-calcs']) $(f).value = ''; $('nb-team').value = ''; $('nb-title').textContent = 'Add a matchup'; $('nb-cancel').hidden = true; }
  $('nb-cancel').onclick = clearNb;
  $('nb-filter').onchange = renderAll;
  $('nb-form').addEventListener('submit', e => {
    e.preventDefault(); const name = $('nb-name').value.trim(); if (!name) return;
    const id = nbEditing || VL.newId('m'); const prev = store.get('matchups', id);
    store.put('matchups', id, { ts: prev?.ts || Date.now(), fmt: prev?.fmt || curFormatId(), name, team: $('nb-team').value || null, plan: $('nb-plan').value.trim(), lead: $('nb-lead').value.trim(), bring: $('nb-bring').value.trim(), calcs: $('nb-calcs').value.trim() });
    clearNb(); VL.toast('Matchup saved');
  });
  $('nb-list').addEventListener('click', e => {
    const ed = e.target.dataset.editnb, dl = e.target.dataset.delnb;
    if (ed) { const m = store.get('matchups', ed); if (!m) return; nbEditing = ed; $('nb-name').value = m.name || ''; $('nb-team').value = m.team || ''; $('nb-plan').value = m.plan || ''; $('nb-lead').value = m.lead || ''; $('nb-bring').value = m.bring || ''; $('nb-calcs').value = m.calcs || ''; $('nb-title').textContent = 'Edit matchup'; $('nb-cancel').hidden = false; $('nb-name').focus(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    if (dl) armDelete(e.target, () => store.del('matchups', dl));
  });

  let tmEditing = null;
  function clearTm() { tmEditing = null; for (const f of ['tm-name', 'tm-src', 'tm-paste', 'tm-why', 'tm-weak']) $(f).value = ''; $('tm-title').textContent = 'Add a team'; $('tm-cancel').hidden = true; }
  $('tm-cancel').onclick = clearTm;
  $('tm-form').addEventListener('submit', e => {
    e.preventDefault(); const name = $('tm-name').value.trim(); if (!name) return;
    const id = tmEditing || VL.newId('t'); const prev = store.get('teams', id);
    store.put('teams', id, { ts: prev?.ts || Date.now(), fmt: prev?.fmt || curFormatId(), name, src: $('tm-src').value.trim(), paste: $('tm-paste').value.replace(/\s+$/, ''), why: $('tm-why').value.trim(), weak: $('tm-weak').value.trim() });
    clearTm(); VL.toast('Team saved');
  });
  $('tm-list').addEventListener('click', async e => {
    const ed = e.target.dataset.editteam, dl = e.target.dataset.delteam, cp = e.target.dataset.copyteam;
    if (cp) { const t = store.get('teams', cp); try { await navigator.clipboard.writeText(t?.paste || ''); VL.toast('Paste copied'); } catch (err) { VL.toast('Couldn\'t copy. Select the text instead.'); } }
    if (ed) { const t = store.get('teams', ed); if (!t) return; tmEditing = ed; $('tm-name').value = t.name || ''; $('tm-src').value = t.src || ''; $('tm-paste').value = t.paste || ''; $('tm-why').value = t.why || ''; $('tm-weak').value = t.weak || ''; $('tm-title').textContent = 'Edit team'; $('tm-cancel').hidden = false; $('tm-name').focus(); }
    if (dl) armDelete(e.target, () => store.del('teams', dl));
  });

  $('sy-connect').onclick = () => {
    const t = $('sy-token').value.trim();
    if (!t) { VL.toast('Paste your token first'); return; }
    VL.sync.setToken(t); $('sy-token').value = ''; renderSettings(); VL.sync.run();
  };
  $('sy-now').onclick = () => VL.sync.run();
  $('sy-forget').onclick = (e) => armDelete(e.target, () => { VL.sync.setToken(''); VL.onSync('off', 'Not synced'); renderSettings(); VL.toast('This device is disconnected. Your data stays here.'); });
  $('bk-export').onclick = () => {
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `vgc-lab-backup-${dayKey()}.json`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  $('bk-import').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { store.importJSON(JSON.parse(await f.text())); VL.toast('Backup restored'); } catch (err) { VL.toast('That file isn\'t a VGC Lab backup'); }
    e.target.value = '';
  };

  // ---------- boot ----------
  route();
  store.ready.then(() => { renderAll(); if (VL.sync.token()) VL.sync.run(); else VL.onSync('off', 'Not synced'); VL.maybeTour(); });
  fetch('data/dex.json', { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(dex => {
    D.load(dex);
    store.ready.then(() => {
      const p = profile();
      if (!p.format) putProfile({ format: D.format().id });
      fillFormatSelect(); fillDatalist(); VL.study.fill(curFormatId().startsWith('custom:') ? '' : curFormatId());
      renderAll(); route();
      VL.meta.ready.then(() => { renderAll(); if (location.hash === '#meta') VL.meta.render(); });
    });
  }).catch(() => banner('Couldn\'t load the Pokémon data. The log still works; Study needs the data file. Check your connection and reload.'));
})();
