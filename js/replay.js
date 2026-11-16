/* Replay review: step through a Pokémon Showdown replay turn by turn.
 * The battle log is read into turns, each with plain-English events and a
 * snapshot of both teams (HP, status, who is on the field) and the field.
 * You mark the key turn, write notes per turn and a takeaway; reviews are
 * saved to your account and can be sent to the game log. */
(function () {
  'use strict';
  const VL = (window.VL = window.VL || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = () => VL.store;

  const STAT = { atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed', accuracy: 'accuracy', evasion: 'evasiveness' };
  const STATUS = { brn: 'burned', par: 'paralyzed', psn: 'poisoned', tox: 'badly poisoned', slp: 'asleep', frz: 'frozen' };
  const WEATHER = { RainDance: 'Rain', SunnyDay: 'Sun', Sandstorm: 'Sandstorm', Snowscape: 'Snow', Snow: 'Snow', Hail: 'Hail', DesolateLand: 'Extremely harsh sunlight', PrimordialSea: 'Heavy rain', DeltaStream: 'Strong winds' };
  const clean = (s) => String(s || '').replace(/^(move|ability|item): /, '');

  // ---------- reading the log ----------
  function parse(log) {
    const lines = String(log || '').split('\n');
    const S = { players: {}, preview: { p1: [], p2: [] }, mons: {}, order: { p1: [], p2: [] }, active: {}, weather: '', terrain: '', room: [], side: { p1: [], p2: [] } };
    const REV = {}; const rev = (k) => (REV[k] ||= { moves: new Set(), item: '', ability: '', mega: false, tera: '' });
    const turns = [{ n: 0, events: [] }]; let cur = turns[0]; let winner = '', tier = '', gametype = '', after = false, flags = {};
    const ref = (ident) => { const m = String(ident || '').match(/^(p[12])([a-c])?: (.+)$/); return m ? { side: m[1], slot: m[2] ? m[1] + m[2] : null, k: m[1] + ':' + m[3] } : null; };
    const species = (d) => String(d || '').split(',')[0].trim();
    const hpOf = (s) => { s = String(s || ''); if (/fnt/.test(s)) return { hp: 0, fnt: true, status: '' }; const m = s.match(/^(\d+)\/(\d+)/); const st = (s.split(' ')[1] || '').replace(/[^a-z]/g, ''); return { hp: m ? Math.max(+m[1] > 0 ? 1 : 0, Math.round(100 * m[1] / m[2])) : null, status: STATUS[st] ? st : '' }; };
    const nm = (r) => { const m = r && S.mons[r.k]; return m ? `<span class="rp-n ${m.side}">${esc(m.name)}</span>` : '<span class="rp-n">a Pokémon</span>'; };
    const pl = (side) => `<span class="rp-n ${side}">${esc(S.players[side] || side)}</span>`;
    const tagOf = (f, name) => { const t = f.find(x => x.startsWith(`[${name}]`)); return t ? t.slice(name.length + 2).trim() : ''; };
    const from = (f) => { const t = tagOf(f, 'from'); if (!t) return ''; const map = { psn: 'poison', tox: 'poison', brn: 'its burn', Recoil: 'recoil', recoil: 'recoil', confusion: 'confusion' }; return map[t] || clean(t); };
    const ev = (side, html, cls) => cur.events.push({ side: side || '', html, cls: cls || '', after });
    const snap = () => JSON.parse(JSON.stringify({ mons: S.mons, order: S.order, active: S.active, weather: S.weather, terrain: S.terrain, room: S.room, side: S.side }));
    const setHp = (r, text) => { const m = S.mons[r.k]; if (!m) return null; const h = hpOf(text); const was = m.hp; if (h.hp !== null) m.hp = h.hp; if (h.fnt) { m.fnt = true; m.status = ''; } else if (h.status || /\d+\/\d+$/.test(String(text).split(' ')[0])) m.status = h.status; return { was, now: m.hp }; };

    for (const l of lines) {
      const f = l.split('|'); const t = f[1];
      if (!t) continue;
      if (t === 'player' && f[3]) { S.players[f[2]] = f[3]; continue; }
      if (t === 'poke') { if (S.preview[f[2]]) S.preview[f[2]].push(species(f[3]).replace(/-\*$/, '')); continue; }
      if (t === 'tier') { tier = f[2]; continue; }
      if (t === 'gametype') { gametype = f[2]; continue; }
      if (t === 'turn') { cur.snap = snap(); cur = { n: +f[2], events: [] }; turns.push(cur); after = false; flags = {}; continue; }
      if (t === 'upkeep') { after = true; continue; }
      if (t === 'win') { winner = f[2]; ev('', `<b>${esc(f[2])} won the battle.</b>`, 'win'); continue; }
      if (t === 'tie') { ev('', '<b>The battle ended in a tie.</b>', 'win'); continue; }
      const r = ref(f[2]);
      // what each Pokémon revealed: abilities and items named in a [from] tag belong to [of], or to the Pokémon itself
      const fromTag = tagOf(f, 'from'); const fm = fromTag.match(/^(ability|item): (.+)$/);
      if (fm) { const who = ref(tagOf(f, 'of')) || r; if (who) { const x = rev(who.k); if (fm[1] === 'ability') x.ability = fm[2]; else x.item = fm[2]; } }
      if (r && t === 'move' && !fromTag) rev(r.k).moves.add(f[3]);
      // turn order, for working out Speed: each action with the field as it was when it happened
      if (r && !after && cur.n > 0 && ((t === 'move' && !fromTag) || t === 'cant')) {
        const m = S.mons[r.k];
        // everyone on the field as they were right as this action started (the next action was ordered from this)
        const field = {}; for (const k of Object.values(S.active)) { const x = S.mons[k]; if (x) field[k] = { name: x.name, st: x.boosts ? x.boosts.spe || 0 : 0, par: x.status === 'par', tw: (S.side[x.side] || []).includes('Tailwind') }; }
        (cur.acts ||= []).push({ k: r.k, side: r.side, name: m ? m.name : '', move: t === 'move' ? f[3] : null, tr: S.room.includes('Trick Room'), weather: S.weather, terrain: S.terrain, field });
        if (t === 'move' && /^(After You|Quash|Instruct|Ally Switch|Round)$/.test(f[3])) cur.skip = true;
      }
      if (r && ((t === '-activate' && /Quick Claw|Quick Draw/.test(f.join('|'))) || (t === '-enditem' && /Custap/.test(f[3] || '')) || /Quick Draw|Quick Claw|Custap/.test(fromTag))) (cur.quick ||= []).push(r.k);
      if (r && (t === '-item' || t === '-enditem')) rev(r.k).item = f[3];
      if (r && t === '-ability') rev(r.k).ability = f[3];
      if (r && t === '-mega') { rev(r.k).mega = true; if (f[4]) rev(r.k).item = f[4]; }
      if (r && t === '-terastallize') rev(r.k).tera = f[3];
      if (t === 'switch' || t === 'drag' || t === 'replace') {
        if (!r) continue;
        const name = species(f[3]);
        const old = r.slot && S.active[r.slot] && S.mons[S.active[r.slot]];
        if (!S.mons[r.k]) { S.mons[r.k] = { side: r.side, name, hp: 100, status: '', fnt: false, boosts: {} }; S.order[r.side].push(r.k); }
        const m = S.mons[r.k]; m.name = name; m.boosts = {}; setHp(r, f[4]);
        if (old && old !== m) old.boosts = {};
        if (r.slot) S.active[r.slot] = r.k;
        if (t === 'replace') continue;
        const lead = cur.n === 0;
        ev(r.side, lead ? `${pl(r.side)} leads with ${nm(r)}.` : t === 'drag' ? `${nm(r)} was dragged in.` : old && old !== m && !old.fnt ? `${pl(r.side)} switched <span class="rp-n ${r.side}">${esc(old.name)}</span> out for ${nm(r)}${m.hp < 100 ? ` (${m.hp}%)` : ''}.` : `${pl(r.side)} sent in ${nm(r)}${m.hp < 100 ? ` (${m.hp}%)` : ''}.`, 'sw');
        continue;
      }
      if (t === 'detailschange' || t === '-formechange') { if (r && S.mons[r.k]) { const was = S.mons[r.k].name; S.mons[r.k].name = species(f[3]); if (t === '-formechange' && was !== S.mons[r.k].name) ev(r.side, `${nm(r)} changed form.`); } continue; }
      if (t === '-mega') { if (r) ev(r.side, `${nm(r)} Mega Evolved${f[4] ? ` (${esc(f[4])})` : ''}.`, 'gim'); continue; }
      if (t === '-terastallize') { if (r) { if (S.mons[r.k]) S.mons[r.k].tera = f[3]; ev(r.side, `${nm(r)} Terastallized into the <b>${esc(f[3])}</b> type.`, 'gim'); } continue; }
      if (t === 'move') {
        if (!r) continue; const target = ref(f[4]); const spread = tagOf(f, 'spread'); const miss = f.includes('[miss]'); const fr = from(f);
        flags = {};
        ev(r.side, `${nm(r)} used <b>${esc(f[3])}</b>${spread ? ' on both targets' : target && target.k !== r.k && S.mons[target.k] ? ` on ${nm(target)}` : ''}${fr && fr !== f[3] ? ` <span class="mini">(${esc(fr)})</span>` : ''}${miss ? ', but it missed' : ''}.`, 'mv');
        continue;
      }
      if (t === 'cant') { if (r) { const why = { flinch: 'flinched', par: 'is fully paralyzed', slp: 'is fast asleep', frz: 'is frozen solid', recharge: 'has to recharge' }[f[3]]; ev(r.side, why ? `${nm(r)} ${why} and couldn't move.` : `${nm(r)} couldn't move (${esc(clean(f[3]))}).`, 'bad'); } continue; }
      if (t === 'faint') { if (r && S.mons[r.k]) { S.mons[r.k].hp = 0; S.mons[r.k].fnt = true; S.mons[r.k].status = ''; ev(r.side, `${nm(r)} fainted.`, 'ko'); } continue; }
      if (t === '-supereffective') { if (r) flags[r.k] = { ...(flags[r.k] || {}), se: 1 }; continue; }
      if (t === '-resisted') { if (r) flags[r.k] = { ...(flags[r.k] || {}), res: 1 }; continue; }
      if (t === '-crit') { if (r) flags[r.k] = { ...(flags[r.k] || {}), crit: 1 }; continue; }
      if (t === '-damage' || t === '-heal' || t === '-sethp') {
        if (!r || !S.mons[r.k]) continue; const h = setHp(r, f[3]); if (!h) continue; const fr = from(f); const fl = flags[r.k] || {}; delete flags[r.k];
        const d = h.now - h.was; const notes = [fl.se ? 'super effective' : '', fl.res ? 'not very effective' : '', fl.crit ? 'critical hit' : '', fr ? `from ${esc(fr)}` : ''].filter(Boolean).join(', ');
        if (t === '-heal') ev(r.side, `${nm(r)} healed to <b>${h.now}%</b>${d ? ` <span class="mini">(+${d})</span>` : ''}${fr ? ` <span class="mini">${esc(fr)}</span>` : ''}.`, 'heal');
        else ev(r.side, `${nm(r)} ${h.now === 0 ? 'was knocked out' : `is down to <b>${h.now}%</b>`}${d ? ` <span class="mini">(${d})</span>` : ''}${notes ? ` <span class="mini">${notes}</span>` : ''}.`, 'hit');
        continue;
      }
      if (t === '-status') { if (r && S.mons[r.k]) { S.mons[r.k].status = f[3]; ev(r.side, `${nm(r)} is now <b>${esc(STATUS[f[3]] || f[3])}</b>${from(f) ? ` <span class="mini">(${esc(from(f))})</span>` : ''}.`, 'bad'); } continue; }
      if (t === '-curestatus') { if (r && S.mons[r.k]) { S.mons[r.k].status = ''; ev(r.side, `${nm(r)} is no longer ${esc(STATUS[f[3]] || f[3])}.`); } continue; }
      if (t === '-boost' || t === '-unboost') { if (r && S.mons[r.k]) { const n = +f[4] || 1; const b = S.mons[r.k].boosts; b[f[3]] = (b[f[3]] || 0) + (t === '-boost' ? n : -n); ev(r.side, `${nm(r)}'s ${esc(STAT[f[3]] || f[3])} ${t === '-boost' ? 'rose' : 'fell'}${n > 1 ? ` by ${n}` : ''} <span class="mini">(now ${b[f[3]] > 0 ? '+' : ''}${b[f[3]]})</span>.`, t === '-boost' ? 'good' : 'bad'); } continue; }
      if (t === '-setboost') { if (r && S.mons[r.k]) { S.mons[r.k].boosts[f[3]] = +f[4]; ev(r.side, `${nm(r)}'s ${esc(STAT[f[3]] || f[3])} was set to ${+f[4] > 0 ? '+' : ''}${esc(f[4])}.`); } continue; }
      if (t === '-clearallboost') { for (const m of Object.values(S.mons)) m.boosts = {}; ev('', 'All stat changes were removed.'); continue; }
      if (t === '-clearboost' || t === '-clearnegativeboost' || t === '-clearpositiveboost') { if (r && S.mons[r.k]) { S.mons[r.k].boosts = {}; ev(r.side, `${nm(r)}'s stat changes were removed.`); } continue; }
      if (t === '-weather') { if (f.includes('[upkeep]')) continue; const w = f[2]; const of = ref(tagOf(f, 'of')); if (w === 'none') { if (S.weather) ev('', `The ${esc(S.weather.toLowerCase())} stopped.`, 'fld'); S.weather = ''; } else { S.weather = WEATHER[w] || w; ev(of ? of.side : '', `<b>${esc(S.weather)}</b> started${from(f) ? ` <span class="mini">(${of ? nm(of) + '\'s ' : ''}${esc(from(f))})</span>` : ''}.`, 'fld'); } continue; }
      if (t === '-fieldstart' || t === '-fieldend') { const what = clean(f[2]); const on = t === '-fieldstart'; if (/Terrain/.test(what)) S.terrain = on ? what : ''; else { S.room = S.room.filter(x => x !== what); if (on) S.room.push(what); } ev('', `<b>${esc(what)}</b> ${on ? 'started' : 'ended'}${on && from(f) ? ` <span class="mini">(${esc(from(f))})</span>` : ''}.`, 'fld'); continue; }
      if (t === '-sidestart' || t === '-sideend') { const side = (f[2] || '').slice(0, 2); const what = clean(f[3]); const on = t === '-sidestart'; if (S.side[side]) { if (on) S.side[side].push(what); else { const i = S.side[side].indexOf(what); if (i >= 0) S.side[side].splice(i, 1); } } ev(side, `<b>${esc(what)}</b> ${on ? 'is now up on' : 'ended on'} ${pl(side)}'s side.`, 'fld'); continue; }
      if (t === '-ability') { if (r) ev(r.side, `${nm(r)}'s <b>${esc(f[3])}</b> activated.`, 'info'); continue; }
      if (t === '-item') { if (r) ev(r.side, `${nm(r)}'s item is revealed: <b>${esc(f[3])}</b>${from(f) ? ` <span class="mini">(${esc(from(f))})</span>` : ''}.`, 'info'); continue; }
      if (t === '-enditem') { if (r) ev(r.side, f.includes('[eat]') ? `${nm(r)} ate its <b>${esc(f[3])}</b>.` : from(f) ? `${nm(r)} lost its <b>${esc(f[3])}</b> <span class="mini">(${esc(from(f))})</span>.` : `${nm(r)}'s <b>${esc(f[3])}</b> was used up.`, 'info'); continue; }
      if (t === '-miss') { const tg = ref(f[3]); if (r) ev(r.side, `${nm(r)}'s attack missed${tg && S.mons[tg.k] ? ' ' + nm(tg) : ''}.`, 'bad'); continue; }
      if (t === '-fail') { if (r) ev(r.side, `It failed for ${nm(r)}.`, 'bad'); continue; }
      if (t === '-immune') { if (r) ev(r.side, `It doesn't affect ${nm(r)}.`); continue; }
      if (t === '-activate') { if (r) { const what = clean(f[3]); ev(r.side, /Protect|Detect|Shield|Bunker|Guard|Obstruct|Silk Trap|Bulwark/.test(what) ? `${nm(r)} protected itself.` : `${nm(r)}: ${esc(what)}.`, 'info'); } continue; }
      if (t === '-start' || t === '-end') { if (r) { const what = clean(f[3]); if (/^typechange|^typeadd/.test(what)) continue; ev(r.side, t === '-start' ? `${nm(r)}: <b>${esc(what)}</b> started.` : `${nm(r)}: ${esc(what)} ended.`, 'info'); } continue; }
      if (t === '-prepare') { if (r) ev(r.side, `${nm(r)} is charging <b>${esc(f[3])}</b>.`); continue; }
      if (t === '-hitcount') { ev('', `Hit ${esc(f[3])} times.`); continue; }
      if (t === '-singlemove' || t === '-singleturn') { if (r && !/Protect|Detect/.test(f[3] || '')) ev(r.side, `${nm(r)}: ${esc(clean(f[3]))}.`, 'info'); continue; }
      if (t === '-message') { ev('', esc(f[2] || '')); continue; }
    }
    cur.snap = snap();
    const leads = { p1: [], p2: [] }; for (const side of ['p1', 'p2']) for (const k of S.order[side]) { const sl = Object.entries(turns[0].snap.active).some(([slot, key]) => key === k); if (sl) leads[side].push(k); }
    const revealed = Object.fromEntries(Object.entries(REV).map(([k, x]) => [k, { ...x, moves: [...x.moves] }]));
    return { revealed, players: S.players, preview: S.preview, turns, winner, tier, gametype, leads, ok: turns.length > 1 && !!S.players.p1 && !!S.players.p2 };
  }

  // ---------- state ----------
  let R = null; // { id, url, log, data, me, turn, key, notes, takeaway, after }
  const SD = 'vgclab-sdname';
  const sdName = () => { try { return localStorage.getItem(SD) || ''; } catch (e) { return ''; } };
  const norm = (u) => String(u || '').trim().replace(/[?#].*$/, '').replace(/\.(json|log)$/, '');
  const idOf = (url) => 'r-' + norm(url).replace(/^https:\/\/replay\.pokemonshowdown\.com\//, '').replace(/[^a-z0-9-]/gi, '').slice(0, 80);
  const baseName = (n) => String(n || '').replace(/-(Mega|Mega-[XYZ]|Primal)$/, '');

  function start(log, url, saved) {
    const data = parse(log);
    if (!data.ok) return false;
    const mine = sdName().toLowerCase();
    let me = saved && saved.me; if (!me) me = Object.keys(data.players).find(k => data.players[k].toLowerCase() === mine) || 'p1';
    R = { id: saved ? saved.id : (url ? idOf(url) : VL.newId('r')), url: url || '', log, data, me, turn: saved && saved.key ? saved.key : 1, key: saved ? saved.key || null : null, notes: saved ? { ...(saved.notes || {}) } : {}, takeaway: saved ? saved.takeaway || '' : '', after: false, dirty: false };
    if (R.turn > data.turns.length - 1) R.turn = data.turns.length - 1;
    return true;
  }
  async function loadUrl(raw) {
    const url = norm(raw);
    if (!/^https:\/\/replay\.pokemonshowdown\.com\/[^/]+/.test(url)) return 'That isn\'t a Showdown replay link. They start with https://replay.pokemonshowdown.com/';
    let j = null; try { const r = await fetch(url + '.json'); if (r.ok) j = await r.json(); } catch (e) { j = null; }
    if (!j || !j.log) return 'Couldn\'t load that replay. Check the link, or paste the battle log below instead.';
    const saved = store().get('reviews', idOf(url));
    return start(j.log, url, saved) ? '' : 'That replay doesn\'t have a battle in it.';
  }

  // ---------- their Pokémon and the speed order ----------
  // What the replay revealed for each Pokémon, what it usually runs, and the speed order: yours exact
  // (from the saved team that matches), theirs a range from the slowest to the fastest it could be.
  const toId = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const STAT6 = ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'];
  function fmtOf(d) { const id = toId(d.tier); const f = id && VL.D.format(id); return f && f.id === id ? f : VL.D.format(VL.curFormatId()); }
  function myTeamSets(d, fmt, side) {
    const last = d.turns[d.turns.length - 1].snap;
    const mine = new Set([...d.preview[side], ...last.order[side].map(k => last.mons[k].name)].map(n => toId(baseName(n))));
    let best = null, bestN = 0;
    for (const t of store().list('teams').filter(t => t.paste)) {
      const sets = VL.builder.parsePaste(t.paste).filter(x => x && x.species);
      const n = sets.filter(x => mine.has(toId(baseName(x.species)))).length;
      if (n > bestN || (n === bestN && t.fmt === fmt.id && best && best.t.fmt !== fmt.id)) { best = { t, sets }; bestN = n; }
    }
    return bestN >= 3 ? best : null;
  }
  function recOf(name, fmt) { const i = VL.D.find(name); return i >= 0 ? VL.D.mon(i, fmt) : null; }
  function megaRec(rec, item, fmt) { const k = rec && item ? VL.D.megaOf(rec, item) : null; return k !== null && k !== undefined ? VL.D.mon(k, fmt) : null; }
  function speedRows(d, fmt, mineSets, tr) {
    const last = d.turns[d.turns.length - 1].snap; const sp = VL.teamcheck.speedOf; const champ = !!(fmt.mod && fmt.mod.startsWith('champions')); const max = champ ? 32 : 252;
    const e = VL.meta.forFormat(fmt.id);
    const rows = [];
    for (const side of ['p1', 'p2']) for (const k of last.order[side]) {
      const name = last.mons[k].name; const x = d.revealed[k] || {}; let rec = recOf(baseName(name), fmt); if (!rec) continue;
      const mine = side === R.me;
      const set = mine && mineSets ? mineSets.sets.find(s => toId(baseName(s.species)) === toId(baseName(name))) : null;
      const item = (set && set.item) || x.item || '';
      const mg = megaRec(rec, item, fmt) || (/-Mega/.test(name) ? recOf(name, fmt) : null); const show = mg || rec;
      const scarf = toId(item) === 'choicescarf' ? 1.5 : 1; const f = (v) => Math.floor(v * scarf);
      if (set) { rows.push({ k, side, mine, name: show.n, lo: f(sp(show.s[5], set.evs, set.nature, fmt)), hi: null, exact: true, scarf: scarf > 1 }); continue; }
      const m = e && (VL.meta.get(e, show.n) || VL.meta.get(e, rec.n)); const spread = m && m.spreads && m.spreads[0] && m.spreads[0][0];
      const common = spread ? f(sp(show.s[5], (spread.split(':')[1] || '').split('/').map(Number), spread.split(':')[0], fmt)) : null;
      rows.push({ k, side, mine, name: show.n, lo: f(sp(show.s[5], [0, 0, 0, 0, 0, 0], 'Brave', fmt)), hi: f(sp(show.s[5], [0, 0, 0, 0, 0, max], 'Timid', fmt)), common, scarf: scarf > 1 });
    }
    const clues = speedClues(d, fmt, mineSets);
    for (const r of rows) {
      const c = !r.mine && clues[r.k + '|' + toId(r.name)]; if (!c) continue;
      r.why = c.why; r.scarfMaybe = c.scarfMaybe;
      const lo = Math.max(r.lo, c.lo ?? -Infinity), hi = Math.min(r.hi, c.hi ?? Infinity);
      if (lo > hi) r.odd = true;
      else { const nlo = Math.ceil(lo), nhi = Math.floor(hi); r.narrowed = nlo > r.lo || nhi < r.hi; r.lo = nlo; r.hi = nhi; if (r.narrowed && r.common && (r.common < r.lo || r.common > r.hi)) r.commonOut = true; }
    }
    const key = (r) => r.exact ? r.lo : r.narrowed ? (r.lo + r.hi) / 2 : (r.common ?? (r.lo + r.hi) / 2);
    return rows.sort((a, b) => tr ? key(a) - key(b) : key(b) - key(a));
  }
  // Turn order as evidence: when one of yours and one of theirs act back to back with the same priority,
  // the first was faster (slower under Trick Room). Your Speed is exact, so each such pair puts a floor or a
  // ceiling on theirs. Pairs are skipped when something unseen could change the order: Quick Claw, After You,
  // a possible Prankster, Gale Wings or Triage, or a possible weather or terrain Speed ability in that weather.
  const SPEED_AB = { 'Swift Swim': (a) => /Rain|rain/.test(a.weather), Chlorophyll: (a) => /Sun|sunlight/.test(a.weather), 'Sand Rush': (a) => a.weather === 'Sandstorm', 'Slush Rush': (a) => /Snow|Hail/.test(a.weather), 'Surge Surfer': (a) => a.terrain === 'Electric Terrain', Protosynthesis: (a) => /Sun|sunlight/.test(a.weather), 'Quark Drive': (a) => a.terrain === 'Electric Terrain' };
  const UNSURE_AB = ['Unburden', 'Stall', 'Mycelium Might', 'Gale Wings', 'Triage', 'Quick Draw'];
  const stage = (n) => (n >= 0 ? (2 + n) / 2 : 2 / (2 - n));
  function speedClues(d, fmt, mineSets) {
    const out = {}; if (!mineSets) return out;
    const sp = VL.teamcheck.speedOf;
    const abil = (k, name) => { const x = d.revealed[k]; if (x && x.ability) return [x.ability]; const r = recOf(name, fmt); return r ? (r.a || []) : []; };
    const prio = (act, abs) => {
      if (!act.move) return null; const mv = VL.D.move(act.move, fmt); if (!mv) return null;
      if (mv.c === 'S' && abs.includes('Prankster')) return abs.length === 1 ? (mv.p || 0) + 1 : null;
      if (abs.some(a => UNSURE_AB.includes(a))) return null;
      return mv.p || 0;
    };
    for (const T of d.turns) {
      const acts = T.acts || []; if (T.skip || acts.length < 2) continue; const quick = T.quick || [];
      for (let i = 0; i + 1 < acts.length; i++) {
        const A = acts[i], B = acts[i + 1];
        if (A.side === B.side || quick.includes(A.k) || quick.includes(B.k)) continue;
        const me0 = A.side === R.me ? A : B, them0 = me0 === A ? B : A;
        // both as they were when A started: that's when B's place in the order was settled
        const at = (x) => { const f = A.field[x.k]; return { ...x, name: f ? f.name : x.name, st: f ? f.st : 0, par: f ? f.par : false, tw: f ? f.tw : false, weather: A.weather, terrain: A.terrain }; };
        const me = at(me0), them = at(them0);
        const set = mineSets.sets.find(x => toId(baseName(x.species)) === toId(baseName(me.name))); if (!set) continue;
        const myRec = recOf(me.name, fmt), theirRec = recOf(them.name, fmt); if (!myRec || !theirRec) continue;
        const myAb = set.ability ? [set.ability] : (myRec.a || []), theirAb = abil(them.k, them.name);
        const pa = prio(A, A === me ? myAb : theirAb), pb = prio(B, B === me ? myAb : theirAb);
        if (pa === null || pb === null || pa !== pb) continue;
        if (theirAb.some(a => SPEED_AB[a] && SPEED_AB[a](them))) continue;
        if (myAb.length !== 1 && myAb.some(a => SPEED_AB[a] && SPEED_AB[a](me))) continue;
        // your effective Speed right then
        let mine = sp(myRec.s[5], set.evs, set.nature, fmt) * stage(me.st) * (me.tw ? 2 : 1) * (me.par ? 0.5 : 1) * (toId(set.item) === 'choicescarf' && !/-Mega/.test(me.name) ? 1.5 : 1);
        if (myAb.length === 1 && SPEED_AB[myAb[0]] && SPEED_AB[myAb[0]](me)) mine *= 2;
        mine = Math.floor(mine);
        // what multiplies their Speed that we can see
        const rv = d.revealed[them.k] || {}; const scarf = toId(rv.item) === 'choicescarf' && !/-Mega/.test(them.name);
        const mult = stage(them.st) * (them.tw ? 2 : 1) * (them.par ? 0.5 : 1) * (scarf ? 1.5 : 1);
        const theyFirst = them0 === A; const faster = A.tr ? !theyFirst : theyFirst; // under Trick Room the first one was slower
        const bound = mine / mult;
        const id = them.k + '|' + toId(them.name); const c = (out[id] ||= { lo: null, hi: null, why: [] });
        const mvName = (a) => a.move || 'its turn';
        if (faster) { c.lo = Math.max(c.lo ?? 0, bound); if (!rv.item) c.scarfMaybe = true; }
        else c.hi = Math.min(c.hi ?? Infinity, bound);
        c.why.push({ b: faster ? Math.ceil(bound) : Math.floor(bound), lo: faster, t: `Turn ${T.n}: ${them.name} (${mvName(them)}) moved ${theyFirst ? 'before' : 'after'} your ${me.name} (${mvName(me)}, Speed ${mine})${A.tr ? ' under Trick Room' : ''}${them.tw ? ', their Tailwind up' : ''}${me.tw ? ', your Tailwind up' : ''}${them.st ? `, its Speed ${them.st > 0 ? '+' : ''}${them.st}` : ''}${them.par ? ', it was paralyzed' : ''}, so its Speed is ${faster ? 'at least' : 'at most'} ${faster ? Math.ceil(bound) : Math.floor(bound)}.` });
      }
    }
    return out;
  }
  function infoHtml() {
    const d = R.data; const fmt = fmtOf(d); const opp = R.me === 'p1' ? 'p2' : 'p1'; const last = d.turns[d.turns.length - 1].snap;
    const e = VL.meta.forFormat(fmt.id); const mineSets = myTeamSets(d, fmt, R.me); const tr = !!R.trOrder;
    const brought = new Map(last.order[opp].map(k => [toId(baseName(last.mons[k].name)), k]));
    const names = d.preview[opp].length ? d.preview[opp] : last.order[opp].map(k => last.mons[k].name);
    const card = (n) => {
      const k = brought.get(toId(baseName(n))); const x = (k && d.revealed[k]) || { moves: [] };
      const rec = recOf(baseName(n), fmt); if (!rec) return `<div class="rp-mon"><b>${esc(n)}</b></div>`;
      const mg = megaRec(rec, x.item, fmt) || (k && /-Mega/.test(last.mons[k].name) ? recOf(last.mons[k].name, fmt) : null); const show = mg || rec;
      const m = e && (VL.meta.get(e, show.n) || VL.meta.get(e, rec.n));
      const seen = [x.moves.length ? `<b>Moves:</b> ${esc(x.moves.join(', '))}` : '', x.item ? `<b>Item:</b> ${esc(x.item)}` : '', x.ability ? `<b>Ability:</b> ${esc(x.ability)}` : '', x.mega ? '<b>Mega Evolved</b>' : '', x.tera ? `<b>Tera:</b> ${esc(x.tera)}` : ''].filter(Boolean);
      const usual = m ? [m.items[0] && m.items[0][0] !== 'No item' ? m.items[0][0] : '', m.abilities[0] && m.abilities[0][0], m.spreads[0] && VL.meta.spreadText ? VL.meta.spreadText(m.spreads[0][0], !!(fmt.mod && fmt.mod.startsWith('champions'))) : '', m.moves.slice(0, 4).map(y => y[0]).join(', ')].filter(Boolean) : [];
      return `<div class="rp-mon ${k ? '' : 'unbrought'}"><div class="kv">${VL.sprite(show, 'xs')}<b>${esc(show.n)}</b>${show.t.map(t => `<span class="ty ${esc(t)}">${esc(t)}</span>`).join('')}${k ? '' : '<span class="mini">not brought</span>'}</div>
        <div class="rp-base">${STAT6.map((l, i) => `<span><i>${l}</i> ${show.s[i]}</span>`).join('')}</div>
        ${k ? `<div class="sub">${seen.length ? 'Seen in this game: ' + seen.join(' · ') : 'Nothing revealed in this game.'}</div>` : ''}
        ${usual.length ? `<div class="sub">Usually: ${esc(usual.join(' · '))}</div>` : ''}</div>`;
    };
    const rows = speedRows(d, fmt, mineSets, tr);
    const top = Math.max(1, ...rows.map(r => r.hi || r.lo));
    const spRow = (r) => `<div class="${r.mine ? 'mine' : ''}">${VL.sprite(r.name, 'xs')}<span>${esc(r.name)}${r.scarf ? ' <span class="mini">Scarf</span>' : ''}</span>
      <span class="bar">${r.exact ? `<i style="left:${Math.round(100 * r.lo / top)}%;width:1.5%"></i>` : `<i style="left:${Math.round(100 * r.lo / top)}%;width:${Math.max(1.5, Math.round(100 * (r.hi - r.lo) / top))}%"></i>`}</span>
      <span class="num">${r.exact ? r.lo : r.odd ? `<span class="mid-t">doesn't fit</span>` : `${r.lo === r.hi ? r.lo : `${r.lo}–${r.hi}`}${r.narrowed ? ' <span class="mini good-t">from turn order</span>' : r.common ? ` <span class="mini">usually ${r.common}</span>` : ''}`}</span></div>`;
    return `<div class="card"><div class="card-head"><h3>Their Pokémon</h3><span class="sub">${esc(fmt.name)}</span></div>
      <div class="rp-mons">${names.map(card).join('')}</div>
      <p class="sub">Base stats, then what this replay revealed, then the most common item, ability, spread and moves for it in this format.</p></div>
      <div class="card"><div class="card-head"><h3>Speed order</h3><div class="seg" role="group" aria-label="Speed order"><button type="button" data-rptr="0" aria-pressed="${!tr}">Normal</button><button type="button" data-rptr="1" aria-pressed="${tr}">Under Trick Room</button></div></div>
        <div class="sh-speed rp-speed">${rows.map(spRow).join('')}</div>
        ${(() => { const ev = rows.filter(r => r.why && r.why.length); if (!ev.length) return `<p class="sub">${mineSets ? 'No turns in this game had one of yours and one of theirs move back to back with the same priority, so their Speed can\'t be narrowed down.' : 'Save this team in the Team builder so your Speed is exact; then turn order can narrow down theirs.'}</p>`;
          return `<details class="rp-why" open><summary><b>How their Speed was worked out</b></summary>${ev.map(r => `<div class="rp-why-mon"><b>${esc(r.name)}</b>${r.odd ? ' <span class="mid-t">The turn order doesn\'t fit any normal spread, so something unseen sped it up or slowed it down (a Choice Scarf, Quick Claw, an ability or an item). Its full range is shown.</span>' : ` <span class="sub">${r.narrowed ? `${r.lo === r.hi ? r.lo : `${r.lo}–${r.hi}`}${r.commonOut ? ', so it isn\'t running the most common spread' : ''}${r.scarfMaybe ? '. If it held a hidden Choice Scarf, its real Speed could be lower' : ''}.` : 'These turns fit its whole range, so they don\'t narrow it down.'}</span>`}${(() => { const key = r.why.filter(w => r.narrowed && (w.lo ? w.b === r.lo : w.b === r.hi)); const show = key.length ? key.slice(0, 3) : r.why.slice(0, 2); const rest = r.why.length - show.length;
            return `<ul>${show.map(w => `<li>${esc(w.t)}</li>`).join('')}${rest > 0 ? `<li class="sub">and ${rest} more turn${rest === 1 ? '' : 's'} that fit${rest === 1 ? 's' : ''} this.</li>` : ''}</ul>`; })()}</div>`).join('')}</details>`; })()}
        <p class="sub">${tr ? 'Under Trick Room the slowest moves first, so the top of this list moves first. ' : 'Fastest first. '}${mineSets ? `Your Speed is exact, from your saved team <b>${esc(mineSets.t.name || 'Untitled team')}</b>. ` : 'No saved team matched yours, so your Speed is a range too. '}Theirs is a range from no Speed investment with a Speed-lowering nature to full Speed with a Speed-raising one, plus the most common spread's Speed. If two ranges overlap, either could move first. Where one of yours and one of theirs moved back to back, their range is narrowed using that turn order. A Choice Scarf is counted once the replay shows it.</p></div>`;
  }

  // ---------- drawing ----------
  // ---------- drawing (the board is VL.battleView) ----------
  function render() {
    const root = $('rr-root'); if (!root) return;
    if (!VL.D.dex) { root.innerHTML = '<p class="sub">Loading the Pokémon data…</p>'; return; }
    if (!R) return renderHome();
    const d = R.data; const N = d.turns.length - 1; const T = d.turns[R.turn];
    const sn = R.turn === 0 || R.after ? T.snap : d.turns[R.turn - 1].snap;
    const opp = R.me === 'p1' ? 'p2' : 'p1';
    const result = d.winner ? (d.winner === d.players[R.me] ? 'You won' : 'You lost') : 'No result';
    const evs = (list) => list.map(e => `<div class="rp-ev ${e.cls} ${e.side ? (e.side === R.me ? 'mine' : 'theirs') : ''}">${e.html}</div>`).join('');
    const during = T.events.filter(e => !e.after), afterEv = T.events.filter(e => e.after);
    root.innerHTML = `
      <div class="card rp-head"><div class="card-head"><div><h3><span class="rp-n p1">${esc(d.players.p1)}</span> vs <span class="rp-n p2">${esc(d.players.p2)}</span></h3><div class="sub">${esc(d.tier || 'Showdown battle')} · ${N} turn${N === 1 ? '' : 's'} · <b>${result}</b></div></div>
        <div class="kv" style="flex-wrap:wrap"><span class="sub">I was</span><div class="seg" role="group" aria-label="Which player were you">${['p1', 'p2'].map(s => `<button type="button" data-rpme="${s}" aria-pressed="${R.me === s}">${esc(d.players[s])}</button>`).join('')}</div></div></div>
        <div class="row" style="gap:6px"><button class="btn small" data-rp="save">${R.dirty ? 'Save review' : 'Saved'}</button><button class="btn ghost small" data-rp="log">Log this game</button>${R.url ? `<a class="btn ghost small" href="${esc(R.url)}" target="_blank" rel="noopener">Watch on Showdown ↗</a>` : ''}<button class="btn ghost small" data-rp="close">Close</button></div></div>
      <div class="card"><div class="rp-nav"><button class="btn ghost" data-rp="prev" ${R.turn <= 0 ? 'disabled' : ''} aria-label="Previous turn">◀ Previous</button><div class="rp-title"><b>${R.turn === 0 ? 'Leads' : `Turn ${R.turn}`}</b><span class="sub">of ${N}</span></div><button class="btn ghost" data-rp="next" ${R.turn >= N ? 'disabled' : ''} aria-label="Next turn">Next ▶</button></div>
        <div class="rp-turns" role="group" aria-label="Jump to a turn">${d.turns.map(t => `<button type="button" data-rpt="${t.n}" class="${t.n === R.turn ? 'on' : ''} ${R.key === t.n ? 'key' : ''} ${R.notes[t.n] ? 'note' : ''}" title="${t.n === 0 ? 'Leads' : 'Turn ' + t.n}${R.key === t.n ? ' (key turn)' : ''}">${t.n === 0 ? 'L' : t.n}${R.key === t.n ? '★' : ''}</button>`).join('')}</div>
        <p class="sub">★ is your key turn. A dot marks turns with a note. Use the left and right arrow keys to step.</p></div>
      <div class="rp-main">
        <div class="card"><div class="card-head"><h3>${R.turn === 0 ? 'The field after leads' : R.after ? `The field after turn ${R.turn}` : `The field at the start of turn ${R.turn}`}</h3>${R.turn > 0 ? `<div class="seg" role="group"><button type="button" data-rpa="0" aria-pressed="${!R.after}">Before</button><button type="button" data-rpa="1" aria-pressed="${R.after}">After</button></div>` : ''}</div>
          ${VL.battleView(d, sn, { me: R.me, turn: R.turn === 0 ? 0 : R.after ? R.turn + 1 : R.turn })}</div>
        <div class="card"><div class="card-head"><h3>${R.turn === 0 ? 'Team preview and leads' : `What happened on turn ${R.turn}`}</h3><span class="sub"><span class="rp-n ${R.me}">you</span> · <span class="rp-n ${opp}">opponent</span></span></div>
          <div class="rp-events">${evs(during) || '<span class="sub">Nothing happened.</span>'}${afterEv.length ? `<div class="section-label">End of turn</div>${evs(afterEv)}` : ''}</div>
          <label for="rp-note">Your note on ${R.turn === 0 ? 'team preview and leads' : `turn ${R.turn}`}<textarea id="rp-note" placeholder="${R.turn === 0 ? 'Was this the right four and the right lead?' : 'What would you do now? What did you miss?'}">${esc(R.notes[R.turn] || '')}</textarea></label>
          <div class="row" style="justify-content:space-between"><button class="btn ${R.key === R.turn ? '' : 'ghost'} small" data-rp="key">${R.key === R.turn ? '★ This is the key turn' : 'Mark as the key turn'}</button></div></div>
      </div>
      ${infoHtml()}
      <div class="card"><label for="rp-take">Takeaway: what would you do differently next time?<textarea id="rp-take" placeholder="One or two sentences you'd want to read before your next game like this">${esc(R.takeaway)}</textarea></label></div>`;
  }
  function renderHome() {
    const root = $('rr-root');
    const revs = store().list('reviews').sort((a, b) => (b.u || b.ts || 0) - (a.u || a.ts || 0));
    const have = new Set(revs.map(r => r.url).filter(Boolean));
    const games = store().list('games').filter(g => /^https:\/\/replay\.pokemonshowdown\.com\//.test(g.source || '') && !have.has(norm(g.source))).sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 12);
    root.innerHTML = `
      <div class="card"><div class="row"><label for="rp-url2" style="flex:2 1 320px">Replay link<input type="text" id="rp-url2" placeholder="https://replay.pokemonshowdown.com/..."></label><label for="rp-me2">Your Showdown username<input type="text" id="rp-me2" value="${esc(sdName())}" placeholder="So the app knows which side was you"></label><button class="btn" id="rp-load" style="height:36px;align-self:flex-end">Load replay</button></div>
        <p class="sub" id="rp-msg2" role="status"></p>
        <details><summary class="sub" style="cursor:pointer">Link not working? Paste the battle log instead</summary><p class="sub">Open the replay, add <code class="k">.log</code> to the end of its address, copy everything, and paste it here.</p><textarea id="rp-log2" style="min-height:110px;font-family:var(--mono);font-size:12px"></textarea><div class="row" style="justify-content:flex-end"><button class="btn ghost small" id="rp-loadlog">Use this log</button></div></details></div>
      ${revs.length ? `<div class="card"><div class="card-head"><h3>Your reviews</h3><span class="sub">${revs.length} saved</span></div>${revs.map(r => `<div class="threat"><div class="h"><div><b>${esc(r.title || 'Replay')}</b> <span class="mini">${r.ts ? new Date(r.ts).toLocaleDateString() : ''}</span><div class="sub">${esc(r.fmt || '')}${r.result ? ` · ${r.result === 'W' ? 'Win' : 'Loss'}` : ''}${r.key ? ` · key turn ${r.key}` : ''}${Object.keys(r.notes || {}).length ? ` · ${Object.keys(r.notes).length} note${Object.keys(r.notes).length === 1 ? '' : 's'}` : ''}</div></div><div class="kv"><button class="btn small" data-rpopen="${esc(r.id)}">Open</button><button class="linkbtn" data-rpdel="${esc(r.id)}">Delete</button></div></div>${r.takeaway ? `<div class="sub" style="white-space:pre-wrap">${esc(r.takeaway)}</div>` : ''}</div>`).join('')}</div>` : ''}
      ${games.length ? `<div class="card"><div class="card-head"><h3>Logged games with a replay</h3><span class="sub">Not reviewed yet</span></div>${games.map(g => `<div class="threat"><div class="h"><div><span class="pill ${g.result === 'W' ? 'w' : 'l'}">${g.result === 'W' ? 'Win' : 'Loss'}</span> <span class="mini">${esc(g.day || '')}</span> ${VL.spriteRow(g.opp || [], 'xs')}</div><button class="btn small" data-rpurl="${esc(g.source)}">Review</button></div></div>`).join('')}</div>` : ''}
      ${!revs.length && !games.length ? '<div class="empty">No reviews yet. Paste a replay link above to start your first one.</div>' : ''}`;
  }

  // ---------- saving ----------
  function grabInputs() { if (!R) return; const n = $('rp-note'), t = $('rp-take'); if (n) { const v = n.value.trim(); if (v) R.notes[R.turn] = v; else delete R.notes[R.turn]; } if (t) R.takeaway = t.value.trim(); }
  function save(quiet) {
    grabInputs(); const d = R.data;
    const title = `${d.players[R.me]} vs ${d.players[R.me === 'p1' ? 'p2' : 'p1']}`;
    const rec = { ts: (store().get('reviews', R.id) || {}).ts || Date.now(), url: R.url, title, fmt: d.tier, me: R.me, result: d.winner ? (d.winner === d.players[R.me] ? 'W' : 'L') : null, turns: d.turns.length - 1, key: R.key, notes: R.notes, takeaway: R.takeaway };
    if (!R.url) rec.log = R.log.slice(0, 120000); // pasted logs have no link to load from again
    store().put('reviews', R.id, rec); R.dirty = false;
    if (!quiet) { VL.toast('Review saved'); VL.sound && VL.sound.play('save'); }
  }
  function toLog() {
    save(true); const d = R.data; const opp = R.me === 'p1' ? 'p2' : 'p1'; const last = d.turns[d.turns.length - 1].snap;
    const names = (keys) => keys.map(k => baseName(last.mons[k].name));
    const myLead = names(d.leads[R.me]), myAll = names(last.order[R.me]);
    const lines = [R.takeaway, R.key ? `Key turn: ${R.key}${R.notes[R.key] ? '. ' + R.notes[R.key] : ''}` : '', ...Object.entries(R.notes).filter(([t]) => +t !== R.key).map(([t, v]) => `${+t === 0 ? 'Leads' : 'Turn ' + t}: ${v}`), R.url ? `Replay: ${R.url}` : ''].filter(Boolean);
    VL.prefillLog({ mypreview: d.preview[R.me].length ? d.preview[R.me] : null, bring: /singles/i.test(d.gametype || '') ? 3 : 4, result: d.winner ? (d.winner === d.players[R.me] ? 'W' : 'L') : null, opp: d.preview[opp].length ? d.preview[opp] : names(last.order[opp]), opplead: names(d.leads[opp]), mylead: myLead, myback: myAll.filter(n => !myLead.includes(n)), oppName: d.players[opp], note: lines.join('\n'), source: R.url || 'showdown-log', turn: R.key || null });
  }

  // ---------- events ----------
  function go(n) { grabInputs(); const N = R.data.turns.length - 1; R.turn = Math.max(0, Math.min(N, n)); R.after = false; render(); }
  document.addEventListener('click', async (e) => {
    const root = $('rr-root'); if (!root || !root.contains(e.target)) return;
    if (e.target.id === 'rp-load') {
      const me = $('rp-me2').value.trim(); try { localStorage.setItem(SD, me); } catch (x) { /* ignore */ }
      $('rp-msg2').textContent = 'Loading…'; const err = await loadUrl($('rp-url2').value); if (err) { $('rp-msg2').textContent = err; return; } render(); return;
    }
    if (e.target.id === 'rp-loadlog') { const me = $('rp-me2').value.trim(); try { localStorage.setItem(SD, me); } catch (x) { /* ignore */ } if (start($('rp-log2').value, '', null)) { R.dirty = true; render(); } else $('rp-msg2').textContent = 'That doesn\'t look like a Showdown battle log.'; return; }
    const op = e.target.closest('[data-rpopen]'); if (op) { const r = store().get('reviews', op.dataset.rpopen); if (!r) return; if (r.log) { if (start(r.log, '', r)) render(); } else { op.textContent = 'Loading…'; const err = await loadUrl(r.url); if (err) { VL.toast(err); render(); } else render(); } return; }
    const dl = e.target.closest('[data-rpdel]'); if (dl) { VL.armDelete(dl, () => { store().del('reviews', dl.dataset.rpdel); render(); }); return; }
    const u = e.target.closest('[data-rpurl]'); if (u) { u.textContent = 'Loading…'; const err = await loadUrl(u.dataset.rpurl); if (err) VL.toast(err); else R.dirty = true; render(); return; }
    if (!R) return;
    const trb = e.target.closest('[data-rptr]'); if (trb) { grabInputs(); R.trOrder = trb.dataset.rptr === '1'; render(); return; }
    const t = e.target.closest('[data-rpt]'); if (t) return go(+t.dataset.rpt);
    const me = e.target.closest('[data-rpme]'); if (me) { grabInputs(); R.me = me.dataset.rpme; R.dirty = true; render(); return; }
    const a = e.target.closest('[data-rpa]'); if (a) { grabInputs(); R.after = a.dataset.rpa === '1'; render(); return; }
    const b = e.target.closest('[data-rp]'); if (!b) return;
    const k = b.dataset.rp;
    if (k === 'prev') go(R.turn - 1);
    if (k === 'next') go(R.turn + 1);
    if (k === 'key') { grabInputs(); R.key = R.key === R.turn ? null : R.turn; R.dirty = true; if (R.key) VL.sound && VL.sound.play('done'); render(); }
    if (k === 'save') { save(); render(); }
    if (k === 'log') toLog();
    if (k === 'close') { if (R.dirty && (R.key || Object.keys(R.notes).length || R.takeaway)) save(true); R = null; render(); }
  });
  document.addEventListener('input', (e) => { if (R && (e.target.id === 'rp-note' || e.target.id === 'rp-take')) { if (!R.dirty) { R.dirty = true; const b = document.querySelector('[data-rp=save]'); if (b) b.textContent = 'Save review'; } } });
  document.addEventListener('keydown', (e) => {
    if (!R || location.hash !== '#replay' || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(R.turn - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); go(R.turn + 1); }
  });

  VL.replay = { render, parse, async open(url) { location.hash = 'replay'; const err = await loadUrl(url); if (err) VL.toast(err); else if (R) R.dirty = true; render(); } };
})();
