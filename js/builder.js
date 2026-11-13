/* Team builder: six slots, search pickers for Pokémon, items and moves (only
 * what's legal in the format), Stat Points or EV sliders with live stats,
 * damage against the meta, and the team checker's analysis, all updating as
 * you build. Teams save themselves as Showdown text, so the rest of the app
 * (logging, the checker, the battle companion) reads them as before.
 * Sprites and item icons load from Pokémon Showdown's image server. */
(function () {
  'use strict';
  const VL = (window.VL = window.VL || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toId = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const D = () => VL.D;
  const store = () => VL.store;

  const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
  const LABEL = ['HP', 'Attack', 'Defense', 'Sp. Atk', 'Sp. Def', 'Speed'];
  const SHORT = ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'];
  const BAR = ['#e5484d', '#f76b15', '#f5b400', '#3e63dd', '#30a46c', '#d6409f'];
  const TYPES = ['Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison', 'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy'];
  const NATURES = { Hardy: [], Lonely: ['atk', 'def'], Brave: ['atk', 'spe'], Adamant: ['atk', 'spa'], Naughty: ['atk', 'spd'], Bold: ['def', 'atk'], Docile: [], Relaxed: ['def', 'spe'], Impish: ['def', 'spa'], Lax: ['def', 'spd'], Timid: ['spe', 'atk'], Hasty: ['spe', 'def'], Serious: [], Jolly: ['spe', 'spa'], Naive: ['spe', 'spd'], Modest: ['spa', 'atk'], Mild: ['spa', 'def'], Quiet: ['spa', 'spe'], Bashful: [], Rash: ['spa', 'spd'], Calm: ['spd', 'atk'], Gentle: ['spd', 'def'], Sassy: ['spd', 'spe'], Careful: ['spd', 'spa'], Quirky: [] };
  const NATNAME = { atk: 'Atk', def: 'Def', spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed' };

  // ---------- images (Pokémon Showdown) ----------
  const SD = 'https://play.pokemonshowdown.com/sprites/';
  const spriteId = (rec) => (rec && (rec.sp || rec.id)) || '';
  VL.sprite = function (nameOrRec, cls) {
    const rec = typeof nameOrRec === 'string' ? (() => { const i = D().find(nameOrRec); return i >= 0 ? D().dex.species[i] : null; })() : nameOrRec;
    if (!rec) return `<span class="spr none ${cls || ''}"></span>`;
    const id = spriteId(rec);
    return `<img class="spr ${cls || ''}" src="${SD}home-centered/${esc(id)}.png" data-sid="${esc(id)}" data-ini="${esc(rec.n.slice(0, 2))}" alt="" loading="lazy" decoding="async" onerror="VL.spriteFail(this)">`;
  };
  VL.spriteFail = function (img) {
    const step = +(img.dataset.step || 0) + 1; img.dataset.step = step;
    if (step === 1) { img.src = `${SD}gen5/${img.dataset.sid}.png`; img.classList.add('pix'); return; }
    if (step === 2) { img.src = `${SD}dex/${img.dataset.sid}.png`; return; }
    const s = document.createElement('span'); s.className = img.className + ' none'; s.textContent = img.dataset.ini || '?'; img.replaceWith(s);
  };
  const itemIcon = (id) => {
    const it = id && D().dex.items[toId(id)]; const n = it && it.sn;
    if (!n) return '<span class="iicon blank"></span>';
    return `<span class="iicon" style="background-position:-${(n % 16) * 24}px -${Math.floor(n / 16) * 24}px"></span>`;
  };
  const tyBadge = (t) => `<span class="ty ${esc(t)}">${esc(t)}</span>`;
  const catIcon = (c) => `<span class="cat ${c === 'P' ? 'phys' : c === 'S' ? 'stat' : 'spec'}" title="${c === 'P' ? 'Physical' : c === 'S' ? 'Status' : 'Special'}">${c === 'P' ? 'Phys' : c === 'S' ? 'Status' : 'Spec'}</span>`;

  // ---------- format helpers ----------
  let T = null; // the open team: { id, name, fmt, sets: [6], why, weak, src }
  let sel = 0, rtab = 'off', atab = 'weak';
  const fmt = () => D().format(T && T.fmt);
  const isChamp = () => { const f = fmt(); return !!(f && f.mod && f.mod.startsWith('champions')); };
  const spMax = () => (isChamp() ? 32 : 252);
  const spTotal = () => (isChamp() ? 66 : 508);
  const spStep = () => (isChamp() ? 1 : 4);
  const hasTera = () => { const f = fmt(); return f && f.gen === 9 && !isChamp(); };
  const recOf = (name) => { const i = D().find(name); return i >= 0 ? D().mon(i, fmt()) : null; };
  const metaE = () => VL.meta && VL.meta.forFormat ? VL.meta.forFormat(fmt().id) : null;
  const metaOf = (name) => { const e = metaE(); return e && VL.meta.get(e, name); };

  // learnsets load per format, on demand
  const lsCache = {};
  function learnset(fid) {
    if (!lsCache[fid]) lsCache[fid] = fetch(`data/learnsets/${fid}.json`).then(r => r.ok ? r.json() : null).catch(() => null);
    return lsCache[fid];
  }
  let LS = null, LSfor = '';
  function movesFor(rec) {
    if (!LS || !rec) return null;
    let l = LS.l[rec.i];
    if (!l && rec.b) { const bi = D().find(rec.b); l = LS.l[bi]; }
    return l ? l.map(k => LS.m[k]) : null;
  }
  let MT = null; // move descriptions
  const moveText = () => MT || (MT = fetch('data/movetext.json').then(r => r.json()).catch(() => ({})));
  let MTX = {}; moveText().then(x => { MTX = x || {}; });

  // ---------- sets and Showdown text ----------
  const blank = () => ({ species: '', item: '', ability: '', nature: '', evs: [0, 0, 0, 0, 0, 0], ivs: [31, 31, 31, 31, 31, 31], moves: ['', '', '', ''], tera: '' });
  const STATWORD = { hp: 0, atk: 1, def: 2, spa: 3, spd: 4, spe: 5, 'sp. atk': 3, 'sp. def': 4, spatk: 3, spdef: 4, attack: 1, defense: 2, speed: 5 };
  function parsePaste(text) {
    const blocks = String(text || '').replace(/\r/g, '').split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
    const out = [];
    for (const b of blocks) {
      const lines = b.split('\n').map(l => l.trim()).filter(Boolean); if (!lines.length) continue;
      const s = blank();
      const [head, item] = lines[0].split(' @ ');
      if (item) s.item = item.trim();
      let nm = head.replace(/\((M|F)\)\s*$/, '').trim(); const par = nm.match(/\(([^)]+)\)\s*$/); if (par) nm = par[1];
      s.species = nm.trim();
      let mi = 0;
      for (const l of lines.slice(1)) {
        if (/^Ability:/i.test(l)) s.ability = l.slice(8).trim();
        else if (/^Tera Type:/i.test(l)) s.tera = l.slice(10).trim();
        else if (/^(EVs|SPs|Stat Points):/i.test(l)) for (const part of l.split(':')[1].split('/')) { const m = part.trim().match(/^(\d+)\s+(.+)$/); if (m) { const k = STATWORD[m[2].toLowerCase()]; if (k !== undefined) s.evs[k] = +m[1]; } }
        else if (/^IVs:/i.test(l)) for (const part of l.slice(4).split('/')) { const m = part.trim().match(/^(\d+)\s+(.+)$/); if (m) { const k = STATWORD[m[2].toLowerCase()]; if (k !== undefined) s.ivs[k] = +m[1]; } }
        else if (/Nature$/i.test(l)) s.nature = l.replace(/\s*Nature$/i, '').trim();
        else if (/^[-~]/.test(l) && mi < 4) s.moves[mi++] = l.replace(/^[-~]\s*/, '').split(' / ')[0].trim();
      }
      out.push(s);
      if (out.length === 6) break;
    }
    // a bare list of names also works
    if (!out.length && text && !/\n-/.test(text)) for (const n of String(text).split(/[,/\n]+/).map(x => x.trim()).filter(Boolean).slice(0, 6)) out.push({ ...blank(), species: n });
    return out;
  }
  function exportSet(s) {
    if (!s || !s.species) return '';
    const L = [`${s.species}${s.item ? ` @ ${s.item}` : ''}`];
    if (s.ability) L.push(`Ability: ${s.ability}`);
    L.push('Level: 50');
    if (s.tera && hasTera()) L.push(`Tera Type: ${s.tera}`);
    const ev = STATS.map((k, i) => s.evs[i] ? `${s.evs[i]} ${SHORT[i]}` : '').filter(Boolean);
    if (ev.length) L.push(`EVs: ${ev.join(' / ')}`);
    if (s.nature) L.push(`${s.nature} Nature`);
    if (!isChamp()) { const iv = STATS.map((k, i) => s.ivs[i] !== 31 ? `${s.ivs[i]} ${SHORT[i]}` : '').filter(Boolean); if (iv.length) L.push(`IVs: ${iv.join(' / ')}`); }
    for (const m of s.moves) if (m) L.push(`- ${m}`);
    return L.join('\n');
  }
  const exportTeam = () => T.sets.filter(s => s && s.species).map(exportSet).join('\n\n');

  // ---------- stats ----------
  function megaName(s, rec) {
    if (!s.item || !rec) return null;
    const it = D().dex.items[toId(s.item)]; if (!it || !/Mega Evolve/.test(it.d || '')) return null;
    const base = rec.b || rec.n;
    const cand = D().dex.species.find(x => x.mg && x.b === base && toId(s.item).startsWith(toId(base).slice(0, 4)) && (/ X$/.test(s.item) ? /-X$/.test(x.n) : / Y$/.test(s.item) ? /-Y$/.test(x.n) : !/-[XY]$/.test(x.n)));
    return cand ? cand.n : null;
  }
  function statsOf(s, rec) {
    const nat = NATURES[s.nature] || [];
    return STATS.map((k, i) => {
      const b = rec.s[i], ev = s.evs[i] || 0;
      if (isChamp()) {
        if (i === 0) return b === 1 ? 1 : b + ev + 75;
        return Math.floor((b + ev + 20) * (nat[0] === k ? 1.1 : nat[1] === k ? 0.9 : 1));
      }
      const iv = s.ivs[i] ?? 31;
      if (i === 0) return b === 1 ? 1 : Math.floor((2 * b + iv + Math.floor(ev / 4)) * 50 / 100) + 60;
      return Math.floor((Math.floor((2 * b + iv + Math.floor(ev / 4)) * 50 / 100) + 5) * (nat[0] === k ? 1.1 : nat[1] === k ? 0.9 : 1));
    });
  }

  // ---------- teams in storage ----------
  const LAST = 'vgclab-builder-team';
  const teamsList = () => store().list('teams').sort((a, b) => (b.u || b.ts || 0) - (a.u || a.ts || 0));
  function openTeam(id) {
    const t = id && store().get('teams', id);
    if (t) {
      const sets = parsePaste(t.paste || ''); while (sets.length < 6) sets.push(null);
      T = { id: t.id, name: t.name || 'Untitled team', fmt: t.fmt || VL.curFormatId(), sets, why: t.why || '', weak: t.weak || '', src: t.src || '' };
      try { localStorage.setItem(LAST, t.id); } catch (e) { /* ignore */ }
    } else {
      T = { id: null, name: 'Untitled team', fmt: VL.curFormatId(), sets: [null, null, null, null, null, null], why: '', weak: '', src: '' };
    }
    if (!D().dex.formats.some(f => f.id === T.fmt)) T.fmt = D().format('').id;
    sel = Math.max(0, T.sets.findIndex(s => s && s.species)); if (sel < 0) sel = 0;
  }
  let saveTimer = null;
  function save(now) {
    clearTimeout(saveTimer);
    const go = () => {
      if (!T.sets.some(s => s && s.species) && !T.id) return; // nothing to save yet
      if (!T.id) { T.id = VL.newId('t'); try { localStorage.setItem(LAST, T.id); } catch (e) { /* ignore */ } }
      const prev = store().get('teams', T.id);
      store().put('teams', T.id, { ts: prev?.ts || Date.now(), name: T.name.trim() || 'Untitled team', fmt: T.fmt, paste: exportTeam(), why: T.why, weak: T.weak, src: T.src });
      const st = $('bd-saved'); if (st) st.textContent = 'Saved';
    };
    if (now) go(); else { const st = $('bd-saved'); if (st) st.textContent = 'Saving…'; saveTimer = setTimeout(go, 500); }
  }

  // ---------- rendering ----------
  function render() {
    const root = $('bd-root'); if (!root || !D().dex) return;
    if (!T) { let last = null; try { last = localStorage.getItem(LAST); } catch (e) { /* ignore */ } openTeam(last && store().get('teams', last) ? last : (teamsList()[0] || {}).id); }
    const f = fmt();
    if (LSfor !== f.id) { LSfor = f.id; LS = null; learnset(f.id).then(x => { if (LSfor === f.id) { LS = x; renderEditor(); } }); }
    root.innerHTML = `
      <div class="bd-top">
        <div class="bd-name"><input type="text" id="bd-name" value="${esc(T.name)}" aria-label="Team name" maxlength="60">
          <select id="bd-pick" aria-label="Open a saved team"><option value="">Saved teams…</option>${teamsList().map(t => `<option value="${esc(t.id)}">${esc(t.name || 'Untitled team')}</option>`).join('')}<option value="__new">+ New team</option></select></div>
        <div class="bd-actions">
          <select id="bd-fmt" aria-label="Format">${D().formats().map(x => `<option value="${esc(x.id)}" ${x.id === f.id ? 'selected' : ''}>${esc(x.name)} · ${esc(x.game)}</option>`).join('')}</select>
          <button class="btn ghost small" data-bd="import">Import</button><button class="btn ghost small" data-bd="export">Showdown export</button><button class="btn ghost small" data-bd="notes">Notes</button><button class="btn ghost small" data-bd="del">Delete</button>
        </div>
      </div>
      <div class="bd-sub"><span><b id="bd-count">${T.sets.filter(s => s && s.species).length}/6</b> Pokémon</span>${recordPill()}<span class="sub" id="bd-saved">${T.id ? 'Saved' : 'Starts saving when you add a Pokémon'}</span><button class="linkbtn" data-bd="clear">Clear all</button></div>
      <div class="bd-slots" id="bd-slots"></div>
      <div class="bd-main">
        <div class="bd-edit card" id="bd-edit"></div>
        <div class="bd-side card" id="bd-side"></div>
      </div>
      <div class="card bd-analysis" id="bd-analysis"></div>`;
    renderSlots(); renderEditor(); renderAnalysis();
  }
  function recordPill() {
    if (!T.id) return '';
    const g = store().list('games').filter(x => x.team === T.id); if (!g.length) return '';
    const w = g.filter(x => x.result === 'W').length;
    return `<span class="pill ${w * 2 >= g.length ? 'w' : 'l'}">${w}–${g.length - w} in your log</span>`;
  }
  function renderSlots() {
    const c = $('bd-count'); if (c) c.textContent = `${T.sets.filter(s => s && s.species).length}/6`;
    $('bd-slots').innerHTML = T.sets.map((s, i) => {
      const rec = s && s.species ? recOf(s.species) : null;
      if (!s || !s.species) return `<button type="button" class="bd-slot empty ${i === sel ? 'on' : ''}" data-slot="${i}"><span class="plus">+</span><span>Slot ${i + 1}</span></button>`;
      const mega = megaName(s, rec);
      return `<div class="bd-slot ${i === sel ? 'on' : ''}" data-slot="${i}" role="button" tabindex="0" aria-label="${esc(s.species)}">
        <button type="button" class="x" data-rm="${i}" aria-label="Remove ${esc(s.species)}">×</button>
        ${VL.sprite(rec || s.species, 'md')}${mega ? '<span class="megabadge" title="Mega Evolves">M</span>' : ''}
        <b>${esc(rec ? rec.n : s.species)}</b>
        <span class="tys">${rec ? rec.t.map(tyBadge).join('') : '<span class="sub">Not found</span>'}</span>
        ${s.item ? `<span class="itm">${itemIcon(s.item)}${esc(s.item)}</span>` : ''}</div>`;
    }).join('');
  }

  function renderEditor() {
    const el = $('bd-edit'); if (!el) return;
    const s = T.sets[sel];
    if (!s || !s.species) {
      el.innerHTML = `<div class="bd-emptyedit"><h3>Slot ${sel + 1}</h3><p class="sub">Pick a Pokémon for this slot. You'll see everything legal in ${esc(fmt().name)}, most used first${T.sets.some(x => x && x.species) ? ', with the ones that pair well with your team marked' : ''}.</p><button class="btn" data-bd="pickmon">Choose a Pokémon</button></div>`;
      renderSide(); return;
    }
    const rec = recOf(s.species);
    if (!rec) { el.innerHTML = `<div class="bd-emptyedit"><h3>${esc(s.species)}</h3><p class="sub">This Pokémon isn't in ${esc(fmt().name)}'s data. Pick another, or switch the format above.</p><button class="btn" data-bd="pickmon">Choose a Pokémon</button></div>`; renderSide(); return; }
    const m = metaOf(rec.n); const champ = isChamp();
    const mega = megaName(s, rec); const megaRec = mega ? recOf(mega) : null;
    const statRec = megaRec || rec;
    const st = statsOf(s, statRec); const used = s.evs.reduce((a, b) => a + b, 0);
    const abilList = (megaRec ? [] : rec.a);
    const pct = (list, n) => { const x = list && list.find(y => toId(y[0]) === toId(n)); return x ? x[1] : null; };
    const nat = NATURES[s.nature] || [];
    el.innerHTML = `
      <div class="bd-head">
        <button type="button" class="bd-bigspr" data-bd="pickmon" aria-label="Change Pokémon">${VL.sprite(megaRec || rec, 'lg')}</button>
        <div><div class="kv"><h3>${esc(rec.n)}</h3>${megaRec ? `<span class="pill n">Mega: ${esc(megaRec.n)}</span>` : ''}</div>
          <div class="kv">${(megaRec || rec).t.map(tyBadge).join('')}${m ? `<span class="mini">${m.u.toFixed(1)}% of teams</span>` : ''}</div>
          <div class="kv" style="margin-top:6px"><button class="btn ghost small" data-bd="pickmon">Change</button>${m ? '<button class="btn ghost small" data-bd="common">Use most common set</button>' : ''}</div></div>
      </div>
      <div class="bd-field"><div class="section-label">Ability${megaRec ? ' (after Mega Evolving it becomes ' + esc(megaRec.a[0]) + ')' : ''}</div>
        <div class="bd-abils">${rec.a.map(a => { const ab = D().dex.abilities[toId(a)]; const p = m && pct(m.abilities, a); return `<button type="button" class="bd-abil" data-abil="${esc(a)}" aria-pressed="${toId(s.ability) === toId(a)}"><b>${esc(a)}</b>${p !== null && p !== undefined ? `<span class="mini">${p}%</span>` : ''}<span class="sub">${esc(ab ? ab.d : '')}</span></button>`; }).join('')}</div></div>
      <div class="bd-grid2">
        <div class="bd-field"><div class="section-label">Item</div><button type="button" class="bd-input" data-bd="pickitem">${s.item ? `${itemIcon(s.item)}<span>${esc(s.item)}</span>` : '<span class="sub">No item</span>'}${m && s.item && pct(m.items, s.item) ? `<span class="mini">${pct(m.items, s.item)}%</span>` : ''}</button></div>
        <div class="bd-field"><div class="section-label">Nature</div><select id="bd-nature">${Object.entries(NATURES).map(([n, [p, q]]) => `<option value="${n}" ${s.nature === n ? 'selected' : ''}>${n}${p ? ` (+${NATNAME[p]}, −${NATNAME[q]})` : ' (no change)'}</option>`).join('')}</select></div>
        ${hasTera() ? `<div class="bd-field"><div class="section-label">Tera type</div><select id="bd-tera"><option value="">Not set</option>${TYPES.concat(['Stellar']).map(t => `<option ${s.tera === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>` : ''}
      </div>
      <div class="bd-field"><div class="section-label">Moves${LS ? '' : ' <span class="mini">loading legal moves…</span>'}</div>
        <div class="bd-moves">${s.moves.map((mn, k) => {
          const mv = mn && D().dex.moves[toId(mn)];
          if (!mn) return `<button type="button" class="bd-move empty" data-move="${k}">Move ${k + 1}</button>`;
          const p = m && pct(m.moves, mn);
          return `<div class="bd-move" data-move="${k}" role="button" tabindex="0"><div class="mt"><b>${esc(mv ? mv.n : mn)}</b>${mv ? tyBadge(mv.t) + catIcon(mv.c) : ''}${p ? `<span class="mini">${p}%</span>` : ''}<span class="mini r">${mv && mv.bp ? mv.bp + ' power' : ''}</span></div><div class="sub">${esc(MTX[toId(mn)] || '')}</div><button type="button" class="x" data-mvx="${k}" aria-label="Remove ${esc(mn)}">×</button></div>`;
        }).join('')}</div></div>
      <div class="bd-field"><div class="section-label">Stats at level 50${megaRec ? ` (as ${esc(megaRec.n)})` : ''}</div>
        <div class="bd-stats">${STATS.map((k, i) => `<div class="bd-stat"><span class="nm ${nat[0] === k ? 'up' : nat[1] === k ? 'down' : ''}">${LABEL[i]}</span><span class="bs">${statRec.s[i]}</span><span class="bar"><i style="width:${Math.min(100, st[i] / (i === 0 ? 2.6 : 2.4))}%;background:${BAR[i]}"></i></span><b class="v">${st[i]}</b><span class="mini">${s.evs[i] ? '+' + s.evs[i] : ''}</span></div>`).join('')}</div></div>
      <div class="bd-field"><div class="section-label">${champ ? '<span class="term" data-term="statpoints">Stat Points</span> (32 max per stat)' : 'Effort values (252 max per stat)'} <span class="r ${used > spTotal() ? 'bad' : ''}" id="bd-used">${used}/${spTotal()}</span></div>
        <div class="bd-sliders">${STATS.map((k, i) => `<label class="bd-slider"><span>${LABEL[i]}</span><input type="range" min="0" max="${spMax()}" step="${spStep()}" value="${s.evs[i]}" data-ev="${i}" aria-label="${LABEL[i]} ${champ ? 'Stat Points' : 'effort values'}"><input type="number" min="0" max="${spMax()}" step="${spStep()}" value="${s.evs[i]}" data-evn="${i}" aria-label="${LABEL[i]}"></label>`).join('')}</div>
        <div class="kv bd-presets">${[['Max Atk/Spe', [0, 1, 0, 0, 0, 1]], ['Max SpA/Spe', [0, 0, 0, 1, 0, 1]], ['Max HP/Def', [1, 0, 1, 0, 0, 0]], ['Max HP/SpD', [1, 0, 0, 0, 1, 0]], ['Max HP/Atk', [1, 1, 0, 0, 0, 0]], ['Max HP/SpA', [1, 0, 0, 1, 0, 0]]].map(([l, v]) => `<button class="chipbtn" data-preset="${v.join('')}">${l}</button>`).join('')}<button class="chipbtn" data-preset="000000">Reset</button></div>
        ${m && m.spreads && m.spreads.length ? `<div class="kv bd-presets"><span class="mini">Common spreads:</span>${m.spreads.slice(0, 4).map(([sp, p]) => `<button class="chipbtn" data-spread="${esc(sp)}">${esc(sp.replace(':', ' '))} <span class="mini">${p}%</span></button>`).join('')}</div>` : ''}
      </div>`;
    renderSide();
  }

  // ---------- this Pokémon against the meta ----------
  let sideToken = 0;
  function renderSide() {
    const el = $('bd-side'); if (!el) return;
    const s = T.sets[sel]; const rec = s && s.species ? recOf(s.species) : null;
    const e = metaE();
    const head = `<div class="card-head"><h3>${rec ? esc(rec.n) + ' vs the meta' : 'Against the meta'}</h3></div>
      <div class="seg bd-tabs" role="group" aria-label="View">${[['off', 'Offense'], ['def', 'Defense'], ['spe', 'Speed']].map(([k, l]) => `<button type="button" data-rtab="${k}" aria-pressed="${rtab === k}">${l}</button>`).join('')}</div>`;
    if (!rec) { el.innerHTML = head + '<p class="sub">Pick a Pokémon to see how it does against the most used Pokémon.</p>'; return; }
    if (!e) { el.innerHTML = head + `<p class="sub">There are no usage stats for ${esc(fmt().name)}, so there's no meta to compare against. Current formats have them.</p>`; return; }
    if (rtab === 'spe') { el.innerHTML = head + speedHtml(s, rec, e); return; }
    el.innerHTML = head + '<p class="sub">Calculating…</p>';
    const tok = ++sideToken;
    VL.calc.engine().then(() => { if (tok !== sideToken) return; el.innerHTML = head + damageHtml(s, rec, e, rtab === 'off'); }).catch(() => { el.innerHTML = head + '<p class="sub">Couldn\'t load the damage calculator.</p>'; });
  }
  function speedHtml(s, rec, e) {
    const mega = megaName(s, rec); const r = mega ? recOf(mega) : rec;
    const mine = statsOf(s, r)[5];
    const others = e.mons.slice(0, 40).filter(x => x.n !== rec.n && x.n !== mega).map(x => {
      const i = D().find(x.n); if (i < 0) return null; const p = D().mon(i, fmt());
      const [nat, nums] = (x.spreads[0] ? x.spreads[0][0] : 'Hardy:0/0/0/0/0/0').split(':');
      const ev = (nums || '').split('/').map(Number);
      const sp = statsOf({ ...blank(), nature: nat, evs: ev.length === 6 ? ev : [0, 0, 0, 0, 0, 0] }, p)[5];
      const scarf = x.items[0] && x.items[0][0] === 'Choice Scarf';
      return { n: x.n, s: scarf ? Math.floor(sp * 1.5) : sp, scarf, rec: p };
    }).filter(Boolean);
    const list = others.concat([{ n: rec.n, s: mine, me: true, rec: r }]).sort((a, b) => b.s - a.s);
    const faster = others.filter(o => o.s > mine).length, ties = others.filter(o => o.s === mine).length;
    return `<p class="sub">${mine} Speed. Faster than ${others.length - faster - ties} of the ${others.length} most used Pokémon${ties ? `, tied with ${ties}` : ''}, each with its most common spread${others.some(o => o.scarf) ? ' (Choice Scarf users shown with it)' : ''}.</p>
      <div class="bd-speed">${list.map(o => `<div class="${o.me ? 'me' : o.s === mine ? 'tie' : ''}"><span class="num">${o.s}</span>${VL.sprite(o.rec, 'xs')}<span>${esc(o.n)}${o.scarf ? ' <span class="mini">Scarf</span>' : ''}${o.me ? ' <b class="mini">yours</b>' : ''}</span></div>`).join('')}</div>`;
  }
  function damageHtml(s, rec, e, offense) {
    const C = window.calc; const f = fmt(); const g = C.Generations.get(isChamp() ? 0 : f.gen);
    const field = () => new C.Field({ gameType: f.doubles ? 'Doubles' : 'Singles' });
    const mine = calcMon(C, g, s, rec);
    if (!mine) return '<p class="sub">The calculator doesn\'t know this Pokémon yet.</p>';
    const myMoves = s.moves.map(n => n && D().dex.moves[toId(n)]).filter(mv => mv && mv.c !== 'S' && mv.bp > 0);
    if (offense && !myMoves.length) return '<p class="sub">Add an attacking move to see how much damage it does.</p>';
    const opp = e.mons.slice(0, 16).filter(x => x.n !== rec.n).slice(0, 14);
    const cards = opp.map(x => {
      const set = { ...blank(), species: x.n, item: x.items[0] && x.items[0][0] !== 'No item' ? x.items[0][0] : '', ability: x.abilities[0] ? x.abilities[0][0] : '' };
      const [nat, nums] = (x.spreads[0] ? x.spreads[0][0] : 'Hardy:0/0/0/0/0/0').split(':'); set.nature = nat; const ev = (nums || '').split('/').map(Number); if (ev.length === 6) set.evs = ev;
      const orec = recOf(x.n); if (!orec) return null;
      const them = calcMon(C, g, set, orec); if (!them) return null;
      let rows;
      if (offense) rows = myMoves.map(mv => row(C, g, mine, them, mv.n, field));
      else rows = x.moves.map(y => D().dex.moves[toId(y[0])]).filter(mv => mv && mv.c !== 'S' && mv.bp > 0).slice(0, 3).map(mv => row(C, g, them, mine, mv.n, field));
      rows = rows.filter(Boolean);
      const best = Math.max(0, ...rows.map(r => r.hi));
      const cls = offense ? (best >= 100 ? 'good' : best >= 50 ? 'mid' : '') : (best >= 100 ? 'bad' : best >= 50 ? 'mid' : 'good');
      return `<div class="bd-vs ${cls}"><div class="kv">${VL.sprite(orec, 'xs')}<b>${esc(x.n)}</b><span class="mini">${x.u.toFixed(1)}%</span></div>${rows.map(r => `<div class="dmg"><span>${esc(r.n)}</span><span class="bar"><i style="width:${Math.min(100, r.hi)}%" class="${r.hi >= 100 ? 'ko' : r.hi >= 50 ? 'two' : ''}"></i></span><span class="num ${r.hi >= 100 ? 'ko' : r.hi >= 50 ? 'two' : ''}">${r.lo}–${r.hi}%</span></div>`).join('') || '<span class="sub">No damaging moves</span>'}</div>`;
    }).filter(Boolean);
    return `<p class="sub">${offense ? `Your moves into the 14 most used Pokémon` : `Their most used attacks into your ${esc(rec.n)}`}, each with its most common set. Level 50, no field effects. <span class="good-t">Green</span> ${offense ? 'can knock out in one hit' : 'is a safe matchup'}, <span class="mid-t">orange</span> is ${offense ? 'two hits' : 'a big hit (50% or more)'}${offense ? '' : ', <span class="bad-t">red</span> can knock you out'}.</p><div class="bd-vsgrid">${cards.join('')}</div>`;
  }
  function calcMon(C, g, s, rec) {
    try {
      let name = rec.n; const mega = megaName(s, rec); if (mega) name = mega;
      const evs = {}; STATS.forEach((k, i) => { evs[k] = s.evs[i] || 0; });
      const opts = { level: 50, nature: s.nature || 'Hardy', evs };
      if (s.ability && !mega) opts.ability = s.ability;
      if (s.item) opts.item = s.item;
      if (!isChamp()) { const ivs = {}; STATS.forEach((k, i) => { ivs[k] = s.ivs[i] ?? 31; }); opts.ivs = ivs; }
      return new C.Pokemon(g, name, opts);
    } catch (e) { return null; }
  }
  function row(C, g, a, d, moveName, field) {
    try {
      const r = C.calculate(g, a, d, new C.Move(g, moveName), field());
      const [lo, hi] = r.range(); const hp = d.maxHP();
      return { n: moveName, lo: Math.round(100 * lo / hp), hi: Math.round(100 * hi / hp) };
    } catch (e) { return null; }
  }

  // ---------- whole-team analysis (from the team checker) ----------
  function renderAnalysis() {
    const el = $('bd-analysis'); if (!el) return;
    const tabs = [['weak', 'Weaknesses'], ['coverage', 'Coverage'], ['checklist', 'What\'s missing'], ['threats', 'Threats'], ['speed', 'Speed tiers']];
    const sec = VL.teamcheck && VL.teamcheck.analyze(exportTeam(), fmt().id);
    el.innerHTML = `<div class="card-head"><h3>Team analysis</h3><span class="sub">Updates as you build</span></div>
      <div class="seg bd-tabs" role="group" aria-label="Analysis">${tabs.map(([k, l]) => `<button type="button" data-atab="${k}" aria-pressed="${atab === k}">${l}</button>`).join('')}</div>
      <div class="bd-an">${sec ? (sec.notes || '') + (sec[atab] || '<p class="sub">Nothing to show yet.</p>') : '<p class="sub">Add Pokémon to see what your team is weak to, what it\'s missing, and which popular Pokémon threaten it.</p>'}</div>`;
  }
  let anTimer = null;
  const analysisSoon = () => { clearTimeout(anTimer); anTimer = setTimeout(renderAnalysis, 250); };
  let sideTimer = null;
  const sideSoon = () => { clearTimeout(sideTimer); sideTimer = setTimeout(renderSide, 300); };

  // ---------- pickers ----------
  function modal(html, onReady) {
    const m = $('bd-modal');
    // a fresh body each time, so listeners from the last picker don't linger
    const old = $('bd-modal-body'); const body = old.cloneNode(false); old.replaceWith(body); body.innerHTML = html; m.hidden = false;
    document.body.classList.add('modal-open');
    if (onReady) onReady($('bd-modal-body'));
  }
  function closeModal() { $('bd-modal').hidden = true; document.body.classList.remove('modal-open'); }

  function teammateScores() {
    const e = metaE(); if (!e) return {};
    const sc = {};
    for (const s of T.sets) {
      if (!s || !s.species) continue; const m = VL.meta.get(e, s.species); if (!m || !m.mates) continue;
      for (const [n, p] of m.mates) sc[n] = Math.max(sc[n] || 0, p);
    }
    return sc;
  }
  function pickMon() {
    const f = fmt(); const e = metaE(); const mates = teammateScores(); const have = new Set(T.sets.filter(Boolean).map(s => s.species));
    const usage = {}; if (e) e.mons.forEach((x, k) => { usage[x.n] = x.u; });
    const all = f.species.map(i => D().mon(i, f)).filter(p => !have.has(p.n));
    let q = '', types = new Set(), sort = 'use', megaOnly = false;
    modal(`<div class="bd-mhead"><input type="search" id="bm-q" placeholder="Search Pokémon by name" autocomplete="off"><button class="x" data-close aria-label="Close">×</button></div>
      <div class="kv bd-chips">${TYPES.map(t => `<button type="button" class="tychip ty ${t}" data-ty="${t}" aria-pressed="false">${t}</button>`).join('')}</div>
      <div class="kv bd-chips"><span class="mini">Sort</span>${[['use', 'Most used'], ['5', 'Speed'], ['1', 'Atk'], ['3', 'SpA'], ['2', 'Def'], ['4', 'SpD'], ['0', 'HP'], ['name', 'Name']].map(([k, l]) => `<button type="button" class="chipbtn" data-sort="${k}" aria-pressed="${k === 'use'}">${l}</button>`).join('')}<button type="button" class="chipbtn" data-mega aria-pressed="false">Mega only</button><span class="mini r" id="bm-n"></span></div>
      <div class="bd-mongrid" id="bm-grid"></div>`, (body) => {
      const draw = () => {
        let list = all.filter(p => (!q || toId(p.n).includes(q)) && [...types].every(t => p.t.includes(t)) && (!megaOnly || p.mg));
        list.sort((a, b) => sort === 'use' ? ((mates[b.n] || 0) * 2 + (usage[b.n] || 0)) - ((mates[a.n] || 0) * 2 + (usage[a.n] || 0)) || a.n.localeCompare(b.n) : sort === 'name' ? a.n.localeCompare(b.n) : b.s[+sort] - a.s[+sort]);
        $('bm-n').textContent = `${list.length} Pokémon`;
        $('bm-grid').innerHTML = list.slice(0, 240).map(p => `<button type="button" class="bd-moncard ${mates[p.n] ? 'mate' : ''}" data-mon="${esc(p.n)}">${VL.sprite(p, 'md')}<b>${esc(p.n)}</b><span class="dots">${p.t.map(t => `<i class="ty ${t}" title="${t}"></i>`).join('')}</span>${mates[p.n] ? `<span class="mini mate-t">${Math.round(mates[p.n])}% together</span>` : ''}${usage[p.n] ? `<span class="mini">${usage[p.n].toFixed(1)}% used</span>` : sort !== 'use' && sort !== 'name' ? `<span class="mini">${SHORT[+sort]} ${p.s[+sort]}</span>` : ''}</button>`).join('') + (list.length > 240 ? '<p class="sub">Keep typing to narrow it down.</p>' : '') || '<p class="sub">No Pokémon match.</p>';
      };
      body.addEventListener('input', (ev) => { if (ev.target.id === 'bm-q') { q = toId(ev.target.value); draw(); } });
      body.addEventListener('click', (ev) => {
        const t = ev.target.closest('[data-ty]'); if (t) { const v = t.dataset.ty; if (types.has(v)) types.delete(v); else { if (types.size >= 2) types.clear(); types.add(v); } body.querySelectorAll('[data-ty]').forEach(b => b.setAttribute('aria-pressed', String(types.has(b.dataset.ty)))); draw(); }
        const so = ev.target.closest('[data-sort]'); if (so) { sort = so.dataset.sort; body.querySelectorAll('[data-sort]').forEach(b => b.setAttribute('aria-pressed', String(b === so))); draw(); }
        const mg = ev.target.closest('[data-mega]'); if (mg) { megaOnly = !megaOnly; mg.setAttribute('aria-pressed', String(megaOnly)); draw(); }
        const mn = ev.target.closest('[data-mon]'); if (mn) { setMon(mn.dataset.mon); closeModal(); }
      });
      draw(); setTimeout(() => $('bm-q').focus(), 30);
    });
  }
  function setMon(name) {
    const rec = recOf(name); if (!rec) return;
    // a Mega form is picked as its base Pokémon holding the stone
    let species = rec.n, item = '';
    if (rec.mg) { species = rec.b; const stone = Object.entries(D().dex.items).find(([id, it]) => fmt().items.includes(id) && /Mega Evolve/.test(it.d || '') && megaName({ item: it.n }, recOf(rec.b)) === rec.n); if (stone) item = stone[1].n; }
    const s = { ...blank(), species, item, ability: (recOf(species) || rec).a[0] || '' };
    const m = metaOf(rec.n) || metaOf(species);
    if (m) applyCommon(s, m, !!item);
    if (rec.mg) { // keep the base Pokémon's ability: the Mega's own ability only applies after it Mega Evolves
      const base = recOf(species); const bm = metaOf(species);
      s.ability = (bm && bm.abilities[0] && base.a.includes(bm.abilities[0][0])) ? bm.abilities[0][0] : base.a[0] || '';
    }
    T.sets[sel] = s;
    renderSlots(); renderEditor(); analysisSoon(); save();
    if (m) VL.toast('Filled in its most common set. Change anything you like.');
  }
  function applyCommon(s, m, keepItem) {
    if (!keepItem && m.items[0] && m.items[0][0] !== 'No item') s.item = m.items[0][0];
    if (m.abilities[0]) s.ability = m.abilities[0][0];
    if (m.spreads[0]) { const [nat, nums] = m.spreads[0][0].split(':'); s.nature = nat; const ev = (nums || '').split('/').map(Number); if (ev.length === 6) s.evs = ev.map(x => Math.min(spMax(), x)); }
    s.moves = m.moves.slice(0, 4).map(x => x[0]); while (s.moves.length < 4) s.moves.push('');
    if (hasTera() && m.tera && m.tera[0] && m.tera[0][0] !== 'nothing') s.tera = m.tera[0][0];
  }
  function pickItem() {
    const s = T.sets[sel]; const rec = recOf(s.species); const m = metaOf(rec.n);
    const items = fmt().items.map(id => ({ id, ...D().dex.items[id] })).filter(x => x.n);
    const pop = m ? m.items.filter(x => x[0] !== 'No item').map(([n, p]) => ({ ...(items.find(i => i.n === n) || { n, d: '' }), p })) : [];
    let q = '';
    modal(`<div class="bd-mhead"><input type="search" id="bm-q" placeholder="Search items" autocomplete="off"><button class="x" data-close aria-label="Close">×</button></div><div class="bd-list" id="bm-list"></div>`, (body) => {
      const line = (it) => `<button type="button" class="bd-li" data-item="${esc(it.n)}">${itemIcon(it.n)}<span class="nm"><b>${esc(it.n)}</b><span class="sub">${esc(it.d || '')}</span></span>${it.p ? `<span class="mini">${it.p}%</span>` : ''}</button>`;
      const draw = () => {
        const f = (x) => !q || toId(x.n).includes(q);
        const p = pop.filter(f), rest = items.filter(x => f(x) && !pop.some(y => y.n === x.n)).sort((a, b) => a.n.localeCompare(b.n));
        $('bm-list').innerHTML = `<button type="button" class="bd-li" data-item=""><span class="iicon blank"></span><span class="nm"><b>No item</b></span></button>` + (p.length ? `<div class="section-label">Popular on ${esc(rec.n)}</div>${p.map(line).join('')}<div class="section-label">All items</div>` : '') + rest.map(line).join('');
      };
      body.addEventListener('input', (ev) => { if (ev.target.id === 'bm-q') { q = toId(ev.target.value); draw(); } });
      body.addEventListener('click', (ev) => { const b = ev.target.closest('[data-item]'); if (b) { s.item = b.dataset.item; closeModal(); renderSlots(); renderEditor(); analysisSoon(); save(); } });
      draw(); setTimeout(() => $('bm-q').focus(), 30);
    });
  }
  function pickMove(k) {
    const s = T.sets[sel]; const rec = recOf(s.species); const m = metaOf(rec.n);
    const ids = movesFor(rec);
    const all = (ids || Object.keys(D().dex.moves)).map(id => ({ id, ...D().dex.moves[id] })).filter(x => x.n);
    const usage = {}; if (m) for (const [n, p] of m.moves) usage[toId(n)] = p;
    let q = '', cat = '', type = '', sort = 'use';
    modal(`<div class="bd-mhead"><input type="search" id="bm-q" placeholder="Search moves" autocomplete="off"><button class="x" data-close aria-label="Close">×</button></div>
      ${ids ? '' : '<p class="sub">Legal move lists are still loading, so every move is shown for now.</p>'}
      <div class="kv bd-chips">${[['P', 'Physical'], ['Sp', 'Special'], ['S', 'Status']].map(([c, l]) => `<button type="button" class="chipbtn" data-cat="${c}" aria-pressed="false">${l}</button>`).join('')}<span class="mini">Sort</span>${[['use', 'Most used'], ['bp', 'Power'], ['name', 'Name']].map(([c, l]) => `<button type="button" class="chipbtn" data-sort="${c}" aria-pressed="${c === 'use'}">${l}</button>`).join('')}</div>
      <div class="kv bd-chips">${TYPES.map(t => `<button type="button" class="tychip ty ${t}" data-ty="${t}" aria-pressed="false">${t}</button>`).join('')}</div>
      <div class="bd-mvtable" id="bm-list"></div>`, (body) => {
      const draw = () => {
        let list = all.filter(x => (!q || toId(x.n).includes(q)) && (!type || x.t === type) && (!cat || x.c === cat));
        list.sort((a, b) => sort === 'bp' ? (b.bp || 0) - (a.bp || 0) : sort === 'name' ? a.n.localeCompare(b.n) : (usage[b.id] || 0) - (usage[a.id] || 0) || a.n.localeCompare(b.n));
        $('bm-list').innerHTML = `<div class="th"><span>Type</span><span>Move</span><span>Power</span><span>Acc.</span><span>PP</span></div>` + list.map(x => `<button type="button" class="tr ${s.moves.includes(x.n) ? 'have' : ''}" data-mv="${esc(x.n)}"><span class="tc">${tyBadge(x.t)}${catIcon(x.c)}</span><span class="nm"><b>${esc(x.n)}</b>${usage[x.id] ? ` <span class="mini">${usage[x.id]}%</span>` : ''}<span class="sub">${esc(MTX[x.id] || '')}</span></span><span class="num">${x.bp || '–'}</span><span class="num">${x.a ? x.a + '%' : '–'}</span><span class="num">${x.pp || ''}</span></button>`).join('');
      };
      body.addEventListener('input', (ev) => { if (ev.target.id === 'bm-q') { q = toId(ev.target.value); draw(); } });
      body.addEventListener('click', (ev) => {
        const c = ev.target.closest('[data-cat]'); if (c) { cat = cat === c.dataset.cat ? '' : c.dataset.cat; body.querySelectorAll('[data-cat]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cat === cat))); draw(); }
        const so = ev.target.closest('[data-sort]'); if (so) { sort = so.dataset.sort; body.querySelectorAll('[data-sort]').forEach(b => b.setAttribute('aria-pressed', String(b === so))); draw(); }
        const t = ev.target.closest('[data-ty]'); if (t) { type = type === t.dataset.ty ? '' : t.dataset.ty; body.querySelectorAll('[data-ty]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.ty === type))); draw(); }
        const mv = ev.target.closest('[data-mv]'); if (mv) { const n = mv.dataset.mv; const other = s.moves.indexOf(n); if (other >= 0 && other !== k) s.moves[other] = s.moves[k]; s.moves[k] = n; closeModal(); renderEditor(); analysisSoon(); save(); }
      });
      draw(); setTimeout(() => $('bm-q').focus(), 30);
    });
  }

  // ---------- import, export and notes ----------
  function importDlg() {
    modal(`<div class="bd-mhead"><h3>Import a team</h3><button class="x" data-close aria-label="Close">×</button></div>
      <p class="sub">Paste a team in Showdown format (from Showdown's Export button, Pokepaste or a rental). It opens as a new team.</p>
      <textarea id="bm-paste" style="min-height:240px;font-family:var(--font-mono,monospace);font-size:12.5px" placeholder="Garchomp @ Choice Scarf&#10;Ability: Rough Skin&#10;Jolly Nature&#10;- Earthquake&#10;..."></textarea>
      <div class="row" style="justify-content:flex-end"><button class="btn" id="bm-go">Import</button></div>`, () => {
      $('bm-go').onclick = () => {
        const sets = parsePaste($('bm-paste').value); if (!sets.length) { VL.toast('Nothing to import'); return; }
        save(true);
        while (sets.length < 6) sets.push(null);
        T = { id: null, name: 'Imported team', fmt: T.fmt, sets, why: '', weak: '', src: 'Imported' }; sel = 0;
        closeModal(); save(true); render(); VL.toast('Team imported');
      };
      setTimeout(() => $('bm-paste').focus(), 30);
    });
  }
  function exportDlg() {
    const txt = exportTeam();
    modal(`<div class="bd-mhead"><h3>Showdown export</h3><button class="x" data-close aria-label="Close">×</button></div>
      <p class="sub">Paste this into Showdown's teambuilder with <b>Import from text</b>.</p>
      <textarea readonly id="bm-out" style="min-height:280px;font-family:var(--font-mono,monospace);font-size:12.5px">${esc(txt)}</textarea>
      <div class="row" style="justify-content:flex-end"><button class="btn" id="bm-copy">Copy</button></div>`, () => {
      $('bm-copy').onclick = async () => { try { await navigator.clipboard.writeText(txt); VL.toast('Copied'); } catch (e) { $('bm-out').select(); VL.toast('Select the text and copy it'); } };
    });
  }
  function notesDlg() {
    modal(`<div class="bd-mhead"><h3>Team notes</h3><button class="x" data-close aria-label="Close">×</button></div>
      <label>Where it's from<input id="bm-src" value="${esc(T.src)}" placeholder="Rental code, player, or my own"></label>
      <label>Why it works<textarea id="bm-why">${esc(T.why)}</textarea></label>
      <label>What it struggles with<textarea id="bm-weak">${esc(T.weak)}</textarea></label>
      <div class="row" style="justify-content:flex-end"><button class="btn" id="bm-save">Save notes</button></div>`, () => {
      $('bm-save').onclick = () => { T.src = $('bm-src').value.trim(); T.why = $('bm-why').value.trim(); T.weak = $('bm-weak').value.trim(); save(true); closeModal(); VL.toast('Notes saved'); };
    });
  }

  // ---------- events ----------
  function bind() {
    const root = $('bd-root');
    root.addEventListener('click', (e) => {
      const rm = e.target.closest('[data-rm]'); if (rm) { e.stopPropagation(); T.sets[+rm.dataset.rm] = null; renderSlots(); renderEditor(); analysisSoon(); save(); return; }
      const sl = e.target.closest('[data-slot]'); if (sl) { sel = +sl.dataset.slot; renderSlots(); renderEditor(); if (!T.sets[sel] || !T.sets[sel].species) pickMon(); return; }
      const b = e.target.closest('[data-bd]');
      if (b) {
        const k = b.dataset.bd;
        if (k === 'pickmon') pickMon();
        if (k === 'pickitem') pickItem();
        if (k === 'common') { const s = T.sets[sel]; const rec = recOf(s.species); const m = metaOf(megaName(s, rec) || rec.n) || metaOf(rec.n); if (m) { const keep = s.ability; applyCommon(s, m, false); if (!rec.a.some(a => toId(a) === toId(s.ability))) s.ability = rec.a.some(a => toId(a) === toId(keep)) ? keep : rec.a[0]; renderSlots(); renderEditor(); analysisSoon(); save(); } }
        if (k === 'import') importDlg();
        if (k === 'export') exportDlg();
        if (k === 'notes') notesDlg();
        if (k === 'clear') VL.armDelete(b, () => { T.sets = [null, null, null, null, null, null]; sel = 0; renderSlots(); renderEditor(); renderAnalysis(); save(); });
        if (k === 'del') VL.armDelete(b, () => { if (T.id) store().del('teams', T.id); try { localStorage.removeItem(LAST); } catch (x) { /* ignore */ } T = null; openTeam((teamsList()[0] || {}).id); render(); VL.toast('Team deleted'); });
        return;
      }
      const ab = e.target.closest('[data-abil]'); if (ab) { T.sets[sel].ability = ab.dataset.abil; renderEditor(); analysisSoon(); save(); return; }
      const mx = e.target.closest('[data-mvx]'); if (mx) { e.stopPropagation(); T.sets[sel].moves[+mx.dataset.mvx] = ''; renderEditor(); analysisSoon(); save(); return; }
      const mv = e.target.closest('[data-move]'); if (mv) { pickMove(+mv.dataset.move); return; }
      const pr = e.target.closest('[data-preset]'); if (pr) { const v = pr.dataset.preset.split('').map(Number); const s = T.sets[sel]; s.evs = v.map(x => x ? spMax() : 0); const left = spTotal() - s.evs.reduce((a, c) => a + c, 0); if (left > 0) { const i = v.indexOf(1) === 0 ? 5 : 0; const room = spMax() - s.evs[i]; s.evs[i] += Math.min(left, room) - (Math.min(left, room) % spStep()); } if (!v.some(Boolean)) s.evs = [0, 0, 0, 0, 0, 0]; renderEditor(); analysisSoon(); save(); return; }
      const sp = e.target.closest('[data-spread]'); if (sp) { const [nat, nums] = sp.dataset.spread.split(':'); const s = T.sets[sel]; s.nature = nat; const ev = nums.split('/').map(Number); if (ev.length === 6) s.evs = ev; renderEditor(); analysisSoon(); save(); return; }
      const rt = e.target.closest('[data-rtab]'); if (rt) { rtab = rt.dataset.rtab; renderSide(); return; }
      const at = e.target.closest('[data-atab]'); if (at) { atab = at.dataset.atab; renderAnalysis(); return; }
    });
    root.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role=button]')) { e.preventDefault(); e.target.click(); } });
    root.addEventListener('input', (e) => {
      const t = e.target;
      if (t.id === 'bd-name') { T.name = t.value; save(); return; }
      if (t.dataset.ev !== undefined || t.dataset.evn !== undefined) {
        const s = T.sets[sel]; const i = +(t.dataset.ev ?? t.dataset.evn);
        let v = Math.max(0, Math.min(spMax(), Math.round((+t.value || 0) / spStep()) * spStep()));
        const others = s.evs.reduce((a, c, k) => a + (k === i ? 0 : c), 0);
        v = Math.min(v, Math.max(0, spTotal() - others)); v -= v % spStep();
        s.evs[i] = v;
        if (t.dataset.ev !== undefined) { const n = root.querySelector(`[data-evn="${i}"]`); if (n) n.value = v; t.value = v; } else { const r = root.querySelector(`[data-ev="${i}"]`); if (r) r.value = v; }
        updateStats(); analysisSoon(); sideSoon(); save();
      }
    });
    root.addEventListener('change', (e) => {
      const t = e.target;
      if (t.id === 'bd-fmt') { T.fmt = t.value; save(); render(); return; }
      if (t.id === 'bd-pick') { const v = t.value; if (!v) return; save(true); if (v === '__new') { T = null; openTeam(null); } else { T = null; openTeam(v); } render(); return; }
      if (t.id === 'bd-nature') { T.sets[sel].nature = t.value; renderEditor(); analysisSoon(); save(); return; }
      if (t.id === 'bd-tera') { T.sets[sel].tera = t.value; save(); return; }
      if (t.dataset.evn !== undefined) renderEditor();
    });
    $('bd-modal').addEventListener('click', (e) => { if (e.target.id === 'bd-modal' || e.target.closest('[data-close]')) closeModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('bd-modal').hidden) closeModal(); });
  }
  // light update while dragging a slider, so it stays smooth
  function updateStats() {
    const s = T.sets[sel]; const rec = recOf(s.species); if (!rec) return;
    const mega = megaName(s, rec); const r = mega ? recOf(mega) : rec; const st = statsOf(s, r);
    $('bd-edit').querySelectorAll('.bd-stat').forEach((row, i) => { row.querySelector('.v').textContent = st[i]; row.querySelector('.bar i').style.width = Math.min(100, st[i] / (i === 0 ? 2.6 : 2.4)) + '%'; row.querySelector('.mini').textContent = s.evs[i] ? '+' + s.evs[i] : ''; });
    const used = s.evs.reduce((a, b) => a + b, 0); const u = $('bd-used'); if (u) { u.textContent = `${used}/${spTotal()}`; u.classList.toggle('bad', used > spTotal()); }
  }

  let bound = false;
  VL.builder = {
    render() { if (!D().dex) return; if (!bound) { bind(); bound = true; } render(); },
    refreshSide() { /* the builder saves its own changes; nothing to redraw from outside */ },
    parsePaste, statsOf,
  };
})();
