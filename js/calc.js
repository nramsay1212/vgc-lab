/* Damage calculator. Uses @smogon/calc (bundled in vendor/, MIT license),
 * the engine behind Pokémon Showdown's calculator. Champions is the
 * engine's generation 0, which uses Stat Points; older games use EVs. */
(function () {
  'use strict';
  const VL = (window.VL = window.VL || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toId = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
  const STAT_NAMES = ['HP', 'Attack', 'Defense', 'Special Attack', 'Special Defense', 'Speed'];
  const NATURES = { Hardy: [], Lonely: ['atk', 'def'], Brave: ['atk', 'spe'], Adamant: ['atk', 'spa'], Naughty: ['atk', 'spd'], Bold: ['def', 'atk'], Docile: [], Relaxed: ['def', 'spe'], Impish: ['def', 'spa'], Lax: ['def', 'spd'], Timid: ['spe', 'atk'], Hasty: ['spe', 'def'], Serious: [], Jolly: ['spe', 'spa'], Naive: ['spe', 'spd'], Modest: ['spa', 'atk'], Mild: ['spa', 'def'], Quiet: ['spa', 'spe'], Bashful: [], Rash: ['spa', 'spd'], Calm: ['spd', 'atk'], Gentle: ['spd', 'def'], Sassy: ['spd', 'spe'], Careful: ['spd', 'spa'], Quirky: [] };
  const SHORT = { hp: 'HP', atk: 'Attack', def: 'Defense', spa: 'Special Attack', spd: 'Special Defense', spe: 'Speed' };
  const TYPES = ['Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison', 'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy'];

  // MEGA_STONES maps an item to { 'Base species': 'Mega form' }
  function megaFor(item, base) { const m = window.calc && window.calc.MEGA_STONES && window.calc.MEGA_STONES[item]; return m && (m[base] || null); }
  let loading = null;
  function loadEngine() {
    if (window.calc && window.calc.calculate && window.calc.Generations) return Promise.resolve();
    if (loading) return loading;
    const add = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    loading = add('vendor/smogon-calc/data.min.js').then(() => add('vendor/smogon-calc/calc.min.js'));
    return loading;
  }

  const blank = () => ({ mon: '', nature: 'Hardy', ability: '', item: '', sp: [0, 0, 0, 0, 0, 0], boosts: { atk: 0, spa: 0, def: 0, spd: 0 }, status: '', hp: 100, tera: '', mega: true, moves: ['', '', '', ''] });
  let S = { fmt: '', atk: blank(), def: blank(), field: { weather: '', terrain: '', reflect: false, light: false, veil: false, friend: false, helping: false, crit: false, doubles: true } };
  try { const saved = JSON.parse(localStorage.getItem('vgclab-calc') || 'null'); if (saved && saved.atk) S = { ...S, ...saved }; } catch (e) { /* ignore */ }
  const save = () => { try { localStorage.setItem('vgclab-calc', JSON.stringify(S)); } catch (e) { /* ignore */ } };

  const fmt = () => VL.D.format(S.fmt || (VL.curFormatId && VL.curFormatId()));
  const isChamp = () => { const f = fmt(); return !!(f && f.mod && f.mod.startsWith('champions')); };
  const genNum = () => isChamp() ? 0 : (fmt() ? fmt().gen : 9);
  const spMax = () => isChamp() ? 32 : 252;
  const spTotal = () => isChamp() ? 66 : 510;

  function sideHtml(key, title) {
    const s = S[key]; const champ = isChamp(); const gen = genNum();
    const natOpts = Object.entries(NATURES).map(([n, [p, m]]) => `<option value="${n}" ${s.nature === n ? 'selected' : ''}>${n}${p ? ` (+${SHORT[p]}, −${SHORT[m]})` : ''}</option>`).join('');
    const i = VL.D.find(s.mon); const sp = i >= 0 ? VL.D.mon(i, fmt()) : null;
    const abil = sp ? sp.a : [];
    const abOpts = (abil.length ? abil : [s.ability || '']).map(a => `<option ${a === s.ability ? 'selected' : ''}>${esc(a)}</option>`).join('');
    const boosts = (key === 'atk' ? ['atk', 'spa'] : ['def', 'spd']).map(b => `<label>${SHORT[b]} stage<select data-boost="${b}">${[6, 5, 4, 3, 2, 1, 0, -1, -2, -3, -4, -5, -6].map(v => `<option value="${v}" ${s.boosts[b] === v ? 'selected' : ''}>${v > 0 ? '+' + v : v}</option>`).join('')}</select></label>`).join('');
    const canMega = !!(sp && s.item && (megaFor(s.item, sp.n) || megaFor(s.item, sp.b)));
    return `<div class="card" data-side="${key}">
      <div class="card-head"><h3>${title}</h3><button class="btn ghost small" data-common>Load common set</button></div>
      <label>Pokémon<input type="text" data-f="mon" list="dl-calc-mons" value="${esc(s.mon)}" placeholder="Start typing a name"></label>
      ${sp ? `<div class="kv">${sp.t.map(t => `<span class="ty ${esc(t)}">${esc(t)}</span>`).join(' ')}<span class="mini">Base ${sp.s.join(' / ')}</span></div>` : ''}
      <div class="row"><label>Nature<select data-f="nature">${natOpts}</select></label><label>Ability<select data-f="ability">${abOpts}</select></label></div>
      <div class="row"><label>Item<input type="text" data-f="item" list="dl-calc-items" value="${esc(s.item)}" placeholder="No item"></label>${canMega ? `<label class="inline"><input type="checkbox" data-f="mega" ${s.mega ? 'checked' : ''}> Mega Evolved</label>` : ''}</div>
      <div><div class="section-label">${champ ? `<span class="term" data-term="statpoints">Stat Points</span> (0–32 each, ${spTotal()} total)` : 'Effort values (0–252 each, 510 total; individual values set to 31)'} · used <b class="num" data-sptotal>${s.sp.reduce((a, b) => a + b, 0)}</b></div>
        <div class="spgrid">${STATS.map((st, k) => `<label>${STAT_NAMES[k]}<input type="number" min="0" max="${spMax()}" data-sp="${k}" value="${s.sp[k]}"></label>`).join('')}</div></div>
      <div class="row">${boosts}<label>Status<select data-f="status">${[['', 'Healthy'], ['brn', 'Burned'], ['par', 'Paralyzed'], ['psn', 'Poisoned'], ['frz', 'Frozen'], ['slp', 'Asleep']].map(([v, l]) => `<option value="${v}" ${s.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        ${key === 'def' ? `<label>Current HP %<input type="number" min="1" max="100" data-f="hp" value="${s.hp}"></label>` : ''}
        ${gen === 9 && !champ ? `<label>Terastallized as<select data-f="tera"><option value="">Not Terastallized</option>${TYPES.map(t => `<option ${s.tera === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>` : ''}</div>
      ${key === 'atk' ? `<div><div class="section-label">Moves to check</div><div class="row">${s.moves.map((m, k) => `<label>Move ${k + 1}<input type="text" data-move="${k}" list="dl-calc-moves" value="${esc(m)}"></label>`).join('')}</div></div>` : ''}
    </div>`;
  }
  function fieldHtml() {
    const f = S.field;
    const chk = (k, l) => `<label class="inline"><input type="checkbox" data-ff="${k}" ${f[k] ? 'checked' : ''}> ${l}</label>`;
    return `<label>Battle<select data-ff="doubles"><option value="1" ${f.doubles ? 'selected' : ''}>Doubles</option><option value="0" ${!f.doubles ? 'selected' : ''}>Singles</option></select></label>
      <label>Weather<select data-ff="weather">${[['', 'None'], ['Sun', 'Sun'], ['Rain', 'Rain'], ['Sand', 'Sand'], ['Snow', 'Snow'], ['Hail', 'Hail (older games)']].map(([v, l]) => `<option value="${v}" ${f.weather === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Terrain<select data-ff="terrain">${[['', 'None'], ['Electric', 'Electric'], ['Grassy', 'Grassy'], ['Psychic', 'Psychic'], ['Misty', 'Misty']].map(([v, l]) => `<option value="${v}" ${f.terrain === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      ${chk('helping', 'Helping Hand on attacker')}${chk('crit', 'Critical hit')}${chk('reflect', 'Reflect on defender')}${chk('light', 'Light Screen on defender')}${chk('veil', 'Aurora Veil on defender')}${chk('friend', 'Friend Guard on defender')}`;
  }

  function build(key) {
    const C = window.calc; const g = C.Generations.get(genNum()); const s = S[key];
    let name = s.mon;
    const mega = s.item && megaFor(s.item, name);
    if (mega && s.mega) name = mega;
    const evs = {}; STATS.forEach((st, k) => { evs[st] = Math.max(0, Math.min(spMax(), +s.sp[k] || 0)); });
    const opts = { level: 50, nature: s.nature, evs, boosts: s.boosts, status: s.status || undefined };
    if (s.ability) opts.ability = s.ability;
    if (s.item) opts.item = s.item;
    if (s.tera) opts.teraType = s.tera;
    if (!isChamp()) opts.ivs = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
    const p = new C.Pokemon(g, name, opts);
    if (key === 'def' && s.hp < 100) p.originalCurHP = Math.max(1, Math.floor(p.maxHP() * s.hp / 100));
    return { g, p };
  }

  function compute() {
    const out = $('cl-out');
    if (!window.calc || !window.calc.calculate) { out.innerHTML = '<p class="sub">Loading the calculator…</p>'; return; }
    if (!S.atk.mon || !S.def.mon) { out.innerHTML = '<div class="empty">Pick an attacker and a defender to see damage.</div>'; return; }
    const C = window.calc;
    let A, Dd;
    try { A = build('atk'); Dd = build('def'); } catch (e) { out.innerHTML = `<div class="empty">The calculator doesn't recognize one of these Pokémon for this game. Check the spelling, or pick a different format.</div>`; return; }
    const f = S.field;
    const field = new C.Field({ gameType: f.doubles ? 'Doubles' : 'Singles', weather: f.weather || undefined, terrain: f.terrain || undefined,
      attackerSide: { isHelpingHand: f.helping }, defenderSide: { isReflect: f.reflect, isLightScreen: f.light, isAuroraVeil: f.veil, isFriendGuard: f.friend } });
    const rows = S.atk.moves.filter(Boolean).map(mn => {
      try {
        const mv = new C.Move(A.g, mn, { isCrit: f.crit });
        if (mv.category === 'Status') return `<div class="calcres"><div class="top"><span class="mv">${esc(mv.name)}</span><span class="sub">Status move, no damage</span></div></div>`;
        const r = C.calculate(A.g, A.p, Dd.p, mv, field);
        const [lo, hi] = r.range(); const hp = Dd.p.maxHP();
        const lp = (100 * lo / hp), hpct = (100 * hi / hp);
        let ko = ''; try { ko = r.kochance().text || ''; } catch (e) { ko = ''; }
        let desc = ''; try { desc = r.desc().replace(/\bSpA\b/g, 'Special Attack').replace(/\bSpD\b/g, 'Special Defense').replace(/\bAtk\b/g, 'Attack').replace(/\bDef\b/g, 'Defense').replace(/\bvs\./g, 'against'); } catch (e) { desc = ''; }
        return `<div class="calcres"><div class="top"><span class="mv">${esc(mv.name)}</span><span class="rng">${lo}–${hi} <span class="sub">(${lp.toFixed(1)}–${hpct.toFixed(1)}%)</span></span></div>
          <div class="hpbar"><span class="hi" style="width:${Math.min(100, hpct)}%"></span><span class="lo" style="width:${Math.min(100, lp)}%"></span></div>
          <span class="ko">${esc(ko ? ko[0].toUpperCase() + ko.slice(1).replace(/OHKO/g, 'one-hit knockout').replace(/(\d)HKO/g, '$1-hit knockout') : 'Not a knockout in a few hits')}</span>
          ${desc ? `<span class="desc">${esc(desc.replace(/OHKO/g, 'one-hit knockout').replace(/(\d)HKO/g, '$1-hit knockout'))}</span>` : ''}</div>`;
      } catch (e) { return `<div class="calcres"><div class="top"><span class="mv">${esc(mn)}</span><span class="sub">Not a move the calculator knows for this game</span></div></div>`; }
    });
    out.innerHTML = rows.join('') || '<div class="empty">Add at least one move for the attacker.</div>';
  }

  function render() {
    if (!VL.D.dex) return;
    const sel = $('cl-format');
    sel.innerHTML = VL.D.formats().map(f => `<option value="${esc(f.id)}">${esc(f.name)} · ${esc(f.game)}</option>`).join('');
    if (!S.fmt) S.fmt = VL.curFormatId ? VL.curFormatId() : '';
    sel.value = fmt().id;
    $('cl-note').innerHTML = isChamp()
      ? 'Champions rules: Level 50, no individual values, and Stat Points instead of effort values. The engine\'s Champions support is newer than the rest, so treat results as very close rather than exact, and check surprising numbers in-game.'
      : `Generation ${fmt().gen} rules, Level 50, individual values set to 31.`;
    $('cl-sides').innerHTML = sideHtml('atk', 'Attacker') + sideHtml('def', 'Defender');
    $('cl-field').innerHTML = fieldHtml();
    fillLists();
    loadEngine().then(() => { if (!$('cl-sides').dataset.megaChecked) { $('cl-sides').dataset.megaChecked = '1'; $('cl-sides').innerHTML = sideHtml('atk', 'Attacker') + sideHtml('def', 'Defender'); } compute(); }).catch(() => { $('cl-out').innerHTML = '<div class="empty">The calculator didn\'t load. Check your connection and reopen this page.</div>'; });
  }
  function fillLists() {
    const f = fmt(); const D = VL.D;
    const ensure = (id) => { let dl = document.getElementById(id); if (!dl) { dl = document.createElement('datalist'); dl.id = id; document.body.appendChild(dl); } return dl; };
    const mons = f.species.map(i => D.dex.species[i].n);
    ensure('dl-calc-mons').innerHTML = mons.map(n => `<option value="${esc(n)}">`).join('');
    ensure('dl-calc-items').innerHTML = f.items.map(id => D.dex.items[id]).filter(Boolean).map(it => `<option value="${esc(it.n)}">`).join('');
    ensure('dl-calc-moves').innerHTML = Object.values(D.dex.moves || {}).filter(m => m.c !== 'S').map(m => `<option value="${esc(m.n)}">`).join('');
  }

  function commonSet(key) {
    const s = S[key]; const e = VL.meta.forFormat(fmt().id); const m = VL.meta.get(e, s.mon);
    if (!m) { VL.toast('No usage stats for ' + (s.mon || 'that Pokémon') + ' in this format yet'); return false; }
    const top = (arr) => arr && arr[0] ? arr[0][0] : '';
    s.item = top(m.items) === 'No item' ? '' : top(m.items);
    s.ability = top(m.abilities) || s.ability;
    const spr = top(m.spreads);
    if (spr && spr.includes(':')) { const [nat, nums] = spr.split(':'); s.nature = nat; s.sp = nums.split('/').map(Number).map(v => Math.min(spMax(), v || 0)); }
    if (key === 'atk') { const dmg = (m.moves || []).map(x => x[0]).filter(n => { const mv = VL.D.dex.moves[toId(n)]; return mv && mv.c !== 'S'; }); s.moves = [0, 1, 2, 3].map(k => dmg[k] || ''); }
    s.mega = true;
    return true;
  }

  // ---------- events ----------
  $('cl-sides').addEventListener('change', e => {
    const card = e.target.closest('[data-side]'); if (!card) return; const key = card.dataset.side; const s = S[key];
    const t = e.target;
    if (t.dataset.f) {
      const f = t.dataset.f;
      if (f === 'mega') s.mega = t.checked;
      else if (f === 'hp') s.hp = Math.max(1, Math.min(100, +t.value || 100));
      else s[f] = t.value.trim();
      if (f === 'mon') { const i = VL.D.find(s.mon); if (i >= 0) { const p = VL.D.dex.species[i]; s.mon = p.n; s.ability = p.a[0] || ''; } }
      save(); render(); return;
    }
    if (t.dataset.sp !== undefined) { s.sp[+t.dataset.sp] = Math.max(0, Math.min(spMax(), +t.value || 0)); save(); card.querySelector('[data-sptotal]').textContent = s.sp.reduce((a, b) => a + b, 0); compute(); return; }
    if (t.dataset.boost) { s.boosts[t.dataset.boost] = +t.value; save(); compute(); return; }
    if (t.dataset.move !== undefined) { s.moves[+t.dataset.move] = t.value.trim(); save(); compute(); }
  });
  $('cl-sides').addEventListener('click', e => {
    const b = e.target.closest('[data-common]'); if (!b) return;
    const key = b.closest('[data-side]').dataset.side;
    if (commonSet(key)) { save(); render(); VL.toast('Loaded the most common set'); }
  });
  $('cl-field').addEventListener('change', e => {
    const k = e.target.dataset.ff; if (!k) return;
    S.field[k] = e.target.type === 'checkbox' ? e.target.checked : (k === 'doubles' ? e.target.value === '1' : e.target.value);
    save(); compute();
  });
  $('cl-format').addEventListener('change', () => { S.fmt = $('cl-format').value; const f = fmt(); S.field.doubles = f.doubles; for (const k of ['atk', 'def']) S[k].sp = S[k].sp.map(v => Math.min(spMax(), v)); save(); render(); });
  $('cl-swap').onclick = () => { const a = S.atk; S.atk = { ...S.def, moves: S.def.moves || ['', '', '', ''] }; S.def = { ...a }; const e = VL.meta.forFormat(fmt().id); const m = VL.meta.get(e, S.atk.mon); if (m && !S.atk.moves.some(Boolean)) commonSet('atk'); save(); render(); };

  VL.calc = {
    render,
    engine: loadEngine,
    load(metaKey, name, side) {
      const e = VL.meta.data && VL.meta.data.formats[metaKey];
      S.fmt = e ? e.parent : S.fmt;
      const key = side === 'def' ? 'def' : 'atk';
      S[key] = { ...blank(), mon: name };
      const i = VL.D.find(name); if (i >= 0) S[key].ability = VL.D.dex.species[i].a[0] || '';
      commonSet(key); save();
      location.hash = 'calc'; render();
    },
  };
})();
