/* Team sheet practice. At official events both players see each other's full
 * team sheet (Pokémon, items, abilities, moves) before the match. Here you
 * read an opponent's sheet against one of your teams, get matchup notes,
 * choose what to bring and lead, write a plan, and review it later. */
(function () {
  'use strict';
  const VL = (window.VL = window.VL || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toId = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const store = () => VL.store;
  const D = () => VL.D;
  const IMMUNE = { levitate: 'Ground', eartheater: 'Ground', flashfire: 'Fire', wellbakedbody: 'Fire', waterabsorb: 'Water', stormdrain: 'Water', dryskin: 'Water', voltabsorb: 'Electric', lightningrod: 'Electric', motordrive: 'Electric', sapsipper: 'Grass' };

  let P = null; // the open practice
  let pending = null; // an opponent handed over from Top teams
  const singles = () => VL.isSingles && VL.isSingles();
  const NB = () => (singles() ? 3 : 4), NL = () => (singles() ? 1 : 2);

  // ---------- team shapes ----------
  const fromSets = (sets) => sets.filter(s => s && s.species).map(s => ({ n: s.species, i: s.item || '', a: s.ability || '', na: s.nature || '', m: (s.moves || []).filter(Boolean), t: s.tera || '', evs: s.evs }));
  const fromPaste = (text) => fromSets(VL.builder.parsePaste(text));
  function info(m, fmt) {
    const i = D().find(m.n); let rec = i >= 0 ? D().mon(i, fmt) : null;
    const mk = rec ? D().megaOf(rec, m.i) : null; const mega = mk !== null ? D().mon(mk, fmt) : null;
    return { rec, mega, show: mega || rec, name: rec ? rec.n : m.n };
  }
  const moveRecs = (m, fmt) => (m.m || []).map(x => D().move(x, fmt)).filter(Boolean);
  function speedRange(m, fmt, known) {
    const x = info(m, fmt); if (!x.show) return null; const base = x.show.s[5]; const sp = VL.teamcheck.speedOf; const max = fmt.mod && fmt.mod.startsWith('champions') ? 32 : 252;
    const scarf = toId(m.i) === 'choicescarf' ? 1.5 : 1; const f = (v) => Math.floor(v * scarf);
    if (known && m.evs) return { lo: f(sp(base, m.evs, m.na, fmt)), hi: f(sp(base, m.evs, m.na, fmt)), exact: true, scarf: scarf > 1 };
    if (m.na) return { lo: f(sp(base, [0, 0, 0, 0, 0, 0], m.na, fmt)), hi: f(sp(base, [0, 0, 0, 0, 0, max], m.na, fmt)), scarf: scarf > 1 };
    return { lo: f(sp(base, [0, 0, 0, 0, 0, 0], 'Hardy', fmt)), hi: f(sp(base, [0, 0, 0, 0, 0, max], 'Timid', fmt)), scarf: scarf > 1 };
  }
  function eff(type, target, fmt) { // target: {m, x}
    const types = target.x.show ? target.x.show.t : []; if (!types.length) return 1;
    const ab = toId(target.x.mega ? target.x.mega.a[0] : target.m.a); if (IMMUNE[ab] === type) return 0;
    if (type === 'Ground' && toId(target.m.i) === 'airballoon') return 0;
    return D().eff(D().chart(fmt), type, types);
  }
  // best damaging move of attacker into target: { e, mv }
  function bestHit(att, target, fmt) { let best = null; for (const mv of moveRecs(att.m, fmt)) { if (mv.c === 'S' || !mv.bp) continue; const e = eff(mv.t, target, fmt); if (!best || e > best.e || (e === best.e && mv.bp > best.mv.bp)) best = { e, mv }; } return best; }

  // ---------- drawing ----------
  function sheetHtml(mons, fmt, mine) {
    return `<div class="sh-sheet">${mons.map(m => { const x = info(m, fmt); return `<div class="sh-mon">${VL.sprite(x.show || m.n, 'md', false)}<div><div class="kv"><b>${esc(x.name)}</b>${x.show ? x.show.t.map(VL.typeBadge).join('') : ''}${x.mega ? '<span class="pill n">Mega</span>' : ''}</div>
      <div class="sub">${m.i ? VL.itemIcon(m.i) + esc(m.i) : 'No item'} · ${esc(m.a || 'ability unknown')}${m.na ? ' · ' + esc(m.na) : ''}${m.t ? ' · Tera ' + esc(m.t) : ''}</div>
      <div class="tt-mvs">${(m.m || []).map(mv => { const r = D().move(mv, fmt); return `<span class="tt-mv">${r ? `<i class="ty ${esc(r.t)}"></i>` : ''}${esc(mv)}</span>`; }).join('') || '<span class="sub">Moves not listed</span>'}</div></div></div>`; }).join('')}</div>`;
  }
  function notesHtml(mine, theirs, fmt) {
    const M = mine.map(m => ({ m, x: info(m, fmt) })), T = theirs.map(m => ({ m, x: info(m, fmt) }));
    // tools to watch
    const has = (ids) => T.filter(t => (t.m.m || []).some(mv => ids.includes(toId(mv)))).map(t => t.x.name);
    const hasAb = (ids) => T.filter(t => ids.includes(toId(t.m.a)) || (t.x.mega && ids.includes(toId(t.x.mega.a[0])))).map(t => t.x.name + (t.x.mega && ids.includes(toId(t.x.mega.a[0])) ? ' (after Mega Evolving)' : ''));
    const hasItem = (ids) => T.filter(t => ids.includes(toId(t.m.i))).map(t => t.x.name);
    const prio = T.map(t => ({ n: t.x.name, mv: moveRecs(t.m, fmt).filter(mv => mv.p > 0 && mv.bp > 0 && toId(mv.n) !== 'fakeout').map(mv => mv.n) })).filter(x => x.mv.length).map(x => `${x.n} (${x.mv.join(', ')})`);
    const megas = T.filter(t => t.x.mega).map(t => t.x.mega.n);
    const tools = [
      ['Mega Evolution', megas, megas.length > 1 ? 'Only one can Mega Evolve per battle, so work out which one they bring against you.' : 'Their Mega. Expect it in most games.'],
      ['Fake Out', has(['fakeout']), 'Costs you a turn on the first turn it\'s out. Protect, or lead something that doesn\'t mind.'],
      ['Trick Room', has(['trickroom']), 'Slower Pokémon move first for 5 turns. Plan to stop the setter or stall it out.'],
      ['Tailwind', has(['tailwind']), 'Doubles their Speed for 4 turns. Check the speed order below with their numbers doubled.'],
      ['Intimidate', hasAb(['intimidate']), 'Lowers your physical attackers\' Attack on every switch-in.'],
      ['Redirection', has(['followme', 'ragepowder']), 'Pulls your single-target moves away from its partner. Spread moves get around it.'],
      ['Weather', hasAb(['drought', 'drizzle', 'sandstream', 'snowwarning', 'megasol']).concat(has(['raindance', 'sunnyday'])), 'Changes damage and enables their weather abilities. Your own weather overrides it if you set it later.'],
      ['Terrain', hasAb(['psychicsurge', 'grassysurge', 'electricsurge', 'mistysurge']), 'Psychic Terrain blocks priority; Grassy weakens Earthquake; Misty blocks status.'],
      ['Priority attacks', prio, 'Can pick off your weakened Pokémon regardless of Speed.'],
      ['Choice Scarf', hasItem(['choicescarf']), 'Faster than it looks (1.5× Speed), but locked into one move.'],
      ['Focus Sash', hasItem(['focussash']), 'Survives one hit from full HP. Break it with chip damage, a multi-hit move or Fake Out.'],
      ['Sleep', has(['spore', 'sleeppowder', 'yawn', 'hypnosis', 'darkvoid']), 'Have a plan: Safety Goggles, Grass types, terrain, or knock it out first.'],
      ['Disruption', has(['encore', 'taunt', 'disable', 'imprison', 'partingshot', 'haze', 'snarl', 'willowisp', 'thunderwave', 'icywind', 'electroweb']), 'Encore punishes Protect and setup. Speed drops and status change the turn order.'],
      ['Screens', has(['reflect', 'lightscreen', 'auroraveil']), 'Your damage drops for 5 turns. Brick Break and similar moves remove them.'],
      ['Wide Guard or Quick Guard', has(['wideguard', 'quickguard']), 'Blocks your spread moves or priority for a turn.'],
      ['Setup', has(['swordsdance', 'dragondance', 'nastyplot', 'calmmind', 'bulkup', 'quiverdance', 'shellsmash', 'bellydrum', 'coil', 'irondefense']), 'Gets dangerous if it gets a free turn. Keep pressure on it.'],
      ['Perish Song', has(['perishsong']), 'Everything on the field faints in 3 turns unless it switches.'],
    ].filter(x => x[1].length);
    // speed order
    const rows = [...M.map(t => ({ ...t, mine: true, r: speedRange(t.m, fmt, true) })), ...T.map(t => ({ ...t, mine: false, r: speedRange(t.m, fmt, false) }))].filter(x => x.r).sort((a, b) => b.r.hi - a.r.hi || b.r.lo - a.r.lo);
    const top = Math.max(1, ...rows.map(x => x.r.hi));
    // matchups
    const match = T.map(t => {
      const answers = M.map(me => ({ n: me.x.name, h: bestHit(me, t, fmt) })).filter(a => a.h && a.h.e >= 2);
      const threatens = M.map(me => ({ n: me.x.name, h: bestHit(t, me, fmt) })).filter(a => a.h && a.h.e >= 2);
      return { t, answers, threatens };
    });
    return `<div class="card"><div class="card-head"><h3>Matchup notes</h3><span class="sub">Worked out from both sheets</span></div>
      ${tools.length ? `<div class="section-label">Tools to watch for</div><div class="sh-tools">${tools.map(([k, who, why]) => `<div><b>${esc(k)}</b><span>${esc([...new Set(who)].join(', '))}</span><span class="sub">${esc(why)}</span></div>`).join('')}</div>` : ''}
      <div class="section-label">Who beats whom on type</div>
      <div class="scroll"><table class="list sh-match"><thead><tr><th>Their Pokémon</th><th>You hit it super effectively with</th><th>It hits super effectively</th></tr></thead><tbody>${match.map(r => `<tr><td><span class="kv">${VL.sprite(r.t.x.show || r.t.m.n, 'xs', false)}<b>${esc(r.t.x.name)}</b></span></td>
        <td>${r.answers.map(a => `${esc(a.n)} <span class="mini">${esc(a.h.mv.n)}${a.h.e >= 4 ? ' 4×' : ''}</span>`).join(', ') || '<span class="bad-t">Nothing</span>'}</td>
        <td>${r.threatens.map(a => `${esc(a.n)} <span class="mini">${esc(a.h.mv.n)}${a.h.e >= 4 ? ' 4×' : ''}</span>`).join(', ') || '<span class="good-t">Nothing</span>'}</td></tr>`).join('')}</tbody></table></div>
      <p class="sub">Uses the attacking moves on each sheet, types after Mega Evolving, and immunities from abilities like Levitate. It doesn't know about damage amounts; use the damage calculator for close calls.</p>
      <div class="section-label">Speed order</div>
      <div class="sh-speed">${rows.map(x => `<div class="${x.mine ? 'mine' : ''}">${VL.sprite(x.x.show || x.m.n, 'xs', false)}<span>${esc(x.x.name)}${x.r.scarf ? ' <span class="mini">Scarf</span>' : ''}</span><span class="bar"><i style="left:${Math.round(100 * x.r.lo / top)}%;width:${Math.max(1.5, Math.round(100 * (x.r.hi - x.r.lo) / top))}%"></i></span><span class="num">${x.r.lo === x.r.hi ? x.r.lo : `${x.r.lo}–${x.r.hi}`}</span></div>`).join('')}</div>
      <p class="sub">Your Speed is exact. Team sheets don't show Stat Points, so theirs is a range from no investment to the maximum${T.some(t => t.m.na) ? ' with the nature on the sheet' : ''}. Choice Scarf is included.</p></div>`;
  }
  function picker(label, mons, st, key, fmt) {
    const b = st.filter(x => x > 0).length, l = st.filter(x => x === 2).length;
    return `<div><div class="section-label">${esc(label)} · ${b}/${NB()} brought · ${l}/${NL()} leading</div><div class="sh-pick">${mons.map((m, i) => { const x = info(m, fmt); return `<button type="button" data-shp="${key}" data-i="${i}" class="${st[i] === 2 ? 'lead' : st[i] === 1 ? 'back' : ''}" aria-pressed="${st[i] > 0}">${VL.sprite(x.show || m.n, 'sm', false)}<span>${esc(x.name)}</span><span class="mini">${st[i] === 2 ? 'lead' : st[i] === 1 ? 'back' : 'not brought'}</span></button>`; }).join('')}</div></div>`;
  }
  function render() {
    const root = $('sh-root'); if (!root) return;
    if (!D().dex) { root.innerHTML = '<p class="sub">Loading the Pokémon data…</p>'; return; }
    if (pending) { const p = pending; pending = null; begin(p); }
    if (!P) return renderHome();
    const fmt = D().format(P.fmt);
    root.innerHTML = `
      <div class="card"><div class="card-head"><div><h3>${esc(P.teamName)} <span class="sub">against</span> ${esc(P.label)}</h3><div class="sub">${esc(fmt.name)} · bring ${NB()}, lead ${NL()}</div></div>
        <div class="row" style="gap:6px"><button class="btn ghost small" data-sh="random">Another random opponent</button><button class="btn ghost small" data-sh="close">Close</button></div></div></div>
      <div class="sh-cols"><div class="card"><div class="card-head"><h3>Their team sheet</h3></div>${sheetHtml(P.opp, fmt, false)}</div>
        <div class="card"><div class="card-head"><h3>Your team sheet</h3></div>${sheetHtml(P.mine, fmt, true)}</div></div>
      ${notesHtml(P.mine, P.opp, fmt)}
      <div class="card"><div class="card-head"><h3>Your plan</h3><span class="sub">Tap a Pokémon once to bring it, again to lead with it, a third time to leave it out</span></div>
        <div id="sh-picks">${picker('What you bring', P.mine, P.sm, 'm', fmt)}${picker('What you expect them to bring', P.opp, P.so, 'o', fmt)}</div>
        <label for="sh-plan">Plan: your first turns, what you must stop, and how you win<textarea id="sh-plan" placeholder="For example: Lead A + B. Fake Out their Trick Room setter turn 1 and double the partner. Keep C healthy for the endgame.">${esc(P.plan)}</textarea></label>
        <details ${P.actual || P.result ? 'open' : ''}><summary class="sub" style="cursor:pointer">After you've played it: what actually happened?</summary>
          <div class="row" style="margin-top:8px"><label for="sh-result">Result<select id="sh-result"><option value="">Not played</option><option value="W" ${P.result === 'W' ? 'selected' : ''}>Won</option><option value="L" ${P.result === 'L' ? 'selected' : ''}>Lost</option></select></label></div>
          <label for="sh-actual">What they really brought and led, and whether the plan held up<textarea id="sh-actual">${esc(P.actual)}</textarea></label></details>
        <div class="row" style="justify-content:flex-end;gap:6px"><span class="sub" id="sh-msg" role="status"></span><button class="btn ghost small" data-sh="notebook">Save to Notebook too</button><button class="btn" data-sh="save">Save plan</button></div></div>`;
  }
  function renderHome() {
    const root = $('sh-root');
    const teams = store().list('teams').filter(t => t.paste).sort((a, b) => (b.u || b.ts || 0) - (a.u || a.ts || 0));
    const saved = store().list('sheets').sort((a, b) => (b.u || b.ts || 0) - (a.u || a.ts || 0));
    root.innerHTML = `
      <div class="card"><div class="card-head"><h3>Start a practice</h3></div>
        ${teams.length ? `<div class="row"><label for="sh-team">Your team<select id="sh-team">${teams.map(t => `<option value="${esc(t.id)}">${esc(t.name || 'Untitled team')}</option>`).join('')}</select></label></div>
        <div class="row" style="gap:8px"><button class="btn" data-sh="random">Random top-cut opponent</button><a class="btn ghost" href="#topteams">Pick one from Top teams</a></div>
        <details><summary class="sub" style="cursor:pointer">Or paste an opponent's team</summary><textarea id="sh-paste" style="min-height:120px;font-family:var(--mono);font-size:12.5px" placeholder="Paste a team in Showdown format"></textarea><div class="row" style="justify-content:flex-end"><button class="btn ghost small" data-sh="paste">Use this team</button></div></details>
        <p class="sub" id="sh-msg" role="status"></p>`
        : '<p class="sub">You need a saved team first. Build one in the Team builder, or copy one from Top teams.</p><div class="row"><a class="btn small" href="#teams">Open the Team builder</a><a class="btn ghost small" href="#topteams">Browse Top teams</a></div>'}</div>
      ${saved.length ? `<div class="card"><div class="card-head"><h3>Your plans</h3><span class="sub">${saved.length} saved</span></div>${saved.map(r => `<div class="threat"><div class="h"><div><b>${esc(r.teamName || 'Your team')}</b> <span class="sub">against</span> <b>${esc(r.label || 'a team')}</b> ${r.result ? `<span class="pill ${r.result === 'W' ? 'w' : 'l'}">${r.result === 'W' ? 'Won' : 'Lost'}</span>` : ''} <span class="mini">${r.ts ? new Date(r.ts).toLocaleDateString() : ''}</span><div class="kv" style="margin-top:4px">${VL.spriteRow((r.opp || []).map(m => m.n), 'xs')}</div></div>
        <div class="kv"><button class="btn small" data-shopen="${esc(r.id)}">Open</button><button class="linkbtn" data-shdel="${esc(r.id)}">Delete</button></div></div>
        ${r.lead && r.lead.length ? `<div class="sub">Lead ${esc(r.lead.join(' + '))}${r.back && r.back.length ? ', back ' + esc(r.back.join(', ')) : ''}</div>` : ''}${r.plan ? `<div class="sub" style="white-space:pre-wrap">${esc(r.plan)}</div>` : ''}</div>`).join('')}</div>` : ''}`;
  }

  // ---------- actions ----------
  function begin({ mons, label, fmt, teamId, saved }) {
    const teams = store().list('teams').filter(t => t.paste).sort((a, b) => (b.u || b.ts || 0) - (a.u || a.ts || 0));
    const sel = $('sh-team'); const t = store().get('teams', teamId || (P && P.team) || (sel && sel.value) || '') || teams[0];
    if (!t) { P = null; return false; }
    const mine = fromPaste(t.paste); if (!mine.length) return false;
    P = { id: saved ? saved.id : null, team: t.id, teamName: t.name || 'Your team', mine, opp: mons, label: label || 'an opponent', fmt: fmt || t.fmt || VL.curFormatId(), plan: saved ? saved.plan || '' : '', actual: saved ? saved.actual || '' : '', result: saved ? saved.result || '' : '',
      sm: mine.map(m => saved ? ((saved.lead || []).includes(m.n) ? 2 : (saved.back || []).includes(m.n) ? 1 : 0) : 0), so: mons.map(m => saved ? ((saved.olead || []).includes(m.n) ? 2 : (saved.oback || []).includes(m.n) ? 1 : 0) : 0) };
    return true;
  }
  function grab() { if (!P) return; const p = $('sh-plan'), a = $('sh-actual'), r = $('sh-result'); if (p) P.plan = p.value.trim(); if (a) P.actual = a.value.trim(); if (r) P.result = r.value; }
  function save() {
    grab(); if (!P.id) P.id = VL.newId('s');
    const pick = (mons, st, v) => mons.filter((m, i) => st[i] === v).map(m => m.n);
    const prev = store().get('sheets', P.id);
    store().put('sheets', P.id, { ts: prev?.ts || Date.now(), label: P.label, fmt: P.fmt, team: P.team, teamName: P.teamName, opp: P.opp.map(m => ({ n: m.n, i: m.i, a: m.a, na: m.na, m: m.m, t: m.t })), lead: pick(P.mine, P.sm, 2), back: pick(P.mine, P.sm, 1), olead: pick(P.opp, P.so, 2), oback: pick(P.opp, P.so, 1), plan: P.plan, actual: P.actual, result: P.result });
  }
  async function randomOpp() {
    await VL.topteams.load(); const t = VL.topteams.random();
    if (!t) { const m = $('sh-msg'); if (m) m.textContent = 'No tournament teams are loaded yet. Paste a team instead.'; return; }
    if (P) grab();
    if (begin({ mons: t.mons, label: `${t.who || 'Unknown player'}, ${VL.topteams.place(t.p)} at ${t.ev.name}`, fmt: t.ev.fmt })) render();
  }
  document.addEventListener('click', (e) => {
    const root = $('sh-root'); if (!root || !root.contains(e.target)) return;
    const pk = e.target.closest('[data-shp]');
    if (pk && P) {
      grab(); const st = pk.dataset.shp === 'm' ? P.sm : P.so; const i = +pk.dataset.i;
      st[i] = (st[i] + 1) % 3;
      if (st[i] === 1 && st.filter(x => x > 0).length > NB()) st[i] = 0;
      if (st[i] === 2 && st.filter(x => x === 2).length > NL()) st[i] = 0;
      const fmt = D().format(P.fmt); $('sh-picks').innerHTML = picker('What you bring', P.mine, P.sm, 'm', fmt) + picker('What you expect them to bring', P.opp, P.so, 'o', fmt); return;
    }
    const op = e.target.closest('[data-shopen]'); if (op) { const r = store().get('sheets', op.dataset.shopen); if (r && begin({ mons: r.opp || [], label: r.label, fmt: r.fmt, teamId: r.team, saved: r })) render(); else VL.toast('The team for that plan was deleted.'); return; }
    const dl = e.target.closest('[data-shdel]'); if (dl) { VL.armDelete(dl, () => { store().del('sheets', dl.dataset.shdel); render(); }); return; }
    const b = e.target.closest('[data-sh]'); if (!b) return; const k = b.dataset.sh;
    if (k === 'random') randomOpp();
    if (k === 'paste') { const mons = fromPaste($('sh-paste').value); if (mons.length < 2) { $('sh-msg').textContent = 'Paste at least two Pokémon in Showdown format.'; return; } if (begin({ mons, label: 'a pasted team' })) render(); }
    if (k === 'close') { if (P && (P.plan || P.sm.some(Boolean))) save(); P = null; render(); }
    if (k === 'save') { save(); const m = $('sh-msg'); if (m) m.textContent = 'Saved.'; VL.toast('Plan saved'); }
    if (k === 'notebook') {
      save(); const pick = (v) => P.mine.filter((m, i) => P.sm[i] === v).map(m => m.n);
      store().put('matchups', VL.newId('m'), { ts: Date.now(), fmt: P.fmt, name: P.label.slice(0, 80), team: P.team, plan: P.plan, lead: pick(2).join(' + '), bring: [...pick(2), ...pick(1)].join(', '), calcs: '' });
      VL.toast('Added to your Notebook');
    }
  });

  VL.sheets = {
    render,
    start(opp) { pending = opp; if (location.hash === '#sheets') render(); else location.hash = 'sheets'; },
  };
})();
