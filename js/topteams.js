/* Top teams: the highest-placing teams at recent official and online
 * tournaments, from data/teams.json (rebuilt by the daily update), plus every
 * past official event by season from data/teams/<season>.json. Browse by
 * event, style or Pokémon, open a team in the builder, or practice against it. */
(function () {
  'use strict';
  const VL = (window.VL = window.VL || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toId = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const place = (p) => p === 1 ? '1st' : p === 2 ? '2nd' : p === 3 ? '3rd' : `${p}th`;
  const dateText = (d) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  let DATA = null, loading = null;
  const S = { season: '', scope: 'official', tag: '', mon: '', q: '', top: 32, open: new Set(), shown: 40 };
  function load() { return loading || (loading = VL.files.teams().then(j => { DATA = j && Array.isArray(j.events) ? j : { events: [] }; DATA.events.forEach(ev => ev.teams.forEach((t, k) => { t.key = ev.id + ':' + k; t.tags = VL.teamTags(t.mons); t.ev = ev; })); return DATA; })); }

  // past seasons: every finished official event, one file per season, loaded when picked
  const ARCH = { index: null, got: {}, wait: {} };
  function loadIndex() { return ARCH.wait.index || (ARCH.wait.index = fetch('data/teams/index.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(j => { ARCH.index = (j && j.seasons) || {}; return ARCH.index; }).catch(() => { ARCH.index = {}; return ARCH.index; })); }
  function loadSeason(k) {
    return ARCH.wait[k] || (ARCH.wait[k] = fetch(`data/teams/${k}.json`).then(r => r.ok ? r.json() : null).then(j => {
      const evs = j && Array.isArray(j.events) ? j.events : [];
      evs.forEach(ev => ev.teams.forEach((t, i) => { t.key = 's' + k + ':' + ev.id + ':' + i; t.tags = VL.teamTags(t.mons); t.ev = ev; }));
      ARCH.got[k] = evs; return evs;
    }).catch(() => { delete ARCH.wait[k]; return null; }));
  }
  const pool = () => S.season ? (ARCH.got[S.season] || []) : DATA.events;
  const seasonLabel = (k) => `${k} season (September ${k - 1} to August ${k})`;

  // the Mega a Pokémon becomes with its item, so sun teams show Mega Charizard Y and so on
  function shownName(m) {
    const D = VL.D; if (!D || !D.dex) return m.n;
    const i = D.find(m.n); if (i < 0) return m.n;
    const k = D.megaOf(D.dex.species[i], m.i); return k === null ? m.n : D.dex.species[k].n;
  }
  function scopeTeams() {
    const evs = pool().filter(ev => S.scope === 'all' ? true : S.scope === 'official' || S.scope === 'online' ? ev.src === S.scope : ev.id === S.scope);
    return evs.flatMap(ev => ev.teams.filter(t => t.p <= S.top));
  }
  function usage(teams) {
    const c = {}; for (const t of teams) for (const m of t.mons) { const n = shownName(m); c[n] = (c[n] || 0) + 1; }
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }
  function teamCard(t, showEvent) {
    const open = S.open.has(t.key);
    const D = VL.D;
    const mons = t.mons.map(m => {
      const mv = (m.m || []).map(x => { const r = D.dex ? D.move(x, D.format(t.ev.fmt)) : null; return `<span class="tt-mv">${r ? `<i class="ty ${esc(r.t)}"></i>` : ''}${esc(x)}</span>`; }).join('');
      return open
        ? `<div class="tt-mon full">${VL.sprite(shownName(m), 'md')}<div><b>${esc(m.n)}</b><div class="sub">${m.i ? VL.itemIcon(m.i) + esc(m.i) : 'No item'}</div><div class="sub">${esc(m.a || '')}${m.na ? ' · ' + esc(m.na) : ''}${m.t ? ' · Tera ' + esc(m.t) : ''}</div><div class="tt-mvs">${mv}</div></div></div>`
        : `<div class="tt-mon">${VL.sprite(shownName(m), 'md')}<span class="itm">${m.i ? VL.itemIcon(m.i) : ''}</span></div>`;
    }).join('');
    return `<div class="card tt-team" data-team="${esc(t.key)}">
      <div class="card-head"><div class="kv"><span class="pill ${t.p <= 1 ? 'w' : t.p <= 8 ? 'n' : 'm'}">${place(t.p)}</span><b>${esc(t.who || 'Unknown player')}</b>${t.c ? `<span class="mini">${esc(t.c)}</span>` : ''}${t.rec ? `<span class="mini">${esc(t.rec)}</span>` : ''}</div>
        <div class="kv">${t.tags.map(x => `<span class="pill m">${esc(x)}</span>`).join('')}</div></div>
      ${showEvent ? `<div class="sub">${esc(t.ev.name)} · ${dateText(t.ev.date)}${t.ev.rule ? ' · ' + esc(t.ev.rule) : ''}</div>` : ''}
      <div class="tt-mons ${open ? 'open' : ''}">${mons}</div>
      <div class="row" style="justify-content:flex-end;gap:6px"><button class="btn ghost small" data-tt="toggle">${open ? 'Hide details' : 'Full team sheet'}</button><button class="btn ghost small" data-tt="copy">Copy as text</button><button class="btn ghost small" data-tt="practice">Practice against it</button><button class="btn small" data-tt="build">Open in builder</button></div>
    </div>`;
  }
  function render() {
    const root = $('tt-root'); if (!root) return;
    if (!VL.D.dex) { root.innerHTML = '<p class="sub">Loading the Pokémon data…</p>'; return; }
    if (!DATA) { load().then(render); return; }
    if (ARCH.index === null) loadIndex().then(() => { if (location.hash === '#topteams') render(); });
    if (S.season && !ARCH.got[S.season]) { root.innerHTML = `<p class="sub">Loading the ${esc(seasonLabel(+S.season))}…</p>`; loadSeason(S.season).then(x => { if (!x) { S.season = ''; VL.toast('Couldn\'t load that season. Check your connection and try again.'); } render(); }); return; }
    if (!DATA.events.length && !S.season) { root.innerHTML = '<div class="empty">No tournament teams yet. They\'re added by the daily update when results are published.</div>'; return; }
    if (S.scope !== 'all' && S.scope !== 'official' && S.scope !== 'online' && !pool().some(e => e.id === S.scope)) S.scope = 'official';
    if (S.scope === 'official' && !pool().some(e => e.src === 'official')) S.scope = 'all';
    const off = DATA.events.filter(e => e.src === 'official'), on = DATA.events.filter(e => e.src === 'online');
    const all = scopeTeams();
    const tagCount = {}; for (const t of all) for (const x of t.tags) tagCount[x] = (tagCount[x] || 0) + 1;
    const use = usage(all);
    const q = toId(S.q);
    const list = all.filter(t => (!S.tag || t.tags.includes(S.tag)) && (!S.mon || t.mons.some(m => shownName(m) === S.mon || m.n === S.mon)) && (!q || toId(t.who).includes(q) || t.mons.some(m => toId(m.n).includes(q))))
      .sort((a, b) => (a.p - b.p) || String(b.ev.date).localeCompare(String(a.ev.date)));
    const single = pool().find(e => e.id === S.scope);
    const inSeason = !!S.season;
    const pick = (v) => !inSeason && S.scope === v ? 'selected' : '';
    const opt = (ev) => `<option value="${esc(ev.id)}" ${pick(ev.id)}>${esc(ev.name)} · ${dateText(ev.date)}</option>`;
    const seasons = Object.entries(ARCH.index || {}).sort((a, b) => b[0].localeCompare(a[0]));
    const seasonOpts = seasons.length ? `<optgroup label="Past seasons, every official event">${seasons.map(([k, v]) => `<option value="season:${esc(k)}" ${inSeason && S.season === k && S.scope === 'official' ? 'selected' : ''}>${esc(seasonLabel(+k))} · ${v.events} events</option>`).join('')}</optgroup>` : '';
    const seasonEvents = inSeason ? `<optgroup label="Events in the ${esc(S.season)} season">${pool().map(ev => `<option value="S:${esc(ev.id)}" ${S.scope === ev.id ? 'selected' : ''}>${esc(ev.name)} · ${dateText(ev.date)}</option>`).join('')}</optgroup>` : '';
    root.innerHTML = `${VL.isSingles && VL.isSingles() ? '<div class="banner" style="background:var(--accent-soft)">Official tournaments are played in doubles, so every team here is a doubles team.</div>' : ''}
      <div class="card"><div class="row">
        <label for="tt-scope">Event<select id="tt-scope"><optgroup label="Recent"><option value="official" ${pick('official')}>Recent official events (${off.length})</option><option value="online" ${pick('online')}>Recent online tournaments (${on.length})</option><option value="all" ${pick('all')}>Everything recent</option></optgroup>
          ${off.length ? `<optgroup label="Recent official events">${off.map(opt).join('')}</optgroup>` : ''}${on.length ? `<optgroup label="Recent online tournaments">${on.map(opt).join('')}</optgroup>` : ''}${seasonOpts}${seasonEvents}</select></label>
        <label for="tt-top">Placing<select id="tt-top">${[[4, 'Top 4'], [8, 'Top 8'], [16, 'Top 16'], [32, 'Top 32']].map(([v, l]) => `<option value="${v}" ${S.top === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label for="tt-q">Search player or Pokémon<input type="search" id="tt-q" value="${esc(S.q)}" placeholder="Type a name"></label></div>
        ${single ? `<p class="sub">${esc(single.name)} · ${dateText(single.date)} · ${single.players ? single.players.toLocaleString() + ' players · ' : ''}${esc(single.rule || VL.fmtName(single.fmt))}${single.live ? ' · still in progress' : ''} · <a href="${esc(single.url)}" target="_blank" rel="noopener">full standings</a></p>` : `<p class="sub">${all.length} teams from ${new Set(all.map(t => t.ev.id)).size} events. Official results come from <a href="${esc((DATA.sources && DATA.sources[0] && DATA.sources[0].url) || '#')}" target="_blank" rel="noopener">Pokédata</a>, online ones from <a href="${esc((DATA.sources && DATA.sources[1] && DATA.sources[1].url) || '#')}" target="_blank" rel="noopener">Limitless</a>. Updated ${DATA.generated ? dateText(DATA.generated.slice(0, 10)) : ''}.</p>`}
        <div class="kv" style="flex-wrap:wrap;gap:6px"><span class="mini">Style</span><button class="chipbtn" data-tag="" aria-pressed="${!S.tag}">Any</button>${Object.entries(tagCount).sort((a, b) => b[1] - a[1]).map(([x, n]) => `<button class="chipbtn" data-tag="${esc(x)}" aria-pressed="${S.tag === x}">${esc(x)} <span class="mini">${n}</span></button>`).join('')}</div>
      </div>
      <div class="card"><div class="card-head"><h3>Most used in these ${all.length} teams</h3><span class="sub">Tap a Pokémon to see only teams with it</span></div>
        <div class="tt-usage">${use.slice(0, 18).map(([n, c]) => `<button class="tt-use" data-mon="${esc(n)}" aria-pressed="${S.mon === n}">${VL.sprite(n, 'sm')}<span>${esc(n)}</span><span class="mini">${Math.round(100 * c / Math.max(1, all.length))}%</span></button>`).join('')}</div>
        ${S.mon ? `<div class="kv"><span class="sub">Showing teams with <b>${esc(S.mon)}</b></span><button class="linkbtn" data-mon="">Clear</button></div>` : ''}</div>
      <div class="sub">${list.length} team${list.length === 1 ? '' : 's'}</div>
      <div class="tt-grid">${list.slice(0, S.shown).map(t => teamCard(t, !single)).join('') || '<div class="empty">No teams match those filters.</div>'}</div>
      ${list.length > S.shown ? `<div class="row" style="justify-content:center"><button class="btn ghost" id="tt-more">Show more</button></div>` : ''}`;
  }

  // Team sheets don't show Stat Points, so fill in the most common spread that matches each nature
  function builderText(t) {
    const D = VL.D; const fmt = D.format(t.ev.fmt); const e = !VL.meta ? null : t.ev.meta ? VL.meta.lookup(t.ev.meta) : VL.meta.forFormat(fmt.id);
    const SH = ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'];
    return t.mons.map(m => {
      const meta = e ? (VL.meta.get(e, shownName(m)) || VL.meta.get(e, m.n)) : null;
      let ev = '';
      if (meta && meta.spreads) { const hit = meta.spreads.find(sp => sp[0].split(':')[0] === m.na) || (!m.na && meta.spreads[0]); if (hit) { const nums = hit[0].split(':')[1].split('/').map(Number); ev = nums.map((v, i) => v ? `${v} ${SH[i]}` : '').filter(Boolean).join(' / '); } }
      return [`${m.n}${m.i ? ' @ ' + m.i : ''}`, m.a ? `Ability: ${m.a}` : '', 'Level: 50', m.t ? `Tera Type: ${m.t}` : '', ev ? `EVs: ${ev}` : '', m.na ? `${m.na} Nature` : '', ...(m.m || []).map(x => `- ${x}`)].filter(Boolean).join('\n');
    }).join('\n\n');
  }
  function find(key) { for (const evs of [DATA.events, ...Object.values(ARCH.got)]) for (const ev of evs) for (const t of ev.teams) if (t.key === key) return t; return null; }

  document.addEventListener('click', async (e) => {
    const root = $('tt-root'); if (!root || !root.contains(e.target)) return;
    const tg = e.target.closest('[data-tag]'); if (tg) { S.tag = tg.dataset.tag; S.shown = 40; render(); return; }
    const mn = e.target.closest('[data-mon]'); if (mn) { S.mon = S.mon === mn.dataset.mon ? '' : mn.dataset.mon; S.shown = 40; render(); return; }
    if (e.target.id === 'tt-more') { S.shown += 40; render(); return; }
    const b = e.target.closest('[data-tt]'); if (!b) return;
    const card = b.closest('[data-team]'); const t = card && find(card.dataset.team); if (!t) return;
    const k = b.dataset.tt;
    if (k === 'toggle') { if (S.open.has(t.key)) S.open.delete(t.key); else S.open.add(t.key); const y = card.getBoundingClientRect().top; render(); const again = document.querySelector(`[data-team="${CSS.escape(t.key)}"]`); if (again) window.scrollBy(0, again.getBoundingClientRect().top - y); }
    if (k === 'copy') { try { await navigator.clipboard.writeText(VL.teamText(t.mons)); VL.toast('Team copied'); } catch (err) { VL.toast('Couldn\'t copy. Open the full team sheet instead.'); } }
    if (k === 'practice') { VL.sheets && VL.sheets.start({ mons: t.mons, label: `${t.who || 'Unknown player'}, ${place(t.p)} at ${t.ev.name}`, fmt: t.ev.fmt }); }
    if (k === 'build') {
      if (VL.meta) await VL.meta.load(t.ev.meta || t.ev.fmt); // the matching usage stats give each Pokémon a likely spread
      const id = VL.newId('t');
      VL.store.put('teams', id, { ts: Date.now(), name: `${t.who || 'Top team'} (${place(t.p)}, ${t.ev.name})`.slice(0, 60), fmt: t.ev.fmt, paste: builderText(t), why: '', weak: '', src: `${place(t.p)} place at ${t.ev.name}, ${dateText(t.ev.date)}` });
      VL.builder && VL.builder.open(id); location.hash = 'teams';
      VL.toast('Copied to your teams. Stat Points use the most common spread, since team sheets don\'t show them.');
    }
  });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'tt-scope') {
      const v = e.target.value;
      if (v.startsWith('season:')) { S.season = v.slice(7); S.scope = 'official'; } else if (v.startsWith('S:')) S.scope = v.slice(2); else { S.season = ''; S.scope = v; }
      S.tag = ''; S.mon = ''; S.shown = 40; render();
    }
    if (e.target.id === 'tt-top') { S.top = +e.target.value; S.shown = 40; render(); }
  });
  let qTimer = null;
  document.addEventListener('input', (e) => { if (e.target.id !== 'tt-q') return; S.q = e.target.value; clearTimeout(qTimer); qTimer = setTimeout(() => { const pos = e.target.selectionStart; render(); const el = $('tt-q'); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (x) { /* ignore */ } } }, 200); });

  VL.topteams = {
    render, load,
    show(eventId) { S.season = ''; S.scope = eventId || 'official'; S.tag = ''; S.mon = ''; S.q = ''; location.hash = 'topteams'; render(); },
    random(fmtDoubles) { if (!DATA) return null; const pool = DATA.events.filter(e => e.src === 'official').flatMap(e => e.teams.filter(t => t.p <= 16)); const all = pool.length ? pool : DATA.events.flatMap(e => e.teams); return all.length ? all[Math.floor(Math.random() * all.length)] : null; },
    place, shownName,
  };
})();
