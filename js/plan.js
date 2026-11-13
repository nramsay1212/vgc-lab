/* Tournaments (with Championship Points and best-finish limits), opponents,
 * and prediction practice. */
(function () {
  'use strict';
  const VL = (window.VL = window.VL || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = VL.store;
  const cap = (s) => s.trim().replace(/\s+/g, ' ').split(' ').map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
  const pad = (n) => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

  // ---------- tournaments ----------
  // Best-finish limits from the 2027 season rules: only your best N finishes of a kind count.
  const KINDS = [
    { id: 'lc', n: 'League Challenge', limit: 4, group: 'lc' },
    { id: 'cup', n: 'League Cup', limit: 4, group: 'cup' },
    { id: 'regional', n: 'Regional Championship', limit: 5, group: 'major', big: true },
    { id: 'special', n: 'Special Event', limit: 5, group: 'major', big: true },
    { id: 'intl', n: 'International Championship', limit: 5, group: 'major', big: true },
    { id: 'online', n: 'Online Challenge (Global or Grand)', limit: null, group: 'online' },
    { id: 'worlds', n: 'World Championship', limit: 0, group: 'worlds', big: true },
    { id: 'other', n: 'Other tournament (no Championship Points)', limit: 0, group: 'other' },
  ];
  const kind = (id) => KINDS.find(k => k.id === id) || KINDS[KINDS.length - 1];
  const seasonOf = (date) => { const [y, m] = String(date || today()).split('-').map(Number); return m >= 9 ? y + 1 : y; };
  const events = () => store.list('events').sort((a, b) => String(b.date).localeCompare(String(a.date)));

  function seasonPoints(season) {
    const list = events().filter(e => seasonOf(e.date) === season);
    const total = list.reduce((a, e) => a + (+e.cp || 0), 0);
    const groups = {};
    for (const e of list) { const k = kind(e.kind); (groups[k.group] ||= { limit: k.limit, pts: [] }).pts.push(+e.cp || 0); }
    let counted = 0;
    for (const g of Object.values(groups)) { const sorted = g.pts.sort((a, b) => b - a); counted += g.limit === null ? sorted.reduce((a, b) => a + b, 0) : sorted.slice(0, g.limit).reduce((a, b) => a + b, 0); }
    const w = list.reduce((a, e) => a + (+e.w || 0), 0), l = list.reduce((a, e) => a + (+e.l || 0), 0);
    const best = list.filter(e => e.place).sort((a, b) => a.place - b.place)[0];
    return { list, total, counted, w, l, best };
  }
  let tnEditing = null;
  function renderTournaments() {
    const ks = $('tn-kind'); if (!ks.options.length) ks.innerHTML = KINDS.map(k => `<option value="${k.id}">${esc(k.n)}</option>`).join('');
    const ts = $('tn-team'); const ct = ts.value; ts.innerHTML = '<option value="">(not set)</option>' + store.list('teams').map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join(''); ts.value = ct;
    if (!$('tn-date').value) $('tn-date').value = today();
    const season = seasonOf(today()); const sp = seasonPoints(season);
    $('tn-tiles').innerHTML = [
      [`${season} season points`, sp.counted, sp.counted !== sp.total ? `${sp.total} earned, ${sp.counted} counted` : ''],
      ['Events this season', sp.list.length, ''],
      ['Match record this season', sp.list.length ? `${sp.w}–${sp.l}` : '–', ''],
      ['Best finish this season', sp.best ? `#${sp.best.place}` : '–', sp.best ? sp.best.name : ''],
    ].map(([k, v, s]) => `<div class="tile"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div>${s ? `<div class="mini">${esc(s)}</div>` : ''}</div>`).join('');
    const list = events(); const tname = Object.fromEntries(store.list('teams').map(t => [t.id, t.name]));
    $('tn-list').innerHTML = list.length ? `<table class="list"><thead><tr><th>Date</th><th>Event</th><th>Record</th><th>Placement</th><th>Championship Points</th><th></th></tr></thead><tbody>${list.map(e => `<tr>
      <td class="mono" style="white-space:nowrap">${esc(e.date)}</td>
      <td><b>${esc(e.name)}</b><br><span class="sub">${esc(kind(e.kind).n)}${e.players ? ` · ${e.players} players` : ''}${e.team && tname[e.team] ? ` · ${esc(tname[e.team])}` : ''}</span>${e.day2 ? ' <span class="pill n">Day 2</span>' : ''}${e.cut ? ' <span class="pill w">Top cut</span>' : ''}${e.notes ? `<br><span class="sub">${esc(e.notes)}</span>` : ''}</td>
      <td class="num">${e.w ?? '–'}–${e.l ?? '–'}</td><td class="num">${e.place ? '#' + e.place : '–'}</td><td class="num">${e.cp || 0}</td>
      <td style="white-space:nowrap"><button class="linkbtn" data-tnedit="${esc(e.id)}">Edit</button><button class="linkbtn" data-tndel="${esc(e.id)}">Delete</button></td></tr>`).join('')}</tbody></table>`
      : '<div class="empty">No events yet. Add your first League Challenge or online tournament after you play it.</div>';
    $('tn-rules').textContent = 'Counted points follow the 2027 season rules: your best 4 League Challenges, best 4 League Cups, and best 5 Regional, Special and International finishes combined. Online Challenges are added in full here, so check their limit in the official rules. These limits can change each season.';
  }
  function clearTn() { tnEditing = null; for (const f of ['tn-name', 'tn-players', 'tn-w', 'tn-l', 'tn-place', 'tn-cp', 'tn-notes']) $(f).value = ''; $('tn-date').value = today(); $('tn-day2').checked = false; $('tn-cut').checked = false; $('tn-title').textContent = 'Add an event'; $('tn-cancel').hidden = true; }
  $('tn-cancel').onclick = clearTn;
  $('tn-form').addEventListener('submit', e => {
    e.preventDefault();
    const num = (id) => { const v = parseInt($(id).value, 10); return Number.isFinite(v) ? v : null; };
    const date = /^\d{4}-\d{2}-\d{2}$/.test($('tn-date').value.trim()) ? $('tn-date').value.trim() : today();
    store.put('events', tnEditing || VL.newId('e'), { date, name: $('tn-name').value.trim(), kind: $('tn-kind').value, players: num('tn-players'), w: num('tn-w'), l: num('tn-l'), place: num('tn-place'), cp: num('tn-cp') || 0, team: $('tn-team').value || null, day2: $('tn-day2').checked, cut: $('tn-cut').checked, notes: $('tn-notes').value.trim() });
    clearTn(); VL.toast('Event saved');
  });
  $('tn-list').addEventListener('click', e => {
    const ed = e.target.dataset.tnedit, dl = e.target.dataset.tndel;
    if (ed) { const v = store.get('events', ed); if (!v) return; tnEditing = ed; $('tn-date').value = v.date || ''; $('tn-name').value = v.name || ''; $('tn-kind').value = v.kind; $('tn-players').value = v.players ?? ''; $('tn-w').value = v.w ?? ''; $('tn-l').value = v.l ?? ''; $('tn-place').value = v.place ?? ''; $('tn-cp').value = v.cp ?? ''; $('tn-team').value = v.team || ''; $('tn-day2').checked = !!v.day2; $('tn-cut').checked = !!v.cut; $('tn-notes').value = v.notes || ''; $('tn-title').textContent = 'Edit event'; $('tn-cancel').hidden = false; $('tn-name').focus(); }
    if (dl) VL.armDelete(e.target, () => store.del('events', dl));
  });
  function autoMilestones() {
    const ev = store.list('events');
    const big = ev.filter(e => kind(e.kind).big && e.kind !== 'worlds');
    return {
      mcup: ev.some(e => e.kind === 'cup' && (e.cut || e.place === 1)),
      mwin: ev.some(e => e.kind === 'cup' && e.place === 1),
      mday2: big.some(e => e.day2 || e.cut),
      mrcut: big.some(e => e.cut),
      mwday2: ev.some(e => e.kind === 'worlds' && (e.day2 || e.cut)),
      mworlds: ev.some(e => e.kind === 'worlds' && e.cut),
      mchamp: ev.some(e => e.kind === 'worlds' && e.place === 1),
    };
  }

  // ---------- opponents ----------
  const norm = (s) => String(s || '').trim().toLowerCase();
  function ensureOpponent(name) {
    const n = String(name || '').trim(); if (!n) return;
    if (store.list('opponents').some(o => norm(o.name) === norm(n))) return;
    store.put('opponents', VL.newId('o'), { name: n, notes: '' });
  }
  function renderOpponents() {
    const q = norm($('op-q').value); const games = store.list('games');
    const list = store.list('opponents').filter(o => !q || norm(o.name).includes(q)).map(o => {
      const gs = games.filter(g => norm(g.oppName) === norm(o.name)).sort((a, b) => (b.ts || 0) - (a.ts || 0));
      return { o, gs };
    }).sort((a, b) => ((b.gs[0] && b.gs[0].ts) || 0) - ((a.gs[0] && a.gs[0].ts) || 0) || a.o.name.localeCompare(b.o.name));
    $('dl-opps').innerHTML = store.list('opponents').map(o => `<option value="${esc(o.name)}">`).join('');
    $('op-list').innerHTML = list.length ? list.map(({ o, gs }) => {
      const w = gs.filter(g => g.result === 'W').length;
      const teamsSeen = [...new Set(gs.map(g => (g.opp || []).join(', ')).filter(Boolean))].slice(0, 3);
      return `<div class="nb-card"><div class="h"><h4>${esc(o.name)}</h4>${gs.length ? `<span class="pill ${w * 2 >= gs.length ? 'w' : 'l'}">${w}–${gs.length - w}</span>` : '<span class="pill m">no games logged</span>'}</div>
        ${gs.length ? `<span class="sub">Last played ${esc(gs[0].day || '')}</span>` : ''}
        ${teamsSeen.length ? `<div><div class="section-label">Teams you've seen</div>${teamsSeen.map(t => `<div class="sub">${esc(t)}</div>`).join('')}</div>` : ''}
        <label>Notes<textarea data-opnotes="${esc(o.id)}" placeholder="How they play, what they lead, how they react when behind">${esc(o.notes || '')}</textarea></label>
        <div class="row" style="justify-content:flex-end"><button class="linkbtn" data-opdel="${esc(o.id)}">Delete</button></div></div>`;
    }).join('') : '<div class="empty">No opponents yet. Type an opponent\'s name when you log a game, or add one above.</div>';
  }
  $('op-add').onclick = () => { const n = $('op-new').value.trim(); if (!n) return; ensureOpponent(n); $('op-new').value = ''; VL.toast('Added ' + n); };
  $('op-q').addEventListener('input', renderOpponents);
  $('op-list').addEventListener('change', e => { const id = e.target.dataset.opnotes; if (!id) return; const o = store.get('opponents', id); if (o) store.put('opponents', id, { name: o.name, notes: e.target.value.trim() }); });
  $('op-list').addEventListener('click', e => { const id = e.target.dataset.opdel; if (id) VL.armDelete(e.target, () => store.del('opponents', id)); });

  // ---------- prediction practice ----------
  // chip states: 0 not brought, 1 brought, 2 lead (also brought)
  let P = null; // { id, stage: 'predict' | 'actual', a, b, sa, sb }
  const splitNames = (s) => String(s || '').split(/[,/\n]+/).map(cap).filter(Boolean).slice(0, 6);
  const canon = (n) => { const i = VL.D.dex ? VL.D.find(n) : -1; return i >= 0 ? VL.D.dex.species[i].n : n; };
  $('pr-form').addEventListener('submit', e => {
    e.preventDefault();
    const a = splitNames($('pr-a').value).map(canon), b = splitNames($('pr-b').value).map(canon);
    const nb = VL.isSingles() ? 3 : 4, nl = VL.isSingles() ? 1 : 2;
    if (a.length < nb || b.length < nb) { VL.toast(`Enter at least ${nb} Pokémon for each player`); return; }
    P = { id: null, stage: 'predict', src: $('pr-src').value.trim() || 'Untitled match', a, b, sa: a.map(() => 0), sb: b.map(() => 0), nb, nl };
    $('pr-a').value = ''; $('pr-b').value = ''; $('pr-src').value = '';
    renderPredict(); $('pr-live').scrollIntoView({ behavior: 'smooth' });
  });
  function stateOk(st) { return st.filter(x => x > 0).length === P.nb && st.filter(x => x === 2).length === P.nl; }
  function picker(label, names, st, key) {
    const brought = st.filter(x => x > 0).length, leads = st.filter(x => x === 2).length;
    return `<div><div class="section-label">${esc(label)} · ${brought}/${P.nb} brought · ${leads}/${P.nl} leading</div><div class="chips">${names.map((n, i) => `<button type="button" class="chip" data-pk="${key}" data-i="${i}" aria-pressed="${st[i] > 0}" style="${st[i] === 2 ? 'border-color:var(--hot);background:var(--hot-soft)' : ''}">${esc(n)}${st[i] === 2 ? ' · lead' : st[i] === 1 ? ' · back' : ''}</button>`).join('')}</div></div>`;
  }
  function renderPredict() {
    const el = $('pr-live');
    if (!P) { el.hidden = true; return; }
    el.hidden = false;
    const ok = stateOk(P.sa) && stateOk(P.sb);
    el.innerHTML = `<div class="card-head"><h3>${P.stage === 'predict' ? 'Your prediction' : 'What actually happened'}: ${esc(P.src)}</h3><button class="linkbtn" id="pr-close">Close</button></div>
      <p class="sub">Tap a Pokémon once to bring it, again to make it a lead, and a third time to leave it out. Each player brings ${P.nb} and leads with ${P.nl}.</p>
      ${picker('Player 1', P.a, P.sa, 'a')}${picker('Player 2', P.b, P.sb, 'b')}
      <div class="row" style="justify-content:flex-end"><button class="btn" id="pr-save" ${ok ? '' : 'disabled'}>${P.stage === 'predict' ? 'Lock in prediction' : 'Score it'}</button></div>`;
    $('pr-close').onclick = () => { P = null; renderPredict(); };
    $('pr-save').onclick = savePredict;
  }
  $('pr-live').addEventListener('click', e => {
    const b = e.target.closest('[data-pk]'); if (!b || !P) return;
    const st = b.dataset.pk === 'a' ? P.sa : P.sb; const i = +b.dataset.i;
    st[i] = (st[i] + 1) % 3;
    if (st[i] === 2 && st.filter(x => x === 2).length > P.nl) st[i] = 0;
    if (st[i] === 1 && st.filter(x => x > 0).length > P.nb) st[i] = 0;
    renderPredict();
  });
  const pick = (names, st, v) => names.filter((n, i) => v === 2 ? st[i] === 2 : st[i] > 0);
  function savePredict() {
    if (P.stage === 'predict') {
      store.put('predictions', VL.newId('p'), { ts: Date.now(), src: P.src, a: P.a, b: P.b, pa4: pick(P.a, P.sa, 1), pal: pick(P.a, P.sa, 2), pb4: pick(P.b, P.sb, 1), pbl: pick(P.b, P.sb, 2), nb: P.nb, nl: P.nl, done: false });
      VL.toast('Locked in. Enter what happened after you watch.');
    } else {
      const r = store.get('predictions', P.id);
      store.put('predictions', P.id, { ...r, id: undefined, aa4: pick(P.a, P.sa, 1), aal: pick(P.a, P.sa, 2), ab4: pick(P.b, P.sb, 1), abl: pick(P.b, P.sb, 2), done: true });
      VL.toast('Scored');
    }
    P = null; renderPredict();
  }
  const overlap = (x, y) => (x || []).filter(n => (y || []).includes(n)).length;
  function score(r) {
    const nb = r.nb || 4, nl = r.nl || 2, bring = overlap(r.pa4, r.aa4) + overlap(r.pb4, r.ab4), lead = overlap(r.pal, r.aal) + overlap(r.pbl, r.abl);
    return { bring, lead, nb, nl, bp: bring / (2 * nb), lp: lead / (2 * nl) };
  }
  function renderPredictions() {
    const all = store.list('predictions').sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const done = all.filter(r => r.done);
    const sc = done.map(score);
    const avg = (arr, k) => arr.length ? arr.reduce((a, s) => a + s[k], 0) / arr.length : null;
    const pct = (x) => x === null ? '–' : `${Math.round(100 * x)}%`;
    const last10 = sc.slice(0, 10); const prev10 = sc.slice(10, 20);
    const diff = avg(last10, 'bp') !== null && avg(prev10, 'bp') !== null ? Math.round(100 * (avg(last10, 'bp') - avg(prev10, 'bp'))) : null;
    $('pr-stats').innerHTML = [
      ['Matches scored', done.length],
      ['Brought Pokémon called correctly', pct(avg(sc, 'bp'))],
      ['Leads called correctly', pct(avg(sc, 'lp'))],
      ['Last 10 vs the 10 before', diff === null ? '–' : `${diff >= 0 ? '+' : ''}${diff} points`],
    ].map(([k, v]) => `<div class="tile"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`).join('');
    $('pr-list').innerHTML = all.length ? all.map(r => {
      const s = r.done ? score(r) : null;
      return `<div class="threat"><div class="h"><div><b>${esc(r.src)}</b> <span class="mini">${new Date(r.ts).toLocaleDateString()}</span></div>
        <div class="kv">${s ? `<span class="pill ${s.bp >= 0.75 ? 'w' : 'l'}">${s.bring}/${2 * s.nb} brought</span><span class="pill ${s.lp >= 0.5 ? 'w' : 'l'}">${s.lead}/${2 * s.nl} leads</span>` : `<button class="btn small" data-pract="${esc(r.id)}">Enter what happened</button>`}<button class="linkbtn" data-prdel="${esc(r.id)}">Delete</button></div></div>
        <ul><li>Player 1 · you called ${esc((r.pa4 || []).join(', '))} (lead ${esc((r.pal || []).join(' + '))})${r.done ? ` · actual ${esc((r.aa4 || []).join(', '))} (lead ${esc((r.aal || []).join(' + '))})` : ''}</li>
        <li>Player 2 · you called ${esc((r.pb4 || []).join(', '))} (lead ${esc((r.pbl || []).join(' + '))})${r.done ? ` · actual ${esc((r.ab4 || []).join(', '))} (lead ${esc((r.abl || []).join(' + '))})` : ''}</li></ul></div>`;
    }).join('') : '<div class="empty">No predictions yet. Next time you watch a top match, pause at team preview and start one above.</div>';
  }
  $('pr-list').addEventListener('click', e => {
    const a = e.target.dataset.pract, d = e.target.dataset.prdel;
    if (a) { const r = store.get('predictions', a); if (!r) return; P = { id: a, stage: 'actual', src: r.src, a: r.a, b: r.b, sa: r.a.map(() => 0), sb: r.b.map(() => 0), nb: r.nb || 4, nl: r.nl || 2 }; renderPredict(); $('pr-live').scrollIntoView({ behavior: 'smooth' }); }
    if (d) VL.armDelete(e.target, () => store.del('predictions', d));
  });

  VL.plan = {
    render() { renderTournaments(); renderOpponents(); renderPredictions(); },
    autoMilestones, ensureOpponent, seasonPoints, seasonOf,
  };
})();
