/* Compared with top players (Review page): how your games and your team line
 * up against what places at tournaments in your format, from the team sheets
 * saved for Top teams. Only loads the team sheets while Review is open. */
(function () {
  'use strict';
  const VL = (window.VL = window.VL || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toId = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  // a team sheet's Pokémon and what you typed in a log may differ by form (Charizard, Charizard-Mega-Y)
  const base = (n) => toId(String(n || '').replace(/-(Mega(-[XYZ])?|Primal|Tera|Terastal|Stellar)$/i, ''));
  const cache = {};

  function parsePaste(text) {
    const out = [];
    for (const block of String(text || '').split(/\n\s*\n/)) {
      const lines = block.split('\n').map(l => l.trim()).filter(Boolean); if (!lines.length) continue;
      const m = lines[0].match(/^(.*?)(?:\s*@\s*(.+))?$/); let name = (m[1] || '').replace(/\s*\((M|F)\)\s*$/, '').trim();
      const inner = name.match(/\(([^)]+)\)\s*$/); if (inner) name = inner[1];
      if (!name) continue;
      out.push({ n: name, i: (m[2] || '').trim(), m: lines.filter(l => l.startsWith('-')).map(l => l.replace(/^-\s*/, '').split(' / ')[0].trim()) });
    }
    return out;
  }

  function render() {
    const root = $('rv-top'); if (!root) return;
    if (location.hash !== '#review') return;
    const D = VL.D; if (!D || !D.dex || !VL.topteams) { root.innerHTML = '<p class="sub">Loading…</p>'; return; }
    const fid = VL.curFormatId ? VL.curFormatId() : ''; if (!fid || fid.startsWith('custom:')) { root.innerHTML = '<p class="sub">Pick one of the listed formats on Today to compare with tournament teams.</p>'; return; }
    if (!(fid in cache)) {
      root.innerHTML = '<p class="sub">Counting tournament team sheets for your format…</p>';
      cache[fid] = undefined;
      VL.topteams.usageFor(fid).then(u => { cache[fid] = u || null; render(); }).catch(() => { cache[fid] = null; render(); });
      return;
    }
    const u = cache[fid]; if (u === undefined) return;
    const fname = VL.fmtName ? VL.fmtName(fid) : fid;
    if (!u) { root.innerHTML = `<p class="sub">No tournament team sheets saved for ${esc(fname)} yet. They're added as events finish.</p>`; return; }

    const games = VL.store.list('games').filter(g => g.fmt === fid);
    const rec = (name) => { const b = base(name); const gs = games.filter(g => (g.opp || []).some(o => base(o) === b)); return { n: gs.length, w: gs.filter(g => g.result === 'W').length }; };

    // 1. what top players bring, and how you do against it
    const rows = u.mons.slice(0, 10).map(m => {
      const r = rec(m.n); const wr = r.n ? Math.round(100 * r.w / r.n) : null;
      const flag = !r.n ? '<span class="pill m">not faced yet</span>' : r.n >= 3 && wr < 45 ? `<span class="pill l">${wr}% wins</span>` : `<span class="pill ${wr >= 55 ? 'w' : 'n'}">${wr}% wins</span>`;
      const act = r.n >= 3 && wr < 45 ? `<button class="linkbtn ms-go" data-cmp-nb="${esc(m.n)}">Make a plan for it →</button>` : '';
      return `<div class="cmp-row">${VL.sprite(m.n, 'sm', false)}<div><b>${esc(m.n)}</b><div class="sub">On ${m.u.toFixed(0)}% of top-cut teams${r.n ? ` · you've played it ${r.n} time${r.n === 1 ? '' : 's'}, won ${r.w}` : ''}</div></div><div class="kv">${flag}${act}</div></div>`;
    }).join('');

    // 2. your most-played team next to top-cut sets of the same Pokémon
    const teams = VL.store.list('teams'); const count = {};
    for (const g of games) if (g.team) count[g.team] = (count[g.team] || 0) + 1;
    const tid = Object.keys(count).sort((a, b) => count[b] - count[a])[0];
    const team = (tid && teams.find(t => t.id === tid)) || teams.filter(t => t.fmt === fid).sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
    let mine = '';
    if (team) {
      const mons = parsePaste(team.paste);
      const notes = mons.map(m => {
        const shown = VL.topteams.shownName({ n: m.n, i: m.i });
        const t = u.mons.find(x => toId(x.n) === toId(shown)) || u.mons.find(x => base(x.n) === base(m.n));
        if (!t) return `<li>${VL.sprite(shown, 'xs', false)} <b>${esc(shown)}</b>: not on any saved top-cut team. That can be a strength (nobody expects it) or a sign it's outclassed. Check its job is worth a slot.</li>`;
        const bits = [];
        const topItem = t.items[0];
        if (topItem && m.i && toId(topItem[0]) !== toId(m.i)) { const mineShare = (t.items.find(x => toId(x[0]) === toId(m.i)) || [null, 0])[1]; bits.push(`top players mostly hold ${esc(topItem[0])} (${topItem[1].toFixed(0)}%); yours holds ${esc(m.i)}${mineShare ? ` (${mineShare.toFixed(0)}%)` : ', which none of them use'}`); }
        const missing = t.moves.filter(([mv, p]) => p >= 50 && !m.m.some(x => toId(x) === toId(mv))).slice(0, 2);
        if (missing.length) bits.push(`most run ${missing.map(([mv, p]) => `${esc(mv)} (${p.toFixed(0)}%)`).join(' and ')}, which you don't`);
        return `<li>${VL.sprite(shown, 'xs', false)} <b>${esc(shown)}</b> · on ${t.u.toFixed(0)}% of top-cut teams${bits.length ? `: ${bits.join('; ')}.` : '. Your set matches what top players run.'}</li>`;
      }).join('');
      mine = `<div class="section-label">Your team: ${esc(team.name || 'Untitled')}</div><ul class="cmp-list">${notes || '<li>This team has no Pokémon yet.</li>'}</ul><p class="sub">Different isn't wrong. But if you can't say why your set is different, try theirs.</p>`;
    } else mine = '<p class="sub">Save a team in the Team builder and pick it when you log games to compare your sets with top players\'.</p>';

    root.innerHTML = `<p class="sub">${esc(fname)}: ${u.teams.toLocaleString()} top-cut team sheets from ${u.events} tournaments. <button class="linkbtn ms-go" data-cmp-meta>See all their sets →</button></p>
      <div class="section-label">What top players bring, and how you do against it</div>
      <div class="cmp-rows">${rows}</div>
      ${mine}`;
  }

  document.addEventListener('click', (e) => {
    const root = $('rv-top'); if (!root || !root.contains(e.target)) return;
    const nb = e.target.closest('[data-cmp-nb]');
    if (nb) { location.hash = 'notebook'; setTimeout(() => { const n = $('nb-name'), p = $('nb-plan'); if (n) n.value = nb.dataset.cmpNb; if (p) p.focus(); }, 60); return; }
    if (e.target.closest('[data-cmp-meta]')) { $('mt-from').value = 'events'; const f = VL.curFormatId(); location.hash = 'meta'; setTimeout(() => { const s = $('mt-format'); if ([...s.options].some(o => o.value === f)) s.value = f; VL.meta.render(); }, 60); }
  });
  window.addEventListener('hashchange', render);
  VL.compare = { render, parsePaste };
})();
