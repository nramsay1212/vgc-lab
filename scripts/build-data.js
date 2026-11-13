#!/usr/bin/env node
/*
 * Builds data/dex.json for VGC Lab from a built Pokémon Showdown checkout.
 *
 *   node scripts/build-data.js <path-to-pokemon-showdown> [out-file]
 *
 * The Showdown checkout must be built first (`npm ci && node build`).
 * Everything here is discovered from Showdown, so new games, regulations,
 * Pokémon, items and abilities appear on the next run without code changes.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PS = path.resolve(process.argv[2] || './pokemon-showdown');
const OUT = path.resolve(process.argv[3] || path.join(__dirname, '..', 'data', 'dex.json'));
const { Dex, TeamValidator } = require(path.join(PS, 'dist', 'sim'));

const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const SKIP_NONSTANDARD = new Set(['CAP', 'Custom', 'LGPE', 'Pokestar', 'Gigantamax']);

// ---------- which formats to include ----------
// Every VGC format (doubles) plus Battle Stadium singles, minus random/factory
// formats and Bo3 duplicates of a format we already have.
const formats = Dex.formats.all().filter(f =>
  f.effectType === 'Format' &&
  /\bVGC\b|\bBSS\b|Battle Stadium/i.test(f.name) &&
  !/Factory|Random|\(Bo3\)|Custom/i.test(f.name)
);

function gameName(mod, gen) {
  if (mod.startsWith('champions')) return 'Pokémon Champions';
  const g = { 9: 'Scarlet/Violet', 8: 'Sword/Shield', 7: 'Sun/Moon, Ultra Sun/Ultra Moon', 6: 'X/Y, Omega Ruby/Alpha Sapphire', 5: 'Black/White, Black 2/White 2', 4: 'Diamond/Pearl/Platinum, HeartGold/SoulSilver' };
  return g[gen] || `Gen ${gen}`;
}
function gimmick(mod, gen) {
  if (mod.startsWith('champions')) return 'Mega Evolution';
  return ({ 9: 'Terastallization', 8: 'Dynamax', 7: 'Mega Evolution and Z-Moves', 6: 'Mega Evolution' })[gen] || 'None';
}

// ---------- species table (global, latest data wins) ----------
const species = []; // [{id, n, t, s, a, b, fe, mg}]
const spIndex = new Map();
function addSpecies(s) {
  if (spIndex.has(s.id)) return spIndex.get(s.id);
  const rec = {
    id: s.id,
    n: s.name,
    t: s.types.slice(),
    s: STATS.map(k => s.baseStats[k]),
    a: Object.values(s.abilities).filter(Boolean),
    b: s.baseSpecies,
  };
  if (s.spriteid && s.spriteid !== s.id) rec.sp = s.spriteid; // Showdown sprite file name
  if (!s.nfe) rec.fe = 1;
  if (s.isMega || s.isPrimal) {
    rec.mg = 1;
    if (s.requiredItem) rec.ri = s.requiredItem; // its stone or orb
    const bo = Array.isArray(s.battleOnly) ? s.battleOnly[0] : s.battleOnly;
    if (bo) rec.bo = bo; // the form that holds the stone
  }
  spIndex.set(s.id, species.length);
  species.push(rec);
  return species.length - 1;
}
function usableSpecies(s) {
  if (!s.exists) return false;
  if (s.isNonstandard && SKIP_NONSTANDARD.has(s.isNonstandard)) return false;
  if (/Totem|Gmax|Eternamax|Starter/.test(s.forme || '')) return false;
  return true;
}
// Champions first (its stats are authoritative for Champions), then the main dex.
const latestChampMod = formats.find(f => f.mod === 'champions') ? 'champions' : null;
if (latestChampMod) for (const s of Dex.mod(latestChampMod).species.all()) if (usableSpecies(s)) addSpecies(s);
for (const s of Dex.species.all()) if (usableSpecies(s)) addSpecies(s);

// ---------- legality per format ----------
function itemAllowed(dex, rt, it) {
  if (!it.exists) return false;
  if (rt.isBanned('item:' + it.id)) return false;
  if (it.isNonstandard && !rt.has('+pokemontag:' + String(it.isNonstandard).toLowerCase())) return false;
  return true;
}
function heldItem(it) {
  return it.exists && !it.isPokeball && !/^(TR|TM)\d/.test(it.name) &&
    !it.isNonstandard?.match?.(/CAP|Custom|LGPE/) && !/Fossil|Ticket|Key Stone|Ability (Capsule|Patch)|Bottle Cap|Mint$/.test(it.name);
}

const items = new Map(); // id -> {n, d}
const abilities = new Map(); // id -> {n, d}
const typeCharts = []; // distinct charts
const chartKey = new Map();

function buildChart(dex) {
  const types = dex.types.all().filter(t => t.exists && !['Stellar', '???'].includes(t.name) && !t.isNonstandard).map(t => t.name);
  const m = {};
  for (const atk of types) {
    m[atk] = {};
    for (const def of types) {
      const code = dex.types.get(def).damageTaken[atk];
      m[atk][def] = code === 1 ? 2 : code === 2 ? 0.5 : code === 3 ? 0 : 1;
    }
  }
  const key = JSON.stringify(m);
  if (!chartKey.has(key)) { chartKey.set(key, typeCharts.length); typeCharts.push({ types, eff: m }); }
  return chartKey.get(key);
}

// Descriptions live in Showdown's text tables, resolved per game (mod) so
// changed effects show the right text.
function describe(dex, effect) {
  try { const t = dex.text.get(effect); return (t && (t.shortDesc || t.desc)) || ''; } catch (e) { return ''; }
}

const outFormats = [];
const learnsets = new Map(); // format id -> {m: [move ids], l: {speciesIndex: [index into m]}}
const moveText = new Map(); // move id -> short description
for (const f of formats) {
  const dex = Dex.forFormat(f);
  const v = TeamValidator.get(f);
  const rt = v.ruleTable;
  const legal = [];
  const overrides = {};
  for (const s of dex.species.all()) {
    if (!usableSpecies(s)) continue;
    let sp = s;
    if (s.battleOnly) {
      const req = s.requiredItem || (s.requiredItems && s.requiredItems[0]);
      if (!req) continue;
      if (!itemAllowed(dex, rt, dex.items.get(req))) continue;
      sp = dex.species.get(Array.isArray(s.battleOnly) ? s.battleOnly[0] : s.battleOnly);
    }
    const set = { species: sp.name, name: sp.baseSpecies, ability: Object.values(sp.abilities)[0], item: '', moves: [], level: 50, evs: {}, ivs: {} };
    let prob = null;
    try { prob = v.checkSpecies(set, sp, sp, {}); } catch (e) { prob = 'error'; }
    if (prob) continue;
    const idx = addSpecies(s);
    legal.push(idx);
    // stats and types can differ between games (e.g. Fairy type before Gen 6)
    const base = species[idx];
    const st = STATS.map(k => s.baseStats[k]);
    const ov = {};
    if (st.join() !== base.s.join()) ov.s = st;
    if (s.types.join() !== base.t.join()) ov.t = s.types.slice();
    const abil = Object.values(s.abilities).filter(Boolean).filter(an => dex.abilities.get(an).exists && !dex.abilities.get(an).isNonstandard);
    if (abil.slice().sort().join() !== base.a.slice().sort().join()) ov.a = abil;
    if (Object.keys(ov).length) overrides[idx] = ov;
    for (const an of Object.values(s.abilities)) {
      const a = dex.abilities.get(an);
      if (a.exists && !abilities.has(a.id)) abilities.set(a.id, { n: a.name, d: describe(dex, a) });
    }
  }
  const legalItems = [];
  for (const it of dex.items.all()) {
    if (!heldItem(it) || !itemAllowed(dex, rt, it)) continue;
    const d = describe(dex, it);
    if (!d) continue;
    if (!items.has(it.id)) items.set(it.id, { n: it.name, d, ...(it.spritenum ? { sn: it.spritenum } : {}) });
    legalItems.push(it.id);
  }
  // learnable moves for every legal Pokémon (battle-only formes use their base)
  const moveOk = (m) => m.exists && !m.isMax && !m.isZ && !rt.isBanned('move:' + m.id) && !(m.isNonstandard && !rt.has('+pokemontag:' + String(m.isNonstandard).toLowerCase()));
  const fmtMoves = dex.moves.all().filter(moveOk);
  const lsIds = []; const lsIdx = new Map(); const ls = {};
  for (const idx of legal) {
    const rec = species[idx];
    let sp = dex.species.get(rec.id);
    if (sp.battleOnly) continue; // client falls back to the base species
    const got = [];
    for (const m of fmtMoves) {
      let prob = 'x';
      try { prob = v.checkCanLearn(m, sp); } catch (e) { prob = 'x'; }
      if (prob) continue;
      if (!lsIdx.has(m.id)) { lsIdx.set(m.id, lsIds.length); lsIds.push(m.id); }
      got.push(lsIdx.get(m.id));
    }
    if (got.length) ls[idx] = got;
  }
  learnsets.set(f.id, { m: lsIds, l: ls });
  for (const m of fmtMoves) if (!moveText.has(m.id) && lsIdx.has(m.id)) moveText.set(m.id, describe(dex, m));
  const clean = f.name.replace(/^\[[^\]]+\]\s*/, '');
  outFormats.push({
    id: f.id,
    name: clean,
    game: gameName(f.mod, dex.gen),
    gen: dex.gen,
    mod: f.mod,
    doubles: f.gameType === 'doubles',
    current: f.searchShow !== false,
    noIVs: f.mod.startsWith('champions'),
    gimmick: gimmick(f.mod, dex.gen),
    chart: buildChart(dex),
    species: legal,
    items: legalItems,
    overrides,
  });
}
outFormats.sort((a, b) => (b.current - a.current) || (b.gen - a.gen) || (a.mod.startsWith('champions') ? -1 : 0) - (b.mod.startsWith('champions') ? -1 : 0) || b.name.localeCompare(a.name));

