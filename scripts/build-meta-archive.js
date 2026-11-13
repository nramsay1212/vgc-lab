#!/usr/bin/env node
/*
 * Usage stats for older formats: data/meta/<format>.json plus data/meta/index.json.
 *
 *   node scripts/build-meta-archive.js <path-to-pokemon-showdown> [dex.json]
 *
 * Smogon keeps every month's stats since late 2014, but formats were named
 * differently over the years (vgc2016, gen7vgc2019ultraseries,
 * gen9vgc2023regulationc ...). For each format in data/dex.json that isn't
 * current, this finds every name and month Smogon used for it, picks the
 * busiest month (the format's real season, not a quiet month years later) and
 * saves its stats in the same shape as data/meta.json. A finished format never
 * changes, so it is only downloaded once; formats with no stats are checked
 * again once a month. Set META_ARCHIVE_REBUILD=1 to redo everything.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const PS = path.resolve(process.argv[2] || './pokemon-showdown');
const DEX = path.resolve(process.argv[3] || path.join(__dirname, '..', 'data', 'dex.json'));
const DIR = path.join(path.dirname(DEX), 'meta');
const INDEX = path.join(DIR, 'index.json');
const { Dex } = require(path.join(PS, 'dist', 'sim'));
const BASE = 'https://www.smogon.com/stats/';
const UA = { 'User-Agent': 'toxicroak-vgc-lab (github.com/nramsay1212/vgc-lab)' };
const REBUILD = !!process.env.META_ARCHIVE_REBUILD;

async function get(rel) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { const r = await fetch(BASE + rel, { headers: UA }); if (r.ok) return await r.text(); if (r.status === 404) return null; } catch (e) { /* retry */ }
    await new Promise(res => setTimeout(res, 1000 * (attempt + 1)));
  }
  return null;
}
const top = (obj, n, total, name) => Object.entries(obj || {})
  .filter(([k, v]) => k && v > 0)
  .sort((a, b) => b[1] - a[1]).slice(0, n)
  .map(([k, v]) => [name ? name(k) : k, Math.round(1000 * v / total) / 10]);

// Every Smogon name that is this format: same name; the old names without a
// generation (vgc2016); "regulation" spelled out; a different season year for
// the same regulation (Reg I ran in 2025 and 2026); and the series of one year.
function norm(n) { return n.replace(/regulation/g, 'reg').replace(/vgc20\d\d(?=reg)/, 'vgc'); }
function aliases(id, names) {
  const want = norm(id);
  const bare = id.replace(/^gen6(?=vgc)/, '');
  return names.filter(n => {
    if (n === id || n === bare) return true;
    if (norm(n) === want && /reg[a-z]+(bo3)?$/.test(want)) return true;
    const rest = n.startsWith(id) ? n.slice(id.length) : null;
    return rest !== null && /^(series\d+|sunseries|moonseries|ultraseries)$/.test(rest) && !id.endsWith('bo3');
  });
}

function entryFrom(j, t, month, cut, smogon) {
  const sdex = Dex.mod(t.mod);
  const itemName = (id) => id === 'nothing' ? 'No item' : (sdex.items.get(id).name || id);
  const abilityName = (id) => sdex.abilities.get(id).name || id;
  const moveName = (id) => sdex.moves.get(id).name || id;
  const data = j.data || {};
  const mons = Object.entries(data)
    .map(([name, d]) => ({ name, d, u: d.usage || 0 }))
    .sort((a, b) => b.u - a.u).slice(0, 100)
    .map(({ name, d, u }) => {
      const total = Object.values(d.Abilities || {}).reduce((a, b) => a + b, 0) || 1;
      const rec = { n: name, u: Math.round(10000 * u) / 100, items: top(d.Items, 6, total, itemName), abilities: top(d.Abilities, 3, total, abilityName), moves: top(d.Moves, 10, total, moveName), mates: top(d.Teammates, 10, total), spreads: top(d.Spreads, 5, total) };
      if (d['Tera Types']) rec.tera = top(d['Tera Types'], 4, total);
      return rec;
    });
  return { label: t.label, parent: t.parent || t.id, bo3: !!t.bo3, month, rating: cut, battles: (j.info && j.info['number of battles']) || 0, archived: true, smogon, mons };
}

