/* Pictures and shared data files.
 * - VL.sprite(name) gives a Pokémon's picture. data/sprites.json (rebuilt by
 *   the daily update) says which Pokémon Showdown sprite to use for each one;
 *   if a picture still fails to load, it falls back to other sets, then to a
 *   small badge with the first letters of the name.
 * - VL.files loads the daily data files (news, tournament teams, status). */
(function () {
  'use strict';
  const VL = (window.VL = window.VL || {});
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toId = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const BASE = 'https://play.pokemonshowdown.com/sprites/';
  const SETS = ['home-centered', 'gen5', 'dex'];
  let MAN = null; // { sets, x: { id: [set index, file] }, none: [ids] }

  const getJSON = (path) => fetch(path, { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null);
  const cache = {};
  VL.files = {
    get(name) { return cache[name] || (cache[name] = getJSON(`data/${name}.json`)); },
    news() { return this.get('news'); },
    teams() { return this.get('teams'); },
    status() { return this.get('status'); },
  };
  VL.sprites = { ready: VL.files.get('sprites').then(j => { if (j && j.x) MAN = j; return j; }) };

  function recOf(nameOrRec) {
    if (nameOrRec && typeof nameOrRec === 'object') return nameOrRec;
    const D = VL.D; if (!D || !D.dex) return null;
    let i = D.find(nameOrRec);
    if (i < 0) i = D.find(String(nameOrRec || '').replace(/-(Mega|Mega-[XYZ]|Primal)$/i, ''));
    return i >= 0 ? D.dex.species[i] : null;
  }
  function urlFor(rec) {
    const x = MAN && MAN.x && MAN.x[rec.id];
    const sets = (MAN && MAN.sets) || SETS;
    if (x) return { src: `${BASE}${sets[x[0]]}/${x[1]}.png`, pix: sets[x[0]] === 'gen5', file: x[1] };
    const file = rec.sp || rec.id;
    return { src: `${BASE}${sets[0]}/${file}.png`, pix: false, file };
  }
  /* size: xs (28px), sm (40px), md (64px), lg (96px) */
  VL.sprite = function (nameOrRec, size, title) {
    const rec = recOf(nameOrRec); const cls = size || 'sm';
    const label = rec ? rec.n : String(nameOrRec || '');
    const ini = esc(label.replace(/[^A-Za-z]/g, '').slice(0, 2) || '?');
    if (!rec || (MAN && MAN.none && MAN.none.includes(rec.id))) return `<span class="spr none ${cls}" title="${esc(label)}">${ini}</span>`;
    const u = urlFor(rec);
    return `<img class="spr ${cls}${u.pix ? ' pix' : ''}" src="${esc(u.src)}" data-file="${esc(u.file)}" data-ini="${ini}" alt="${title === false ? '' : esc(label)}" title="${title === false ? '' : esc(label)}" loading="lazy" decoding="async" onerror="VL.spriteFail(this)">`;
  };
  VL.spriteFail = function (img) {
    const step = +(img.dataset.step || 0) + 1; img.dataset.step = step;
    const tries = [`${BASE}gen5/${img.dataset.file}.png`, `${BASE}dex/${img.dataset.file}.png`, `${BASE}gen5/${String(img.dataset.file).split('-')[0]}.png`].filter(u => u !== img.src);
    if (step <= tries.length) { img.classList.toggle('pix', /\/gen5\//.test(tries[step - 1])); img.src = tries[step - 1]; return; }
    const s = document.createElement('span'); s.className = img.className.replace(/\bpix\b/, '') + ' none'; s.textContent = img.dataset.ini || '?'; s.title = img.title || ''; img.replaceWith(s);
  };
  /* a row of small pictures for a list of names */
  VL.spriteRow = function (names, size) { return `<span class="sprrow">${(names || []).filter(Boolean).map(n => VL.sprite(n, size || 'xs')).join('')}</span>`; };
  VL.itemIcon = function (name) {
    const D = VL.D; const it = name && D && D.dex && D.dex.items[toId(name)]; const n = it && it.sn;
    if (!n) return '<span class="iicon blank"></span>';
    return `<span class="iicon" title="${esc(it.n)}" style="background-position:-${(n % 16) * 24}px -${Math.floor(n / 16) * 24}px"></span>`;
  };
  VL.typeBadge = (t) => `<span class="ty ${esc(t)}">${esc(t)}</span>`;

  /* A team's style, worked out from its abilities and moves. Used by Top teams and Team sheet practice. */
  VL.teamTags = function (mons) {
    const ab = new Set(), mv = new Set(), names = new Set();
    for (const m of mons || []) { if (m.a) ab.add(toId(m.a)); for (const x of (m.m || [])) mv.add(toId(x)); names.add(toId(m.n)); if (m.i) names.add('item:' + toId(m.i)); }
    const megaAb = (stone, a) => names.has('item:' + stone) && a;
    const tags = [];
    if (ab.has('drought') || mv.has('sunnyday') || megaAb('charizarditey', 1) || ab.has('orichalcumpulse') || ab.has('megasol')) tags.push('Sun');
    if (ab.has('drizzle') || mv.has('raindance')) tags.push('Rain');
    if (ab.has('sandstream') || mv.has('sandstorm') || megaAb('tyranitarite', 1)) tags.push('Sand');
    if (ab.has('snowwarning') || mv.has('snowscape') || mv.has('hail') || megaAb('abomasite', 1)) tags.push('Snow');
    if (mv.has('trickroom')) tags.push('Trick Room');
    if (mv.has('tailwind')) tags.push('Tailwind');
    if (ab.has('psychicsurge') || mv.has('psychicterrain')) tags.push('Psychic Terrain');
    if (ab.has('grassysurge') || mv.has('grassyterrain')) tags.push('Grassy Terrain');
    if (ab.has('electricsurge') || mv.has('electricterrain') || ab.has('hadronengine')) tags.push('Electric Terrain');
    if (ab.has('mistysurge') || mv.has('mistyterrain')) tags.push('Misty Terrain');
    if (mv.has('reflect') && mv.has('lightscreen') || mv.has('auroraveil')) tags.push('Screens');
    if (mv.has('followme') || mv.has('ragepowder')) tags.push('Redirection');
    if (mv.has('perishsong')) tags.push('Perish Song');
    if (!tags.length) tags.push('Balance');
    return tags;
  };
  /* tournament team (short keys from data/teams.json) to Showdown text */
  VL.teamText = function (mons) {
    return (mons || []).map(m => [`${m.n}${m.i ? ' @ ' + m.i : ''}`, m.a ? `Ability: ${m.a}` : '', 'Level: 50', m.t ? `Tera Type: ${m.t}` : '', m.na ? `${m.na} Nature` : '', ...(m.m || []).map(x => `- ${x}`)].filter(Boolean).join('\n')).join('\n\n');
  };
})();
