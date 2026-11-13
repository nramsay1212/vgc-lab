#!/usr/bin/env node
/*
 * Builds data/teams.json: the teams that placed highest at recent tournaments.
 *
 *   node scripts/build-teams.js [dex.json] [out.json]
 *
 * Official events (Regionals, Internationals, Worlds) come from Pokédata's
 * published standings, which include each player's open team sheet. Large
 * online tournaments come from the Limitless tournament platform. Run on a
 * schedule, so new results appear on their own. Every finished official event
 * is also kept by season in data/teams/<season>.json.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const DEX = path.resolve(process.argv[2] || path.join(__dirname, '..', 'data', 'dex.json'));
const OUT = path.resolve(process.argv[3] || path.join(__dirname, '..', 'data', 'teams.json'));
const UA = { 'User-Agent': 'toxicroak-vgc-lab (github.com/nramsay1212/vgc-lab)' };
const toId = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const OFFICIAL_EVENTS = 8, OFFICIAL_TOP = 32, OFFICIAL_DAYS = 240;
const ONLINE_EVENTS = 6, ONLINE_TOP = 8, ONLINE_DAYS = 28, ONLINE_MIN_PLAYERS = 48, ONLINE_ARCHIVE_PER_RUN = 40;

async function getJSON(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { const r = await fetch(url, { headers: UA }); if (r.ok) return JSON.parse(await r.text()); if (r.status === 404) return null; } catch (e) { /* retry */ }
    await new Promise(res => setTimeout(res, 1500 * (attempt + 1)));
  }
  return null;
}

const dex = JSON.parse(fs.readFileSync(DEX, 'utf8'));
const spByKey = new Map(); dex.species.forEach((s, i) => { spByKey.set(toId(s.n), i); spByKey.set(s.id, i); });
const itemName = new Map(Object.values(dex.items).map(x => [toId(x.n), x.n]));
const moveName = new Map(Object.values(dex.moves).map(x => [toId(x.n), x.n]));
const abilName = new Map(Object.values(dex.abilities).map(x => [toId(x.n), x.n]));
const NATURES = ['Hardy', 'Lonely', 'Brave', 'Adamant', 'Naughty', 'Bold', 'Docile', 'Relaxed', 'Impish', 'Lax', 'Timid', 'Hasty', 'Serious', 'Jolly', 'Naive', 'Modest', 'Mild', 'Quiet', 'Bashful', 'Rash', 'Calm', 'Gentle', 'Sassy', 'Careful', 'Quirky'];
const unresolved = new Map();
const title = (s) => String(s || '').trim().replace(/\s+/g, ' ').split(' ').map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
const fix = (map, raw) => { const k = toId(raw); if (!k) return ''; return map.get(k) || title(raw); };

