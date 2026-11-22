/* Decides whether a finished battle should go to VGC Lab, then sends it by opening
 * (or quietly updating) a VGC Lab tab with the game in its address. */
'use strict';
const LAB = 'https://nramsay1212.github.io/vgc-lab/';
const DEFAULTS = { enabled: true, lossesOnly: false, format: 'gen9championsvgc2026regmc', headsUp: true, askAfter: true };
// the same lists as VGC Lab's Log form, so answers land in the same fields
const ARCHS = ['Tailwind offense', 'Trick Room', 'Sun', 'Rain', 'Sand', 'Snow', 'Terrain', 'Balance', 'Hyper offense', 'Other'];
const TAGS_D = [['preview', 'Wrong bring or lead'], ['speed', 'Misjudged speed, Trick Room or Tailwind turns'], ['calc', 'Misjudged damage'], ['overpredict', 'Over-predicted (Protect, switch)'], ['predictable', 'Played too predictable'], ['mega', 'Gimmick timing (Mega, Tera, etc.)'], ['wincon', 'Traded away my win condition'], ['endgame', 'Endgame miscount'], ['info', 'Missed an item/ability reveal'], ['knowledge', 'Didn\'t know a mechanic or interaction'], ['tilt', 'Autopilot or tilt'], ['luck', 'Bad luck (critical hit, miss, speed tie)'], ['matchup', 'Bad team matchup']];
const TAGS_S = [['preview', 'Wrong bring-3 or lead'], ['speed', 'Misjudged speed or priority'], ['calc', 'Misjudged damage'], ['switch', 'Bad switch-in or lost momentum'], ['setup', 'Let them set up, or set up at the wrong time'], ['hazards', 'Hazards or chip damage'], ['overpredict', 'Over-predicted (switch, Protect)'], ['predictable', 'Played too predictable'], ['mega', 'Gimmick timing (Mega, Tera, etc.)'], ['wincon', 'Traded away my win condition'], ['endgame', 'Endgame miscount'], ['info', 'Missed an item/ability reveal'], ['knowledge', 'Didn\'t know a mechanic or interaction'], ['tilt', 'Autopilot or tilt'], ['luck', 'Bad luck (critical hit, miss, speed tie)'], ['matchup', 'Bad team matchup']];
const isDoubles = (fmt) => /vgc|doubles/.test(fmt);
const toId = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const getSettings = async () => ({ ...DEFAULTS, ...(await chrome.storage.sync.get(Object.keys(DEFAULTS))) });

// the battle's number, the same one its replay would get: format-123456 (a private battle's password is dropped)
const battleId = (room) => { const m = String(room).replace(/^battle-/, '').match(/^([a-z0-9]+-\d+)/); return m ? m[1] : ''; };

function readBattle(log, me) {
  const players = {}; const preview = { p1: [], p2: [] }; let winner = null, rated = null, turn = 0;
  const seen = { p1: [], p2: [] }, leads = { p1: [], p2: [] };
  const sp = (s) => String(s || '').split(',')[0].replace(/-\*$/, '').replace(/-Mega(-[XYZ])?$/, '');
  for (const line of log.split('\n')) {
    const f = line.split('|');
    if (f[1] === 'player' && f[3]) players[f[2]] = f[3];
    else if (f[1] === 'poke' && preview[f[2]]) preview[f[2]].push(String(f[3] || '').split(',')[0].replace(/-\*$/, ''));
    else if (f[1] === 'win') winner = f[2] || '';
    else if (f[1] === 'tie') winner = '';
    else if (f[1] === 'rated') rated = f[2] || '';
    else if (f[1] === 'turn') turn = +f[2] || turn;
    else if (f[1] === 'switch' || f[1] === 'drag') { const s = (f[2] || '').slice(0, 2); const n = sp(f[3]); if (!seen[s]) continue; if (!seen[s].includes(n)) seen[s].push(n); if (turn === 0 && !leads[s].includes(n)) leads[s].push(n); }
  }
  const side = Object.keys(players).find(k => toId(players[k]) === toId(me));
  const opp = side === 'p1' ? 'p2' : 'p1';
  return { side, rated, turns: turn, result: winner === null ? null : winner === '' ? 'T' : toId(winner) === toId(me) ? 'W' : 'L', theirs: side ? preview[opp] : [], oppName: side ? players[opp] : '', oppLeads: side ? leads[opp] : [], oppBrought: side ? seen[opp] : [], mine: side ? preview[side] : [], mySeen: side ? seen[side] : [] };
}