// abilities for every species we kept, from the latest data
for (const s of species) for (const an of s.a) {
  const a = Dex.abilities.get(an);
  if (a.exists && !abilities.has(a.id)) abilities.set(a.id, { n: a.name, d: describe(Dex, a) });
}

// ---------- priority moves (latest Champions data, then main dex) ----------
const moves = new Map();
for (const dex of [latestChampMod ? Dex.mod(latestChampMod) : null, Dex].filter(Boolean)) {
  for (const m of dex.moves.all()) {
    if (!m.exists || m.isNonstandard && SKIP_NONSTANDARD.has(m.isNonstandard) || m.isMax || m.isZ) continue;
    if (moves.has(m.id)) continue;
    if (m.priority === 0) continue;
    moves.set(m.id, { n: m.name, p: m.priority, t: m.type, c: m.category, d: describe(dex, m) });
  }
}

// ---------- all moves (type, category, power, priority, spread target) ----------
const allMoves = {};
for (const dex of [latestChampMod ? Dex.mod(latestChampMod) : null, Dex].filter(Boolean)) {
  for (const m of dex.moves.all()) {
    if (!m.exists || m.isMax || m.isZ || (m.isNonstandard && SKIP_NONSTANDARD.has(m.isNonstandard))) continue;
    if (allMoves[m.id]) continue;
    const rec = { n: m.name, t: m.type, c: m.category === 'Special' ? 'Sp' : m.category[0], bp: m.basePower || 0 }; // P, Sp, or S (status)
    if (m.priority) rec.p = m.priority;
    if (m.accuracy !== true) rec.a = m.accuracy;
    if (m.pp) rec.pp = m.pp;
    if (m.target === 'allAdjacentFoes') rec.sp = 'f';
    else if (m.target === 'allAdjacent') rec.sp = 'a';
    allMoves[m.id] = rec;
  }
}

