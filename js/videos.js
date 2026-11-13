/* Videos: recent videos from competitive Pokémon YouTube channels
 * (data/videos.json, refreshed by the daily update). Watch in the app, mark
 * what you've seen, and open teams linked from a video in the Team builder. */
(function () {
  'use strict';
  const VL = (window.VL = window.VL || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const WATCHED = 'vgclab-watched';
  const KINDS = [['all', 'Everything'], ['team', 'Team ideas'], ['learn', 'Learn'], ['event', 'Tournaments'], ['battle', 'Battles']];
  const KIND_NAME = { team: 'Team idea', learn: 'Lesson', event: 'Tournament', battle: 'Battle' };

  let DATA = null, loading = null;
  const S = { kind: 'all', ch: '', q: '', both: false, hideWatched: false, shown: 24 };
  let watched = {}; try { watched = JSON.parse(localStorage.getItem(WATCHED) || '{}') || {}; } catch (e) { watched = {}; }
  const saveWatched = () => { try { localStorage.setItem(WATCHED, JSON.stringify(watched)); } catch (e) { /* ignore */ } };

  function load() { return loading || (loading = VL.files.get('videos').then(j => { DATA = j && Array.isArray(j.videos) ? j : { channels: [], videos: [] }; return DATA; })); }
  const chan = (id) => (DATA.channels.find(c => c.id === id) || { name: 'YouTube', style: 'doubles' });
  const ago = (d) => { const n = Math.round((Date.now() - new Date(d + 'T12:00:00')) / 864e5); return n <= 0 ? 'today' : n === 1 ? 'yesterday' : n < 30 ? `${n} days ago` : n < 365 ? `${Math.round(n / 30)} month${Math.round(n / 30) === 1 ? '' : 's'} ago` : `${Math.round(n / 365)} year${Math.round(n / 365) === 1 ? '' : 's'} ago`; };
  const views = (n) => !n ? '' : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M views` : n >= 1e3 ? `${Math.round(n / 1e3)}K views` : `${n} views`;
  const style = () => (VL.isSingles && VL.isSingles() ? 'singles' : 'doubles');

  function list() {
    const q = S.q.trim().toLowerCase();
    return DATA.videos.filter(v => (S.both || chan(v.ch).style === style()) && (S.kind === 'all' || v.kind === S.kind) && (!S.ch || v.ch === S.ch) && (!S.hideWatched || !watched[v.id]) && (!q || v.title.toLowerCase().includes(q) || (v.team || '').toLowerCase().includes(q)));
  }
  function teamMons(v) {
    const sets = VL.builder && VL.builder.parsePaste ? VL.builder.parsePaste(v.team) : [];
    return sets.filter(s => s && s.species).map(s => ({ n: s.species, i: s.item || '', a: s.ability || '', na: s.nature || '', t: s.tera || '', m: (s.moves || []).filter(Boolean) }));
  }

  function card(v) {
    const c = chan(v.ch); const mons = v.team ? teamMons(v) : [];
    return `<div class="card vd-card ${watched[v.id] ? 'seen' : ''}" data-vid="${esc(v.id)}">
      <button type="button" class="vd-thumb" data-vd="play" aria-label="Watch ${esc(v.title)}"><img src="https://i.ytimg.com/vi/${esc(v.id)}/mqdefault.jpg" alt="" loading="lazy"><span class="vd-play" aria-hidden="true">▶</span>${watched[v.id] ? '<span class="vd-seen">Watched</span>' : ''}</button>
      <div class="vd-body"><b class="vd-title">${esc(v.title)}</b>
        <div class="sub">${esc(c.name)} · ${esc(ago(v.date))}${v.views ? ' · ' + views(v.views) : ''}</div>
        <div class="kv" style="gap:6px;flex-wrap:wrap"><span class="pill ${v.kind === 'team' ? 'n' : v.kind === 'learn' ? 'w' : 'm'}">${esc(KIND_NAME[v.kind] || 'Video')}</span>${mons.length ? `<span class="vd-mons">${VL.spriteRow ? VL.spriteRow(mons.map(m => m.n)) : ''}</span>` : ''}</div>
        <div class="row" style="gap:6px;justify-content:flex-start;margin-top:auto">
          ${mons.length ? '<button class="btn small" data-vd="build">Open team in builder</button><button class="btn ghost small" data-vd="practice">Practice against it</button>' : ''}
          <button class="btn ghost small" data-vd="seen">${watched[v.id] ? 'Not watched' : 'Mark watched'}</button>
        </div></div></div>`;
  }

  function render() {
    const root = $('vd-root'); if (!root) return;
    if (!DATA) { load().then(render); return; }
    if (!DATA.videos.length) { root.innerHTML = '<div class="empty">No videos yet. They\'re added by the daily update.</div>'; return; }
    const st = style();
    const chans = DATA.channels.filter(c => S.both || c.style === st);
    if (S.ch && !chans.some(c => c.id === S.ch)) S.ch = '';
    const all = list();
    const count = (k) => DATA.videos.filter(v => (S.both || chan(v.ch).style === st) && (!S.ch || v.ch === S.ch) && (k === 'all' || v.kind === k)).length;
    root.innerHTML = `<div class="card"><div class="kv" style="flex-wrap:wrap;gap:6px">${KINDS.filter(([k]) => k === 'all' || k === S.kind || count(k)).map(([k, l]) => `<button class="chipbtn" data-vk="${k}" aria-pressed="${S.kind === k}">${l} <span class="mini">${count(k)}</span></button>`).join('')}</div>
        <div class="row"><label for="vd-ch">Channel<select id="vd-ch"><option value="">All channels</option>${chans.map(c => `<option value="${esc(c.id)}" ${S.ch === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
          <label for="vd-q">Search titles and teams<input type="search" id="vd-q" value="${esc(S.q)}" placeholder="Sneasler, Trick Room, Floette…"></label></div>
        <div class="kv" style="gap:16px;flex-wrap:wrap"><label class="vd-check"><input type="checkbox" id="vd-hide" ${S.hideWatched ? 'checked' : ''}> Hide videos I've watched</label><label class="vd-check"><input type="checkbox" id="vd-both" ${S.both ? 'checked' : ''}> Show ${st === 'singles' ? 'doubles' : 'singles'} channels too</label></div></div>
      <div class="sub">${all.length} video${all.length === 1 ? '' : 's'} · updated ${esc(ago(String(DATA.generated || '').slice(0, 10)))}</div>
      <div class="vd-grid">${all.slice(0, S.shown).map(card).join('') || '<div class="empty">No videos match.</div>'}</div>
      ${all.length > S.shown ? '<div class="row" style="justify-content:center"><button class="btn ghost" id="vd-more">Show more</button></div>' : ''}`;
  }

  function play(v) {
    watched[v.id] = Date.now(); saveWatched();
    let m = $('vd-modal');
    if (!m) { m = document.createElement('div'); m.id = 'vd-modal'; m.className = 'modal-back vd-modal'; document.body.appendChild(m); m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-vd-close]')) close(); }); }
    m.innerHTML = `<div class="modal vd-box" role="dialog" aria-modal="true" aria-label="${esc(v.title)}"><div class="vd-frame"><iframe src="https://www.youtube-nocookie.com/embed/${esc(v.id)}?autoplay=1&rel=0" title="${esc(v.title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>
      <div class="row" style="justify-content:space-between;align-items:center"><div><b>${esc(v.title)}</b><div class="sub">${esc(chan(v.ch).name)} · ${esc(ago(v.date))}</div></div><div class="row" style="gap:8px"><a class="btn ghost small" href="https://www.youtube.com/watch?v=${esc(v.id)}" target="_blank" rel="noopener">Open on YouTube ↗</a><button class="btn small" data-vd-close>Close</button></div></div></div>`;
    m.hidden = false; document.body.classList.add('modal-open');
  }
  function close() { const m = $('vd-modal'); if (!m) return; m.hidden = true; m.innerHTML = ''; document.body.classList.remove('modal-open'); render(); }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('vd-modal') && !$('vd-modal').hidden) close(); });

  document.addEventListener('click', (e) => {
    const root = $('vd-root'); if (!root || !root.contains(e.target)) return;
    const k = e.target.closest('[data-vk]'); if (k) { S.kind = k.dataset.vk; S.shown = 24; render(); return; }
    if (e.target.id === 'vd-more') { S.shown += 24; render(); return; }
    const b = e.target.closest('[data-vd]'); if (!b) return;
    const v = DATA.videos.find(x => x.id === b.closest('[data-vid]').dataset.vid); if (!v) return;
    const act = b.dataset.vd;
    if (act === 'play') play(v);
    if (act === 'seen') { if (watched[v.id]) delete watched[v.id]; else watched[v.id] = Date.now(); saveWatched(); render(); }
    if (act === 'build') {
      const id = VL.newId('t'); const fmt = VL.curFormatId ? VL.curFormatId() : '';
      VL.store.put('teams', id, { ts: Date.now(), name: v.title.slice(0, 60), fmt, paste: v.team, why: '', weak: '', src: `${chan(v.ch).name} on YouTube: https://www.youtube.com/watch?v=${v.id}` });
      VL.builder && VL.builder.open(id); location.hash = 'teams'; VL.toast('Team copied to your Team builder');
    }
    if (act === 'practice') { VL.sheets && VL.sheets.start({ mons: teamMons(v), label: `the team from "${v.title.slice(0, 50)}"`, fmt: VL.curFormatId ? VL.curFormatId() : '' }); }
  });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'vd-ch') { S.ch = e.target.value; S.shown = 24; render(); }
    if (e.target.id === 'vd-hide') { S.hideWatched = e.target.checked; render(); }
    if (e.target.id === 'vd-both') { S.both = e.target.checked; render(); }
  });
  let qt = null;
  document.addEventListener('input', (e) => { if (e.target.id !== 'vd-q') return; S.q = e.target.value; clearTimeout(qt); qt = setTimeout(() => { const pos = e.target.selectionStart; render(); const el = $('vd-q'); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (x) { /* ignore */ } } }, 200); });

  VL.videos = { render, load };
})();