// ---------- opponent history, for the heads-up at team preview ----------
// Every finished game in your format where you were a player, rated or not: who it was, what they showed,
// brought and led, and the result. Kept on this computer only (up to 12 games per player, 400 players).
async function rememberOpponent(id, b) {
  if (!b.oppName || (b.result !== 'W' && b.result !== 'L')) return;
  const { opphist = {} } = await chrome.storage.local.get('opphist');
  const k = toId(b.oppName); const list = (opphist[k] || []).filter(g => g.id !== id);
  list.unshift({ id, t: Date.now(), name: b.oppName, result: b.result, turns: b.turns, preview: b.theirs, brought: b.oppBrought, leads: b.oppLeads });
  opphist[k] = list.slice(0, 12);
  const keys = Object.keys(opphist); if (keys.length > 400) { keys.sort((a, c) => (opphist[a][0].t || 0) - (opphist[c][0].t || 0)).slice(0, keys.length - 400).forEach(x => delete opphist[x]); }
  await chrome.storage.local.set({ opphist });
}
async function lookupOpponent({ room, me, log }) {
  const s = await getSettings();
  if (!s.headsUp || !battleId(room).startsWith(toId(s.format) + '-')) return null;
  const b = readBattle(log, me); if (!b.side || !b.oppName) return null;
  const { opphist = {} } = await chrome.storage.local.get('opphist');
  const games = (opphist[toId(b.oppName)] || []).filter(g => g.id !== battleId(room));
  return games.length ? { opp: b.oppName, preview: b.theirs, games } : null;
}

