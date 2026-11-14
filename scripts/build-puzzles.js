#!/usr/bin/env node
/*
 * Builds data/puzzles.json: the highest-rated public Showdown replays in each
 * current format, which the Puzzles page turns into "what would you do this
 * turn?" questions. Only the list is saved; the app loads each replay when it's
 * played.
 *
 *   node scripts/build-puzzles.js [dex.json] [out.json]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const DEX = path.resolve(process.argv[2] || path.join(__dirname, '..', 'data', 'dex.json'));
const OUT = path.resolve(process.argv[3] || path.join(__dirname, '..', 'data', 'puzzles.json'));
const UA = { 'User-Agent': 'toxicroak-vgc-lab (github.com/nramsay1212/vgc-lab)' };
const PAGES = 4, KEEP = 150, MIN_RATING = 1300, KEEP_DAYS = 120;

async function getJSON(url) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url, { headers: UA }); if (r.ok) { const t = await r.text(); return JSON.parse(t.replace(/^\]/, '')); } if (r.status === 404) return null; } catch (e) { /* retry */ }
    await new Promise(res => setTimeout(res, 1500 * (i + 1)));
  }
  return null;
}

(async () => {
  const dex = JSON.parse(fs.readFileSync(DEX, 'utf8'));
  let old = null; try { old = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { old = null; }
  const ids = dex.formats.filter(f => f.current).flatMap(f => [f.id, f.id + 'bo3']);
  const formats = {};
  const now = Date.now() / 1000;
  for (const fid of ids) {
    const seen = new Map();
    for (const r of ((old && old.formats && old.formats[fid]) || [])) if (now - r.t < KEEP_DAYS * 86400) seen.set(r.id, r);
    for (let page = 1; page <= PAGES; page++) {
      const list = await getJSON(`https://replay.pokemonshowdown.com/search.json?format=${fid}&sort=rating&page=${page}`);
      if (!Array.isArray(list) || !list.length) break;
      for (const r of list) {
        if (r.private || r.password || !r.rating || r.rating < MIN_RATING) continue;
        if (now - r.uploadtime > KEEP_DAYS * 86400) continue;
        seen.set(r.id, { id: r.id, r: r.rating, t: r.uploadtime, p: r.players });
      }
      if (list.length < 50) break;
    }
    const best = [...seen.values()].sort((a, b) => b.r - a.r).slice(0, KEEP);
    if (best.length) formats[fid] = best;
    console.log(`  ${fid}: ${best.length} replays${best.length ? `, rated ${best[best.length - 1].r}–${best[0].r}` : ''}`);
  }
  if (!Object.keys(formats).length) { console.log('No replays found; keeping the old file.'); return; }
  const result = { v: 1, generated: new Date().toISOString(), formats };
  if (old && JSON.stringify({ ...old, generated: 0 }) === JSON.stringify({ ...result, generated: 0 })) { console.log('No new replays.'); return; }
  fs.writeFileSync(OUT, JSON.stringify(result));
  console.log(`Wrote ${OUT}`);
})();