// "Tauros (Paldean Form - Blaze Breed)", "Ogerpon [Wellspring Mask]", "Rotom-Wash", "Urshifu Rapid Strike" ...
function species(raw) {
  const tries = [raw];
  const m = String(raw).match(/^(.+?)\s*[\[(](.+)[\])]\s*$/);
  if (m) {
    const words = m[2].replace(/\b(form|forme|mask|breed|style|mode|face|cloak|plumage|size|pattern|flower|trim|forms?)\b/gi, ' ').replace(/[-–]/g, ' ').trim().split(/\s+/).filter(Boolean);
    const region = { paldean: 'Paldea', alolan: 'Alola', galarian: 'Galar', hisuian: 'Hisui' };
    const w = words.map(x => region[x.toLowerCase()] || x);
    tries.push(m[1] + '-' + w.join('-'), m[1] + '-' + w[0], m[1] + '-' + w.slice(-1)[0], m[1]);
  }
  const sp = String(raw).split(/\s+/);
  const REG = { paldean: 'Paldea', alolan: 'Alola', galarian: 'Galar', hisuian: 'Hisui' };
  if (sp.length > 1 && REG[sp[0].toLowerCase()]) tries.push(sp.slice(1).join(' ') + '-' + REG[sp[0].toLowerCase()]);
  if (sp.length > 1) tries.push(sp[sp.length - 1] + '-' + sp[0], sp[0] + '-' + sp.slice(1).join(''), sp.slice(1).join('') + '-' + sp[0], sp[sp.length - 1] + '-' + sp.slice(0, -1).join(''));
  for (const t of tries) { const i = spByKey.get(toId(t)); if (i !== undefined) return dex.species[i].n; }
  unresolved.set(raw, (unresolved.get(raw) || 0) + 1);
  return title(raw);
}
function mon(d) {
  const o = { n: species(d.name || d.id) };
  if (d.item) o.i = fix(itemName, d.item);
  if (d.ability) o.a = fix(abilName, d.ability);
  const nat = d.stat_alignment || d.nature; if (nat && NATURES.includes(title(nat))) o.na = title(nat);
  const mv = (d.badges || d.attacks || d.moves || []).filter(Boolean).map(x => fix(moveName, x)); if (mv.length) o.m = mv.slice(0, 4);
  const tera = d.teratype || d.tera; if (tera) o.t = title(tera);
  return o;
}
// the newest doubles format in which (nearly) every Pokémon on these teams is legal
function formatFor(teams, hint) {
  const dbl = dex.formats.filter(f => f.doubles);
  if (hint) { const h = dbl.find(f => toId(f.name).includes(toId('reg' + hint)) || toId(f.name).endsWith(toId(hint))); if (h) return h.id; }
  const idx = []; for (const t of teams) for (const m of t.mons) { const i = spByKey.get(toId(m.n)); if (i !== undefined) idx.push(i); }
  if (!idx.length) return (dbl.find(f => f.current) || dbl[0]).id;
  let best = null;
  for (const f of dbl) { const legal = new Set(f.species); const share = idx.filter(i => legal.has(i)).length / idx.length; if (share >= 0.97) return f.id; if (!best || share > best.share) best = { id: f.id, share }; }
  return best.id;
}
// The rules official events were played under, by date (Victory Road's regulation list). Team
// sheets don't say, and newer rules allow nearly everything older ones did, so the date decides.
// fmt is a format the app has full data for (base stats, calculator); meta is the usage stats to
// match, which for rules Showdown no longer lists is a separate archived file.
const RULES = [
  ['2023-01-02', '2023-01-31', 'Regulation A', 'gen9vgc2023regc', 'gen9vgcseries1'],
  ['2023-02-01', '2023-03-31', 'Regulation B', 'gen9vgc2023regc', 'gen9vgcseries2'],
  ['2023-04-01', '2023-06-30', 'Regulation C', 'gen9vgc2023regc'],
  ['2023-07-01', '2023-09-30', 'Regulation D', 'gen9vgc2023regd'],
  ['2023-10-01', '2024-01-03', 'Regulation E', 'gen9vgc2025regi', 'gen9vgcrege'],
  ['2024-01-04', '2024-04-30', 'Regulation F', 'gen9vgc2025regi', 'gen9vgcregf'],
  ['2024-05-01', '2024-08-31', 'Regulation G', 'gen9vgc2024regg'],
  ['2024-09-01', '2025-01-05', 'Regulation H', 'gen9vgc2025regi', 'gen9vgcregh'],
  ['2025-01-06', '2025-04-30', 'Regulation G', 'gen9vgc2024regg'],
  ['2025-05-01', '2025-08-31', 'Regulation I', 'gen9vgc2025regi'],
  ['2025-09-01', '2025-11-30', 'Regulation H', 'gen9vgc2025regi', 'gen9vgcregh'],
  ['2025-12-01', '2026-03-31', 'Regulation F', 'gen9vgc2025regi', 'gen9vgcregf'],
  ['2026-04-01', '2026-05-28', 'Regulation I', 'gen9vgc2025regi'],
  ['2026-05-29', '2026-06-16', 'Regulation M-A', 'gen9championsvgc2026regmb'],
  ['2026-06-17', '2026-09-02', 'Regulation M-B', 'gen9championsvgc2026regmb'],
  ['2026-09-03', '2026-12-02', 'Regulation M-C', 'gen9championsvgc2026regmc'],
];
function ruleFor(ev) {
  const d = String(ev.date).slice(0, 10); const r = RULES.find(x => x[0] <= d && d <= x[1]);
  if (!r || !dex.formats.some(f => f.id === r[3])) return false;
  ev.fmt = r[3]; ev.rule = r[2]; if (r[4]) ev.meta = r[4]; else delete ev.meta;
  return true;
}
const daysAgo = (d) => (Date.now() - new Date(d).getTime()) / 864e5;

