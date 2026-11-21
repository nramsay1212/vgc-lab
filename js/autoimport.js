/* Automatic import from the VGC Lab Showdown extension.
 * The extension opens this page with the game in the address:
 *   #import=sd1.<battle log, compressed>   (what the extension sends: the log read from the battle page)
 *   #import=https://replay.pokemonshowdown.com/<replay>   (any replay link works too)
 * The game is saved as a climb game, tagged with the saved team that matches your six,
 * and the address goes back to the page you were on. The battle log is kept with the
 * game (compressed) so Review can step through it later. */
(function () {
  'use strict';
  const VL = (window.VL = window.VL || {});
  const toId = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const SD = 'vgclab-sdname';

  // ---------- compression (the browser's own deflate, so nothing extra to load) ----------
  const fromB64 = (s) => { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  const toB64 = (u) => { let bin = ''; for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  async function inflate(b64) { const st = new Blob([fromB64(b64)]).stream().pipeThrough(new DecompressionStream('deflate-raw')); return new Response(st).text(); }
  async function deflate(text) { const st = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw')); return toB64(new Uint8Array(await new Response(st).arrayBuffer())); }

  // chat, joins, leaves, timer and timestamp lines aren't part of the battle; dropping them keeps saved logs small
  const keepLine = (l) => !/^\|(c|c:|chat|j|J|join|l|L|leave|n|N|t:|inactive|inactiveoff|html|uhtml|uhtmlchange|raw|unlink|hidelines|clearpoke|teampreviewdone|request|sentchoice|noinit|deinit)\|/.test(l + '|') || /^\|raw\|.*rating:/.test(l);
  const slim = (log) => String(log || '').split('\n').filter(l => l && keepLine(l)).join('\n');

  // the battle's number, the same one its replay would have: format-123456 (a private battle's password is dropped)
  const battleId = (s) => { const m = String(s || '').replace(/^https?:\/\/replay\.pokemonshowdown\.com\//, '').replace(/^battle-/, '').match(/^([a-z0-9]+-\d+)/); return m ? m[1] : ''; };

  // ---------- which saved team was it ----------
  // Compare by the species before the first dash, so a team preview's "Urshifu" or "Ogerpon-Wellspring"
  // still matches the same Pokémon in a paste. The species clause means two forms of one species never share a team.
  const base = (n) => toId(String(n || '').replace(/-\*$/, '').split('-')[0]);
  function matchTeam(six, style) {
    const want = new Set(six.map(base).filter(Boolean)); if (!want.size || !VL.builder || !VL.builder.parsePaste) return null;
    const need = want.size >= 6 ? 5 : Math.max(3, want.size - 1); // one swap still counts as the same team
    const lastUse = {}; for (const g of VL.store.listAll('games')) if (g.team) lastUse[g.team] = Math.max(lastUse[g.team] || 0, g.ts || 0);
    let best = null;
    for (const t of VL.store.listAll('teams')) {
      if ((t.style || 'doubles') !== style || !t.paste) continue;
      const have = new Set(VL.builder.parsePaste(t.paste).filter(x => x && x.species).map(x => base(x.species)));
      let n = 0; for (const s of want) if (have.has(s)) n++;
      if (n < need) continue;
      const score = n * 1e15 + (lastUse[t.id] || 0) + (t.u || 0) / 1e3; // most in common; on a tie, the one you played last
      if (!best || score > best.score) best = { t, score, n };
    }
    return best ? best.t : null;
  }

  // ---------- your Showdown accounts: each one's games are climb or testing ----------
  const accts = () => ((VL.store.get('meta', 'sdaccounts') || {}).list) || {};
  function setAcct(name, mode) {
    const id = toId(name); if (!id) return;
    const list = { ...accts() }; if (mode === null) delete list[id]; else list[id] = { name: (list[id] && list[id].name) || String(name).trim(), mode };
    VL.store.put('meta', 'sdaccounts', { list });
  }
  function renderAccts() {
    const box = document.getElementById('sd-accts'); if (!box) return;
    const rows = Object.entries(accts()).sort((a, b) => (a[1].mode === b[1].mode ? a[1].name.localeCompare(b[1].name) : a[1].mode === 'climb' ? -1 : 1));
    box.innerHTML = rows.length ? rows.map(([id, a]) => `<div class="row sd-acct" style="align-items:center;justify-content:space-between;padding:4px 0"><b>${esc(a.name)}</b><span class="row" style="gap:8px;align-items:center"><span class="seg" role="radiogroup" aria-label="Games from ${esc(a.name)}"><button type="button" data-sdacct="${id}" data-sdmode="climb" aria-pressed="${a.mode !== 'test'}">Climb</button><button type="button" data-sdacct="${id}" data-sdmode="test" aria-pressed="${a.mode === 'test'}">Testing</button></span><button type="button" class="linkbtn" data-sddel="${id}">Remove</button></span></div>`).join('')
      : '<p class="sub">No accounts yet. Add your main account and your testing account, or just play: each account is added the first time one of its games comes in.</p>';
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- reading the game ----------
  function ratingAfter(log, me) {
    for (const l of String(log).split('\n').reverse()) {
      const m = l.match(/^\|raw\|(.+?)'s rating: \d+ &rarr; <strong>(\d+)<\/strong>/);
      if (m && toId(m[1]) === toId(me)) return +m[2];
    }
    return null;
  }
  function formatOf(log, bid) {
    const tier = (String(log).match(/^\|tier\|(.+)$/m) || [])[1] || '';
    const ids = (VL.D && VL.D.dex ? VL.D.dex.formats : []).map(f => f.id);
    for (const id of [toId(tier), bid.split('-')[0]]) if (id && ids.includes(id)) return id;
    return VL.curFormatId ? VL.curFormatId() : '';
  }

  const ready = () => new Promise((res) => { const t0 = Date.now(); (function wait() { if (VL.store && VL.D && VL.D.dex && VL.parseReplay && VL.builder) return VL.store.ready.then(res); if (Date.now() - t0 > 20000) return res(); setTimeout(wait, 100); })(); });

  async function importGame({ log, me, bid, url }) {
    await ready();
    if (!VL.parseReplay) return { msg: 'VGC Lab is still loading. Send the game again from the extension.' };
    if (!me) { // a replay link: work out which player you were from your names or your saved teams
      const players = {}, preview = { p1: [], p2: [] };
      for (const l of String(log).split('\n')) { const f = l.split('|'); if (f[1] === 'player' && f[3]) players[f[2]] = f[3]; else if (f[1] === 'poke' && preview[f[2]]) preview[f[2]].push(String(f[3] || '').split(',')[0].replace(/-\*$/, '')); }
      const side = VL.mySide(players, preview, []); me = side ? players[side] : '';
    }
    if (!me) return { msg: 'Couldn\'t tell which player you were. Type your Showdown username on the Log page under Import a replay, then send it again.' };
    try { if (!localStorage.getItem(SD)) localStorage.setItem(SD, me); } catch (e) { /* private mode */ }
    bid = bid || battleId(url);
    if (bid && VL.store.listAll('games').some(g => g.battle === bid || String(g.source || '').includes(bid))) return { msg: 'Already imported. That game is in your log.', dup: true };
    const r = VL.parseReplay(log, me);
    if (r.error) return { msg: r.error };
    if (!r.result) return { msg: 'That battle has no winner (a tie or unfinished), so it wasn\'t logged.' };
    const fmt = formatOf(log, bid); const style = (VL.styleOfFmt && VL.styleOfFmt(fmt)) || 'doubles';
    const team = matchTeam(r.mypreview || [], style);
    const logz = url ? null : await deflate(slim(log)).catch(() => null);
    // climb or testing goes by which of your Showdown accounts played it
    let acct = accts()[toId(me)], newAcct = false;
    if (!acct) { setAcct(me, 'climb'); acct = accts()[toId(me)]; newAcct = Object.keys(accts()).length > 1; }
    const mode = acct && acct.mode === 'test' ? 'test' : 'climb';
    const id = VL.newId('g'); const now = Date.now();
    VL.store.put('games', id, {
      ts: now, day: VL.dayKey(), fmt, fmtName: VL.fmtName ? VL.fmtName(fmt) : fmt, result: r.result, mode, style, sdUser: me,
      type: 'Ladder (best of 1)', rating: ratingAfter(log, me), team: team ? team.id : null, arch: null,
      opp: (r.opp || []).slice(0, 6), mylead: (r.mylead || []).join(', '), myback: (r.myback || []).join(', '), opplead: (r.opplead || []).join(', '), turn: null,
      tags: [], note: `Sent from Showdown by the extension. Lasted ${r.turns} turn${r.turns === 1 ? '' : 's'}.`, oppName: r.oppName || null,
      source: url || (bid ? 'showdown:' + bid : 'showdown-log'), battle: bid || null, logz, auto: true,
    });
    if (r.oppName && VL.plan && VL.plan.ensureOpponent) VL.plan.ensureOpponent(r.oppName);
    if (mode === 'climb' && VL.markDone && (!VL.style || VL.style() === style)) VL.markDone('log');
    // name what they brought (what came in), or their team preview if the replay shows nothing
    const theirs = (r.opp || []).length ? (r.opplead || []).concat((r.opp || []).filter(n => !(r.opplead || []).includes(n))) : [];
    const shown = theirs.slice(0, 2).join('/') + (theirs.length > 2 ? '/…' : '');
    const extra = newAcct ? ` · New account ${me}, logged as climb. If it's your testing account, switch it in Settings under Showdown accounts.` : mode === 'test' ? ' · testing game' : '';
    return { ok: true, id, msg: `Imported: ${r.result === 'W' ? 'Win' : 'Loss'}${shown ? ' vs ' + shown : ''}${team ? ' · ' + (team.name || 'your team') : ' · no saved team matched'}${extra}` };
  }

  // ---------- telling you ----------
  // The page is usually in a background tab while you play, so the note waits until you look at it.
  function note(msg, ok) {
    const show = () => {
      let el = document.getElementById('ai-note');
      if (!el) { el = document.createElement('div'); el.id = 'ai-note'; el.className = 'ai-note'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
      el.innerHTML = ''; const t = document.createElement('span'); t.textContent = msg; el.appendChild(t);
      if (ok) {
        const a = document.createElement('a'); a.href = '#log'; a.textContent = 'See it';
        a.onclick = (e) => { e.preventDefault(); location.hash = 'log'; setTimeout(() => { const r = document.getElementById('recent'); if (r) r.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 80); el.remove(); };
        el.appendChild(a);
      }
      const x = document.createElement('button'); x.type = 'button'; x.className = 'linkbtn'; x.textContent = 'Close'; x.setAttribute('aria-label', 'Close'); x.onclick = () => el.remove(); el.appendChild(x);
      el.classList.toggle('bad', !ok); el.classList.add('on');
      clearTimeout(note._t); note._t = setTimeout(() => el.remove(), 8000);
      if (ok) VL.sound && VL.sound.play('save');
    };
    if (document.visibilityState === 'visible') show();
    else document.addEventListener('visibilitychange', function once() { if (document.visibilityState !== 'visible') return; document.removeEventListener('visibilitychange', once); show(); });
  }

  // ---------- the address ----------
  let chain = Promise.resolve();
  function handle(oldHash) {
    const h = location.hash; if (!h.startsWith('#import=')) return;
    const raw = h.slice('#import='.length);
    // put the address back right away, without leaving the page you were on
    const back = oldHash && !oldHash.startsWith('#import=') ? oldHash : '#log';
    if (oldHash === null) location.hash = back.slice(1); else history.replaceState(null, '', location.pathname + location.search + back);
    chain = chain.then(async () => {
      try {
        let res;
        if (raw.startsWith('sd1.')) {
          const p = JSON.parse(await inflate(raw.slice(4)));
          res = await importGame({ log: p.log, me: p.me, bid: battleId(p.id) });
        } else {
          let url = decodeURIComponent(raw).replace(/[?#].*$/, '').replace(/\.(json|log)$/, '');
          if (!/^https:\/\/replay\.pokemonshowdown\.com\/[^/]+/.test(url)) res = { msg: 'That isn\'t a Showdown replay link.' };
          else {
            const j = await fetch(url + '.json').then(x => x.ok ? x.json() : null).catch(() => null);
            res = j && j.log ? await importGame({ log: j.log, me: '', bid: battleId(j.id || url), url }) : { msg: 'Couldn\'t load that replay.' };
          }
        }
        note(res.msg, !!res.ok);
      } catch (e) { console.error(e); note('Couldn\'t read the game the extension sent. Send it again from the extension\'s menu.', false); }
    });
  }
  window.addEventListener('hashchange', (e) => { const old = (e.oldURL || '').split('#')[1]; handle(old !== undefined ? '#' + old : '#today'); });
  handle(null); // opened straight to an import

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sdacct]'); if (b) { setAcct(accts()[b.dataset.sdacct].name, b.dataset.sdmode); VL.sound && VL.sound.play('tap'); return; }
    const d = e.target.closest('[data-sddel]'); if (d) { VL.armDelete ? VL.armDelete(d, () => setAcct(accts()[d.dataset.sddel].name, null)) : setAcct(accts()[d.dataset.sddel].name, null); return; }
    if (e.target.id === 'sd-add') { const n = document.getElementById('sd-new'); const v = n.value.trim(); if (!v) return; if (!accts()[toId(v)]) setAcct(v, Object.keys(accts()).length ? 'test' : 'climb'); n.value = ''; VL.toast && VL.toast('Added ' + v); }
  });
  document.addEventListener('keydown', (e) => { if (e.target && e.target.id === 'sd-new' && e.key === 'Enter') { e.preventDefault(); document.getElementById('sd-add').click(); } });
  if (VL.store) { VL.store.onChange(renderAccts); VL.store.ready.then(renderAccts); }

  // Which side of a battle you were: any of your names (Settings → Showdown accounts, the name last typed in a
  // replay box, plus any passed in), ignoring capitals and spaces; else the side whose team preview matches one
  // of your saved teams. null when neither tells.
  VL.mySide = function (players, preview, extra) {
    const names = new Set([...(extra || []), (() => { try { return localStorage.getItem(SD) || ''; } catch (e) { return ''; } })(),
      ...(VL.store ? Object.values(((VL.store.get('meta', 'sdaccounts') || {}).list) || {}).map(a => a.name) : [])].map(toId).filter(Boolean));
    const byName = Object.keys(players || {}).find(k => names.has(toId(players[k])));
    if (byName) return byName;
    const st = VL.style ? VL.style() : 'doubles';
    const hit = ['p1', 'p2'].filter(k => (preview && preview[k] || []).length && matchTeam(preview[k], st));
    return hit.length === 1 ? hit[0] : null;
  };

  VL.autoimport = { inflate, deflate, importGame, matchTeam, battleId };
})();
