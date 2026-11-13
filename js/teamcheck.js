/* Team checker: shared weaknesses, coverage, speed, a checklist of common
 * tools (doubles or singles, by format), and the meta Pokémon most likely to beat a team. */
(function () {
  'use strict';
  const VL = (window.VL = window.VL || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toId = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const NAT = { lonely: ['atk', 'def'], brave: ['atk', 'spe'], adamant: ['atk', 'spa'], naughty: ['atk', 'spd'], bold: ['def', 'atk'], relaxed: ['def', 'spe'], impish: ['def', 'spa'], lax: ['def', 'spd'], timid: ['spe', 'atk'], hasty: ['spe', 'def'], jolly: ['spe', 'spa'], naive: ['spe', 'spd'], modest: ['spa', 'atk'], mild: ['spa', 'def'], quiet: ['spa', 'spe'], rash: ['spa', 'spd'], calm: ['spd', 'atk'], gentle: ['spd', 'def'], sassy: ['spd', 'spe'], careful: ['spd', 'spa'] };
  const STATKEY = { hp: 0, atk: 1, def: 2, spa: 3, spd: 4, spe: 5 };
  const STATWORD = { hp: 'hp', atk: 'atk', def: 'def', spa: 'spa', spd: 'spd', spe: 'spe', attack: 'atk', defense: 'def', 'sp. atk': 'spa', 'sp. def': 'spd', speed: 'spe', 'spatk': 'spa', 'spdef': 'spd' };
  const ABIL_IMMUNE = { levitate: { Ground: 0 }, eartheater: { Ground: 0 }, flashfire: { Fire: 0 }, wellbakedbody: { Fire: 0 }, waterabsorb: { Water: 0 }, stormdrain: { Water: 0 }, dryskin: { Water: 0 }, voltabsorb: { Electric: 0 }, lightningrod: { Electric: 0 }, motordrive: { Electric: 0 }, sapsipper: { Grass: 0 }, thickfat: { Fire: 0.5, Ice: 0.5 }, heatproof: { Fire: 0.5 }, waterbubble: { Fire: 0.5 }, purifyingsalt: { Ghost: 0.5 } };
  const SPEED_CONTROL = ['tailwind', 'trickroom', 'icywind', 'electroweb', 'thunderwave', 'scaryface', 'bleakwindstorm', 'rocktomb', 'bulldoze', 'glare', 'nuzzle', 'stringshot', 'cottonspore', 'lowsweep', 'afteryou', 'quash'];
  const PROTECTS = ['protect', 'detect', 'spikyshield', 'kingsshield', 'banefulbunker', 'silktrap', 'burningbulwark', 'obstruct'];
  const REDIRECT = ['followme', 'ragepowder', 'spotlight'];
  const SETTERS_AB = ['drought', 'drizzle', 'sandstream', 'snowwarning', 'orichalcumpulse', 'hadronengine', 'electricsurge', 'grassysurge', 'psychicsurge', 'mistysurge', 'megasol'];
  const SETTERS_MV = ['sunnyday', 'raindance', 'sandstorm', 'snowscape', 'electricterrain', 'grassyterrain', 'psychicterrain', 'mistyterrain'];
  const HAZARDS = ['stealthrock', 'spikes', 'toxicspikes', 'stickyweb', 'stoneaxe', 'ceaselessedge'];
  const REMOVAL = ['rapidspin', 'defog', 'mortalspin', 'tidyup', 'courtchange'];
  const PIVOTS = ['uturn', 'voltswitch', 'flipturn', 'partingshot', 'teleport', 'shedtail', 'chillyreception', 'batonpass'];
  const SETUP = ['swordsdance', 'dragondance', 'nastyplot', 'calmmind', 'bulkup', 'quiverdance', 'shellsmash', 'shiftgear', 'coil', 'bellydrum', 'victorydance', 'tidyup', 'agility', 'rockpolish', 'irondefense', 'curse', 'tailglow', 'geomancy', 'filletaway', 'clangoroussoul', 'noretreat'];
  const ANTISETUP = ['haze', 'clearsmog', 'roar', 'whirlwind', 'dragontail', 'circlethrow', 'encore', 'perishsong', 'yawn', 'spectralthief'];
  const RECOVERY = ['recover', 'roost', 'slackoff', 'softboiled', 'synthesis', 'moonlight', 'morningsun', 'wish', 'shoreup', 'strengthsap', 'milkdrink', 'rest', 'junglehealing', 'lunarblessing', 'lifedew', 'healorder'];
  const DISRUPT = ['taunt', 'encore', 'spore', 'sleeppowder', 'willowisp', 'snarl', 'partingshot', 'yawn', 'haze', 'clearsmog', 'imprison'];

  function parse(text) {
    const t = String(text || '').trim(); if (!t) return [];
    if (!/\n\s*\n|\n-|Ability:|@/.test(t)) return t.split(/[,/\n]+/).map(s => ({ name: s.trim() })).filter(x => x.name).slice(0, 6);
    return t.split(/\n\s*\n/).map(block => {
      const lines = block.split('\n').map(l => l.trim()).filter(Boolean); if (!lines.length) return null;
      const m = { name: '', item: '', ability: '', nature: '', evs: null, moves: [] };
      let first = lines[0]; const at = first.split('@'); if (at[1]) m.item = at[1].trim();
      let nm = at[0].replace(/\((M|F)\)/g, '').trim(); const par = nm.match(/\(([^)]+)\)/); m.name = par ? par[1].trim() : nm;
      for (const l of lines.slice(1)) {
        if (/^Ability:/i.test(l)) m.ability = l.split(':')[1].trim();
        else if (/^(EVs|SPs|Stat Points):/i.test(l)) { m.evs = [0, 0, 0, 0, 0, 0]; for (const part of l.split(':')[1].split('/')) { const mm = part.trim().match(/^(\d+)\s+(.+)$/); if (mm) { const k = STATWORD[mm[2].toLowerCase().replace(/\s+/g, ' ')] || STATWORD[toId(mm[2])]; if (k) m.evs[STATKEY[k]] = +mm[1]; } } }
        else if (/Nature$/i.test(l)) m.nature = l.replace(/Nature/i, '').trim();
        else if (/^-/.test(l)) m.moves.push(l.replace(/^-\s*/, '').split('/')[0].trim());
      }
      return m;
    }).filter(Boolean).slice(0, 6);
  }

  function speedOf(base, evs, nature, fmt) {
    const champ = fmt && fmt.mod && fmt.mod.startsWith('champions');
    const nat = NAT[toId(nature)]; const mult = nat ? (nat[0] === 'spe' ? 1.1 : nat[1] === 'spe' ? 0.9 : 1) : 1;
    const inv = evs ? evs[5] : 0;
    const raw = champ ? base + 20 + Math.min(32, inv) : Math.floor((2 * base + 31 + Math.floor(Math.min(252, inv) / 4)) * 50 / 100) + 5;
    return Math.floor(raw * mult);
  }
  function defMult(chart, atkType, types, ability, item) {
    let m = VL.D.eff(chart, atkType, types);
    const a = ABIL_IMMUNE[toId(ability)]; if (a && a[atkType] !== undefined) m *= a[atkType];
    if (toId(item) === 'airballoon' && atkType === 'Ground') m = 0;
    return m;
  }
  const fmtMult = (m) => m === 0 ? '0' : m === 0.25 ? '¼' : m === 0.5 ? '½' : String(m);

  function run() {
    const out = $('tc-out');
    if (!VL.D.dex) { out.innerHTML = ''; return; }
    const sec = analyze($('tc-paste').value, $('tc-format').value);
    out.innerHTML = sec ? Object.values(sec).join('') : '<div class="empty">Pick a saved team or paste one above, then press Check team.</div>';
  }
  // Returns the analysis as named HTML sections, so the team builder can show them in tabs.
  function analyze(text, fmtId) {
    const D = VL.D; if (!D.dex) return null;
    const fmt = D.format(fmtId);
    const chart = D.chart(fmt);
    const metaE = VL.meta.forFormat(fmt.id);
    const raw = parse(text);
    if (!raw.length) return null;
    const sec = {};
    const filled = [];
    const team = raw.map(r => {
      const i = D.find(r.name); const p = i >= 0 ? D.mon(i, fmt) : null;
      const m = { ...r, p, known: !!p, name: p ? p.n : r.name };
      if (p) {
        const meta = VL.meta.get(metaE, p.n);
        if (!m.moves.length && meta) { m.moves = meta.moves.slice(0, 4).map(x => x[0]); filled.push(p.n); m.guessed = true; }
        if (!m.ability) m.ability = meta ? meta.abilities[0][0] : (p.a.length === 1 ? p.a[0] : '');
        if (!m.item && meta && m.guessed) m.item = meta.items[0][0] === 'No item' ? '' : meta.items[0][0];
        if (!m.evs && meta && m.guessed && meta.spreads[0]) { const [nat, nums] = meta.spreads[0][0].split(':'); if (nums) { m.nature = m.nature || nat; m.evs = nums.split('/').map(Number); } }
        m.speed = speedOf(p.s[5], m.evs, m.nature, fmt);
        m.moveRecs = m.moves.map(n => D.dex.moves[toId(n)]).filter(Boolean);
      }
      return m;
    });
    const known = team.filter(m => m.known);
    const unknown = team.filter(m => !m.known).map(m => m.name);
    let html = '';
    if (unknown.length) html += `<div class="banner">Couldn't find ${esc(unknown.join(', '))} in this game's data. Check the spelling.</div>`;
    if (filled.length) html += `<div class="banner" style="background:var(--accent-soft)">No moves were listed for ${esc(filled.join(', '))}, so the checker used ${filled.length === 1 ? 'its' : 'their'} most common set from the Meta page.</div>`;

    sec.notes = html; html = '';
    // overview
    html += `<div class="card"><div class="card-head"><h3>Your team</h3><span class="sub">${esc(fmt.name)} · Level 50</span></div><div class="scroll"><table class="list"><thead><tr><th>Pokémon</th><th>Types</th><th>Item</th><th>Ability</th><th>Speed</th><th>Moves</th></tr></thead><tbody>${known.map(m => `<tr><td><b>${esc(m.name)}</b>${m.guessed ? ' <span class="pill m">common set</span>' : ''}</td><td>${m.p.t.map(t => `<span class="ty ${esc(t)}">${esc(t)}</span>`).join(' ')}</td><td>${esc(m.item || '–')}</td><td>${esc(m.ability || '–')}</td><td class="num">${m.speed}${m.evs ? '' : ' <span class="mini">(no spread given)</span>'}</td><td class="sub">${esc(m.moves.join(', ') || '–')}</td></tr>`).join('')}</tbody></table></div></div>`;

    sec.overview = html; html = '';
    // defensive matrix
    const rows = chart.types.map(t => {
      const ms = known.map(m => defMult(chart, t, m.p.t, m.ability, m.item));
      const weak = ms.filter(x => x >= 2).length, resist = ms.filter(x => x < 1).length;
      return { t, ms, weak, resist, flag: weak >= 3 && resist <= 1 };
    });
    const shared = rows.filter(r => r.flag);
    html += `<div class="card"><div class="card-head"><h3>Shared weaknesses</h3><span class="sub">How much damage each type does to each of your Pokémon</span></div>
      ${shared.length ? `<p>${shared.map(r => `<span class="ty ${esc(r.t)}">${esc(r.t)}</span> hits ${r.weak} of your Pokémon super effectively and ${r.resist ? 'only ' + r.resist + ' resists it' : 'none resist it'}.`).join('<br>')}</p>` : '<p class="sub">No type hits 3 or more of your Pokémon super effectively while going mostly unresisted. Good defensive balance.</p>'}
      <div class="scroll"><table class="matrix"><thead><tr><th></th>${known.map(m => `<th>${esc(m.name)}</th>`).join('')}<th>Weak</th><th>Resist</th></tr></thead><tbody>${rows.map(r => `<tr class="${r.flag ? 'flag' : ''}"><th style="text-align:left"><span class="ty ${esc(r.t)}">${esc(r.t)}</span></th>${r.ms.map(x => `<td class="${x >= 4 ? 'x4' : x >= 2 ? 'x2' : x === 0 ? 'x0' : x <= 0.25 ? 'x025' : x < 1 ? 'x05' : ''}">${x === 1 ? '' : fmtMult(x)}</td>`).join('')}<td>${r.weak || ''}</td><td>${r.resist || ''}</td></tr>`).join('')}</tbody></table></div>
      <p class="sub">Accounts for abilities like Levitate and Flash Fire and for Air Balloon.</p></div>`;

    sec.weak = html; html = '';
    // coverage
    const atkTypes = new Set(); for (const m of known) for (const mv of m.moveRecs) if (mv.c !== 'S' && mv.bp > 0) atkTypes.add(mv.t);
    if (!atkTypes.size) for (const m of known) m.p.t.forEach(t => atkTypes.add(t));
    const noSE = chart.types.filter(d => ![...atkTypes].some(a => VL.D.eff(chart, a, [d]) >= 2));
    html += `<div class="card"><div class="card-head"><h3>Coverage</h3><span class="sub">Attacking types on your team: ${[...atkTypes].map(t => `<span class="ty ${esc(t)}">${esc(t)}</span>`).join(' ')}</span></div>
      ${noSE.length ? `<p>Nothing on your team hits these types super effectively: ${noSE.map(t => `<span class="ty ${esc(t)}">${esc(t)}</span>`).join(' ')}</p><p class="sub">That's fine if you have strong neutral damage into them, but check how you beat the popular Pokémon of these types.</p>` : '<p class="sub">Your attacks hit every type super effectively at least once.</p>'}</div>`;

    sec.coverage = html; html = '';
    // checklist
    const has = (ids) => known.filter(m => m.moveRecs.some(mv => ids.includes(toId(mv.n))));
    const hasAb = (ids) => known.filter(m => ids.includes(toId(m.ability)));
    const names = (arr) => arr.map(m => m.name).join(', ');
    const spreadUsers = known.filter(m => m.moveRecs.some(mv => mv.sp && mv.bp > 0));
    const prio = known.filter(m => m.moveRecs.some(mv => mv.p > 0 && mv.bp > 0));
    const protects = has(PROTECTS);
    const scarf = known.filter(m => toId(m.item) === 'choicescarf');
    const items = known.map(m => toId(m.item)).filter(Boolean); const dupItems = items.filter((x, i) => items.indexOf(x) !== i);
    const dupCheck = [dupItems.length ? 'no' : 'ok', 'Item Clause', dupItems.length ? `Two Pokémon hold the same item (${[...new Set(dupItems)].map(id => (VL.D.dex.items[id] && VL.D.dex.items[id].n) || known.find(m => toId(m.item) === id).item).join(', ')}). Official formats don't allow duplicate items.` : 'No duplicate items.'];
    const checks = !fmt.doubles ? singlesChecks() : [
      [has(SPEED_CONTROL).length ? 'ok' : scarf.length ? 'meh' : 'no', 'Speed control', has(SPEED_CONTROL).length ? `${names(has(SPEED_CONTROL))}.` : scarf.length ? `Only Choice Scarf (${names(scarf)}).` : 'None. Most strong teams can change who moves first with Tailwind, Trick Room, Icy Wind, Electroweb or Thunder Wave.'],
      [has(['fakeout']).length ? 'ok' : 'meh', 'Fake Out', has(['fakeout']).length ? `${names(has(['fakeout']))}.` : 'None. Fake Out buys a free turn for setting up or attacking safely. Not required, but common.'],
      [hasAb(['intimidate']).length ? 'ok' : 'meh', 'Intimidate', hasAb(['intimidate']).length ? `${names(hasAb(['intimidate']))}.` : 'None. Intimidate softens physical attackers every time it switches in.'],
      [has(REDIRECT).length ? 'ok' : 'meh', 'Redirection', has(REDIRECT).length ? `${names(has(REDIRECT))}.` : 'None (Follow Me, Rage Powder). Optional, but it protects a partner while it sets up.'],
      [protects.length >= 3 ? 'ok' : protects.length ? 'meh' : 'no', 'Protect', `${protects.length} of ${known.length} have Protect or a similar move${protects.length < 3 ? '. Most doubles teams run it on 3 to 5 Pokémon, since it is the main way to scout and stall turns.' : '.'}`],
      [spreadUsers.length ? 'ok' : 'meh', 'Spread damage', spreadUsers.length ? `${names(spreadUsers)}.` : 'No moves that hit both opponents. Spread moves pressure both slots at once.'],
      [prio.length ? 'ok' : 'meh', 'Priority attacks', prio.length ? `${names(prio)}.` : 'None. Priority picks off weakened Pokémon and ignores speed.'],
      [has(['wideguard', 'quickguard']).length ? 'ok' : 'meh', 'Wide Guard or Quick Guard', has(['wideguard', 'quickguard']).length ? `${names(has(['wideguard', 'quickguard']))}.` : 'None. Only matters if you struggle with spread moves or priority.'],
      [(hasAb(SETTERS_AB).length || has(SETTERS_MV).length) ? 'ok' : 'meh', 'Weather or terrain', (hasAb(SETTERS_AB).length || has(SETTERS_MV).length) ? `${names([...new Set([...hasAb(SETTERS_AB), ...has(SETTERS_MV)])])}.` : 'None set by your team. That\'s fine unless your plan depends on it.'],
      [has(DISRUPT).length ? 'ok' : 'meh', 'Disruption', has(DISRUPT).length ? `${names(has(DISRUPT))}.` : 'Nothing like Taunt, Encore, Will-O-Wisp, Snarl or Spore to slow down your opponent.'],
      dupCheck,
    ];
    function singlesChecks() {
      const hz = has(HAZARDS), rm = has(REMOVAL), pv = has(PIVOTS), su = has(SETUP), rc = has(RECOVERY);
      const anti = [...new Set([...has(ANTISETUP), ...hasAb(['unaware'])])];
      const fast = known.filter(m => m.p && m.p.s && m.p.s[5] >= 100);
      return [
        [su.length ? 'ok' : 'meh', 'Setup sweeper', su.length ? `${names(su)}.` : 'Nothing with Swords Dance, Dragon Dance, Nasty Plot or similar. Fine for a pure attacking team, but setup is the most common way to win 3-on-3.'],
        [anti.length ? 'ok' : 'no', 'Answer to setup', anti.length ? `${names(anti)}.` : 'Nothing like Haze, Roar, Encore, Dragon Tail or Unaware. If the opponent sets up, you\'re relying on outspeeding or priority.'],
        [prio.length ? 'ok' : 'meh', 'Priority attacks', prio.length ? `${names(prio)}.` : 'None. Priority picks off weakened Pokémon and boosted sweepers.'],
        [(fast.length || scarf.length) ? 'ok' : 'meh', 'Speed', `${fast.length ? `Base 100 Speed or faster: ${names(fast)}.` : 'Nothing with base 100 Speed or more.'}${scarf.length ? ` Choice Scarf: ${names(scarf)}.` : ''}${has(SPEED_CONTROL).length ? ` Speed control: ${names(has(SPEED_CONTROL))}.` : ''}`],
        [pv.length ? 'ok' : 'meh', 'Pivoting', pv.length ? `${names(pv)}.` : 'No U-turn, Volt Switch, Flip Turn or Parting Shot. Pivots let you switch safely after seeing the opponent\'s move.'],
        [hz.length ? 'ok' : 'meh', 'Entry hazards', hz.length ? `${names(hz)}.` : 'No Stealth Rock or Spikes. Less important when each side only brings 3, but chip adds up.'],
        [rm.length ? 'ok' : 'meh', 'Hazard removal', rm.length ? `${names(rm)}.` : 'No Rapid Spin, Defog or Mortal Spin. Only matters if hazards hurt your team a lot.'],
        [rc.length ? 'ok' : 'meh', 'Recovery', rc.length ? `${names(rc)}.` : 'No healing moves. Fine for offense; bulkier teams usually want some.'],
        [has(DISRUPT).length ? 'ok' : 'meh', 'Disruption', has(DISRUPT).length ? `${names(has(DISRUPT))}.` : 'Nothing like Taunt, Encore, Will-O-Wisp or Spore to slow down your opponent.'],
        dupCheck,
      ];
    }
    html += `<div class="card"><div class="card-head"><h3>Checklist</h3><span class="sub">Common tools in ${fmt.doubles ? 'doubles' : 'singles'}. Missing one isn't automatically bad.</span></div>${checks.map(([s, t, d]) => `<div class="check"><span class="mark ${s}">${s === 'ok' ? '✓' : s === 'no' ? '!' : '–'}</span><div><b>${t}</b><div class="sub">${esc(d)}</div></div></div>`).join('')}</div>`;

    sec.checklist = html; html = '';
    // threats
    if (metaE) {
      const mine = new Set(known.map(m => m.name));
      const threats = metaE.mons.slice(0, 40).filter(x => !mine.has(x.n)).map(x => {
        const i = D.find(x.n); if (i < 0) return null; const p = D.mon(i, fmt);
        const atks = x.moves.map(mv => D.dex.moves[toId(mv[0])]).filter(mv => mv && mv.c !== 'S' && mv.bp >= 50).slice(0, 4);
        const sp = x.spreads[0] ? x.spreads[0][0].split(':') : null;
        const spe = speedOf(p.s[5], sp && sp[1] ? sp[1].split('/').map(Number) : [0, 0, 0, 0, 0, 32], sp ? sp[0] : 'Jolly', fmt);
        const hits = known.map(m => { let best = null; for (const mv of atks) { const e = defMult(chart, mv.t, m.p.t, m.ability, m.item); if (!best || e > best.e) best = { e, mv }; } return { m, best }; }).filter(h => h.best && h.best.e >= 2);
        const faster = known.filter(m => spe > m.speed);
        const answers = known.filter(m => m.moveRecs.some(mv => mv.c !== 'S' && mv.bp > 0 && D.eff(chart, mv.t, p.t) >= 2));
        const score = (hits.length * 2 + faster.length * 0.5 + (answers.length === 0 ? 3 : answers.length === 1 ? 1 : 0)) * (0.6 + x.u / 100);
        return { x, p, spe, hits, faster, answers, score };
      }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 8);
      html += `<div class="card"><div class="card-head"><h3>Biggest threats</h3><span class="sub">From the 40 most-used Pokémon, using their most common moves and spread</span></div>${threats.map(t => `<div class="threat"><div class="h"><div class="kv"><b>${esc(t.x.n)}</b>${t.p.t.map(y => `<span class="ty ${esc(y)}">${esc(y)}</span>`).join(' ')}<span class="pill m">${t.x.u.toFixed(1)}% of teams</span></div><button class="linkbtn" data-tcnb="${esc(t.x.n)}">+ Notebook</button></div>
        <ul>${t.hits.length ? `<li>Hits ${t.hits.length} of your Pokémon super effectively: ${t.hits.map(h => `${esc(h.m.name)} (${esc(h.best.mv.n)}, ${fmtMult(h.best.e)}×)`).join(', ')}.</li>` : ''}
        <li>Usually ${t.spe} Speed, faster than ${t.faster.length} of your ${known.length}${t.faster.length ? ` (${esc(t.faster.map(m => m.name).join(', '))})` : ''}.</li>
        <li>${t.answers.length ? `Hit super effectively by ${esc(t.answers.map(m => m.name).join(', '))}.` : 'Nothing on your team hits it super effectively.'}</li></ul></div>`).join('')}</div>`;

      sec.threats = html; html = '';
      // speed tiers
      const tiers = known.map(m => ({ n: m.name, s: m.speed, mine: true })).concat(metaE.mons.slice(0, 25).filter(x => !mine.has(x.n)).map(x => { const i = D.find(x.n); if (i < 0) return null; const p = D.mon(i, fmt); const sp = x.spreads[0] ? x.spreads[0][0].split(':') : null; return { n: x.n, s: speedOf(p.s[5], sp && sp[1] ? sp[1].split('/').map(Number) : null, sp ? sp[0] : '', fmt) }; }).filter(Boolean)).sort((a, b) => b.s - a.s);
      html += `<div class="card"><div class="card-head"><h3>Speed tiers</h3><span class="sub">Your team against the 25 most-used Pokémon, each with its most common spread</span></div><div class="speedline">${tiers.map(t => `<div class="s ${t.mine ? 'mine' : ''}"><span class="num">${t.s}</span><span>${esc(t.n)}</span><span class="mini">${t.mine ? 'yours' : ''}</span></div>`).join('')}</div><p class="sub">Under Trick Room the order flips. Under Tailwind your side's numbers double.</p></div>`;
    } else {
      html += `<div class="card"><p class="sub">Threats and meta speed tiers appear once usage stats are available for ${esc(fmt.name)} on the Meta page.</p></div>`;
    }
    sec.speed = html;
    return sec;
  }

  function render() {
    if (!VL.D.dex) return;
    const fs = $('tc-format'); const cur = fs.value || (VL.curFormatId ? VL.curFormatId() : '');
    fs.innerHTML = VL.D.formats().map(f => `<option value="${esc(f.id)}">${esc(f.name)} · ${esc(f.game)}</option>`).join('');
    fs.value = VL.D.format(cur).id;
    const ts = $('tc-team'); const ct = ts.value;
    ts.innerHTML = '<option value="">(paste below)</option>' + VL.store.list('teams').map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
    ts.value = ct;
  }
  $('tc-team').addEventListener('change', () => { const t = VL.store.get('teams', $('tc-team').value); if (t) { $('tc-paste').value = t.paste || ''; if (t.fmt && VL.D.dex && VL.D.dex.formats.some(f => f.id === t.fmt)) $('tc-format').value = t.fmt; run(); } });
  $('tc-run').onclick = run;
  $('tc-out').addEventListener('click', e => { const b = e.target.closest('[data-tcnb]'); if (b) { location.hash = 'notebook'; setTimeout(() => { $('nb-name').value = b.dataset.tcnb; $('nb-plan').focus(); }, 50); } });
  VL.teamcheck = { render, run, parse, analyze, speedOf };
})();