// one official event's top teams from Pokédata, or null if its standings can't be read
async function officialEvent(t) {
  const st = await getJSON(`https://www.pokedata.ovh/standingsVGC/${t.id}/masters/${t.id}_Masters.json`);
  if (!Array.isArray(st)) { console.log(`  ${t.name}: no standings`); return null; }
  const teams = st.filter(p => p.placing && p.placing <= OFFICIAL_TOP && Array.isArray(p.decklist) && p.decklist.length >= 4)
    .sort((a, b) => a.placing - b.placing)
    .map(p => ({ p: p.placing, who: String(p.name || '').replace(/\s*\[[A-Z]{2}\]\s*$/, ''), c: (String(p.name || '').match(/\[([A-Z]{2})\]\s*$/) || [])[1] || '', rec: p.record ? `${p.record.wins}-${p.record.losses}${p.record.ties ? '-' + p.record.ties : ''}` : '', mons: p.decklist.slice(0, 6).map(mon) }));
  if (!teams.length) { console.log(`  ${t.name}: no team sheets in the top ${OFFICIAL_TOP}`); return { id: 'o' + t.id, teams: [] }; }
  const ev = { id: 'o' + t.id, src: 'official', name: t.name.replace(/Pokémon VGC /, '').replace(/\s+/g, ' ').trim(), date: t.date.start, players: (t.players && +t.players.masters) || st.length, live: t.tournamentStatus !== 'finished' ? 1 : undefined, url: `https://www.pokedata.ovh/standingsVGC/${t.id}/masters/`, fmt: formatFor(teams), teams };
  ruleFor(ev);
  console.log(`  ${ev.date} ${ev.name}: ${teams.length} teams, ${ev.players} players, ${ev.rule || ev.fmt}`);
  return ev;
}
let officialList = null;
async function official() {
  const j = await getJSON('https://www.pokedata.ovh/apiv2/vg/tournaments');
  const list = j && j.vg && j.vg.data; if (!Array.isArray(list)) { console.log('Official events: could not read the list'); return null; }
  officialList = list;
  const recent = list.filter(t => t.decklists > 0 && !/\bTCG\b/.test(t.name) && t.date && daysAgo(t.date.start) <= OFFICIAL_DAYS && daysAgo(t.date.start) >= 0)
    .sort((a, b) => String(b.date.start).localeCompare(String(a.date.start))).slice(0, OFFICIAL_EVENTS);
  const out = [];
  for (const t of recent) { const ev = await officialEvent(t); if (ev && ev.teams.length) out.push(ev); }
  return out;
}