// ---------- per-format move differences (power, type, category, priority) ----------
// The move table above holds the newest numbers; older games get corrections.
for (const f of outFormats) {
  const dex = Dex.forFormat(Dex.formats.get(f.id));
  const mv = {};
  for (const [id, rec] of Object.entries(allMoves)) {
    const m = dex.moves.get(id); if (!m.exists) continue;
    const c = m.category === 'Special' ? 'Sp' : m.category[0];
    const o = {};
    if ((m.basePower || 0) !== rec.bp) o.bp = m.basePower || 0;
    if (m.type !== rec.t) o.t = m.type;
    if (c !== rec.c) o.c = c;
    if ((m.priority || 0) !== (rec.p || 0)) o.p = m.priority || 0;
    const acc = m.accuracy === true ? undefined : m.accuracy;
    if (acc !== rec.a) o.a = acc === undefined ? 0 : acc;
    if (Object.keys(o).length) mv[id] = o;
  }
  f.mv = mv;
  // item and ability text where this game's effect differs from the newest one
  const itd = {}, abd = {};
  for (const id of f.items) { const t = describe(dex, dex.items.get(id)); if (t && items.get(id) && t !== items.get(id).d) itd[id] = t; }
  for (const i of f.species) for (const an of (f.overrides[i] && f.overrides[i].a) || species[i].a) {
    const ab = dex.abilities.get(an); if (!ab.exists) continue; const t = describe(dex, ab);
    if (t && abilities.get(ab.id) && t !== abilities.get(ab.id).d) abd[ab.id] = t;
  }
  if (Object.keys(itd).length) f.itd = itd;
  if (Object.keys(abd).length) f.abd = abd;
  // priority moves that exist in this game
  const rt = TeamValidator.get(f.id).ruleTable;
  f.pm = dex.moves.all().filter(m => m.exists && m.priority && !m.isMax && !m.isZ && !rt.isBanned('move:' + m.id) && !(m.isNonstandard && !rt.has('+pokemontag:' + String(m.isNonstandard).toLowerCase())) ).map(m => { if (!moves.has(m.id)) moves.set(m.id, { n: m.name, p: m.priority, t: m.type, c: m.category, d: describe(dex, m) }); return m.id; }).sort();
}

