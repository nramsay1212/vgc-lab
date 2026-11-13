/* News: one timeline of what changed. Everything here is produced by the
 * daily update: data changes (new formats, Pokémon, items, balance changes),
 * monthly usage shifts, tournament results, headlines from VGC news sites,
 * the event calendar and this app's own updates.
 * Also: the "new version is ready" bar, and the update status line. */
(function () {
  'use strict';
  const VL = (window.VL = window.VL || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dateOf = (d) => new Date(d + 'T12:00:00');
  const daysUntil = (d) => Math.round((dateOf(d) - dateOf(dayKey())) / 864e5);
  const niceDay = (d) => { const n = -daysUntil(d); return n === 0 ? 'Today' : n === 1 ? 'Yesterday' : dateOf(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: dateOf(d).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }); };
  const SEEN = 'vgclab-news-seen';

  let NEWS = null, TEAMS = null, STATUS = null, loaded = null;
  let filter = 'all', shown = 40;
  function load() {
    return loaded || (loaded = Promise.all([VL.files.news(), VL.topteams ? VL.topteams.load() : VL.files.teams(), VL.files.status(), VL.meta.ready]).then(([n, t, st]) => {
      NEWS = n || { changes: [], headlines: [], app: [], calendar: [] }; TEAMS = t || { events: [] }; STATUS = st || null; return NEWS;
    }));
  }

  const KINDS = {
    format: ['Rules', 'n'], pokemon: ['Pokémon', 'n'], item: ['Items', 'n'], move: ['Moves', 'n'], ability: ['Abilities', 'n'], balance: ['Balance change', 'l'],
    meta: ['Meta', 'w'], results: ['Results', 'w'], headline: ['Headline', 'm'], app: ['App update', 'm'],
  };
  const GROUP = { format: 'game', pokemon: 'game', item: 'game', move: 'game', ability: 'game', balance: 'game', meta: 'meta', results: 'results', headline: 'headlines', app: 'app' };
  const FILTERS = [['all', 'Everything'], ['game', 'Game and data changes'], ['meta', 'Meta'], ['results', 'Tournament results'], ['headlines', 'Headlines'], ['app', 'App updates']];

  function items() {
    const out = [];
    for (const c of NEWS.changes || []) out.push({ d: c.d, k: KINDS[c.k] ? c.k : 'format', t: c.t, x: c.x || '', go: c.k === 'meta' ? ['meta', 'See the Meta page'] : null });
    for (const ev of TEAMS.events || []) {
      const win = ev.teams.find(t => t.p === 1); if (!win) continue;
      out.push({ d: ev.date, k: 'results', t: `${ev.name}: ${win.who ? win.who + ' won' : 'results are in'}`, x: `${ev.players ? ev.players.toLocaleString() + ' players. ' : ''}Winning team:`, mons: win.mons, ev: ev.id });
    }
    for (const h of NEWS.headlines || []) out.push({ d: h.d, k: 'headline', t: h.t, x: h.s || '', u: h.u });
    for (const a of NEWS.app || []) out.push({ d: a.d, k: 'app', t: a.t });
    const order = { format: 0, balance: 1, pokemon: 2, item: 3, move: 4, ability: 5, meta: 6, results: 7, headline: 8, app: 9 };
    return out.filter(x => x.d && x.t).sort((a, b) => b.d.localeCompare(a.d) || order[a.k] - order[b.k]);
  }
  function seen() { try { return JSON.parse(localStorage.getItem(SEEN) || 'null'); } catch (e) { return null; } }
  function isNew(it, s) { if (!s) return false; return it.d > s.day || (it.d === s.day && NEWS.generated && NEWS.generated > s.at && it.k !== 'app'); }
  function unread() { if (!NEWS) return 0; const s = seen(); if (!s) return items().length ? 1 : 0; return items().filter(it => isNew(it, s)).length; }
  function dot() {
    const n = unread();
    document.querySelectorAll('a[href="#news"]').forEach(a => { let d = a.querySelector('.newdot'); if (n && !d) { d = document.createElement('span'); d.className = 'newdot'; d.title = 'Something new'; a.appendChild(d); } else if (!n && d) d.remove(); });
  }

  // ---------- calendar: automatic list from Limitless, plus hand-written entries that aren't tournaments ----------
  const tidy = (n) => String(n).replace(/^Regional (.+?)(, [A-Z]{2})?$/, '$1 Regional').replace(/^(Special Event .+?), [A-Z]{2}$/, '$1').replace(/^Special Event (.+)$/, '$1 Special Event').replace(/^(International) (.+)$/, '$2 International');
  VL.upcoming = function () {
    const auto = (NEWS && NEWS.calendar) || [];
    const hand = (VL.EVENTS || []).map(([d, n, note]) => ({ d, n, note }));
    if (!auto.length) return hand;
    const isTourney = (n) => /Regional|International|World Championship|Special/i.test(n);
    const extra = hand.filter(h => !isTourney(h.n) || !auto.some(a => Math.abs(daysUntil(a.d) - daysUntil(h.d)) <= 3));
    return [...auto.map(a => ({ d: a.d, n: tidy(a.n), c: a.c, note: '' })), ...extra].sort((a, b) => a.d.localeCompare(b.d));
  };

  function statusHtml() {
    const when = (iso) => iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'not yet';
    const parts = [];
    if (STATUS && STATUS.checked) parts.push(`Last checked for new data: <b>${esc(when(STATUS.checked))}</b>`);
    else if (NEWS && NEWS.generated) parts.push(`News last updated: <b>${esc(when(NEWS.generated))}</b>`);
    parts.push('The app checks every day for new Pokémon data, usage stats, sprites, tournament teams and news.');
    if (STATUS && STATUS.problems && STATUS.problems.length) parts.push(`<span class="bad-t">The last check couldn't update: ${esc(STATUS.problems.join(', '))}. It will try again tomorrow; the previous copy is still in use.</span>`);
    return parts.join(' ');
  }
  function moversHtml() {
    const fid = VL.curFormatId ? VL.curFormatId() : ''; const mv = VL.meta.movers(fid, 4);
    if (!mv || (!mv.up.length && !mv.down.length)) return '';
    const row = (x) => `<div class="mv-row">${VL.sprite(x.n, 'xs', false)}<span>${esc(x.n)}</span><span class="num ${x.d > 0 ? 'good-t' : 'bad-t'}">${x.d > 0 ? '▲ +' : '▼ −'}${Math.abs(x.d).toFixed(1)}</span><span class="mini">${x.u.toFixed(1)}%</span></div>`;
    const mon = (m) => new Date(m + '-15T12:00:00').toLocaleDateString(undefined, { month: 'long' });
    return `<div class="card"><div class="card-head"><h3>Meta movers</h3><a class="sub" href="#meta">${esc(VL.fmtName(fid))} · ${esc(mon(mv.month))} vs ${esc(mon(mv.prev))}</a></div>
      <div class="grid2 tight"><div><div class="section-label">Rising</div>${mv.up.map(row).join('') || '<span class="sub">Nothing much</span>'}</div><div><div class="section-label">Falling</div>${mv.down.map(row).join('') || '<span class="sub">Nothing much</span>'}</div></div>
      <p class="sub">Change in the share of teams using each Pokémon, in percentage points.</p></div>`;
  }
  function calendarHtml(n) {
    const up = VL.upcoming().filter(e => daysUntil(e.d) >= 0).slice(0, n || 6);
    if (!up.length) return '';
    return `<div class="card"><div class="card-head"><h3>Coming up</h3><a class="sub" href="#roadmap">Full calendar</a></div>
      <div class="cal">${up.map(e => { const k = daysUntil(e.d); return `<div><span class="num">${dateOf(e.d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span><span>${esc(e.n)}${e.c ? ` <span class="mini">${esc(e.c)}</span>` : ''}</span><span class="mini">${k === 0 ? 'today' : k === 1 ? 'tomorrow' : `in ${k} days`}</span></div>`; }).join('')}</div></div>`;
  }
  function itemHtml(it, s) {
    const [label, cls] = KINDS[it.k];
    const body = it.u ? `<a href="${esc(it.u)}" target="_blank" rel="noopener noreferrer"><b>${esc(it.t)}</b> ↗</a>` : `<b>${esc(it.t)}</b>`;
    return `<div class="nw-item"><span class="pill ${cls}">${esc(label)}</span><div>${body}${isNew(it, s) ? ' <span class="pill w">new</span>' : ''}
      ${it.x ? `<div class="sub">${esc(it.x)}</div>` : ''}${it.mons ? `<div class="kv" style="margin-top:4px">${VL.spriteRow(it.mons.map(m => VL.topteams ? VL.topteams.shownName(m) : m.n), 'sm')}<button class="linkbtn" data-nwev="${esc(it.ev)}">See the top teams</button></div>` : ''}
      ${it.go ? `<a class="sub" href="#${it.go[0]}">${esc(it.go[1])}</a>` : ''}</div></div>`;
  }
  function render() {
    const root = $('nw-root'); if (!root) return;
    if (!NEWS || !VL.D.dex) { load().then(() => { if (VL.D.dex) render(); }); return; }
    const s = seen(); const all = items();
    const list = all.filter(it => filter === 'all' || GROUP[it.k] === filter);
    const counts = {}; for (const it of all) counts[GROUP[it.k]] = (counts[GROUP[it.k]] || 0) + 1;
    let html = '', last = '';
    for (const it of list.slice(0, shown)) { if (it.d !== last) { html += `<div class="nw-day">${esc(niceDay(it.d))}</div>`; last = it.d; } html += itemHtml(it, s); }
    root.innerHTML = `
      <p class="sub" id="nw-status">${statusHtml()}</p>
      <div class="nw-layout">
        <div class="card"><div class="kv" style="flex-wrap:wrap;gap:6px">${FILTERS.map(([k, l]) => `<button class="chipbtn" data-nwf="${k}" aria-pressed="${filter === k}">${l}${k !== 'all' && counts[k] ? ` <span class="mini">${counts[k]}</span>` : ''}</button>`).join('')}</div>
          <div class="nw-list">${html || `<div class="empty">${filter === 'game' ? 'No game or data changes recorded yet. When a new regulation, Pokémon, item or balance change reaches the data, it shows up here on its own.' : 'Nothing here yet.'}</div>`}</div>
          ${list.length > shown ? '<div class="row" style="justify-content:center"><button class="btn ghost" id="nw-more">Show older</button></div>' : ''}</div>
        <div class="nw-side">${calendarHtml(6)}${moversHtml()}</div>
      </div>`;
    if (location.hash === '#news') { try { localStorage.setItem(SEEN, JSON.stringify({ day: dayKey(), at: new Date().toISOString() })); } catch (e) { /* ignore */ } dot(); }
  }
  document.addEventListener('click', (e) => {
    const f = e.target.closest('[data-nwf]'); if (f) { filter = f.dataset.nwf; shown = 40; render(); return; }
    if (e.target.id === 'nw-more') { shown += 40; render(); return; }
    const ev = e.target.closest('[data-nwev]'); if (ev && VL.topteams) VL.topteams.show(ev.dataset.nwev);
  });

  // ---------- "a new version is ready" ----------
  const myVersion = () => { const el = $('app-version'); const m = el && el.textContent.match(/App version ([0-9a-z]+)/); return m ? m[1] : ''; };
  let barShown = false;
  async function checkVersion() {
    if (barShown || !navigator.onLine) return;
    const st = await fetch('data/status.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
    if (!st || !st.version) return;
    STATUS = st;
    const mine = myVersion(); if (!mine || mine.length < 7 || mine === st.version) return;
    barShown = true;
    const bar = document.createElement('div'); bar.className = 'updatebar'; bar.setAttribute('role', 'status');
    bar.innerHTML = '<span>A new version of the app is ready.</span><button class="btn small" type="button">Refresh</button>';
    bar.querySelector('button').onclick = async () => { try { const r = navigator.serviceWorker && await navigator.serviceWorker.getRegistration(); if (r) await r.update(); } catch (e) { /* ignore */ } location.reload(); };
    document.body.appendChild(bar);
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkVersion(); });
  setInterval(() => { if (document.visibilityState === 'visible') checkVersion(); }, 20 * 60 * 1000);

  function settingsLine() {
    const el = $('update-info'); if (!el || !NEWS) return;
    const d = (iso) => iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'not yet';
    const metaD = VL.meta.data && VL.meta.data.generated;
    el.innerHTML = `${statusHtml()}<br>Usage stats: ${esc(d(metaD))}. Tournament teams: ${esc(d(TEAMS && TEAMS.generated))}. News: ${esc(d(NEWS.generated))}.`;
  }

  VL.news = {
    badge: dot, render, load, items: () => (NEWS ? items() : []), unread, calendarHtml, moversHtml, isReady: () => !!NEWS, niceDay, daysUntil, kinds: KINDS };
  load().then(() => { dot(); settingsLine(); if (location.hash === '#news') render(); VL.onNews && VL.onNews(); setTimeout(checkVersion, 4000); });
})();
