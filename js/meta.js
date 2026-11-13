/* Meta: what people actually play, from Smogon's monthly usage statistics
 * (data/meta.json, refreshed weekly by the GitHub workflow). Also gives the
 * calculator, team checker and battle companion access to common sets. */
(function () {
  'use strict';
  const VL = (window.VL = window.VL || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const STAT_NAMES = ['HP', 'Attack', 'Defense', 'Special Attack', 'Special Defense', 'Speed'];

  const M = (VL.meta = {
    data: null,
    ready: null,
    entries() { return this.data ? Object.entries(this.data.formats) : []; },
    // best entry for a dex format id: ladder (best of 1) unless asked for best of 3
    forFormat(fid, bo3) {
      if (!this.data || !fid) return null;
      const f = this.data.formats;
      return (bo3 ? f[fid + 'bo3'] || f[fid] : f[fid] || f[fid + 'bo3']) || null;
    },
    get(entry, name) {
      if (!entry) return null;
      const id = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      return entry.mons.find(m => m.n.toLowerCase().replace(/[^a-z0-9]/g, '') === id) || null;
    },
    topNames(fid, n) { const e = this.forFormat(fid); return e ? e.mons.slice(0, n).map(m => m.n) : []; },
    spreadText(spread, champ) {
      const [nature, nums] = String(spread || '').split(':');
      if (!nums) return spread || '';
      const parts = nums.split('/').map(Number).map((v, i) => v ? `${v} ${STAT_NAMES[i]}` : null).filter(Boolean);
      return `${nature} · ${parts.join(' · ') || 'no investment'}${champ ? '' : ' (effort values)'}`;
    },
  });
  // who is rising and falling compared with the month before, in percentage points of teams
  M.movers = function (fid, n) {
    const e = fid && typeof fid === 'object' ? fid : this.forFormat(fid); if (!e || !e.prev || !e.prev.u) return null;
    const pu = e.prev.u;
    const all = e.mons.filter(m => m.u >= 2 || (pu[m.n] || 0) >= 2).map(m => ({ n: m.n, u: m.u, d: Math.round((m.u - (pu[m.n] || 0)) * 10) / 10 }));
    return { month: e.month, prev: e.prev.month, up: all.filter(x => x.d > 0.4).sort((a, b) => b.d - a.d).slice(0, n || 5), down: all.filter(x => x.d < -0.4).sort((a, b) => a.d - b.d).slice(0, n || 5), delta: Object.fromEntries(all.map(x => [x.n, x.d])) };
  };
  M.ready = fetch('data/meta.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(j => { M.data = j; return j; }).catch(() => null);

  // ---------- page ----------
  let selected = null;
  function fillSelect() {
    const sel = $('mt-format'); const cur = sel.value;
    const ents = M.entries();
    sel.innerHTML = ents.length ? ents.map(([id, e]) => `<option value="${esc(id)}">${esc(e.label)}</option>`).join('') : '<option value="">No usage stats yet</option>';
    const want = cur || (VL.curFormatId ? VL.curFormatId() : '');
    if (ents.some(([id]) => id === want)) sel.value = want;
  }
  function render() {
    fillSelect();
    const id = $('mt-format').value; const e = M.data && M.data.formats[id];
    if (!e) {
      $('mt-src').textContent = '';
      $('mt-list').innerHTML = '<div class="empty">No usage stats yet. They\'re added by the weekly update once Smogon publishes the month\'s numbers, usually in the first days of the month.</div>';
      $('mt-detail').innerHTML = '<p class="sub">Nothing to show yet.</p>';
      return;
    }
    const month = new Date(e.month + '-15').toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    $('mt-src').innerHTML = `From <a href="${esc(M.data.source.url)}" target="_blank" rel="noopener">Smogon's usage statistics</a> for ${esc(month)}: ${e.battles.toLocaleString()} battles on Pokémon Showdown's ${e.bo3 ? 'best-of-3' : 'ladder'}, players rated ${e.rating ? e.rating + ' and up' : 'at any rating'}. Showdown play is a close guide to the in-game ladder, not an exact copy.`;
    const q = $('mt-q').value.trim().toLowerCase();
    const max = e.mons[0] ? e.mons[0].u : 1;
    const rows = e.mons.map((m, i) => ({ m, i })).filter(({ m }) => !q || m.n.toLowerCase().includes(q));
    const mv = M.movers(e);
    if (!selected || !e.mons.some(m => m.n === selected)) selected = e.mons[0] && e.mons[0].n;
    $('mt-list').innerHTML = rows.map(({ m, i }) => `<button class="metarow" data-mon="${esc(m.n)}" aria-current="${m.n === selected}"><span class="rk">${i + 1}</span>${VL.sprite(m.n, 'xs', false)}<span>${esc(m.n)}${mv && mv.delta[m.n] !== undefined && Math.abs(mv.delta[m.n]) >= 0.5 ? ` <span class="mini ${mv.delta[m.n] > 0 ? 'good-t' : 'bad-t'}">${mv.delta[m.n] > 0 ? '▲' : '▼'}${Math.abs(mv.delta[m.n]).toFixed(1)}</span>` : ''}<span class="ub"><span style="width:${Math.round(100 * m.u / max)}%"></span></span></span><span class="pct">${m.u.toFixed(1)}%</span></button>`).join('') || '<p class="sub" style="padding:8px">No match.</p>';
    renderDetail(id, e);
  }
  function list(title, rows, fmt) {
    if (!rows || !rows.length) return '';
    return `<div><div class="section-label">${title}</div><div class="kvlist">${rows.map(([k, v]) => `<span>${fmt ? fmt(k) : esc(k)}</span><span class="pct">${v.toFixed(1)}%</span><span class="bar2"><span style="width:${Math.min(100, v)}%"></span></span>`).join('')}</div></div>`;
  }
  function renderDetail(id, e) {
    const m = e.mons.find(x => x.n === selected); const out = $('mt-detail');
    if (!m) { out.innerHTML = ''; return; }
    const D = VL.D; const champ = (id || '').includes('champions');
    const i = D.dex ? D.find(m.n) : -1; const fmt = D.dex ? D.format(e.parent) : null; const p = i >= 0 ? D.mon(i, fmt) : null;
    const rank = e.mons.indexOf(m) + 1;
    out.innerHTML = `<div class="card-head"><div class="kv">${VL.sprite(m.n, 'md', false)}<h2>${esc(m.n)}</h2>${p ? p.t.map(t => `<span class="ty ${esc(t)}">${esc(t)}</span>`).join(' ') : ''}</div><span class="pill n">#${rank} · ${m.u.toFixed(1)}% of teams</span></div>
      ${p ? `<p class="sub">Base stats ${p.s.join(' / ')} · Speed at Level 50: ${D.speed(p.s[5], 'none', fmt)} uninvested, ${D.speed(p.s[5], 'max+', fmt)} max with a Speed nature</p>` : ''}
      <div class="row" style="gap:8px"><button class="btn small" data-calc="atk">Open in calculator as attacker</button><button class="btn ghost small" data-calc="def">As defender</button><button class="btn ghost small" data-nb>Add to notebook</button></div>
      <div class="meta-sets">
        ${list('Items', m.items)}
        ${list('Abilities', m.abilities)}
        ${list('Moves', m.moves)}
        ${list('Spreads', m.spreads, (k) => esc(M.spreadText(k, champ)))}
        ${list('Common teammates', m.mates, (k) => `<a href="#meta" data-mate="${esc(k)}">${VL.sprite(k, 'xs', false)} ${esc(k)}</a>`)}
        ${m.tera ? list('Tera types', m.tera) : ''}
      </div>
      <p class="sub">Percentages are the share of ${esc(m.n)} using each option. Moves add up to about 400% because each Pokémon has four.</p>`;
  }
  $('mt-list').addEventListener('click', e => { const b = e.target.closest('[data-mon]'); if (b) { selected = b.dataset.mon; render(); if (window.innerWidth < 860) $('mt-detail').scrollIntoView({ behavior: 'smooth' }); } });
  $('mt-detail').addEventListener('click', e => {
    const mate = e.target.closest('[data-mate]'); if (mate) { e.preventDefault(); selected = mate.dataset.mate; $('mt-q').value = ''; render(); return; }
    const c = e.target.closest('[data-calc]'); if (c) { VL.calc && VL.calc.load($('mt-format').value, selected, c.dataset.calc); return; }
    if (e.target.closest('[data-nb]')) { location.hash = 'notebook'; setTimeout(() => { $('nb-name').value = selected; $('nb-plan').focus(); }, 50); }
  });
  $('mt-format').addEventListener('change', () => { selected = null; render(); });
  $('mt-q').addEventListener('input', render);
  M.render = render;
})();
