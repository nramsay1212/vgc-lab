/* Regulation change report: what changed from the previous regulation to the current one, and what
 * that means for your saved teams. Shown in News under Meta. A banner announces a new regulation the
 * first time you open the app after it goes live (once per play style, remembered in your account).
 *  - Pokémon and items now legal or no longer legal: the two formats' lists, compared.
 *  - Balance changes (stats, moves, abilities, items): one copy of the game's data is kept, so a patch
 *    changes it in place. The daily update records each change in full in data/changelog.json. */
(function () {
  'use strict';
  const VL = (window.VL = window.VL || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toId = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const pad = (n) => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const niceDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  const STAT = ['HP', 'Attack', 'Defense', 'Sp. Atk', 'Sp. Def', 'Speed'];
  const style = () => (VL.style ? VL.style() : 'doubles');

  let LOG = null;
  const loadLog = () => (LOG ? Promise.resolve(LOG) : VL.files.get('changelog').then(j => { LOG = (j && j.entries) || []; return LOG; }));

  // the current regulation for a play style, and the one before it (the formats list is newest first)
  function pair(st) {
    const all = VL.D && VL.D.dex ? VL.D.allFormats() : []; const dbl = st !== 'singles';
    const i = all.findIndex(f => f.current && !!f.doubles === dbl); if (i < 0) return {};
    const prev = all.slice(i + 1).find(f => !!f.doubles === dbl && !f.current);
    return { cur: all[i], prev };
  }
  const seenRec = () => (VL.store.get('meta', 'regseen') || {});

  function build(st) {
    const { cur, prev } = pair(st); if (!cur) return null;
    const D = VL.D; const sp = D.dex.species;
    const names = (f) => new Set((f ? f.species : []).map(i => sp[i] && sp[i].n).filter(Boolean));
    const nowL = names(cur), oldL = names(prev);
    const inn = [...nowL].filter(n => !oldL.has(n)), out = prev ? [...oldL].filter(n => !nowL.has(n)) : [];
    const itemN = (ids) => ids.map(id => D.dex.items[id] && D.dex.items[id].n).filter(Boolean);
    const iIn = prev ? itemN(cur.items.filter(i => !prev.items.includes(i))) : [], iOut = prev ? itemN(prev.items.filter(i => !cur.items.includes(i))) : [];
    // balance changes since this regulation began
    // when it became current: from the daily update's record if it saw the switch, else when you first saw it
    const logged = ((LOG || []).find(e => (e.current || []).some(c => c.id === cur.id)) || {}).d || null;
    const start = logged || (seenRec()[st] || {}).since || null;
    const since = (LOG || []).filter(e => !start || e.d >= start);
    const legalItems = new Set(cur.items);
    const stats = since.flatMap(e => e.stats.filter(x => nowL.has(x.n)).map(x => ({ ...x, d: e.d })));
    const moves = since.flatMap(e => e.moves.map(x => ({ ...x, d: e.d })));
    const abilities = since.flatMap(e => e.abilities.map(x => ({ ...x, d: e.d })));
    const items = since.flatMap(e => e.items.filter(x => legalItems.has(x.id)).map(x => ({ ...x, d: e.d })));
    // your saved teams (this play style), checked against the current regulation
    const teams = [];
    for (const t of VL.store.list('teams')) {
      if (!t.paste || !VL.builder || !VL.builder.parsePaste) continue;
      const sets = VL.builder.parsePaste(t.paste).filter(x => x && x.species);
      const notes = [];
      for (const s of sets) {
        const i = D.find(s.species); const n = i >= 0 ? sp[i].n : s.species;
        if (i >= 0 && !cur.species.includes(i)) notes.push({ bad: true, t: `${n} isn't legal in ${cur.name}` });
        if (s.item && legalItems.size && !legalItems.has(toId(s.item)) && D.dex.items[toId(s.item)]) notes.push({ bad: true, t: `${n}'s ${s.item} isn't legal in ${cur.name}` });
        for (const x of stats) if (x.n === n || toId(x.n) === toId(s.species)) notes.push({ t: `${n}: ${typeof x.k === 'number' ? STAT[x.k] : x.k} ${x.from} → ${x.to}` });
        for (const x of moves) if ((s.moves || []).some(m => toId(m) === x.id)) notes.push({ t: `${n}'s ${x.n}: ${x.k} ${x.from ?? '–'} → ${x.to ?? '–'}` });
        for (const x of abilities) if (s.ability && toId(s.ability) === x.id) notes.push({ t: `${n}'s ${x.n} changed: ${x.to}` });
        for (const x of items) if (s.item && toId(s.item) === x.id) notes.push({ t: `${n}'s ${x.n} changed: ${x.to}` });
      }
      teams.push({ t, notes });
    }
    return { cur, prev, start, logged, inn, out, iIn, iOut, stats, moves, abilities, items, teams };
  }

  function html(r) {
    if (!r) return '';
    const sprites = (list) => list.length ? `<div class="rr-mons">${list.map(n => `<span class="rr-mon">${VL.sprite ? VL.sprite(n, 'sm', false) : ''}${esc(n)}</span>`).join('')}</div>` : '<p class="sub">None.</p>';
    const plain = (list) => list.length ? `<p>${list.map(esc).join(', ')}</p>` : '<p class="sub">None.</p>';
    const bal = r.stats.length + r.moves.length + r.abilities.length + r.items.length;
    const hit = r.teams.filter(x => x.notes.length);
    const row = (a, b) => `<tr><td>${a}</td><td>${b}</td></tr>`;
    const balance = bal ? `<table class="list rr-bal"><tbody>${[
      ...r.stats.map(x => row(`<b>${esc(x.n)}</b>`, `${typeof x.k === 'number' ? STAT[x.k] : esc(x.k)} ${esc(x.from)} → <b>${esc(x.to)}</b>`)),
      ...r.moves.map(x => row(`<b>${esc(x.n)}</b> <span class="mini">move</span>`, `${esc(x.k)} ${esc(x.from ?? '–')} → <b>${esc(x.to ?? '–')}</b>`)),
      ...r.abilities.map(x => row(`<b>${esc(x.n)}</b> <span class="mini">ability</span>`, `<span class="sub">Was:</span> ${esc(x.from)}<br><span class="sub">Now:</span> ${esc(x.to)}`)),
      ...r.items.map(x => row(`<b>${esc(x.n)}</b> <span class="mini">item</span>`, `<span class="sub">Was:</span> ${esc(x.from)}<br><span class="sub">Now:</span> ${esc(x.to)}`)),
    ].join('')}</tbody></table>` : `<p class="sub">No balance changes recorded${r.start ? ` since ${esc(niceDate(r.start))}` : ''}. Patches show up here the day the data updates.</p>`;
    return `<div class="card rr-card" id="rr-card">
      <div class="card-head"><div><h3>Regulation change report</h3><div class="sub">${esc(r.cur.name)}${r.prev ? `, compared with ${esc(r.prev.name)}` : ''}${r.logged ? ` · current since ${esc(niceDate(r.logged))}` : ''}</div></div></div>
      <div class="kv rr-sum">${[[r.inn.length, 'Pokémon added'], [r.out.length, 'Pokémon removed'], [r.iIn.length + r.iOut.length, 'item changes'], [bal, 'balance changes'], [hit.length, `of your ${r.teams.length} team${r.teams.length === 1 ? '' : 's'} affected`]].map(([n, l]) => `<span class="pill ${n ? 'n' : 'm'}">${n} ${esc(l)}</span>`).join('')}</div>
      <details class="rr-sec" ${hit.length ? 'open' : ''}><summary><b>Your teams</b> <span class="sub">${hit.length ? `${hit.length} need a look` : 'all fine'}</span></summary>
        ${r.teams.length ? r.teams.map(x => `<div class="rr-team"><b>${esc(x.t.name || 'Saved team')}</b> ${x.notes.length ? x.notes.map(n => `<div class="${n.bad ? 'bad-t' : ''}">${esc(n.t)}</div>`).join('') : '<span class="sub">Nothing changed for this team.</span>'}</div>`).join('') : '<p class="sub">No saved teams yet.</p>'}</details>
      <details class="rr-sec" ${r.inn.length ? '' : ''}><summary><b>Pokémon now legal</b> <span class="sub">${r.inn.length}</span></summary>${sprites(r.inn)}</details>
      <details class="rr-sec"><summary><b>Pokémon no longer legal</b> <span class="sub">${r.out.length}</span></summary>${sprites(r.out)}</details>
      <details class="rr-sec"><summary><b>Items</b> <span class="sub">${r.iIn.length} added · ${r.iOut.length} removed</span></summary><div class="section-label">Now legal</div>${plain(r.iIn)}<div class="section-label">No longer legal</div>${plain(r.iOut)}</details>
      <details class="rr-sec" ${bal ? 'open' : ''}><summary><b>Balance changes</b> <span class="sub">${bal}</span></summary>${balance}</details>
    </div>`;
  }

  // ---------- the banner: once per new regulation, per play style ----------
  function remember(st, id, since) { const s = seenRec(); const rec = { ...s }; delete rec.id; delete rec.u; delete rec.style; rec[st] = { id, since }; VL.store.put('meta', 'regseen', rec); }
  function banner() {
    const st = style(); const { cur, prev } = pair(st); if (!cur) return;
    const s = seenRec()[st];
    if (!s) { remember(st, cur.id, today()); return; } // first time using the app: nothing to announce
    if (s.id === cur.id) return;
    if ($('reg-banner')) return;
    const b = document.createElement('div'); b.id = 'reg-banner'; b.className = 'reg-banner'; b.setAttribute('role', 'status');
    b.innerHTML = `<span><b>New regulation: ${esc(cur.name)}</b> is live${prev ? `, replacing ${esc(prev.name)}` : ''}.</span><button type="button" class="btn small" id="reg-see">See what changed</button><button type="button" class="linkbtn" id="reg-x">Dismiss</button>`;
    const wrap = document.querySelector('.wrap'); wrap.insertBefore(b, wrap.firstChild.nextSibling);
    const refit = () => setTimeout(() => { VL.fitToday && VL.fitToday(); }, 30); refit(); // Today on the widescreen fits around it
    const done = () => { remember(st, cur.id, today()); b.remove(); refit(); };
    $('reg-see').onclick = () => { done(); open(); };
    $('reg-x').onclick = done;
  }
  function open() {
    location.hash = 'news';
    setTimeout(() => { if (VL.news && VL.news.showMeta) VL.news.showMeta(); setTimeout(() => { const c = $('rr-card'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 150); }, 80);
  }

  function start() {
    if (!VL.D || !VL.D.dex || !VL.store) { setTimeout(start, 300); return; }
    loadLog().then(() => (VL.whenDataReady ? VL.whenDataReady(banner) : banner()));
  }
  start();

  VL.regReport = { build, html, ready: () => loadLog(), open, pair, banner };
})();
