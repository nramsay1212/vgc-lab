#!/usr/bin/env node
/*
 * Builds data/meta.json: what people actually play, from Smogon's monthly
 * usage statistics (https://www.smogon.com/stats/), for every current format
 * in data/dex.json.
 *
 *   node scripts/build-meta.js <path-to-pokemon-showdown> [dex.json] [out.json]
 *
 * For testing without network access, set META_FIXTURES to a folder holding
 * index.html and <month>/chaos/<format>-<cutoff>.json files.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const PS = path.resolve(process.argv[2] || './pokemon-showdown');
const DEX = path.resolve(process.argv[3] || path.join(__dirname, '..', 'data', 'dex.json'));
const OUT = path.resolve(process.argv[4] || path.join(__dirname, '..', 'data', 'meta.json'));
const { Dex } = require(path.join(PS, 'dist', 'sim'));
const BASE = 'https://www.smogon.com/stats/';
const FIX = process.env.META_FIXTURES;
const CUTOFFS = [1760, 1630, 1500, 0];
const MIN_BATTLES = 1500; // prefer the highest-rated slice with at least this many battles

async function get(rel) {
  if (FIX) { const p = path.join(FIX, rel || 'index.html'); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null; }
  try {
    const r = await fetch(BASE + rel, { headers: { 'User-Agent': 'toxicroak-vgc-lab (github.com/nramsay1212/vgc-lab)' } });
    return r.ok ? r.text() : null;
  } catch (e) { return null; }
}

const top = (obj, n, total, name) => Object.entries(obj || {})
  .filter(([k, v]) => k && v > 0)
  .sort((a, b) => b[1] - a[1]).slice(0, n)
  .map(([k, v]) => [name ? name(k) : k, Math.round(1000 * v / total) / 10]);

(async () => {
  const dex = JSON.parse(fs.readFileSync(DEX, 'utf8'));
  const listing = await get('');
  if (!listing) { console.log('Could not read the Smogon stats index; keeping the old meta file.'); return; }
  const allMonths = [...new Set([...listing.matchAll(/href="(\d{4}-\d{2})\/"/g)].map(m => m[1]))].sort().reverse();
  const months = allMonths.slice(0, 3);
  let oldMeta = null; try { oldMeta = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { oldMeta = null; }
  const newsEntries = [];
  const monthName = (m) => new Date(m + '-15T12:00:00Z').toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  console.log('Months available:', months.join(', '));

  const targets = [];
  for (const f of dex.formats.filter(x => x.current)) {
    targets.push({ id: f.id, label: f.name, mod: f.mod });
    targets.push({ id: f.id + 'bo3', label: f.name + ' (best of 3)', mod: f.mod, bo3: true, parent: f.id });
  }

  const out = {};
  for (const t of targets) {
    const sdex = Dex.mod(t.mod);
    const itemName = (id) => id === 'nothing' ? 'No item' : (sdex.items.get(id).name || id);
    const abilityName = (id) => sdex.abilities.get(id).name || id;
    const moveName = (id) => sdex.moves.get(id).name || id;
    let picked = null;
    for (const month of months) {
      const slices = [];
      for (const cut of CUTOFFS) {
        const txt = await get(`${month}/chaos/${t.id}-${cut}.json`);
        if (!txt) continue;
        try { const j = JSON.parse(txt); slices.push({ cut, j, battles: (j.info && j.info['number of battles']) || 0 }); } catch (e) { /* skip bad file */ }
      }
      if (!slices.length) continue;
      picked = slices.find(s => s.battles >= MIN_BATTLES) || slices.sort((a, b) => b.battles - a.battles)[0];
      picked.month = month;
      break;
    }
    if (!picked) { console.log(`  ${t.id}: no stats yet`); continue; }
    const data = picked.j.data || {};
    const mons = Object.entries(data)
      .map(([name, d]) => ({ name, d, u: d.usage || 0 }))
      .sort((a, b) => b.u - a.u).slice(0, 100)
      .map(({ name, d, u }) => {
        const total = Object.values(d.Abilities || {}).reduce((a, b) => a + b, 0) || 1;
        const rec = {
          n: name,
          u: Math.round(10000 * u) / 100,
          items: top(d.Items, 6, total, itemName),
          abilities: top(d.Abilities, 3, total, abilityName),
          moves: top(d.Moves, 10, total, moveName),
          mates: top(d.Teammates, 10, total),
          spreads: top(d.Spreads, 5, total),
        };
        if (d['Tera Types']) rec.tera = top(d['Tera Types'], 4, total);
        return rec;
      });
    out[t.id] = { label: t.label, parent: t.parent || t.id, bo3: !!t.bo3, month: picked.month, rating: picked.cut, battles: picked.battles, mons };
    // last month's usage, so the app can show who is rising and falling
    const was = oldMeta && oldMeta.formats && oldMeta.formats[t.id];
    let prev = null;
    if (was && was.month === picked.month && was.prev) prev = was.prev;
    else if (was && was.month && was.month < picked.month) prev = { month: was.month, u: Object.fromEntries(was.mons.map(m => [m.n, m.u])) };
    else {
      const before = allMonths.find(m => m < picked.month);
      if (before) for (const cut of [picked.cut, ...CUTOFFS.filter(c => c !== picked.cut)]) {
        const txt = await get(`${before}/chaos/${t.id}-${cut}.json`); if (!txt) continue;
        try { const j = JSON.parse(txt); const d = j.data || {}; if ((j.info && j.info['number of battles'] || 0) < 300) continue;
          prev = { month: before, u: Object.fromEntries(Object.entries(d).map(([n, v]) => [n, Math.round(10000 * (v.usage || 0)) / 100]).sort((a, b) => b[1] - a[1]).slice(0, 150)) }; break; } catch (e) { /* try the next slice */ }
      }
    }
    if (prev) out[t.id].prev = prev;
    if (was && was.month && was.month !== picked.month && !t.bo3) {
      const pu = prev ? prev.u : {}; const moves = mons.filter(m => m.u >= 2 || (pu[m.n] || 0) >= 2).map(m => ({ n: m.n, d: Math.round((m.u - (pu[m.n] || 0)) * 10) / 10 }));
      const up = moves.filter(x => x.d >= 1).sort((a, b) => b.d - a.d).slice(0, 5), down = moves.filter(x => x.d <= -1).sort((a, b) => a.d - b.d).slice(0, 5);
      const fmtList = (arr) => arr.map(x => `${x.n} ${x.d > 0 ? '+' : ''}${x.d}`).join(', ');
      newsEntries.push({ d: new Date().toISOString().slice(0, 10), k: 'meta', t: `${monthName(picked.month)} usage stats are in for ${t.label}`, x: `${picked.battles.toLocaleString('en-US')} battles counted.${up.length ? ' Rising: ' + fmtList(up) + '.' : ''}${down.length ? ' Falling: ' + fmtList(down) + '.' : ''} Numbers are the change in the share of teams, in percentage points.`, f: t.id });
    }
    console.log(`  ${t.id}: ${picked.month}, rating ${picked.cut}+, ${picked.battles} battles, ${mons.length} Pokémon`);
  }

  if (!Object.keys(out).length) { console.log('No usage stats found; keeping the old meta file.'); return; }
  const result = { v: 1, source: { name: 'Smogon usage statistics', url: BASE }, generated: new Date().toISOString(), formats: out };
  const comparable = (o) => JSON.stringify({ ...o, generated: null });
  if (fs.existsSync(OUT)) {
    try { if (comparable(JSON.parse(fs.readFileSync(OUT, 'utf8'))) === comparable(result)) { console.log('No meta changes.'); return; } } catch (e) { /* overwrite */ }
  }
  fs.writeFileSync(OUT, JSON.stringify(result));
  console.log(`Wrote ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
  if (newsEntries.length) {
    const file = path.join(path.dirname(OUT), 'news.json');
    let news = {}; try { news = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { news = {}; }
    fs.writeFileSync(file, JSON.stringify({ v: 1, generated: new Date().toISOString(), changes: [...newsEntries, ...(news.changes || [])].slice(0, 150), headlines: news.headlines || [], app: news.app || [], calendar: news.calendar || [] }));
    for (const e of newsEntries) console.log('News: ' + e.t);
  }
})();