let commit = '';
try { commit = execSync('git rev-parse --short HEAD', { cwd: PS }).toString().trim(); } catch (e) { /* not a git checkout */ }

const out = {
  v: 1,
  source: { name: 'Pokémon Showdown', commit, url: 'https://github.com/smogon/pokemon-showdown' },
  generated: new Date().toISOString(),
  stats: STATS,
  species,
  formats: outFormats,
  typeCharts,
  items: Object.fromEntries([...items.entries()].sort()),
  abilities: Object.fromEntries([...abilities.entries()].sort()),
  priorityMoves: Object.fromEntries([...moves.entries()].sort()),
  moves: Object.fromEntries(Object.entries(allMoves).sort()),
};
// learnsets and move text: one file per format, rewritten only when it changes
const writeIfChanged = (file, obj) => {
  const txt = JSON.stringify(obj);
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === txt) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, txt); return true;
};
const lsDir = path.join(path.dirname(OUT), 'learnsets');
let lsChanged = 0;
for (const [fid, data] of learnsets) if (writeIfChanged(path.join(lsDir, fid + '.json'), data)) lsChanged++;
if (writeIfChanged(path.join(path.dirname(OUT), 'movetext.json'), Object.fromEntries([...moveText.entries()].sort()))) lsChanged++;
console.log(`Learnsets: ${learnsets.size} formats, ${lsChanged} files updated`);