(async () => {
  const dex = JSON.parse(fs.readFileSync(DEX, 'utf8'));
  fs.mkdirSync(DIR, { recursive: true });
  let index = {}; try { index = JSON.parse(fs.readFileSync(INDEX, 'utf8')).formats || {}; } catch (e) { index = {}; }
  const today = new Date().toISOString().slice(0, 10);
  const daysSince = (d) => (Date.now() - new Date(d).getTime()) / 864e5;

  const targets = [];
  for (const f of dex.formats.filter(x => !x.current)) {
    targets.push({ id: f.id, label: f.name, mod: f.mod, game: f.game });
    targets.push({ id: f.id + 'bo3', label: f.name + ' (best of 3)', mod: f.mod, game: f.game, bo3: true, parent: f.id });
  }
  const isPending = (t) => REBUILD || !index[t.id] || (index[t.id].none && daysSince(index[t.id].checked) > 30) || (!index[t.id].none && !fs.existsSync(path.join(DIR, t.id + '.json')));
  const scannedAt = index._scanned && index._scanned.checked;
  if (!targets.some(isPending) && scannedAt && daysSince(scannedAt) <= 30) { console.log('Older formats: all saved already.'); return; }

  // which names appear in which months
  const listing = await get('');
  if (!listing) { console.log('Could not read the Smogon stats index; trying again next time.'); return; }
  const months = [...new Set([...listing.matchAll(/href="(\d{4}-\d{2})\/"/g)].map(m => m[1]))].sort();
  const seen = new Map(); // smogon name -> [months]
  for (const m of months) {
    const t = await get(`${m}/chaos/`); if (!t) continue;
    for (const x of t.matchAll(/href="([a-z0-9]+)-\d+\.json"/g)) { const n = x[1]; if (!/vgc|battlestadium|bss/.test(n)) continue; if (!seen.has(n)) seen.set(n, new Set()); seen.get(n).add(m); }
  }
  const names = [...seen.keys()];
  console.log(`Read ${months.length} months; ${names.length} VGC and Battle Stadium names.`);
  index._scanned = { checked: today, months: months.length };

  // Regulations Showdown no longer lists (VGC Reg E, F, H, J, Battle Stadium Singles ...) still have
  // stats on Smogon. They get meta pages too, grouped across season years.
  const claimed = new Set(targets.flatMap(t => aliases(t.id, names)));
  const current = new Set(dex.formats.filter(f => f.current).flatMap(f => [f.id, f.id + 'bo3']));
  const groups = new Map();
  for (const n of names) {
    if (claimed.has(n) || current.has(n)) continue;
    const m = n.match(/^gen(\d)(vgc(20\d\d)(regulation|reg|series)([a-z0-9]+?)|bssreg([a-z])|battlestadium(singles|doubles)(regulation([a-z])|series(\d+))?)(bo3)?$/);
    if (!m || /beta|limitone/.test(n)) continue;
    const gen = m[1], bo3 = !!m[11];
    let key, label;
    if (m[3]) { const kind = m[4] === 'series' ? 'series' : 'reg'; key = `gen${gen}vgc${kind}${m[5]}`; label = kind === 'series' ? `VGC ${m[3]} Series ${m[5]}` : `VGC Reg ${m[5].toUpperCase()}`; }
    else if (m[6]) { key = `gen${gen}bssreg${m[6]}`; label = `BSS Reg ${m[6].toUpperCase()}`; }
    else { const which = m[7] === 'singles' ? 'Singles' : 'Doubles'; const sub = m[9] ? ` Reg ${m[9].toUpperCase()}` : m[10] ? ` Series ${m[10]}` : ''; key = `gen${gen}battlestadium${m[7]}${m[9] ? 'reg' + m[9] : m[10] ? 'series' + m[10] : ''}`; label = `Battle Stadium ${which}${sub}`; }
    key += bo3 ? 'bo3' : ''; if (bo3) label += ' (best of 3)';
    if (!groups.has(key)) { const singles = !!m[6] || m[7] === 'singles';
      // the app needs a real format for base stats and the calculator: the newest older one of the same generation and style
      const near = dex.formats.find(f => !f.current && f.gen === +gen && !/champions/.test(f.mod) && !!f.doubles === !singles);
      groups.set(key, { id: key, label, mod: 'gen' + gen, game: gen === '9' ? 'Scarlet/Violet' : 'Sword/Shield', bo3, parent: near ? near.id : key.replace(/bo3$/, ''), extra: true, names: [] }); }
    groups.get(key).names.push(n);
  }
  for (const g of groups.values()) targets.push(g);
  const pending = targets.filter(isPending);
  console.log(`Formats to look up: ${pending.map(t => t.id).join(', ') || 'none'}`);

  let saved = 0;
  for (const t of pending) {
    const al = t.names || aliases(t.id, names);
    const cands = []; for (const n of al) for (const m of seen.get(n)) cands.push({ n, m });
    if (!cands.length) { index[t.id] = { label: t.label, none: true, checked: today }; console.log(`  ${t.id}: no stats on Smogon`); continue; }
    // battles per month from the small text summary, to find the format's busiest month
    for (const c of cands) { const txt = await get(`${c.m}/${c.n}-0.txt`); const b = txt && txt.match(/Total battles:\s*(\d+)/); c.battles = b ? +b[1] : 0; }
    cands.sort((a, b) => b.battles - a.battles || b.m.localeCompare(a.m));
    const best = cands[0];
    if (!best.battles) { index[t.id] = { label: t.label, none: true, checked: today }; console.log(`  ${t.id}: no readable stats`); continue; }
    const cuts = best.battles >= 20000 ? [1760, 1630, 1500, 0] : best.battles >= 5000 ? [1630, 1500, 0] : best.battles >= 1000 ? [1500, 0] : [0];
    let j = null, cut = null;
    for (const c of cuts) { const txt = await get(`${best.m}/chaos/${best.n}-${c}.json`); if (!txt) continue; try { j = JSON.parse(txt); cut = c; break; } catch (e) { /* next */ } }
    if (!j) { index[t.id] = { label: t.label, none: true, checked: today }; console.log(`  ${t.id}: stats file missing`); continue; }
    const entry = entryFrom(j, t, best.m, cut, best.n);
    fs.writeFileSync(path.join(DIR, t.id + '.json'), JSON.stringify({ v: 1, source: { name: 'Smogon usage statistics', url: BASE }, generated: new Date().toISOString(), entry }));
    index[t.id] = { label: t.label, game: t.game, bo3: !!t.bo3, parent: t.parent || t.id, month: best.m, battles: entry.battles, rating: cut, smogon: best.n, mons: entry.mons.length, ...(t.extra ? { extra: true } : {}) };
    saved++;
    console.log(`  ${t.id}: ${best.n} ${best.m}, ${entry.battles.toLocaleString('en-US')} battles, rating ${cut}+, ${entry.mons.length} Pokémon (also seen as ${[...new Set(cands.map(c => c.n))].join(', ')})`);
  }
  fs.writeFileSync(INDEX, JSON.stringify({ v: 1, generated: new Date().toISOString(), formats: index }));
  console.log(`Older formats: ${saved} saved, ${Object.entries(index).filter(([k, x]) => k !== '_scanned' && !x.none).length} with stats in total.`);
})();
