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
  if (s.isMega || s.isPrimal) rec.mg = 1;
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

// Only rewrite the file when the Pokémon data itself changed, so the weekly
// job doesn't make a commit just because the timestamp moved.
const comparable = (o) => JSON.stringify({ ...o, generated: null, source: { ...o.source, commit: null } });
if (fs.existsSync(OUT)) {
  try {
    const old = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    if (comparable(old) === comparable(out)) { console.log('No data changes since ' + old.generated); process.exit(0); }
  } catch (e) { /* unreadable old file: overwrite */ }
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log(`Wrote ${OUT}: ${species.length} Pokémon, ${outFormats.length} formats, ${items.size} items, ${abilities.size} abilities, ${Object.keys(allMoves).length} moves, ${kb} KB`);
for (const f of outFormats) console.log(`  ${f.current ? '*' : ' '} ${f.name.padEnd(28)} ${f.game.padEnd(36)} ${String(f.species.length).padStart(4)} Pokémon ${String(f.items.length).padStart(4)} items`);
