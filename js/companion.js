/* Battle companion: a live helper for the phone next to the Switch.
 * Field timers, opponent reveals, Protect tracking, then one tap turns the
 * game into a log entry. The battle in progress is kept on this device. */
(function () {
  'use strict';
  const VL = (window.VL = window.VL || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toId = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const cap = (s) => s.trim().replace(/\s+/g, ' ').split(' ').map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ');

  const TIMERS = [
    { k: 'tw_me', l: 'Tailwind', side: 'Your side', len: 4, group: 'Speed' },
    { k: 'tw_opp', l: 'Tailwind', side: 'Their side', len: 4, group: 'Speed' },
    { k: 'tr', l: 'Trick Room', side: 'Whole field', len: 5, group: 'Speed' },
    { k: 'weather', l: 'Weather', side: 'Whole field', len: 5, ext: 8, kinds: ['Sun', 'Rain', 'Sand', 'Snow'], group: 'Field' },
    { k: 'terrain', l: 'Terrain', side: 'Whole field', len: 5, ext: 8, kinds: ['Grassy', 'Electric', 'Psychic', 'Misty'], group: 'Field' },
    { k: 'ref_me', l: 'Reflect', side: 'Your side', len: 5, ext: 8, group: 'Screens' },
    { k: 'ls_me', l: 'Light Screen', side: 'Your side', len: 5, ext: 8, group: 'Screens' },
    { k: 'av_me', l: 'Aurora Veil', side: 'Your side', len: 5, ext: 8, group: 'Screens' },
    { k: 'ref_opp', l: 'Reflect', side: 'Their side', len: 5, ext: 8, group: 'Screens' },
    { k: 'ls_opp', l: 'Light Screen', side: 'Their side', len: 5, ext: 8, group: 'Screens' },
    { k: 'av_opp', l: 'Aurora Veil', side: 'Their side', len: 5, ext: 8, group: 'Screens' },
  ];
  const KEY = 'vgclab-battle';
  let B = null;
  try { B = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { B = null; }
  const save = () => { try { if (B) localStorage.setItem(KEY, JSON.stringify(B)); else localStorage.removeItem(KEY); } catch (e) { /* ignore */ } };

  function teamNames(paste) {
    return String(paste || '').split(/\n\s*\n/).map(b => b.trim().split('\n')[0] || '').map(l => {
      let s = l.split('@')[0].trim(); const m = s.match(/\(([^)]+)\)/g);
      if (m) { const inner = m.map(x => x.slice(1, -1)).find(x => !/^[MF]$/.test(x)); if (inner) s = inner; }
      return s.replace(/\((M|F)\)/g, '').trim();
    }).filter(Boolean).slice(0, 6);
  }

  function renderSetup() {
    const fid = VL.curFormatId ? VL.curFormatId() : '';
    $('cp-fmt').textContent = 'Format: ' + (VL.fmtName ? VL.fmtName(fid) : fid);
    const sel = $('cp-team'); const cur = sel.value;
    sel.innerHTML = '<option value="">(not set)</option>' + VL.store.list('teams').map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
    sel.value = cur;
  }

  function left(t) { const v = B.timers[t.k]; if (!v) return 0; return v.start + v.len - B.turn; }

  function render() {
    if (!$('p-companion')) return;
    renderSetup();
    const live = !!(B && B.active);
    $('cp-setup').hidden = live; $('cp-live').hidden = !live;
    if (!live) return;
    $('cp-turn').textContent = B.turn;
    // timers grouped
    const groups = {};
    for (const t of TIMERS) (groups[t.group] ||= []).push(t);
    $('cp-timers').innerHTML = Object.entries(groups).map(([g, ts]) => `<div class="section-label" style="grid-column:1/-1">${g}</div>` + ts.map(t => {
      const v = B.timers[t.k]; const n = v ? left(t) : 0;
      const kind = v && t.kinds ? `<select data-kind="${t.k}" aria-label="${t.l} type">${t.kinds.map(k => `<option ${v.kind === k ? 'selected' : ''}>${k}</option>`).join('')}</select>` : '';
      const ext = v && t.ext ? `<label class="mini" style="flex-direction:row;gap:4px;align-items:center;margin-top:2px"><input type="checkbox" data-ext="${t.k}" ${v.len === t.ext ? 'checked' : ''}> Lasts ${t.ext} (item)</label>` : '';
      return `<div class="timer ${v ? (n <= 1 ? 'last' : 'on') : ''}" role="button" tabindex="0" data-timer="${t.k}">
        <span class="tl">${t.l}</span><span class="ts">${esc(t.side)}</span>
        ${v ? `<span class="big">${n}</span><span class="ts">${n <= 1 ? 'Last turn' : 'turns left, counting this one'}</span>${kind}${ext}` : '<span class="ts">Tap when it goes up</span>'}
      </div>`;
    }).join('')).join('');

    // opponent cards
    const fmt = VL.D.dex ? VL.D.format(B.fmt) : null;
    const metaE = VL.meta.forFormat(B.fmt);
    $('cp-opps').innerHTML = B.opp.map((o, i) => {
      const di = VL.D.dex ? VL.D.find(o.n) : -1; const p = di >= 0 ? VL.D.mon(di, fmt) : null;
      const m = VL.meta.get(metaE, o.n);
      const usual = m ? `<span class="hint">Usually holds: <b>${m.items.slice(0, 2).map(x => `${esc(x[0])} ${Math.round(x[1])}%`).join(', ')}</b></span><span class="hint">Common moves: ${m.moves.slice(0, 5).map(x => esc(x[0])).join(', ')}</span>` : '';
      const speed = p ? `<span class="hint">Speed at Level 50: ${VL.D.speed(p.s[5], 'none', fmt)} uninvested · ${VL.D.speed(p.s[5], 'max+', fmt)} max · ${Math.floor(VL.D.speed(p.s[5], 'max+', fmt) * 1.5)} with Scarf</span>` : '';
      const prot = o.protectTurn ? (o.protectTurn === B.turn - 1 ? `<span class="togg warn">Protected last turn: another Protect works only 1 time in 3</span>` : o.protectTurn === B.turn ? `<span class="togg warn">Protected this turn</span>` : `<span class="mini">Last Protect: turn ${o.protectTurn}</span>`) : '';
      const abil = p ? p.a : [];
      return `<div class="oppcard ${o.fnt ? 'fnt' : ''} ${o.lead ? 'lead' : ''}" data-i="${i}">
        <div class="h"><div class="kv">${VL.sprite(o.n, 'sm', false)}<b>${esc(o.n)}</b>${p ? p.t.map(t => `<span class="ty ${esc(t)}">${esc(t)}</span>`).join(' ') : ''}</div>
          <div class="kv"><button class="togg" data-t="lead" aria-pressed="${!!o.lead}">Lead</button><button class="togg" data-t="mega" aria-pressed="${!!o.mega}">Mega</button><button class="togg" data-t="fnt" aria-pressed="${!!o.fnt}">Fainted</button></div></div>
        ${speed}${usual}
        <div class="row" style="gap:6px"><label style="flex:1 1 120px">Item<input type="text" data-r="item" value="${esc(o.item || '')}" list="dl-cp-items" placeholder="Not seen"></label>
          <label style="flex:1 1 120px">Ability<select data-r="ability"><option value="">Not seen</option>${abil.map(a => `<option ${o.ability === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select></label></div>
        <div class="chips">${(o.moves || []).map((mv, k) => `<span class="chip" style="cursor:default">${esc(mv)} <button class="linkbtn" data-rm="${k}" aria-label="Remove ${esc(mv)}">×</button></span>`).join('')}
          ${(o.moves || []).length < 4 ? `<input type="text" data-addmove style="flex:1 1 120px;width:auto;padding:4px 8px;font-size:12.5px" list="dl-cp-moves" placeholder="Add a move they used">` : ''}</div>
        <div class="kv"><button class="btn ghost small" data-protect>Protected</button>${prot}</div>
      </div>`;
    }).join('');

    // my Protect tracker
    $('cp-mine-card').hidden = !B.mine.length;
    $('cp-mine').innerHTML = B.mine.map((o, i) => {
      const warn = o.protectTurn === B.turn - 1;
      return `<button class="togg ${warn ? 'warn' : ''}" data-mine="${i}">${VL.sprite(o.n, 'xs', false)} ${esc(o.n)}${o.protectTurn ? (warn ? ' · Protected last turn' : o.protectTurn === B.turn ? ' · Protected this turn' : ` · last Protect turn ${o.protectTurn}`) : ' · tap when it Protects'}</button>`;
    }).join('');
    if (document.activeElement !== $('cp-notes')) $('cp-notes').value = B.notes || '';
    fillLists();
  }
  function fillLists() {
    const D = VL.D; if (!D.dex) return;
    const ensure = (id) => { let dl = document.getElementById(id); if (!dl) { dl = document.createElement('datalist'); dl.id = id; document.body.appendChild(dl); } return dl; };
    const fmt = D.format(B.fmt);
    if (!ensure('dl-cp-items').childElementCount) ensure('dl-cp-items').innerHTML = fmt.items.map(id => D.dex.items[id]).filter(Boolean).map(it => `<option value="${esc(it.n)}">`).join('');
    if (!ensure('dl-cp-moves').childElementCount) ensure('dl-cp-moves').innerHTML = Object.values(D.dex.moves || {}).map(m => `<option value="${esc(m.n)}">`).join('');
  }

  function nextTurn(d) {
    B.turn = Math.max(1, B.turn + d);
    if (d > 0) {
      for (const t of TIMERS) { const v = B.timers[t.k]; if (v && left(t) <= 0) { delete B.timers[t.k]; VL.toast(`${t.l}${t.side !== 'Whole field' ? ' (' + t.side.toLowerCase() + ')' : ''} has ended`); } }
    }
    save(); render();
  }

  // ---------- events ----------
  $('cp-start').onclick = () => {
    const names = String($('cp-opp').value).split(/[,/\n]+/).map(cap).filter(Boolean).slice(0, 6);
    if (!names.length) { VL.toast('Type their Pokémon first'); return; }
    const canon = (n) => { const i = VL.D.dex ? VL.D.find(n) : -1; return i >= 0 ? VL.D.dex.species[i].n : n; };
    const team = VL.store.get('teams', $('cp-team').value);
    B = { active: true, started: Date.now(), fmt: VL.curFormatId ? VL.curFormatId() : '', turn: 1, timers: {}, notes: '', team: team ? team.id : '', oppName: $('cp-oppname').value.trim(),
      opp: names.map(n => ({ n: canon(n), moves: [] })), mine: team ? teamNames(team.paste).map(n => ({ n: canon(n) })) : [] };
    $('cp-opp').value = ''; $('cp-oppname').value = '';
    save(); render(); window.scrollTo(0, 0);
  };
  $('cp-next').onclick = () => nextTurn(1);
  $('cp-undo').onclick = () => nextTurn(-1);
  $('cp-timers').addEventListener('click', e => {
    if (e.target.closest('select,input,label')) return;
    const el = e.target.closest('[data-timer]'); if (!el) return;
    const t = TIMERS.find(x => x.k === el.dataset.timer);
    if (B.timers[t.k]) delete B.timers[t.k]; else B.timers[t.k] = { start: B.turn, len: t.len, kind: t.kinds ? t.kinds[0] : undefined };
    save(); render();
  });
  $('cp-timers').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset.timer) { e.preventDefault(); e.target.click(); } });
  $('cp-timers').addEventListener('change', e => {
    const k = e.target.dataset.kind || e.target.dataset.ext; if (!k) return; const t = TIMERS.find(x => x.k === k);
    if (e.target.dataset.kind) B.timers[k].kind = e.target.value;
    if (e.target.dataset.ext) B.timers[k].len = e.target.checked ? t.ext : t.len;
    save(); render();
  });
  $('cp-opps').addEventListener('click', e => {
    const card = e.target.closest('[data-i]'); if (!card) return; const o = B.opp[+card.dataset.i];
    const tg = e.target.closest('[data-t]');
    if (tg) { o[tg.dataset.t] = !o[tg.dataset.t]; save(); render(); return; }
    if (e.target.closest('[data-protect]')) { o.protectTurn = o.protectTurn === B.turn ? null : B.turn; save(); render(); return; }
    const rm = e.target.closest('[data-rm]'); if (rm) { o.moves.splice(+rm.dataset.rm, 1); save(); render(); }
  });
  $('cp-opps').addEventListener('change', e => {
    const card = e.target.closest('[data-i]'); if (!card) return; const o = B.opp[+card.dataset.i];
    if (e.target.dataset.r) { o[e.target.dataset.r] = e.target.value.trim(); save(); }
    if (e.target.dataset.addmove !== undefined && e.target.value.trim()) { const mv = VL.D.dex && VL.D.dex.moves[toId(e.target.value)]; o.moves.push(mv ? mv.n : cap(e.target.value)); save(); render(); }
  });
  $('cp-opps').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset.addmove !== undefined) { e.preventDefault(); e.target.blur(); } });
  $('cp-mine').addEventListener('click', e => { const b = e.target.closest('[data-mine]'); if (!b) return; const o = B.mine[+b.dataset.mine]; o.protectTurn = o.protectTurn === B.turn ? null : B.turn; save(); render(); });
  let nt = null;
  $('cp-notes').addEventListener('input', () => { clearTimeout(nt); nt = setTimeout(() => { B.notes = $('cp-notes').value; save(); }, 300); });
  function finish(result) {
    const reveals = B.opp.filter(o => o.item || o.ability || (o.moves || []).length).map(o => `${o.n}: ${[o.item && 'item ' + o.item, o.ability && 'ability ' + o.ability, (o.moves || []).length && 'moves ' + o.moves.join(', ')].filter(Boolean).join('; ')}`).join('\n');
    const note = [($('cp-notes').value || '').trim(), reveals ? 'Revealed:\n' + reveals : '', `Lasted ${B.turn} turns.`].filter(Boolean).join('\n\n');
    VL.prefillLog && VL.prefillLog({ result, opp: B.opp.map(o => o.n), opplead: B.opp.filter(o => o.lead).map(o => o.n), oppName: B.oppName, team: B.team, note });
    B = null; save(); render();
  }
  $('cp-won').onclick = () => finish('W');
  $('cp-lost').onclick = () => finish('L');
  $('cp-cancel').onclick = (e) => {
    const btn = e.target;
    if (btn.dataset.armed) { B = null; save(); render(); VL.toast('Battle discarded'); return; }
    btn.dataset.armed = '1'; btn.textContent = 'Tap again to discard'; setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = 'Discard'; } }, 3000);
  };

  VL.companion = { render, teamNames };
})();
