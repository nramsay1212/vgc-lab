/* VGC Lab main app: training log, review, notebook,
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
  const TAGMAP = Object.fromEntries(VL.ALLTAGS);

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
  // A team belongs to the format it was built for: pickers only offer teams for the format in use
  // (a team saved before teams had a format goes anywhere).
  VL.teamFits = (t, fid) => !!t && (!t.fmt || !fid || t.fmt === fid || String(fid).startsWith('custom:'));
  // which play style a format belongs to (used to sort older records that don't say)
  VL.styleOfFmt = (fid) => { if (!fid || !D.dex || String(fid).startsWith('custom:')) return null; const f = D.dex.formats.find(x => x.id === fid); return f ? (f.doubles ? 'doubles' : 'singles') : null; };
  // focus, season goal and best rank are kept per play style
  const sk = (k) => (VL.style && VL.style() === 'singles' ? k + 'Singles' : k);
  const pv = (p, k) => p[sk(k)];
  VL.fmtName = fmtName;

  // ---------- play style (doubles or singles) ----------
  // Each style remembers its own format, so switching back and forth keeps your choice.
  function showStyle() {
    const st = VL.style();
    document.documentElement.dataset.style = st;
    try { localStorage.setItem('vgclab-style', st); } catch (e) { /* ignore */ }
    document.querySelectorAll('[data-stylepick]').forEach(sel => { if (sel.value !== st) sel.value = st; });
  }
  VL.setStyle = async function (st, opts = {}) {
    if (st === VL.style()) return;
    const p = profile(); const was = VL.style();
    const remembered = st === 'singles' ? p.fmtSingles : p.fmtDoubles;
    const all = D.dex ? D.dex.formats : [];
    const fresh = all.find(f => f.current && !!f.doubles === (st === 'doubles')) || all.find(f => !!f.doubles === (st === 'doubles'));
    putProfile({ style: st, format: remembered || (fresh ? fresh.id : p.format), [was === 'singles' ? 'fmtSingles' : 'fmtDoubles']: p.format });
    await store.flush();
    if (opts.noReload) { showStyle(); return; }
    try { sessionStorage.setItem('vgclab-stylemsg', st); } catch (e) { /* ignore */ }
    location.reload();
  };
  document.querySelectorAll('[data-stylepick]').forEach(sel => sel.addEventListener('change', () => VL.setStyle(sel.value)));
  store.ready.then(() => {
    showStyle();
    let msg = null; try { msg = sessionStorage.getItem('vgclab-stylemsg'); sessionStorage.removeItem('vgclab-stylemsg'); } catch (e) { /* ignore */ }
    if (msg) setTimeout(() => VL.toast(msg === 'singles' ? 'Switched to singles' : 'Switched to doubles'), 300);
  });
  store.onChange(showStyle);
  const games = () => store.list('games').sort((a, b) => (b.ts || 0) - (a.ts || 0));
  // Climb (your real ladder games, the default) or Testing (trying out teams). Old games count as Climb.
  const isTest = (g) => g && g.mode === 'test';
  const climbGames = () => games().filter(g => !isTest(g));
  VL.isTestGame = isTest;
  let lfMode = (() => { try { return localStorage.getItem('vgclab-logmode') === 'test' ? 'test' : 'climb'; } catch (e) { return 'climb'; } })();
  function setLogMode(m) {
    lfMode = m === 'test' ? 'test' : 'climb'; try { localStorage.setItem('vgclab-logmode', lfMode); } catch (e) { /* private mode */ }
    document.querySelectorAll('[data-lfmode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lfmode === lfMode)));
    const h = $('lf-mode-help'); if (h) h.textContent = lfMode === 'test' ? 'Trying out a team: kept apart from your climb record, rating line and weekly review.' : 'Your real ladder climb: counts toward your record, rating line and weekly review.';
    $('log-form').classList.toggle('testing', lfMode === 'test');
  }
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
    { const cur = VL.progress ? VL.progress.current() : {}; const ov = VL.progress ? VL.progress.overallOf(Object.fromEntries(Object.entries(cur).map(([k, v]) => [k, [v.r, v.n]]))) : null; $('cd-drills').textContent = ov === null ? '–' : Math.round(ov); }
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
    $('focus-text').textContent = pv(p, 'focus') || 'No focus set yet. Pick one habit to drill in every game this week.';
    if (document.activeElement !== $('focus-input')) $('focus-input').value = pv(p, 'focus') || '';
    const g = climbGames(); const fid = curFormatId();
    const inFmt = g.filter(x => x.fmt === fid);
    const rated = inFmt.filter(x => Number.isFinite(x.rating));
    const f = D.dex && !fid.startsWith('custom:') ? D.format(fid) : null;
    $('fmt-view').innerHTML = `<div style="font-size:17px;font-weight:600">${esc(fmtName(fid))}</div>
      <div class="sub">${esc(f ? `${f.game} · ${f.doubles ? 'Doubles' : 'Singles'} · ${f.gimmick}` : 'Not in the Pokémon data yet. Logging still works.')}</div>
      <div class="grid3" style="margin-top:6px">
        <div><div class="sub">Current rating</div><div class="num" style="font-size:20px">${rated.length ? rated[0].rating : '–'}</div></div>
        <div><div class="sub">Games this format</div><div class="num" style="font-size:20px">${inFmt.length}</div></div>
        <div><div class="sub">Season goal</div><div style="font-size:16px;font-weight:600">${esc(pv(p, 'goal') || 'Not set')}</div></div>
      </div>`;
    $('fmt-goal').value = pv(p, 'goal') || ''; $('fmt-peak').value = pv(p, 'peak') ?? 2000;

    const key = dayKey(); const day = store.get('days', key) || { done: {} };
    const todayGames = g.filter(x => x.day === key); const w = todayGames.filter(x => x.result === 'W').length;
    $('today-date').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    $('today-games').textContent = todayGames.length ? `${todayGames.length} logged today · ${w}–${todayGames.length - w}` : 'No games logged today';
    // warm-up threats: what's beating the team you used last in this format (any game logged with it),
    // falling back to your climb games in this format, then to all your climb games
    const worst = (list) => monStats(list.slice(0, 60)).filter(m => m.n >= 2 && m.w < m.n).sort((a, b) => (a.w / a.n) - (b.w / b.n) || b.n - a.n).slice(0, 3).map(m => m.name);
    const lastWithTeam = inFmt.find(x => x.team);
    const warmTeam = lastWithTeam ? store.get('teams', lastWithTeam.team) : null;
    let threats = [], threatWho = 'you';
    if (warmTeam) { threats = worst(games().filter(x => x.team === warmTeam.id)); if (threats.length) threatWho = warmTeam.name || 'your team'; }
    if (!threats.length) threats = worst(inFmt);
    if (!threats.length) threats = worst(g);
    const calcLink = (n) => `<a href="#calc" data-warmcalc="${esc(n)}" data-warmteam="${esc(threatWho !== 'you' && warmTeam ? warmTeam.id : '')}">${esc(n)}</a>`;
    let weakest = null;
    for (const d of VL.study.DRILLS) { const a = VL.study.accuracy(d.id); if (a !== null && (weakest === null || a < weakest.a)) weakest = { a, n: d.name }; }
    const desc = {
      warm: threats.length ? `Run your main attacks into ${threats.map(calcLink).join(', ')}, the Pokémon beating ${threatWho === 'you' ? 'you' : esc(threatWho)} most lately, and check who outspeeds whom. Tap a name to open it in the damage calculator.` : 'Pick 3 threats you see a lot. Run your main attacks into them in a damage calc and check who outspeeds whom. After a few logged games this fills in from your losses.',
      drill: weakest ? `One round in Study or one game in Games. Your weakest drill right now is ${esc(weakest.n)} (${weakest.a}%).` : 'One round in Study or one game in Games. Speed Duel is a good start.',
    };
    $('checklist').innerHTML = VL.SESSION.map(s => {
      const on = !!(day.done && day.done[s.id]);
      return `<li class="${on ? 'done' : ''}"><input type="checkbox" id="ck-${s.id}" data-ck="${s.id}" ${on ? 'checked' : ''}>
        <label for="ck-${s.id}" style="color:inherit;font-size:inherit;font-weight:inherit"><span class="t">${esc(s.t)}<span class="meta">${esc(s.m)}</span></span><span class="d">${desc[s.id] || s.d}</span></label></li>`;
    }).join('');
    requestAnimationFrame(() => VL.fitToday && VL.fitToday()); setTimeout(() => VL.fitToday && VL.fitToday(), 400);
  }

  // ---------- log ----------
  function teamOptions(sel, first, fid) {
    const cur = sel.value;
    sel.innerHTML = `<option value="">${first}</option>` + teams().filter(t => !fid || VL.teamFits(t, fid) || t.id === cur).slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
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
    let lf = null; try { lf = pendingFmt; } catch (e) { /* not set up yet */ }
    teamOptions($('lf-team'), '(not set)', lf || curFormatId());
    $('log-fmt').textContent = 'Format: ' + fmtName(curFormatId());
    const all = games(); const show = ($('recent-mode') || {}).value || 'all';
    const g = show === 'all' ? all : all.filter(x => show === 'test' ? isTest(x) : !isTest(x));
    $('recent-count').innerHTML = `<select id="recent-mode" aria-label="Which games" style="width:auto"><option value="all">All games (${all.length})</option><option value="climb">Climb (${all.filter(x => !isTest(x)).length})</option><option value="test">Testing (${all.filter(isTest).length})</option></select>`;
    $('recent-mode').value = show;
    if (!g.length) { $('recent').innerHTML = '<div class="empty">No games yet. Log your next game above and it shows up here.</div>'; return; }
    const tname = Object.fromEntries(teams().map(t => [t.id, t.name]));
    $('recent').innerHTML = `<table class="list"><thead><tr><th></th><th>Date</th><th>Their team</th><th>Leads (mine / theirs)</th><th>Tags</th><th>Note</th><th></th></tr></thead><tbody>${
      g.slice(0, 40).map(x => `<tr>
        <td><span class="pill ${x.result === 'W' ? 'w' : 'l'}">${x.result}</span>${x.set ? `<br><span class="pill n" title="Game ${x.setGame} of a best-of-${x.setOf || 3}">G${x.setGame}/${x.setOf || 3}</span>` : ''}${isTest(x) ? '<br><span class="pill m" title="Testing game: not part of your climb">Test</span>' : ''}</td>
        <td class="mono" style="white-space:nowrap">${esc((x.day || '').slice(5))}${Number.isFinite(x.rating) ? `<br><span class="sub">${x.rating}</span>` : ''}${x.sdUser ? `<br><span class="sub" title="Showdown account">${esc(x.sdUser)}</span>` : ''}<br><span class="sub">${esc(x.fmtName || fmtName(x.fmt))}</span></td>
        <td>${(x.opp || []).length ? `<span class="sprrow" title="${esc((x.opp || []).join(', '))}">${(x.opp || []).map(n => VL.sprite(n, 'xs')).join('')}</span>` : '<span class="sub">–</span>'}${/^https:\/\/replay\.pokemonshowdown\.com\//.test(x.source || '') ? `<br><button class="linkbtn" data-review="${esc(x.source)}">Review replay</button>` : x.logz ? `<br><button class="linkbtn" data-reviewgame="${esc(x.id)}">Review game</button>` : ''}${x.arch ? `<br><span class="sub">${esc(x.arch)}</span>` : ''}${x.team && tname[x.team] ? `<br><span class="sub">with ${esc(tname[x.team])}</span>` : ''}</td>
        <td>${esc(x.mylead || '–')} / ${esc(x.opplead || '–')}</td>
        <td>${(x.tags || []).map(t => `<span class="pill m">${esc(TAGMAP[t] || t)}</span>`).join(' ')}</td>
        <td style="max-width:280px">${esc(x.note || '')}${x.turn ? ` <span class="sub">(T${x.turn})</span>` : ''}</td>
        <td style="white-space:nowrap"><button class="linkbtn" data-editgame="${esc(x.id)}">Edit</button> <button class="linkbtn" data-delgame="${esc(x.id)}">Delete</button></td></tr>`).join('')
    }</tbody></table>`;
  }

  // ---------- best-of-3 sets in Review ----------
  // Game 1 is mostly your team against theirs; games 2 and 3 are about adapting to what you saw.
  function renderSets(list) {
    const by = {}; for (const g of list) if (g.set) (by[g.set] = by[g.set] || []).push(g);
    const sets = Object.values(by).map(gs => { gs.sort((a, b) => (a.setGame || 0) - (b.setGame || 0)); const w = gs.filter(g => g.result === 'W').length, l = gs.length - w; const of = gs[0].setOf || 3; const need = Math.floor(of / 2) + 1; return { gs, w, l, won: w >= need ? true : l >= need ? false : null, t: Math.max(...gs.map(g => g.ts || 0)) }; })
      .filter(s => s.gs.length >= 2 || s.won !== null).sort((a, b) => b.t - a.t);
    $('rv-sets-card').hidden = !sets.length; if (!sets.length) return;
    const pct = (a, n) => n ? Math.round(a / n * 100) + '%' : '–';
    const done = sets.filter(s => s.won !== null); const sw = done.filter(s => s.won).length;
    const g1 = sets.map(s => s.gs.find(g => g.setGame === 1)).filter(Boolean); const g1w = g1.filter(g => g.result === 'W').length;
    const later = sets.flatMap(s => s.gs.filter(g => (g.setGame || 0) >= 2)); const lw = later.filter(g => g.result === 'W').length;
    const down = done.filter(s => (s.gs.find(g => g.setGame === 1) || {}).result === 'L'); const back = down.filter(s => s.won).length;
    // did changing the plan between games help? the game after each plan
    const after = (same) => sets.flatMap(s => s.gs.filter((g, i) => i > 0 && s.gs[i - 1].planSame === same));
    const ch = after(false), sm = after(true);
    const tile = (v, l, sub) => `<div class="tile"><div class="k">${esc(l)}</div><div class="v">${v}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>`;
    const tiles = [
      tile(done.length ? `${sw}–${done.length - sw}` : '–', 'Sets won–lost', `${sets.length - done.length ? sets.length - done.length + ' unfinished' : ''}`),
      tile(pct(g1w, g1.length), 'Game 1 win rate', `${g1.length} game${g1.length === 1 ? '' : 's'}`),
      tile(pct(lw, later.length), 'Games 2 and 3', `${later.length} game${later.length === 1 ? '' : 's'}`),
      tile(down.length ? `${back} of ${down.length}` : '–', 'Comebacks after losing game 1', ''),
    ].join('');
    const adapt = ch.length + sm.length >= 2 ? `<p class="sub">After you <b>changed</b> your plan you won ${pct(ch.filter(g => g.result === 'W').length, ch.length)} of the next games (${ch.length}); after keeping the <b>same</b> plan, ${pct(sm.filter(g => g.result === 'W').length, sm.length)} (${sm.length}).</p>`
      : '<p class="sub">Write a plan for the next game between games (on Showdown, or in the Log form) and this shows whether changing it helps.</p>';
    const read = later.length >= 4 && g1.length >= 4 ? (lw / later.length < g1w / g1.length - 0.1 ? '<p class="sub">You win game 1 more often than the games after it, so opponents adapt to you better than you adapt to them. Before each game 2, write down what they led and what they kept in the back, and change one thing.</p>' : lw / later.length > g1w / g1.length + 0.1 ? '<p class="sub">You do better once you\'ve seen their team. That\'s the adapting skill best-of-3 tests.</p>' : '') : '';
    const rows = sets.slice(0, 6).map(s => {
      const who = s.gs.find(g => g.oppName); const res = s.won === null ? `<span class="pill n">${s.w}–${s.l}</span>` : `<span class="pill ${s.won ? 'w' : 'l'}">${s.won ? 'Won' : 'Lost'} ${s.w}–${s.l}</span>`;
      return `<tr><td>${res}</td><td class="mono">${esc((s.gs[0].day || '').slice(5))}</td><td>${who ? esc(who.oppName) : '<span class="sub">–</span>'}</td><td>${s.gs.map(g => `<span class="pill ${g.result === 'W' ? 'w' : 'l'}" title="Game ${g.setGame}${g.plan ? ': plan after it: ' + esc(g.plan) : ''}">${g.result}</span>`).join(' ')}</td><td class="sub">${esc(s.gs[0].type || '')}</td></tr>`;
    }).join('');
    $('rv-sets').innerHTML = `<div class="tiles">${tiles}</div>${adapt}${read}<table class="list"><thead><tr><th>Set</th><th>Date</th><th>Opponent</th><th>Games</th><th>Where</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  // ---------- review ----------
  function fillScope() {
    const sel = $('rv-scope'); const cur = sel.value || 'cur';
    const fmts = [...new Set(games().map(g => g.fmt).filter(Boolean))];
    sel.innerHTML = `<option value="cur">Current format</option><option value="all">All games</option><option value="30">Last 30 days</option>` + fmts.filter(f => f !== curFormatId()).map(f => `<option value="f:${esc(f)}">${esc(fmtName(f))}</option>`).join('');
    sel.value = [...sel.options].some(o => o.value === cur) ? cur : 'cur';
  }
  // Review → Team: all teams, or just the games logged with one of them
  function fillTeamPick() {
    const sel = $('rv-team'); if (!sel) return; let cur = sel.value; if (!sel.dataset.init) { sel.dataset.init = '1'; try { cur = localStorage.getItem('vgclab-rvteam') || 'all'; } catch (e) { cur = 'all'; } }
    const used = new Set(games().map(g => g.team).filter(Boolean));
    const ts = teams().filter(t => used.has(t.id) || t.id === cur).sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const latest = games().find(g => g.team && ts.some(t => t.id === g.team));
    sel.innerHTML = '<option value="all">All teams</option>' + ts.map(t => `<option value="${esc(t.id)}">${esc(t.name || 'Saved team')}${latest && latest.team === t.id ? ' (current)' : ''}</option>`).join('');
    sel.value = [...sel.options].some(o => o.value === cur) ? cur : 'all';
  }
  const teamOk = (x) => { const t = ($('rv-team') || {}).value || 'all'; return t === 'all' || x.team === t; };
  function scoped() {
    const s = $('rv-scope').value; const m = ($('rv-mode') || {}).value || 'climb';
    const g = games().filter(x => (m === 'all' || (m === 'test' ? isTest(x) : !isTest(x))) && teamOk(x));
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
    // drawn at the box's real width, so the labels stay the same size on a wide screen
    const W = Math.max(600, Math.min(2600, ($('rv-chart') && $('rv-chart').clientWidth) || ((document.querySelector('.wrap') || {}).clientWidth || 990) - 90)), H = 200, pl = 44, pr = 14, pt = 12, pb = 24;
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
  // ---------- sessions and tilt ----------
  // Games more than 45 minutes apart start a new session. Each game is sorted by where it fell in its
  // session, what happened just before it, and the time of day, so slumps show up as numbers.
  function tiltHtml(list) {
    const gs = list.filter(x => x.ts && (x.result === 'W' || x.result === 'L')).sort((a, b) => a.ts - b.ts);
    if (gs.length < 15) return `<p class="sub">Shows up once you have 15 games here (${gs.length} so far). Games the Showdown extension sends count automatically, with their real times.</p>`;
    const GAP = 45 * 60 * 1000; const rows = []; let sess = 0, k = 0, prev = null, lossRun = 0; const sizes = [];
    for (const g of gs) {
      if (!prev || g.ts - prev.ts > GAP) { sess++; k = 0; lossRun = 0; sizes.push(0); }
      k++; sizes[sizes.length - 1]++;
      rows.push({ g, sess, k, after: k === 1 ? null : prev.result, lossRun });
      lossRun = g.result === 'L' ? lossRun + 1 : 0; prev = g;
    }
    const wr = (xs) => ({ n: xs.length, v: pct(xs.filter(r => r.g.result === 'W').length, xs.length) });
    const all = wr(rows);
    const hour = (r) => new Date(r.g.ts).getHours();
    const groups = [
      ['In a session', [['Games 1 to 3', rows.filter(r => r.k <= 3)], ['Games 4 to 6', rows.filter(r => r.k >= 4 && r.k <= 6)], ['Game 7 and later', rows.filter(r => r.k >= 7)]]],
      ['What came just before', [['First game of a session', rows.filter(r => r.after === null)], ['After a win', rows.filter(r => r.after === 'W')], ['After a loss', rows.filter(r => r.after === 'L')], ['After 2 or more losses in a row', rows.filter(r => r.lossRun >= 2)]]],
      ['Time of day', [['Morning (5 to noon)', rows.filter(r => hour(r) >= 5 && hour(r) < 12)], ['Afternoon (noon to 5)', rows.filter(r => hour(r) >= 12 && hour(r) < 17)], ['Evening (5 to 10)', rows.filter(r => hour(r) >= 17 && hour(r) < 22)], ['Late night (10 to 5)', rows.filter(r => hour(r) >= 22 || hour(r) < 5)]]],
    ];
    // the clearest slump: at least 6 games and 10 points under your overall win rate
    const cands = groups.flatMap(([, gg]) => gg).map(([label, xs]) => ({ label, ...wr(xs) })).filter(c => c.n >= 6 && c.v <= all.v - 10).sort((a, b) => a.v - b.v);
    const tip = { 'Game 7 and later': 'Long sessions are costing you. Try stopping after 6 games.', 'Games 4 to 6': 'You fade after the first few games. Try shorter sessions with a break.', 'After a loss': 'Losses carry over into the next game. Take a minute between games after a loss.', 'After 2 or more losses in a row': 'Two losses in a row is your cue to stop for a while.', 'Late night (10 to 5)': 'Late-night games go worse. Play earlier when you can.', 'Morning (5 to noon)': 'Mornings are your weakest time.', 'Afternoon (noon to 5)': 'Afternoons are your weakest time.', 'Evening (5 to 10)': 'Evenings are your weakest time.', 'First game of a session': 'Your first game is the weakest. Warm up first (Today\'s session has a warm-up).', 'Games 1 to 3': 'You start sessions slowly. Warm up before queuing.' };
    const worst = cands[0];
    const head = worst ? `<div class="tilt-tip"><b>${esc(worst.label)}: ${worst.v}% wins</b> over ${worst.n} games, against ${all.v}% overall. ${esc(tip[worst.label] || '')}</div>`
      : `<p class="sub">No slump stands out: nothing is 10 or more points under your ${all.v}% overall. Keep it up.</p>`;
    const line = ([label, xs]) => { const r = wr(xs); return r.n ? `<div class="bar"><span>${esc(label)}</span><span class="track"><span class="fill ${r.v < all.v - 9 && r.n >= 6 ? 'bad' : 'acc'}" style="display:block;width:${r.v}%"></span></span><span class="n">${r.v}% <span class="mini">(${r.n})</span></span></div>` : `<div class="bar"><span>${esc(label)}</span><span class="sub">No games</span></div>`; };
    return `${head}<div class="grid2 tilt-grid">${groups.map(([title, gg]) => `<div><div class="section-label">${esc(title)}</div><div class="bars">${gg.map(line).join('')}</div></div>`).join('')}
      <div><div class="section-label">Your sessions</div><p class="sub">${sizes.length} sessions, ${Math.round(10 * gs.length / sizes.length) / 10} games each on average, longest ${Math.max(...sizes)}. A new session starts after a 45-minute break.</p></div></div>`;
  }
  function renderReview() {
    fillTeamPick(); fillScope();
    const list = scoped();
    const n = list.length, w = list.filter(x => x.result === 'W').length;
    const last20 = list.slice(0, 20), w20 = last20.filter(x => x.result === 'W').length;
    const losses = list.filter(x => x.result === 'L'); const tagged = losses.filter(x => (x.tags || []).length).length;
    $('rv-tiles').innerHTML = [['Games', n], ['Win rate', n ? pct(w, n) + '%' : '–'], ['Last 20', last20.length ? pct(w20, last20.length) + '%' : '–'], ['Losses tagged', losses.length ? pct(tagged, losses.length) + '%' : '–']]
      .map(([k, v]) => `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
    $('rv-chart').innerHTML = ratingChart(list);
    $('rv-tilt').innerHTML = tiltHtml(list);
    const tc = {}; for (const g of losses) for (const t of (g.tags || [])) tc[t] = (tc[t] || 0) + 1;
    const tagRows = Object.entries(tc).sort((a, b) => b[1] - a[1]).map(([t, v]) => ({ label: esc(TAGMAP[t] || t), v }));
    $('rv-tags').innerHTML = tagRows.length ? barList(tagRows, { fmt: r => `${r.v} · ${pct(r.v, losses.length)}%` }) + `<p class="sub">Percent of ${losses.length} losses. Bad luck is included so you can see how often it really decides games.</p>`
      : '<div class="empty">Tag your losses when you log them. The biggest bar here is usually your next weekly focus.</div>';
    const mons = monStats(list).filter(m => m.n >= 3).sort((a, b) => (a.w / a.n) - (b.w / b.n) || b.n - a.n).slice(0, 8);
    $('rv-mons').innerHTML = mons.length ? `<div class="bars">${mons.map(m => ` <div class="bar"><span>${VL.sprite(m.name, 'xs', false)} ${esc(m.name)} <button class="linkbtn" style="text-decoration:none;color:var(--accent)" data-addnb="${esc(m.name)}">+ notebook</button></span><span class="track"><span class="fill acc" style="display:block;width:${pct(m.w, m.n)}%"></span></span><span class="n">${pct(m.w, m.n)}% · ${m.n}</span></div>`).join('')}</div><p class="sub">Your win rate in games where they brought it to team preview, and how many games.</p>`
      : '<div class="empty">Fill in "Their 6" when you log. After a dozen games this shows which Pokémon you lose to most.</div>';
    const arch = {}; for (const g of list) { if (!g.arch) continue; (arch[g.arch] ||= { n: 0, w: 0 }); arch[g.arch].n++; if (g.result === 'W') arch[g.arch].w++; }
    const ar = wrRows(Object.entries(arch));
    $('rv-arch').innerHTML = ar.length ? barList(ar, { acc: true, fmt: r => `${r.v}% · ${r.n}` }) : '<div class="empty">Set "Their style" when you log to see which archetypes you struggle with.</div>';
    const leads = {}; for (const g of list) { if (!g.mylead) continue; const k = splitMons(g.mylead).sort().join(' + '); if (!k) continue; (leads[k] ||= { n: 0, w: 0 }); leads[k].n++; if (g.result === 'W') leads[k].w++; }
    const lr = wrRows(Object.entries(leads).filter(([, v]) => v.n >= 3));
    $('rv-leads').innerHTML = lr.length ? barList(lr, { acc: true, fmt: r => `${r.v}% · ${r.n}` }) : '<div class="empty">Log your lead to see which openings win for you.</div>';
    renderSets(list);
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
    const m = ($('rv-mode') || {}).value || 'climb';
    const pool = games().filter(x => (m === 'all' || (m === 'test' ? isTest(x) : !isTest(x))) && teamOk(x));
    const list = pool.filter(g => g.fmt === fid).slice(0, 50);
    const rvT = ($('rv-team') || {}).value || 'all'; const rvTeam = rvT !== 'all' ? (teams().find(t => t.id === rvT) || null) : null;
    const all = list.length ? list : pool.slice(0, 50);
    const tname = Object.fromEntries(teams().map(t => [t.id, t.name]));
    const rows = all.map(g => [g.day, g.result, isTest(g) ? `${g.type || ''} (test)` : g.type, g.rating ?? '', g.team ? tname[g.team] || '' : '', g.arch || '', (g.opp || []).join('/'), g.mylead || '', g.opplead || '', (g.tags || []).map(t => TAGMAP[t] || t).join('; '), g.turn ? 'T' + g.turn : '', (g.note || '').replace(/\s+/g, ' ').slice(0, 220)].join(' | ')).join('\n');
    const nb = store.list('matchups').filter(m => !m.fmt || m.fmt === fid).map(m => `- ${m.name}: ${(m.plan || '').replace(/\s+/g, ' ').slice(0, 160)}`).join('\n') || '(empty)';
    // knowledge ratings from Progress (Games and the Test), with the title for each
    const know = VL.progress ? VL.progress.AREAS.map(a => { const r = VL.progress.ratingOf(a.id); return `${a.n}: ${r === null ? 'not rated yet' : `${r} (${VL.progress.rankOf(r)})`}`; }).join('; ') : '';
    const drills = VL.study.DRILLS.map(d => { const a = VL.study.accuracy(d.id); return a === null ? null : `${d.name} ${a}%`; }).filter(Boolean).join(', ') || 'none yet';
    const prev = store.list('reports').sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
    const f = D.dex && !fid.startsWith('custom:') ? D.format(fid) : null;
    return `You are an experienced Pokémon VGC coach. Review my recent game logs and give me a weekly review.

Context:
- Format: ${fmtName(fid)}${f ? ` (${f.game}, ${f.doubles ? 'doubles' : 'singles'}, gimmick: ${f.gimmick})` : ''}.
- Me: reached high Master Ball and peaked around rank ${pv(p, 'peak') ?? 2000} on Scarlet/Violet ladder. Long-term goal: win a World Championship someday, in whatever game is current. I want skills that carry across formats, not just this one. I mostly play proven teams from top players and sometimes experiment with my own changes; those experiments are logged separately as testing games.
- This week's focus: ${pv(p, 'focus') || '(none set)'}
- Season goal: ${pv(p, 'goal') || '(none set)'}
- My knowledge ratings (from quick games and tests, 1000 is the start, 1400 is Expert): ${know || 'none yet'}
- Recent drill accuracy: ${drills}

${rvTeam ? `Only games with my team "${rvTeam.name || 'Saved team'}" are included, so judge this team and how I play it.\n\nThe team:\n${rvTeam.paste || ''}\n\n` : ''}${m === 'climb' ? 'These are my climb games (my real ladder run). Team-testing games are left out.' : m === 'test' ? 'These are only my team-testing games, where I try out teams. Judge the teams and my piloting, not my ladder progress.' : 'This includes both my climb games and my team-testing games (marked "test" in the type column).'}
Game log, newest first. Columns: date | result | type | rating after | my team | their style | their 6 | my lead | their lead | mistake tags | key turn | note
${rows || '(no games logged)'}

Matchup notebook:
${nb}
${prev ? `\nLast review said (excerpt): ${prev.text.slice(0, 600).replace(/\s+/g, ' ')}` : ''}

Write the review in this order, with short markdown headings and bullets:
1. **Next week's focus**: one specific habit, plus one concrete drill to practice it.
2. **Patterns**: the 3 most important patterns in the data. Cite counts from the log (for example "5 of 9 losses tagged Gimmick timing"). Separate decision errors from bad luck and team matchup problems.
3. **Knowledge check**: where my knowledge ratings don't match the mistakes in the log (for example a high Speed rating but many speed-related mistakes), and which area to drill.
4. **Matchups to write up**: up to 3 Pokémon or archetypes to add to the notebook, each with a one-line starting plan.
5. **Last focus**: one or two lines on whether the logs show progress on this week's focus.

Rules: be direct and specific. Only state numbers you can count in the log. Don't invent damage calcs or usage stats. If there are fewer than 10 games or most fields are empty, say what to log more carefully and keep it short. Under 450 words.`;
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
  // where to go to work on each milestone
  const MS_GO = {
    m100: ['log', 'Log a game'], mfmt3: ['log', 'Log a game'], mtypes: ['drill:typemon', 'Practice it'],
    mpeak: ['ladder', 'Update your ladder rank'], mtop: ['ladder', 'Update your ladder rank'], stop100: ['ladder', 'Update your ladder rank'], stop10: ['ladder', 'Update your ladder rank'], srank1: ['ladder', 'Update your ladder rank'],
    mcup: ['tournaments', 'Add an event'], mwin: ['tournaments', 'Add an event'], mday2: ['tournaments', 'Add an event'], mrcut: ['tournaments', 'Add an event'], minv: ['tournaments', 'See your Championship Points'],
    mwday2: ['tournaments', 'Add an event'], mworlds: ['tournaments', 'Add an event'], mchamp: ['tournaments', 'Add an event'], sonline: ['tournaments', 'Add an event'],
  };
  $('milestones').addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]'); if (!b) return; e.preventDefault();
    const go = b.dataset.go;
    if (go.startsWith('drill:')) { VL.study.drill(go.slice(6)); return; }
    location.hash = go === 'ladder' ? 'today' : go; // best ladder rank is kept with the current format on Today
    setTimeout(() => {
      if (go === 'ladder' && $('fmt-form').hidden) $('fmt-edit').click();
      const focus = { log: null, ladder: 'fmt-peak', tournaments: b.textContent.startsWith('Add') ? 'tn-date' : null }[go];
      if (focus && $(focus)) setTimeout(() => { $(focus).scrollIntoView({ behavior: 'smooth', block: 'center' }); $(focus).focus({ preventScroll: true }); }, 60);
    }, 80);
  });
  function renderRoadmap() {
    const ms = (store.get('meta', 'milestones') || {}).done || {};
    const total = games().length; const fmts = new Set(games().map(g => g.fmt).filter(Boolean)).size;
    const typeAcc = VL.study.accuracy('typemon');
    const auto = { m100: total >= 100, mfmt3: fmts >= 3, mtypes: typeAcc !== null && typeAcc >= 95 && ((VL.store.get('drills', 'typemon') || {}).h || []).length >= 50, ...(VL.plan ? Object.fromEntries(Object.entries(VL.plan.autoMilestones()).filter(([, v]) => v)) : {}) };
    const isDone = (id) => !!(ms[id] || auto[id]);
    let curStage = VL.STAGES.findIndex(s => !s.ms.every(isDone)); if (curStage < 0) curStage = VL.STAGES.length - 1;
    $('stages').innerHTML = VL.STAGES.map((s, i) => `<div class="stage ${i === curStage ? 'cur' : ''}"><span class="sn">${i + 1}</span><div><h4>${esc(s.n)} ${i < curStage ? '<span class="pill w">done</span>' : i === curStage ? '<span class="pill n">you are here</span>' : ''}</h4><p>${esc(s.d)}</p></div></div>`).join('');
    const extra = { m100: ` <span class="meta">${Math.min(total, 100)}/100</span>`, mfmt3: ` <span class="meta">${Math.min(fmts, 3)}/3</span>`, mtypes: typeAcc !== null ? ` <span class="meta">${typeAcc}%</span>` : '' };
    $('milestones').innerHTML = VL.MILESTONES.map(([id, label]) => { const go = MS_GO[id]; return `<li class="${isDone(id) ? 'done' : ''}"><input type="checkbox" id="ms-${id}" data-ms="${id}" ${isDone(id) ? 'checked' : ''} ${auto[id] ? 'disabled' : ''}><label for="ms-${id}" style="color:inherit;font-size:inherit;font-weight:inherit"><span class="t">${esc(label)}${extra[id] || ''}</span></label>${go && !isDone(id) ? `<button class="linkbtn ms-go" data-go="${esc(go[0])}">${esc(go[1])} →</button>` : ''}</li>`; }).join('');
    const today = dayKey(); let nextShown = false;
    $('timeline').innerHTML = (VL.isSingles() ? '<p class="sub" style="margin:0 0 8px">Official Play! Pokémon events, including the World Championships, are played in doubles. Singles is played on the ranked ladder and in online competitions. Switch to Doubles at the top if you want to aim for these.</p>' : '') + (VL.upcoming ? VL.upcoming() : VL.EVENTS.map(([d, n, note]) => ({ d, n, note }))).map(({ d, n: name, note, c }) => {
      const past = d < today; let chip = '';
      if (!past && !nextShown) { chip = '<span class="pill n">next</span>'; nextShown = true; } else if (past) chip = '<span class="pill m">done</span>';
      const dt = new Date(d + 'T12:00:00'); const days = Math.round((dt - new Date()) / 864e5);
      return `<div class="ev ${past ? 'past' : ''}"><span class="date">${dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span><span><span class="name">${esc(name)}${c ? ` <span class="mini">${esc(c)}</span>` : ''}</span>${note ? `<br><span class="sub">${esc(note)}</span>` : ''}</span><span>${chip}${!past ? ` <span class="sub mono">${days}d</span>` : ''}</span></div>`;
    }).join('');
  }

  // ---------- settings ----------
  VL.onSync = function (status, message) {
    for (const id of (VL.account && VL.account.user ? ['syncdot2'] : ['syncdot', 'syncdot2'])) { const el = $(id); el.className = 'syncdot ' + (status === 'ok' ? 'ok' : status === 'err' ? 'err' : status === 'busy' ? 'busy' : ''); el.textContent = message || (status === 'off' ? 'Not synced' : ''); }
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
      renderHeader(); renderToday(); if (VL.trends) VL.trends.render(); renderLog(); renderReview(); renderNotebook(); renderRoadmap(); renderSettings();
      if (VL.builder && location.hash === '#teams') VL.builder.refreshSide();
      VL.study.render();
      if (VL.arcade) VL.arcade.render();
      if (VL.test) VL.test.render();
      if (VL.compare && location.hash === '#review') VL.compare.render();
      if (VL.progress && location.hash === '#progress') VL.progress.render();
      if (VL.plan && !inside('op-list')) VL.plan.render();
      if (VL.meta.render && location.hash === '#meta' && !inside('mt-detail')) VL.meta.render();
    });
  }
  store.onChange(renderAll);
  let rsz = null; window.addEventListener('resize', () => { clearTimeout(rsz); rsz = setTimeout(renderAll, 250); });

  // ---------- routing ----------
  const TABS = ['news', 'replay', 'topteams', 'sheets', 'videos', 'today', 'log', 'review', 'games', 'test', 'progress', 'study', 'meta', 'calc', 'notebook', 'teams', 'teamcompare', 'tournaments', 'opponents', 'roadmap', 'settings'];
  function route() {
    if (location.hash.startsWith('#import=')) return; // a game handed over by the Showdown extension; js/autoimport.js handles it and puts the page back
    const h = location.hash.replace('#', ''); const tab = TABS.includes(h) ? h : 'today';
    const was = document.querySelector('.panel.on');
    for (const t of TABS) $('p-' + t).classList.toggle('on', t === tab);
    document.querySelectorAll('.nav a, .side-foot a, .bottombar a, .sheet a').forEach(a => { if (a.getAttribute('href') === '#' + tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    VL.closeSheet();
    if (was && was.id !== 'p-' + tab) window.scrollTo(0, 0);
    if (tab === 'calc' && VL.calc) VL.calc.render();
    if (tab === 'games' && VL.arcade) VL.arcade.render(); else if (VL.arcade) VL.arcade.stop();
    if (tab === 'test' && VL.test) VL.test.render();
    if (tab === 'progress' && VL.progress) VL.progress.render();
    if (tab === 'meta' && VL.meta.render) VL.meta.render();
    if (tab === 'teams' && VL.builder) VL.builder.render();
    if (tab === 'teamcompare' && VL.teamcompare) VL.teamcompare.render();
    if (tab === 'news' && VL.news) VL.news.render();
    if (tab === 'topteams' && VL.topteams) VL.topteams.render();
    if (tab === 'replay' && VL.replay) VL.replay.render();
    if (tab === 'sheets' && VL.sheets) VL.sheets.render();
    if (tab === 'videos' && VL.videos) VL.videos.render();
    document.title = (tab === 'today' ? '' : $('p-' + tab).querySelector('.page-head h1').textContent + ' · ') + 'Toxicroak VGC Lab';
  }
  // phone "More" sheet
  // iPhone Safari ignores overflow:hidden on the page, so the page is pinned
  // in place with position:fixed while the menu is open, then restored.
  let locked = false, lockY = 0;
  function lockPage() {
    if (locked) return; locked = true; lockY = window.scrollY;
    const b = document.body.style; b.position = 'fixed'; b.top = `-${lockY}px`; b.left = '0'; b.right = '0'; b.width = '100%';
    document.documentElement.classList.add('sheet-open');
  }
  function unlockPage() {
    if (!locked) return; locked = false;
    const b = document.body.style; b.position = ''; b.top = ''; b.left = ''; b.right = ''; b.width = '';
    document.documentElement.classList.remove('sheet-open');
    window.scrollTo(0, lockY);
  }
  VL.closeSheet = function () { $('sheet').hidden = true; $('sheet-back').hidden = true; $('more-btn').setAttribute('aria-expanded', 'false'); unlockPage(); };
  $('more-btn').onclick = () => {
    const open = $('sheet').hidden;
    if (!open) { VL.closeSheet(); return; }
    lockPage();
    $('sheet').hidden = false; $('sheet-back').hidden = false; $('more-btn').setAttribute('aria-expanded', 'true');
    $('sheet').scrollTop = 0;
  };
  // while the menu is open, swipes anywhere outside it do nothing
  document.addEventListener('touchmove', e => { if (locked && !e.target.closest('#sheet')) e.preventDefault(); }, { passive: false });
  // when the menu can't scroll any further, stop the swipe from reaching the page
  let touchY = 0;
  $('sheet').addEventListener('touchstart', e => { touchY = e.touches[0].clientY; }, { passive: true });
  $('sheet').addEventListener('touchmove', e => {
    const s = $('sheet'); const dy = e.touches[0].clientY - touchY;
    const atTop = s.scrollTop <= 0, atBottom = s.scrollTop + s.clientHeight >= s.scrollHeight - 1;
    if ((atTop && dy > 0) || (atBottom && dy < 0)) e.preventDefault();
  }, { passive: false });
  // swipes on the dimmed background shouldn't scroll the page behind the menu
  $('sheet-back').addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  $('sheet-back').onclick = VL.closeSheet;
  // theme (saved per device)
  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('vgclab-theme', t); } catch (e) { /* ignore */ }
    document.querySelectorAll('[data-theme-set]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.themeSet === t)));
    const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#08090A';
  }
  document.querySelectorAll('[data-theme-set]').forEach(b => b.onclick = () => applyTheme(b.dataset.themeSet));
  // title font (Settings → Title font), saved on this device
  function applyTitleFont(f) {
    document.documentElement.dataset.titlefont = f;
    try { localStorage.setItem('vgclab-titlefont', f); } catch (e) { /* ignore */ }
    document.querySelectorAll('[data-tfont-set]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.tfontSet === f)));
  }
  document.querySelectorAll('[data-tfont-set]').forEach(b => b.onclick = () => { applyTitleFont(b.dataset.tfontSet); if (VL.sound) VL.sound.play('tap'); });
  applyTitleFont(document.documentElement.dataset.titlefont || 'workbench');
  // colors (Settings → Colors): shiny teal and pink, or the original indigo and orange
  function applyPalette(v) {
    document.documentElement.dataset.palette = v;
    try { localStorage.setItem('vgclab-palette', v); } catch (e) { /* ignore */ }
    document.querySelectorAll('[data-pal-set]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.palSet === v)));
  }
  document.querySelectorAll('[data-pal-set]').forEach(b => b.onclick = () => { applyPalette(b.dataset.palSet); if (VL.sound) VL.sound.play('tap'); });
  applyPalette(document.documentElement.dataset.palette || 'shiny');
  // Minimalist's striped bars: size the blocks and gaps in whole screen pixels, so every block is the same width
  // even with page zoom (the 1.15 zoom on very wide screens) or Windows display scaling
  function pixelGrid() {
    const z = (parseFloat(getComputedStyle(document.documentElement).zoom) || 1) * (window.devicePixelRatio || 1);
    const seg = Math.max(2, Math.round(6 * z)), per = seg + Math.max(1, Math.round(2 * z));
    document.documentElement.style.setProperty('--dp', (1 / z) + 'px'); // one screen pixel, for sizes that must land on whole pixels
    document.documentElement.style.setProperty('--px-seg', (seg / z) + 'px');
    document.documentElement.style.setProperty('--px-per', (per / z) + 'px');
  }
  // rows of small squares (the win/loss strip, the color swatches) start on a whole screen pixel,
  // so every square and gap is drawn the same instead of some edges going soft
  function snapRows() {
    const z = (parseFloat(getComputedStyle(document.documentElement).zoom) || 1) * (window.devicePixelRatio || 1);
    document.querySelectorAll('.td-strip, .pal-sw').forEach(el => {
      el.style.transform = '';
      const r = el.getBoundingClientRect(); if (!r.width) return;
      const dx = (Math.round(r.left * z) - r.left * z) / z, dy = (Math.round(r.top * z) - r.top * z) / z;
      if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) el.style.transform = `translate(${dx}px, ${dy}px)`;
    });
  }
  VL.snapRows = snapRows;
  pixelGrid(); window.addEventListener('resize', () => { pixelGrid(); requestAnimationFrame(snapRows); });
  window.addEventListener('hashchange', () => setTimeout(snapRows, 80));
  new MutationObserver(() => { clearTimeout(snapRows.t); snapRows.t = setTimeout(snapRows, 60); }).observe(document.getElementById('main') || document.body, { childList: true, subtree: true });
  // style (Settings → Style): standard, or the pixel Minimalist style
  function applyLook(v) {
    document.documentElement.dataset.look = v;
    try { localStorage.setItem('vgclab-look', v); } catch (e) { /* ignore */ }
    document.querySelectorAll('[data-look-set]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.lookSet === v)));
    if (VL.fitToday) requestAnimationFrame(VL.fitToday);
  }
  document.querySelectorAll('[data-look-set]').forEach(b => b.onclick = () => { applyLook(b.dataset.lookSet); if (VL.sound) VL.sound.play('tap'); });
  applyLook(document.documentElement.dataset.look || 'standard');
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
  $('focus-save').onclick = () => { putProfile({ [sk('focus')]: $('focus-input').value.trim() }); $('focus-form').hidden = true; VL.toast('Focus saved'); VL.sound && VL.sound.play('save'); };
  $('focus-input').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('focus-save').click(); } });
  $('fmt-edit').onclick = () => { $('fmt-form').hidden = !$('fmt-form').hidden; };
  $('fmt-save').onclick = () => {
    const v = $('fmt-select').value; const peak = parseInt($('fmt-peak').value, 10);
    const patch = { [sk('goal')]: $('fmt-goal').value.trim(), [sk('peak')]: Number.isFinite(peak) ? peak : null };
    if (v === 'custom') {
      const name = $('fmt-custom') ? $('fmt-custom').value.trim() : '';
      if (!name) { VL.toast('Type the format name first'); return; }
      Object.assign(patch, { format: 'custom', customFormat: name });
    } else Object.assign(patch, { format: v });
    putProfile(patch); $('fmt-form').hidden = true; fillDatalist(); VL.study.fill(v === 'custom' ? '' : v); VL.toast('Saved'); VL.sound && VL.sound.play('save');
  };
  $('fmt-select').addEventListener('change', () => {
    let box = $('fmt-custom-wrap');
    if ($('fmt-select').value === 'custom') {
      if (!box) { box = document.createElement('label'); box.id = 'fmt-custom-wrap'; box.htmlFor = 'fmt-custom'; box.innerHTML = 'Format name<input type="text" id="fmt-custom" placeholder="For example: Generation 10 VGC Regulation A">'; $('fmt-select').parentElement.after(box); }
      box.hidden = false; $('fmt-custom').value = profile().customFormat || ''; $('fmt-custom').focus();
    } else if (box) box.hidden = true;
  });
  // big screens: Today fits on one screen. The session card ends at the bottom of the window and its list scrolls inside.
  function fitToday() {
    const c = document.querySelector('.td-sess'); if (!c) return;
    c.style.maxHeight = ''; c.classList.remove('fitted');
    if (!window.matchMedia('(min-width:2400px)').matches || !c.offsetParent) return;
    const z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    const top = c.getBoundingClientRect().top + window.scrollY;
    const room = Math.floor(window.innerHeight / z - top - 24);
    if (c.scrollHeight > room && room > 320) { c.style.maxHeight = room + 'px'; c.classList.add('fitted'); }
  }
  VL.fitToday = fitToday;
  window.addEventListener('hashchange', () => setTimeout(fitToday, 60));
  let ftT = null; window.addEventListener('resize', () => { clearTimeout(ftT); ftT = setTimeout(fitToday, 150); });
  $('checklist').addEventListener('change', () => requestAnimationFrame(fitToday));
  $('checklist').addEventListener('click', e => {
    const a = e.target.closest('[data-warmcalc]'); if (!a) return;
    e.preventDefault(); if (VL.calc && VL.calc.openTrouble) VL.calc.openTrouble(a.dataset.warmcalc, a.dataset.warmteam || '');
  });
  $('checklist').addEventListener('change', e => {
    const id = e.target.dataset.ck; if (!id) return;
    if (e.target.checked) VL.sound && VL.sound.play('done');
    const key = dayKey(); const day = store.get('days', key) || { done: {} };
    store.put('days', key, { done: { ...(day.done || {}), [id]: e.target.checked } });
  });

  let lfResult = null;
  function setResult(r) { lfResult = r; $('lf-w').setAttribute('aria-pressed', r === 'W'); $('lf-l').setAttribute('aria-pressed', r === 'L'); }
  $('lf-w').onclick = () => setResult('W'); $('lf-l').onclick = () => setResult('L');
  document.querySelectorAll('[data-lfmode]').forEach(b => { b.onclick = () => setLogMode(b.dataset.lfmode); });
  setLogMode(lfMode);
  const tagChips = () => { $('lf-tags').innerHTML = VL.TAGS.map(([id, l]) => `<button type="button" class="chip" data-tag="${id}" aria-pressed="false">${esc(l)}</button>`).join(''); };
  // the question helper and the chips stay in step: a Yes ticks the tag, and ticking a chip marks its question
  const tagLabel = (id) => (VL.TAGS.find(t => t[0] === id) || [])[1] || id;
  const tagQs = () => {
    $('lf-tagq-list').innerHTML = (VL.TAGQ || []).filter(([id]) => VL.TAGS.some(t => t[0] === id)).map(([id, q]) =>
      `<div class="tagq-row"><span>${esc(q)}<span class="mini"> · ${esc(tagLabel(id))}</span></span><button type="button" class="chip" data-tagq="${id}" aria-pressed="false">Yes</button></div>`).join('');
  };
  const syncQs = () => document.querySelectorAll('#lf-tagq-list [data-tagq]').forEach(q => { const c = document.querySelector(`#lf-tags [data-tag="${q.dataset.tagq}"]`); q.setAttribute('aria-pressed', c ? c.getAttribute('aria-pressed') : 'false'); });
  tagChips(); tagQs(); store.ready.then(() => { tagChips(); tagQs(); });
  $('lf-tags').addEventListener('click', e => { const b = e.target.closest('[data-tag]'); if (b) { b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'); syncQs(); } });
  $('lf-tagq-list').addEventListener('click', e => { const q = e.target.closest('[data-tagq]'); if (!q) return; const c = document.querySelector(`#lf-tags [data-tag="${q.dataset.tagq}"]`); if (c) c.click(); });
  $('log-form').addEventListener('submit', e => {
    e.preventDefault();
    if (!lfResult) { $('lf-msg').textContent = 'Pick WIN or LOSS first.'; return; }
    const rating = parseInt($('lf-rating').value, 10), turn = parseInt($('lf-turn').value, 10); const fid = pendingFmt || curFormatId();
    const old = editingId ? store.get('games', editingId) : null;
    store.put('games', editingId || VL.newId('g'), {
      ...(old || {}),
      ts: old ? old.ts : Date.now(), day: old ? old.day : dayKey(), fmt: fid, fmtName: fmtName(fid), result: lfResult, mode: lfMode,
      type: $('lf-type').value, rating: Number.isFinite(rating) ? rating : null, team: $('lf-team').value || null,
      arch: $('lf-arch').value || null, opp: splitMons($('lf-opp').value).slice(0, 6),
      mylead: splitMons($('lf-mylead').value).join(', '), myback: splitMons($('lf-myback').value).join(', '),
      opplead: splitMons($('lf-opplead').value).join(', '), turn: Number.isFinite(turn) ? turn : null,
      tags: [...document.querySelectorAll('#lf-tags [aria-pressed=true]')].map(b => b.dataset.tag), note: $('lf-note').value.trim(),
      oppName: $('lf-oppname').value.trim() || null, source: pendingSource || null,
      ...setFields(old),
    });
    const nextUp = !old && setNext();
    const setDone = !old && +$('lf-setgame').value ? (() => { const g = games().filter(x => x.setGame === +$('lf-setgame').value).sort((a, b) => b.ts - a.ts)[0]; const sc = g && setScore(g.set); return sc && sc.decided ? sc : null; })() : null;
    if ($('lf-oppname').value.trim() && VL.plan) VL.plan.ensureOpponent($('lf-oppname').value.trim());
    pendingSource = null; pendingFmt = null;
    const res = lfResult; setResult(null);
    for (const f of ['lf-opp', 'lf-mylead', 'lf-myback', 'lf-opplead', 'lf-turn', 'lf-note', 'lf-arch', 'lf-oppname']) $(f).value = '';
    backHelp(null);
    document.querySelectorAll('#lf-tags [aria-pressed=true]').forEach(b => b.setAttribute('aria-pressed', 'false'));
    syncQs(); $('lf-tagq').open = false;
    const wasEdit = !!editingId; stopEditing();
    $('lf-msg').textContent = wasEdit ? 'Changes saved.' : 'Saved. Next game.';
    resetSet();
    if (setDone) $('lf-msg').textContent = `Saved. You ${setDone.w > setDone.l ? 'won' : 'lost'} the set ${setDone.w}–${setDone.l}.`;
    if (nextUp) { // between games of a set: one tap fills in the next game's form
      $('lf-msg').innerHTML = `Saved game ${nextUp.n - 1}. <button type="button" class="linkbtn" id="lf-nextgame">Log game ${nextUp.n} of this set</button>`;
      $('lf-nextgame').onclick = () => fillNext(nextUp);
    }
    if (!wasEdit) VL.markDone('log');
    VL.toast(wasEdit ? 'Game updated' : res === 'W' ? 'Win logged' : 'Loss logged'); VL.sound && VL.sound.play('save');
  });
  // ---------- best-of-3 sets in the form ----------
  // In person there's no extension: you say which game of the set this was, and it joins the set
  // you were playing against the same opponent (game 1 starts a new one).
  const need3 = (of) => Math.floor((of || 3) / 2) + 1;
  function setGames(key) { return key ? games().filter(g => g.set === key).sort((a, b) => (a.setGame || 0) - (b.setGame || 0)) : []; }
  function setScore(key) { const gs = setGames(key); const w = gs.filter(g => g.result === 'W').length, l = gs.filter(g => g.result === 'L').length; const of = (gs[0] && gs[0].setOf) || 3; return { gs, w, l, of, decided: w >= need3(of) || l >= need3(of) }; }
  VL.setScore = setScore;
  // the set this game continues: the newest unfinished set against this opponent from the last 12 hours
  function prevSet(n) {
    const who = $('lf-oppname').value.trim().toLowerCase(); const since = Date.now() - 12 * 36e5;
    const cands = games().filter(g => g.set && g.ts > since && (g.setGame || 0) < n && (!who || String(g.oppName || '').toLowerCase() === who) && g.id !== editingId)
      .sort((a, b) => b.ts - a.ts);
    for (const g of cands) { const sc = setScore(g.set); if (!sc.decided && sc.gs.length < n) return g.set; }
    return null;
  }
  const isSetType = () => $('lf-type').value !== 'Ladder (best of 1)';
  function setRow() {
    $('lf-setrow').hidden = !isSetType() && !$('lf-setgame').value;
    const n = +$('lf-setgame').value || 0; const info = $('lf-setinfo');
    const key = n > 1 ? (editingId && (store.get('games', editingId) || {}).set) || prevSet(n) : null;
    if (!key) { info.hidden = !(n > 1); info.textContent = n > 1 ? `No unfinished set${$('lf-oppname').value.trim() ? ' against ' + $('lf-oppname').value.trim() : ''} from today, so this starts a new one.` : ''; return; }
    const sc = setScore(key); const last = sc.gs[sc.gs.length - 1];
    info.hidden = false;
    info.innerHTML = `Continues your set${last.oppName ? ' against ' + esc(last.oppName) : ''}: ${sc.gs.map(g => `game ${g.setGame} ${g.result === 'W' ? 'won' : 'lost'}`).join(', ')}.${last.plan ? ` Your plan for this game: <b>${esc(last.plan)}</b>` : ''}`;
  }
  ['lf-type', 'lf-setgame'].forEach(id => $(id).addEventListener('change', setRow));
  $('lf-oppname').addEventListener('change', setRow);
  function setFields(old) {
    const n = +$('lf-setgame').value || 0;
    const plan = $('lf-plan').value.trim(); const kind = $('lf-plankind').value;
    if (!n) return old && old.set ? { set: null, setGame: null, setOf: null, plan: null, planSame: null } : {};
    const key = (old && old.set) || (n > 1 && prevSet(n)) || 'm' + VL.newId('s');
    return { set: key, setGame: n, setOf: 3, plan: plan || null, planSame: kind === 'same' ? true : kind === 'change' ? false : null };
  }
  // after saving a game of a set that isn't over: what the next game's form needs
  function setNext() {
    const n = +$('lf-setgame').value || 0; if (!n) return null;
    const g = games().filter(x => x.setGame === n).sort((a, b) => b.ts - a.ts)[0]; if (!g) return null;
    const sc = setScore(g.set); if (sc.decided || n >= sc.of) return null;
    return { n: n + 1, type: g.type, team: g.team, arch: g.arch, opp: g.opp, oppName: g.oppName, mode: lfMode };
  }
  function fillNext(x) {
    $('lf-type').value = x.type || 'Best-of-3 practice'; $('lf-team').value = x.team || ''; $('lf-arch').value = x.arch || '';
    $('lf-opp').value = (x.opp || []).join(', '); $('lf-oppname').value = x.oppName || ''; $('lf-setgame').value = String(x.n);
    setRow(); $('lf-msg').textContent = `Game ${x.n}: their team and your team are filled in. Pick WIN or LOSS when it's done.`;
    $('log-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function resetSet() { $('lf-setgame').value = ''; $('lf-plan').value = ''; $('lf-plankind').value = ''; setRow(); }

  // ---------- edit a logged game: load it into the form, save over it ----------
  let editingId = null;
  function stopEditing() {
    editingId = null; $('lf-title').textContent = 'New game'; $('lf-save').textContent = 'Save game'; $('lf-cancel').hidden = true;
  }
  function editGame(id) {
    const x = store.get('games', id); if (!x) return;
    editingId = id; setResult(x.result || null); setLogMode(isTest(x) ? 'test' : 'climb');
    const set = (f, v) => { const el = $(f); if (el) el.value = v ?? ''; };
    set('lf-type', x.type || $('lf-type').value); set('lf-rating', Number.isFinite(x.rating) ? x.rating : '');
    set('lf-team', x.team || ''); set('lf-arch', x.arch || ''); set('lf-opp', (x.opp || []).join(', '));
    set('lf-mylead', x.mylead || ''); set('lf-myback', x.myback || ''); set('lf-opplead', x.opplead || '');
    set('lf-turn', Number.isFinite(x.turn) ? x.turn : ''); set('lf-note', x.note || ''); set('lf-oppname', x.oppName || '');
    set('lf-setgame', x.setGame || ''); set('lf-plan', x.plan || ''); set('lf-plankind', x.planSame === true ? 'same' : x.planSame === false ? 'change' : ''); setRow();
    document.querySelectorAll('#lf-tags [data-tag]').forEach(b => b.setAttribute('aria-pressed', String((x.tags || []).includes(b.dataset.tag))));
    syncQs();
    pendingSource = x.source || null; pendingFmt = x.fmt || null;
    $('lf-title').textContent = `Editing your ${x.result === 'W' ? 'win' : 'loss'} from ${x.day || 'earlier'}`;
    $('lf-save').textContent = 'Save changes'; $('lf-cancel').hidden = false; $('lf-msg').textContent = '';
    $('log-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('lf-cancel').onclick = () => {
    stopEditing(); setResult(null); pendingSource = null; pendingFmt = null; resetSet();
    for (const f of ['lf-opp', 'lf-mylead', 'lf-myback', 'lf-opplead', 'lf-turn', 'lf-note', 'lf-arch', 'lf-oppname']) $(f).value = '';
    backHelp(null);
    document.querySelectorAll('#lf-tags [aria-pressed=true]').forEach(b => b.setAttribute('aria-pressed', 'false')); syncQs();
    $('lf-msg').textContent = 'Editing cancelled. Nothing changed.';
  };
  VL.armDelete = armDelete;
  function armDelete(btn, run) {
    if (btn.dataset.armed) { run(); return; }
    btn.dataset.armed = '1'; const old = btn.textContent; btn.textContent = 'Confirm';
    setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = old; } }, 3000);
  }
  // ---------- fill the log form from a replay ----------
  let pendingSource = null, pendingFmt = null; // a game handed over from another page may be in another format
  let previewMine = null, bringN = 4;
  function backHelp(preview, n) {
    if (preview !== undefined) { previewMine = preview; bringN = n || 4; }
    const box = $('lf-backhelp'); if (!box) return;
    const have = splitMons($('lf-mylead').value).concat(splitMons($('lf-myback').value)).map(x => x.toLowerCase());
    const rest = (previewMine || []).filter(x => !have.includes(String(x).toLowerCase()));
    box.innerHTML = previewMine && have.length < bringN && rest.length
      ? `<span class="sub">The replay only shows ${have.length} of your ${bringN}. Tap the one${bringN - have.length > 1 ? 's' : ''} that stayed in the back:</span> ${rest.map(x => `<button type="button" class="chip" data-addback="${esc(x)}">${VL.sprite(x, 'xs', false)}${esc(x)}</button>`).join('')}`
      : '';
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-addback]'); if (!b) return; const cur = splitMons($('lf-myback').value); cur.push(b.dataset.addback); $('lf-myback').value = cur.join(', '); VL.sound && VL.sound.play('tap'); backHelp(); });
  document.addEventListener('input', (e) => { if (e.target.id === 'lf-myback' || e.target.id === 'lf-mylead') backHelp(); });
  VL.prefillLog = function (o) {
    location.hash = 'log';
    setResult(o.result || null);
    if (o.opp) $('lf-opp').value = o.opp.join(', ');
    if (o.opplead) $('lf-opplead').value = o.opplead.join(', ');
    if (o.mylead) $('lf-mylead').value = o.mylead.join(', ');
    if (o.myback) $('lf-myback').value = o.myback.join(', ');
    // a replay only shows the Pokémon that came in; offer the rest of your team preview for the ones that stayed in the back
    backHelp(o.mypreview || null, o.bring || 4);
    if (o.oppName) $('lf-oppname').value = o.oppName;
    if (o.team) $('lf-team').value = o.team;
    if (o.note) $('lf-note').value = o.note;
    if (o.rating) $('lf-rating').value = o.rating;
    if (o.turn) $('lf-turn').value = o.turn;
    pendingSource = o.source || null; pendingFmt = o.fmt && o.fmt !== curFormatId() ? o.fmt : null;
    if (o.result === 'L') $('lf-tagq').open = true; // after a loss, offer the questions straight away
    $('lf-msg').textContent = `Filled in for you${pendingFmt ? ` (format: ${fmtName(pendingFmt)})` : ''}. Add your tags and what you'd do differently, then save.`;
    setTimeout(() => { window.scrollTo(0, 0); }, 30);
  };
  const toIdApp = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
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
    // your side: the name given, any of your Showdown accounts, or the side whose six matches a saved team
    const mine = VL.mySide ? VL.mySide(players, team, [me]) : Object.keys(players).find(k => players[k].toLowerCase() === String(me || '').trim().toLowerCase());
    if (!mine) return { error: Object.keys(players).length ? `Couldn't tell which player you were. The players were ${Object.values(players).join(' and ')}. Type your Showdown username in the box (or add it in Settings → Showdown accounts).` : 'That doesn\'t look like a Showdown battle log.' };
    const opp = mine === 'p1' ? 'p2' : 'p1';
    return { result: winner ? (toIdApp(winner) === toIdApp(players[mine]) ? 'W' : 'L') : null, opp: team[opp].length ? team[opp] : seen[opp], opplead: leads[opp], mylead: leads[mine], myback: seen[mine].filter(n => !leads[mine].includes(n)), mypreview: team[mine], oppName: players[opp], turns: turn, format };
  }
  VL.parseReplay = parseReplay; VL.dayKey = dayKey;
  function importReplay(log, url) {
    const me = $('rp-me').value.trim(); try { if (me) localStorage.setItem('vgclab-sdname', me); } catch (e) { /* ignore */ }
    const r = parseReplay(log, me);
    if (r.error) { $('rp-msg').textContent = r.error; return; }
    VL.prefillLog({ ...r, bring: /bss|singles/i.test(r.format || '') ? 3 : 4, note: `Imported from ${url || 'a pasted Showdown log'}. Lasted ${r.turns} turns.`, source: url || 'showdown-log' });
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

  $('recent').addEventListener('click', e => { if (e.target.dataset.editgame) { editGame(e.target.dataset.editgame); return; } if (e.target.dataset.review && VL.replay) { VL.replay.open(e.target.dataset.review); return; } if (e.target.dataset.reviewgame && VL.replay) { VL.replay.openGame(e.target.dataset.reviewgame); return; } const id = e.target.dataset.delgame; if (id) armDelete(e.target, () => store.del('games', id)); });

  $('rv-scope').onchange = renderAll;
  try { const rm = localStorage.getItem('vgclab-rvmode'); if (rm) $('rv-mode').value = rm; } catch (e) { /* private mode */ }
  $('rv-mode').onchange = () => { try { localStorage.setItem('vgclab-rvmode', $('rv-mode').value); } catch (e) { /* private mode */ } renderAll(); };
  $('rv-team').onchange = () => { try { localStorage.setItem('vgclab-rvteam', $('rv-team').value); } catch (e) { /* private mode */ } renderAll(); };
  document.addEventListener('change', (e) => { if (e.target.id === 'recent-mode') renderLog(); });
  $('rv-mons').addEventListener('click', e => { const n = e.target.dataset.addnb; if (!n) return; location.hash = 'notebook'; clearNb(); $('nb-name').value = n; $('nb-plan').focus(); });
  $('coach-copy').onclick = async () => {
    const text = coachPrompt();
    try { await navigator.clipboard.writeText(text); VL.toast('Prompt copied. Paste it into Claude.'); }
    catch (err) { $('coach-paste').value = text; $('coach-paste').select(); VL.toast('Couldn\'t copy. The prompt is in the box below; copy it from there.'); }
  };
  $('coach-save').onclick = () => {
    const text = $('coach-paste').value.trim(); if (!text) { VL.toast('Paste Claude\'s review first'); return; }
    const id = VL.newId('r'); store.put('reports', id, { ts: Date.now(), games: games().length, text }); $('coach-paste').value = ''; VL.sound && VL.sound.play('save'); VL.toast('Review saved');
    setTimeout(() => { $('coach-past').value = id; renderAll(); }, 50);
  };
  $('coach-past').onchange = () => { const r = store.get('reports', $('coach-past').value); if (r) $('coach-out').innerHTML = md(r.text); };

  $('milestones').addEventListener('change', e => {
    if (e.target.checked) VL.sound && VL.sound.play('best');
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
    clearNb(); VL.toast('Matchup saved'); VL.sound && VL.sound.play('save');
  });
  $('nb-list').addEventListener('click', e => {
    const ed = e.target.dataset.editnb, dl = e.target.dataset.delnb;
    if (ed) { const m = store.get('matchups', ed); if (!m) return; nbEditing = ed; $('nb-name').value = m.name || ''; $('nb-team').value = m.team || ''; $('nb-plan').value = m.plan || ''; $('nb-lead').value = m.lead || ''; $('nb-bring').value = m.bring || ''; $('nb-calcs').value = m.calcs || ''; $('nb-title').textContent = 'Edit matchup'; $('nb-cancel').hidden = false; $('nb-name').focus(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    if (dl) armDelete(e.target, () => store.del('matchups', dl));
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
      // a default format only once the account's data is here, so it can't replace the real profile
      const setDefault = () => { if (!profile().format) putProfile({ format: D.format().id }); };
      if (VL.whenDataReady) VL.whenDataReady(setDefault); else setDefault();
      fillFormatSelect(); fillDatalist(); VL.study.fill(curFormatId().startsWith('custom:') ? '' : curFormatId());
      renderAll(); route();
      VL.meta.ready.then(() => { renderAll(); if (location.hash === '#meta') VL.meta.render(); });
      // usage stats for an older format arrive after the first render
      window.addEventListener('vl-meta', () => { renderAll(); if (VL.calc && location.hash === '#calc') VL.calc.render(); });
    });
  }).catch(() => banner('Couldn\'t load the Pokémon data. The log still works; Study needs the data file. Check your connection and reload.'));
})();
