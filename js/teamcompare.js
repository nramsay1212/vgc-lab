/* Team comparison: the teams you've played, side by side. For each one, from your game log:
 * the record and progress toward 10 games, the most common mistake tags, the Pokémon you lose
 * to most, and your best and worst leads. Made for trying a few archetypes (Trick Room,
 * Tailwind, weather...) for about 10 games each and then committing to one. */
(function () {
  'use strict';
  const VL = (window.VL = window.VL || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = () => VL.store;
  const STYLES = ['Trick Room', 'Tailwind', 'Rain', 'Sun', 'Sand', 'Snow', 'Balance', 'Hyper offense', 'Other'];
  const GOAL = 10;
  const pct = (w, n) => (n ? Math.round(100 * w / n) : 0);
  const split = (s) => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
  let mode = 'all';

  // what's saved: which teams are on the page, and the style you gave each
  function cfg() { return store().get('meta', 'teamcompare') || { ids: null, style: {} }; }
  function putCfg(c) { store().put('meta', 'teamcompare', c); }
  const teams = () => store().list('teams').sort((a, b) => (b.ts || 0) - (a.ts || 0));
  function gamesFor(id) {
    return store().list('games').filter(g => g.team === id && (mode === 'all' || (mode === 'test' ? g.mode === 'test' : g.mode !== 'test')))
      .sort((a, b) => (b.ts || 0) - (a.ts || 0));
  }
  function shown() {
    const c = cfg(); const all = teams(); const ids = new Set(all.map(t => t.id));
    if (Array.isArray(c.ids)) return c.ids.filter(id => ids.has(id));
    // to start: your three most played teams
    const count = (t) => store().list('games').filter(g => g.team === t.id).length;
    return all.filter(t => count(t) > 0).sort((a, b) => count(b) - count(a)).slice(0, 3).map(t => t.id);
  }

  function stats(t) {
    const g = gamesFor(t.id); const w = g.filter(x => x.result === 'W').length; const losses = g.filter(x => x.result === 'L');
    const TAG = Object.fromEntries(VL.ALLTAGS || []);
    const tags = {}; for (const x of losses) for (const k of (x.tags || [])) tags[k] = (tags[k] || 0) + 1;
    const topTags = Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => ({ name: TAG[k] || k, n }));
    const opp = {}; for (const x of g) for (const n of (x.opp || [])) { const o = (opp[n] ||= { n: 0, w: 0 }); o.n++; if (x.result === 'W') o.w++; }
    const beats = Object.entries(opp).map(([name, o]) => ({ name, ...o, l: o.n - o.w })).filter(o => o.l >= 2 || (o.n >= 2 && o.l >= 1))
      .sort((a, b) => b.l - a.l || (b.l / b.n) - (a.l / a.n)).slice(0, 4); // most losses first
    const leads = {}; for (const x of g) { const k = split(x.mylead).sort().join(' + '); if (!k) continue; const o = (leads[k] ||= { n: 0, w: 0 }); o.n++; if (x.result === 'W') o.w++; }
    const ls = Object.entries(leads).map(([k, o]) => ({ k, ...o })).filter(o => o.n >= 2).sort((a, b) => pct(b.w, b.n) - pct(a.w, a.n) || b.n - a.n);
    const bestLead = ls[0] || null, worstLead = ls.length > 1 ? ls[ls.length - 1] : null;
    return { g, n: g.length, w, l: g.length - w, wr: pct(w, g.length), losses: losses.length, topTags, beats, bestLead, worstLead, last: g[0] ? g[0].day : null };
  }

  function card(t, s, style) {
    const sets = (VL.builder && VL.builder.parsePaste ? VL.builder.parsePaste(t.paste || '') : []).filter(x => x && x.species);
    const fmt = VL.D && VL.D.dex && t.fmt ? VL.D.format(t.fmt) : null;
    const prog = Math.min(100, Math.round(100 * s.n / GOAL));
    const leadLine = (o, label) => o ? `<div><span class="sub">${label}</span> ${esc(o.k)} <b>${o.w}–${o.n - o.w}</b></div>` : '';
    return `<div class="card tc-card">
      <div class="tc-head"><div><b class="tc-name">${esc(t.name || 'Untitled team')}</b>${fmt ? `<div class="sub">${esc(fmt.name)}</div>` : ''}</div><button type="button" class="linkbtn" data-tcrm="${esc(t.id)}" aria-label="Take ${esc(t.name || 'this team')} off the comparison">Remove</button></div>
      <div class="sprrow tc-mons">${sets.map(x => VL.sprite(x.species, 'xs')).join('')}</div>
      <label class="tc-style">Style<select data-tcstyle="${esc(t.id)}"><option value="">Not set</option>${STYLES.map(x => `<option ${x === style ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      <div class="tc-rec"><span class="num">${s.n ? s.wr + '%' : '–'}</span><span class="sub">${s.n ? `${s.w}–${s.l} in ${s.n} game${s.n === 1 ? '' : 's'}` : 'No games logged with this team yet'}</span></div>
      <div class="tc-prog" title="${s.n} of ${GOAL} games"><i style="width:${prog}%"></i></div>
      <div class="sub">${s.n >= GOAL ? `${GOAL}+ games: enough to judge it.` : `${GOAL - s.n} more game${GOAL - s.n === 1 ? '' : 's'} to reach ${GOAL}.`}${s.last ? ` Last played ${esc(s.last)}.` : ''}</div>
      <div class="section-label">Most common mistakes</div>
      ${s.topTags.length ? s.topTags.map(x => `<div>${esc(x.name)} <span class="sub">in ${x.n} of ${s.losses} loss${s.losses === 1 ? '' : 'es'}</span></div>`).join('') : `<div class="sub">${s.losses ? 'No mistake tags on the losses yet.' : 'No losses yet.'}</div>`}
      <div class="section-label">Pokémon you lose to</div>
      ${s.beats.length ? s.beats.map(o => `<div class="kv">${VL.sprite(o.name, 'xs', false)}${esc(o.name)} <b class="bad-t">${o.l} loss${o.l === 1 ? '' : 'es'}</b> <span class="sub">(${o.w}–${o.l} against it)</span></div>`).join('') : '<div class="sub">Nothing has beaten this team twice yet.</div>'}
      <div class="section-label">Leads</div>
      ${s.bestLead ? leadLine(s.bestLead, 'Best:') + (s.worstLead && s.worstLead.k !== s.bestLead.k ? leadLine(s.worstLead, 'Worst:') : '') : '<div class="sub">Log your lead in 2+ games to compare.</div>'}
      <div class="kv tc-links"><a class="btn small ghost" href="#teams" data-tcopen="${esc(t.id)}">Open in builder</a></div>
    </div>`;
  }

  function summary(rows) {
    const played = rows.filter(r => r.s.n);
    if (played.length < 2) return '';
    const ready = played.filter(r => r.s.n >= GOAL).sort((a, b) => b.s.wr - a.s.wr);
    const line = ready.length >= 2
      ? `<b>${esc(ready[0].t.name)}</b> is ahead: ${ready[0].s.wr}% over ${ready[0].s.n} games, against ${ready.slice(1).map(r => `${esc(r.t.name)} ${r.s.wr}%`).join(', ')}.`
      : `Play at least ${GOAL} games with each before deciding. ${played.filter(r => r.s.n < GOAL).map(r => `${esc(r.t.name)} needs ${GOAL - r.s.n} more`).join(', ')}.`;
    return `<div class="card"><div class="card-head"><h3>So far</h3><span class="sub">${mode === 'all' ? 'Climb and testing games' : mode === 'test' ? 'Testing games only' : 'Climb games only'}</span></div><p style="margin:0">${line}</p>
      <div class="scroll"><table class="list"><thead><tr><th>Team</th><th>Style</th><th>Games</th><th>Win rate</th><th>Top mistake</th><th>Loses to most</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.t.name || 'Untitled team')}</td><td>${esc(r.style || '–')}</td><td class="num">${r.s.n}</td><td class="num">${r.s.n ? r.s.wr + '%' : '–'}</td><td>${r.s.topTags[0] ? esc(r.s.topTags[0].name) : '–'}</td><td>${r.s.beats[0] ? `${esc(r.s.beats[0].name)} (${r.s.beats[0].l} loss${r.s.beats[0].l === 1 ? '' : 'es'})` : '–'}</td></tr>`).join('')}</tbody></table></div></div>`;
  }

  function render() {
    const root = $('tc-root'); if (!root || !store()) return;
    const all = teams();
    if (!all.length) { root.innerHTML = '<div class="card"><p class="sub" style="margin:0">No saved teams yet. Build or import one in the <a href="#teams">Team builder</a>, or open one from <a href="#topteams">Top teams</a>, then pick it when you log games.</p></div>'; return; }
    const ids = shown(); const c = cfg();
    const count = (t) => store().list('games').filter(g => g.team === t.id).length;
    const rest = all.filter(t => !ids.includes(t.id));
    const rows = ids.map(id => all.find(t => t.id === id)).filter(Boolean).map(t => ({ t, s: stats(t), style: (c.style || {})[t.id] || '' }));
    root.innerHTML = `<div class="row tc-controls">
        <div class="seg" role="group" aria-label="Which games">${[['all', 'Both'], ['climb', 'Climb'], ['test', 'Testing']].map(([k, l]) => `<button type="button" data-tcmode="${k}" aria-pressed="${mode === k}">${l}</button>`).join('')}</div>
        ${rest.length ? `<label class="tc-add">Add a team<select id="tc-add"><option value="">Pick a saved team…</option>${rest.map(t => `<option value="${esc(t.id)}">${esc(t.name || 'Untitled team')} · ${count(t)} game${count(t) === 1 ? '' : 's'}</option>`).join('')}</select></label>` : ''}
      </div>
      ${summary(rows)}
      ${rows.length ? `<div class="tc-grid">${rows.map(r => card(r.t, r.s, r.style)).join('')}</div>` : '<div class="card"><p class="sub" style="margin:0">Add a team above to start comparing.</p></div>'}
      <p class="sub">Games count for a team when you pick it in <b>Team</b> on the Log form. Teams come from the Team builder; the comparison and styles are saved with your account.</p>`;
  }

  document.addEventListener('click', (e) => {
    const m = e.target.closest('[data-tcmode]'); if (m) { mode = m.dataset.tcmode; render(); return; }
    const rm = e.target.closest('[data-tcrm]'); if (rm) { const c = cfg(); c.ids = shown().filter(id => id !== rm.dataset.tcrm); putCfg(c); VL.sound && VL.sound.play('tap'); render(); return; }
    const op = e.target.closest('[data-tcopen]'); if (op && VL.builder) VL.builder.open(op.dataset.tcopen);
  });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'tc-add' && e.target.value) { const c = cfg(); c.ids = shown().concat([e.target.value]); putCfg(c); VL.sound && VL.sound.play('tap'); render(); return; }
    const st = e.target.closest('[data-tcstyle]'); if (st) { const c = cfg(); c.style = { ...(c.style || {}), [st.dataset.tcstyle]: st.value }; if (!Array.isArray(c.ids)) c.ids = shown(); putCfg(c); render(); }
  });

  VL.teamcompare = { render };
})();