// Every finished official event with team sheets, one file per season (data/teams/<season>.json,
// a season runs from September to the World Championships in August). A finished event never
// changes, so each is downloaded once; the app loads a season when it's picked.
async function archive() {
  if (!officialList && !onlineList) return;
  const DIR = path.join(path.dirname(OUT), 'teams'); fs.mkdirSync(DIR, { recursive: true });
  const IDX = path.join(DIR, 'index.json');
  let idx = {}; try { idx = JSON.parse(fs.readFileSync(IDX, 'utf8')); } catch (e) { idx = {}; }
  const done = new Set(idx.done || []); const seasons = idx.seasons || {};
  const seasonOf = (d) => { const [y, m] = String(d).split('-').map(Number); return String(m >= 9 ? y + 1 : y); };
  const todo = (officialList || []).filter(t => t.decklists > 0 && !/\bTCG\b/.test(t.name) && t.date && t.date.start && t.tournamentStatus === 'finished' && daysAgo(t.date.start) > 0 && !done.has(String(t.id)));
  console.log(`Past seasons: ${todo.length} finished events to add.`);
  // rules can be corrected later, so saved events are relabelled every run
  for (const k of Object.keys(seasons)) {
    const file = path.join(DIR, k + '.json'); let cur; try { cur = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { continue; }
    const before = JSON.stringify(cur); cur.events = cur.events.filter(e => !/\bTCG\b/.test(e.name)); cur.events.forEach(ruleFor);
    if (JSON.stringify(cur) !== before) { fs.writeFileSync(file, JSON.stringify(cur)); seasons[k] = { ...seasons[k], events: cur.events.length, teams: cur.events.reduce((a, e) => a + e.teams.length, 0) }; console.log(`  ${k} season: rules updated`); }
  }
  const bySeason = new Map(); for (const t of todo) { const k = seasonOf(t.date.start); if (!bySeason.has(k)) bySeason.set(k, []); bySeason.get(k).push(t); }
  // large online tournaments too, kept from now on (Limitless lists only the latest few hundred)
  const doneOnline = new Set(idx.doneOnline || []);
  const onlineTodo = (onlineList || []).filter(t => t.players >= ONLINE_MIN_PLAYERS && daysAgo(t.date) > 1 && !doneOnline.has(String(t.id)))
    .sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, ONLINE_ARCHIVE_PER_RUN);
  console.log(`Past seasons: ${onlineTodo.length} online tournaments to add.`);
  for (const t of onlineTodo) { const k = seasonOf(String(t.date).slice(0, 10)); if (!bySeason.has(k)) bySeason.set(k, []); bySeason.get(k).push({ online: t }); }
  for (const [k, list] of bySeason) {
    const file = path.join(DIR, k + '.json');
    let cur = { v: 1, season: k, events: [] }; try { cur = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { /* new season */ }
    for (const t of list) {
      if (t.online) {
        const ev = await onlineEvent(t.online);
        // a finished event with hidden team sheets never gets them, so it's only retried while it's recent
        if (ev || daysAgo(t.online.date) > 7) doneOnline.add(String(t.online.id));
        if (ev) cur.events = cur.events.filter(e => e.id !== ev.id).concat(ev);
        continue;
      }
      const ev = await officialEvent(t); if (!ev) continue; // try again next time
      done.add(String(t.id)); if (!ev.teams.length) continue;
      delete ev.live; cur.events = cur.events.filter(e => e.id !== ev.id).concat(ev);
    }
    cur.events.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (!cur.events.length) continue;
    fs.writeFileSync(file, JSON.stringify(cur));
    seasons[k] = { events: cur.events.length, official: cur.events.filter(e => e.src === 'official').length, online: cur.events.filter(e => e.src === 'online').length, teams: cur.events.reduce((a, e) => a + e.teams.length, 0), from: cur.events[cur.events.length - 1].date, to: cur.events[0].date };
    console.log(`  ${k} season: ${seasons[k].events} events, ${seasons[k].teams} teams, ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
  }
  fs.writeFileSync(IDX, JSON.stringify({ v: 1, generated: new Date().toISOString(), seasons, done: [...done].sort(), doneOnline: [...doneOnline].sort() }));
}
// one online tournament's top teams from Limitless, or null if it isn't finished or its team sheets are hidden
async function onlineEvent(t) {
  const st = await getJSON(`https://play.limitlesstcg.com/api/tournaments/${t.id}/standings`);
  if (!Array.isArray(st)) return null;
  const teams = st.filter(p => p.placing && p.placing <= ONLINE_TOP && Array.isArray(p.decklist) && p.decklist.length >= 4)
    .sort((a, b) => a.placing - b.placing)
    .map(p => ({ p: p.placing, who: String(p.name || ''), c: p.country || '', rec: p.record ? `${p.record.wins}-${p.record.losses}${p.record.ties ? '-' + p.record.ties : ''}` : '', mons: p.decklist.slice(0, 6).map(mon) }));
  if (teams.length < 4) return null;
  const name = String(t.name || '').normalize('NFKC').replace(/[^\p{L}\p{N}\p{P}\p{Zs}$+|]/gu, '').replace(/\s+/g, ' ').trim();
  return { id: 'l' + t.id, src: 'online', name, date: String(t.date).slice(0, 10), players: t.players, url: `https://play.limitlesstcg.com/tournament/${t.id}/standings`, fmt: formatFor(teams, t.format), teams };
}
let onlineList = null;
async function online() {
  const list = await getJSON('https://play.limitlesstcg.com/api/tournaments?game=VGC&limit=250');
  if (!Array.isArray(list)) { console.log('Online events: could not read the list'); return null; }
  onlineList = list;
  const pick = list.filter(t => t.players >= ONLINE_MIN_PLAYERS && daysAgo(t.date) <= ONLINE_DAYS && daysAgo(t.date) > 0.5)
    .sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, ONLINE_EVENTS * 2);
  const out = [];
  for (const t of pick) {
    if (out.length >= ONLINE_EVENTS) break;
    const ev = await onlineEvent(t); if (!ev) continue; // not finished, or team sheets hidden
    out.push(ev); console.log(`  ${ev.date} ${ev.name}: ${teams.length} teams, ${ev.players} players, ${ev.fmt}`);
  }
  return out;
}

(async () => {
  let old = null; try { old = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { old = null; }
  console.log('Official events:'); let off = await official();
  console.log('Online events:'); let on = await online();
  try { await archive(); } catch (e) { console.log('Past seasons: ' + e.message); }
  // if a source is down, keep what we had from it
  if (!off) off = old ? old.events.filter(e => e.src === 'official') : [];
  if (!on) on = old ? old.events.filter(e => e.src === 'online') : [];
  const events = [...off, ...on].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  if (!events.length) { console.log('No tournament teams found; keeping the old file.'); return; }
  if (unresolved.size) console.log('Names not matched to a Pokémon:', [...unresolved.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => `${k} ×${v}`).join(', '));
  const result = { v: 1, sources: [{ name: 'Pokédata', url: 'https://www.pokedata.ovh/standingsVGC/' }, { name: 'Limitless', url: 'https://play.limitlesstcg.com/tournaments/completed?game=VGC' }], generated: new Date().toISOString(), events };
  const comparable = (o) => JSON.stringify({ ...o, generated: null });
  if (old && comparable(old) === comparable(result)) { console.log('No tournament changes.'); return; }
  fs.writeFileSync(OUT, JSON.stringify(result));
  console.log(`Wrote ${OUT}: ${events.length} events, ${events.reduce((a, e) => a + e.teams.length, 0)} teams, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
})();