// the browser's own deflate, then base64 that's safe in an address
async function pack(obj) {
  const st = new Blob([JSON.stringify(obj)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const u = new Uint8Array(await new Response(st).arrayBuffer());
  let bin = ''; for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// one game at a time, with a short gap, so two quick games can't trip over each other
let queue = Promise.resolve();
function openLab(hash) {
  queue = queue.then(async () => {
    const url = LAB + '#import=' + hash;
    const tabs = await chrome.tabs.query({ url: LAB + '*' });
    // update the VGC Lab tab you already have, in the background, so you stay on Showdown
    if (tabs.length) await chrome.tabs.update(tabs[0].id, { url });
    else await chrome.tabs.create({ url, active: false });
    await new Promise(r => setTimeout(r, 1500));
  }).catch(e => console.warn('VGC Lab: could not open the tab', e));
  return queue;
}

async function remember(id, entry) {
  const { sent = [], recent = [] } = await chrome.storage.local.get(['sent', 'recent']);
  if (!sent.includes(id)) sent.push(id);
  recent.unshift(entry);
  await chrome.storage.local.set({ sent: sent.slice(-500), recent: recent.slice(0, 8) });
}

function badge(text, color) {
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeText({ text });
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 15000);
}

// Which of your six never came in. Team preview can hide a form (Urshifu-*), so a preview name matches
// any form that starts with it.
function stayedBack(b) {
  const came = b.mySeen.map(toId);
  return b.mine.filter(n => { const k = toId(n); return k && !came.some(c => c === k || c.startsWith(k)); });
}

// the questions to ask on Showdown once the game is sent
async function askFor(id, me, log, b, fmt) {
  const doubles = isDoubles(fmt); const bring = doubles ? 4 : 3;
  const left = stayedBack(b); const missing = Math.max(0, bring - b.mySeen.length);
  // keep the log for a little while, so your answers can go with it (the background script can be stopped between games)
  const { pend = {} } = await chrome.storage.session.get('pend');
  pend[id] = { me, log, back: left, t: Date.now() };
  for (const k of Object.keys(pend).sort((a, c) => pend[c].t - pend[a].t).slice(4)) delete pend[k];
  await chrome.storage.session.set({ pend });
  return { ask: true, id, result: b.result, oppName: b.oppName, archs: ARCHS, tags: b.result === 'L' ? (doubles ? TAGS_D : TAGS_S) : [], back: missing && left.length ? left : [], bring, pick: Math.min(missing, left.length) };
}

async function onBattle({ room, me, log }, reply = () => {}) {
  const s = await getSettings();
  const id = battleId(room);
  if (!id || !id.startsWith(toId(s.format) + '-')) return reply(null); // only the format you picked
  const b = readBattle(log, me);
  if (!b.side) return reply(null); // you were watching, not playing
  if (s.headsUp) await rememberOpponent(id, b); // for the heads-up: every game you played, even with sending off
  if (!s.enabled) return reply(null);
  if (b.rated === null || /tournament/i.test(b.rated)) return reply(null); // ladder games only: challenges and tournaments aren't rated
  if (b.result !== 'W' && b.result !== 'L') return reply(null); // ties and unfinished games
  const { sent = [] } = await chrome.storage.local.get('sent');
  if (sent.includes(id)) return reply(null); // already sent this one
  const hash = 'sd1.' + await pack({ v: 1, id, me, log });
  // kept for the menu's Send button, so a win skipped by "Losses only" can still be sent by hand
  const entry = { id, result: b.result, opp: b.theirs.slice(0, 6), oppName: b.oppName, t: Date.now(), skipped: false, hash };
  if (s.lossesOnly && b.result === 'W') { entry.skipped = true; await remember(id, entry); return reply(null); }
  await remember(id, entry);
  // the game goes now; the box on Showdown can add your answers to it after
  reply(s.askAfter ? await askFor(id, me, log, b, toId(s.format)) : null);
  await openLab(hash);
  badge(b.result, b.result === 'W' ? '#1E8A55' : '#C93636');
}

// Your answers from the box on Showdown: sent again with the game, so VGC Lab fills them into the game
// it already has (or logs the game with them, if the first send never arrived).
async function onDetails(msg) {
  const id = String(msg.id || '');
  const { pend = {} } = await chrome.storage.session.get('pend');
  const p = pend[id]; if (!p) return { ok: false };
  const all = new Set([...TAGS_D, ...TAGS_S].map(t => t[0]));
  const extra = {};
  if (ARCHS.includes(msg.arch)) extra.arch = msg.arch;
  if (Array.isArray(msg.tags)) extra.tags = msg.tags.filter(t => all.has(t)).slice(0, 16);
  if (Array.isArray(msg.back)) extra.back = msg.back.filter(n => p.back.includes(n)).slice(0, 3);
  if (typeof msg.note === 'string' && msg.note.trim()) extra.note = msg.note.trim().slice(0, 300);
  if (!extra.arch && !(extra.tags || []).length && !(extra.back || []).length && !extra.note) return { ok: true, empty: true };
  const hash = 'sd1.' + await pack({ v: 1, id, me: p.me, log: p.log, extra });
  // the menu's Send again sends the answers too
  const { recent = [] } = await chrome.storage.local.get('recent');
  const e = recent.find(x => x.id === id); if (e) { e.hash = hash; e.answered = true; await chrome.storage.local.set({ recent }); }
  await openLab(hash);
  return { ok: true };
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const fromSD = sender.tab && /^https:\/\/play\.pokemonshowdown\.com\//.test(sender.url || sender.tab.url || '');
  if (msg && msg.type === 'battle-end' && fromSD) { onBattle(msg, reply).catch(() => reply(null)); return true; }
  if (msg && msg.type === 'details' && fromSD) { onDetails(msg).then(reply).catch(() => reply({ ok: false })); return true; }
  if (msg && msg.type === 'battle-start' && fromSD) { lookupOpponent(msg).then(reply).catch(() => reply(null)); return true; }
  if (msg && msg.type === 'resend' && sender.id === chrome.runtime.id && String(sender.url || '').startsWith(chrome.runtime.getURL(''))) { // from the menu's Send buttons
    chrome.storage.local.get('recent').then(async ({ recent = [] }) => {
      const e = recent.find(x => x.id === msg.id); if (!e || !e.hash) { reply({ ok: false }); return; }
      if (e.skipped) { e.skipped = false; await chrome.storage.local.set({ recent }); }
      await openLab(e.hash); reply({ ok: true });
    });
    return true;
  }
});