// ---------- what changed since last time, for the News page ----------
function describeChanges(old, now) {
  const out = []; const today = new Date().toISOString().slice(0, 10);
  const add = (k, t, x) => out.push({ d: today, k, t, ...(x ? { x } : {}) });
  const list = (arr, n = 14) => arr.slice(0, n).join(', ') + (arr.length > n ? ` and ${arr.length - n} more` : '');
  const oldF = new Map((old.formats || []).map(f => [f.id, f]));
  for (const f of now.formats) {
    const o = oldF.get(f.id);
    if (!o) { add('format', `New format: ${f.name}`, `${f.game}, ${f.doubles ? 'doubles' : 'singles'}. ${f.species.length} Pokémon and ${f.items.length} items are legal.${f.current ? ' It is a current format.' : ''}`); continue; }
    if (f.current && !o.current) add('format', `${f.name} is now a current format`, f.game);
    if (!f.current && o.current) add('format', `${f.name} is no longer a current format`, f.game);
    if (!f.current) continue;
    const names = (idxs, table) => idxs.map(i => table[i] && table[i].n).filter(Boolean);
    const oldLegal = new Set(names(o.species, old.species)), nowLegal = new Set(names(f.species, now.species));
    const inn = [...nowLegal].filter(n => !oldLegal.has(n)), gone = [...oldLegal].filter(n => !nowLegal.has(n));
    if (inn.length) add('pokemon', `${inn.length} Pokémon now legal in ${f.name}`, list(inn));
    if (gone.length) add('pokemon', `${gone.length} Pokémon no longer legal in ${f.name}`, list(gone));
    const oi = new Set(o.items), ni = new Set(f.items);
    const iin = f.items.filter(i => !oi.has(i)).map(i => now.items[i] && now.items[i].n).filter(Boolean), igone = o.items.filter(i => !ni.has(i)).map(i => old.items[i] && old.items[i].n).filter(Boolean);
    if (iin.length) add('item', `${iin.length} item${iin.length === 1 ? '' : 's'} now legal in ${f.name}`, list(iin));
    if (igone.length) add('item', `${igone.length} item${igone.length === 1 ? '' : 's'} no longer legal in ${f.name}`, list(igone));
  }
  const oldSp = new Map((old.species || []).map(s => [s.id, s]));
  const fresh = now.species.filter(s => !oldSp.has(s.id)).map(s => s.n);
  if (fresh.length && oldSp.size) add('pokemon', `${fresh.length} new Pokémon or forms added to the data`, list(fresh));
  const SN = ['HP', 'Attack', 'Defense', 'Special Attack', 'Special Defense', 'Speed']; const tweaks = [];
  for (const s of now.species) { const o = oldSp.get(s.id); if (!o) continue;
    s.s.forEach((v, k) => { if (o.s[k] !== v) tweaks.push(`${s.n} ${SN[k]} ${o.s[k]} → ${v}`); });
    if (o.t.join('/') !== s.t.join('/')) tweaks.push(`${s.n} type ${o.t.join('/')} → ${s.t.join('/')}`);
    if (o.a.slice().sort().join() !== s.a.slice().sort().join()) tweaks.push(`${s.n} abilities: ${s.a.join(', ')}`);
  }
  if (tweaks.length) add('balance', `Pokémon changes: ${tweaks.length}`, list(tweaks, 20));
  const newMoves = Object.keys(now.moves).filter(id => old.moves && !old.moves[id]).map(id => now.moves[id].n);
  if (newMoves.length && old.moves) add('move', `${newMoves.length} new move${newMoves.length === 1 ? '' : 's'}`, list(newMoves));
  const mt = [];
  for (const [id, m] of Object.entries(now.moves)) { const o = old.moves && old.moves[id]; if (!o) continue;
    if (o.bp !== m.bp) mt.push(`${m.n} power ${o.bp || '–'} → ${m.bp || '–'}`);
    if (o.t !== m.t) mt.push(`${m.n} type ${o.t} → ${m.t}`);
    if ('a' in o || 'pp' in o) { if ((o.a || 0) !== (m.a || 0)) mt.push(`${m.n} accuracy ${o.a || 'never misses'} → ${m.a || 'never misses'}`); }
    if ((o.p || 0) !== (m.p || 0)) mt.push(`${m.n} priority ${o.p || 0} → ${m.p || 0}`);
  }
  if (mt.length) add('balance', `Move changes: ${mt.length}`, list(mt, 20));
  for (const [kind, label] of [['items', 'Item'], ['abilities', 'Ability']]) {
    const added = [], changed = [];
    for (const [id, v] of Object.entries(now[kind])) { const o = old[kind] && old[kind][id]; if (!o) added.push(v.n); else if (o.d !== v.d) changed.push(`${v.n}: ${v.d}`); }
    if (added.length && old[kind] && Object.keys(old[kind]).length) add(kind === 'items' ? 'item' : 'ability', `${added.length} new ${kind === 'items' ? (added.length === 1 ? 'item' : 'items') : (added.length === 1 ? 'ability' : 'abilities')}`, list(added));
    if (changed.length) add('balance', `${label} changes: ${changed.length}`, list(changed, 8));
  }
  return out;
}
function saveChanges(entries) {
  if (!entries.length) return;
  const file = path.join(path.dirname(OUT), 'news.json');
  let news = {}; try { news = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { news = {}; }
  news.changes = [...entries, ...(news.changes || [])].slice(0, 150);
  fs.writeFileSync(file, JSON.stringify({ v: 1, generated: new Date().toISOString(), changes: news.changes, headlines: news.headlines || [], app: news.app || [], calendar: news.calendar || [] }));
  console.log(`News: ${entries.length} change${entries.length === 1 ? '' : 's'} recorded`); for (const e of entries) console.log(`  ${e.t}`);
}

// Only rewrite the file when the Pokémon data itself changed, so the weekly
// job doesn't make a commit just because the timestamp moved.
const comparable = (o) => JSON.stringify({ ...o, generated: null, source: { ...o.source, commit: null } });
if (fs.existsSync(OUT)) {
  try {
    const old = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    if (comparable(old) === comparable(out)) { console.log('No data changes since ' + old.generated); process.exit(0); }
    try { saveChanges(describeChanges(old, out)); } catch (e) { console.log('Could not work out what changed: ' + e.message); }
  } catch (e) { /* unreadable old file: overwrite */ }
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log(`Wrote ${OUT}: ${species.length} Pokémon, ${outFormats.length} formats, ${items.size} items, ${abilities.size} abilities, ${Object.keys(allMoves).length} moves, ${kb} KB`);
for (const f of outFormats) console.log(`  ${f.current ? '*' : ' '} ${f.name.padEnd(28)} ${f.game.padEnd(36)} ${String(f.species.length).padStart(4)} Pokémon ${String(f.items.length).padStart(4)} items`);
