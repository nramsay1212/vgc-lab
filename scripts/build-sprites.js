#!/usr/bin/env node
/*
 * Builds data/sprites.json: which picture to show for every Pokémon.
 *
 *   node scripts/build-sprites.js [dex.json] [out.json]
 *
 * Pokémon Showdown keeps several sets of sprites. This reads the file list of
 * each set and picks, for every Pokémon in data/dex.json, the best one that
 * exists: its own sprite in the first set that has it, otherwise its base
 * form's. Run on a schedule, so new Pokémon and forms get pictures as soon as
 * Showdown adds them.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const DEX = path.resolve(process.argv[2] || path.join(__dirname, '..', 'data', 'dex.json'));
const OUT = path.resolve(process.argv[3] || path.join(__dirname, '..', 'data', 'sprites.json'));
const BASE = 'https://play.pokemonshowdown.com/sprites/';
const SETS = ['home-centered', 'gen5', 'dex']; // best first
const UA = { 'User-Agent': 'toxicroak-vgc-lab (github.com/nramsay1212/vgc-lab)' };
const toId = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

async function listing(set) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(BASE + set + '/', { headers: UA });
      if (!r.ok) continue;
      const t = await r.text();
      const files = new Set([...t.matchAll(/href="\.?\/?([a-z0-9-]+)\.png"/g)].map(m => m[1]));
      if (files.size > 200) return files;
    } catch (e) { /* retry */ }
  }
  return null;
}

(async () => {
  const dex = JSON.parse(fs.readFileSync(DEX, 'utf8'));
  const lists = [];
  for (const s of SETS) { const l = await listing(s); console.log(`${s}: ${l ? l.size + ' sprites' : 'could not read'}`); lists.push(l); }
  if (!lists[0] && !lists[1]) { console.log('Could not read the sprite lists; keeping the old sprites file.'); return; }
  const has = (k, f) => !!(lists[k] && lists[k].has(f));
  const byName = new Map(dex.species.map(s => [s.n, s]));
  const fileOf = (s) => s.sp || s.id;
  // other spellings Showdown sometimes uses for a form's file
  const variants = (s) => { const f = fileOf(s); const out = [f]; const b = toId(s.b); if (s.id.startsWith(b) && s.id !== b) out.push(b + '-' + s.id.slice(b.length)); return [...new Set(out)]; };
  const x = {}; const none = []; const count = SETS.map(() => 0); let viaBase = 0;
  for (const s of dex.species) {
    let pick = null;
    for (let k = 0; k < SETS.length && !pick; k++) for (const f of variants(s)) if (has(k, f)) { pick = [k, f]; break; }
    if (!pick && s.b && s.b !== s.n) {
      const b = byName.get(s.b);
      for (let k = 0; k < SETS.length && !pick && b; k++) if (has(k, fileOf(b))) { pick = [k, fileOf(b)]; viaBase++; }
    }
    if (!pick) { none.push(s.id); continue; }
    count[pick[0]]++;
    if (pick[0] !== 0 || pick[1] !== fileOf(s)) x[s.id] = pick; // only exceptions are stored
  }
  const out = { v: 1, base: BASE, sets: SETS, x, none };
  const txt = JSON.stringify(out);
  console.log(`Pokémon: ${dex.species.length}. ${SETS.map((s, k) => `${s}: ${count[k]}`).join(', ')}. Using the base form's picture: ${viaBase}. No picture: ${none.length}${none.length ? ' (' + none.slice(0, 20).join(', ') + ')' : ''}`);
  if (fs.existsSync(OUT) && fs.readFileSync(OUT, 'utf8') === txt) { console.log('No sprite changes.'); return; }
  fs.writeFileSync(OUT, txt);
  console.log(`Wrote ${OUT}`);
})();
