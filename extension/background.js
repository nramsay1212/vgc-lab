/* Decides whether a finished battle should go to VGC Lab, then sends it by opening
 * (or quietly updating) a VGC Lab tab with the game in its address. */
'use strict';
const LAB = 'https://nramsay1212.github.io/vgc-lab/';
const DEFAULTS = { enabled: true, lossesOnly: false, format: 'gen9championsvgc2026regmc' };
const toId = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const getSettings = async () => ({ ...DEFAULTS, ...(await chrome.storage.sync.get(Object.keys(DEFAULTS))) });

// the battle's number, the same one its replay would get: format-123456 (a private battle's password is dropped)
const battleId = (room) => { const m = String(room).replace(/^battle-/, '').match(/^([a-z0-9]+-\d+)/); return m ? m[1] : ''; };

function readBattle(log, me) {
  const players = {}; const preview = { p1: [], p2: [] }; let winner = null, rated = null;
  for (const line of log.split('\n')) {
    const f = line.split('|');
    if (f[1] === 'player' && f[3]) players[f[2]] = f[3];
    else if (f[1] === 'poke' && preview[f[2]]) preview[f[2]].push(String(f[3] || '').split(',')[0].replace(/-\*$/, ''));
    else if (f[1] === 'win') winner = f[2] || '';
    else if (f[1] === 'tie') winner = '';
    else if (f[1] === 'rated') rated = f[2] || '';
  }
  const side = Object.keys(players).find(k => toId(players[k]) === toId(me));
  const opp = side === 'p1' ? 'p2' : 'p1';
  return { side, rated, result: winner === null ? null : winner === '' ? 'T' : toId(winner) === toId(me) ? 'W' : 'L', theirs: side ? preview[opp] : [], oppName: side ? players[opp] : '' };
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

async function onBattle({ room, me, log }) {
  const s = await getSettings();
  if (!s.enabled) return;
  const id = battleId(room);
  if (!id || !id.startsWith(toId(s.format) + '-')) return; // only the format you picked
  const b = readBattle(log, me);
  if (!b.side) return; // you were watching, not playing
  if (b.rated === null || /tournament/i.test(b.rated)) return; // ladder games only: challenges and tournaments aren't rated
  if (b.result !== 'W' && b.result !== 'L') return; // ties and unfinished games
  const { sent = [] } = await chrome.storage.local.get('sent');
  if (sent.includes(id)) return; // already sent this one
  const hash = 'sd1.' + await pack({ v: 1, id, me, log });
  // kept for the menu's Send button, so a win skipped by "Losses only" can still be sent by hand
  const entry = { id, result: b.result, opp: b.theirs.slice(0, 6), oppName: b.oppName, t: Date.now(), skipped: false, hash };
  if (s.lossesOnly && b.result === 'W') { entry.skipped = true; await remember(id, entry); return; }
  await remember(id, entry);
  await openLab(hash);
  badge(b.result, b.result === 'W' ? '#1E8A55' : '#C93636');
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg && msg.type === 'battle-end' && sender.tab && /^https:\/\/play\.pokemonshowdown\.com\//.test(sender.url || sender.tab.url || '')) { onBattle(msg); return; }
  if (msg && msg.type === 'resend' && sender.id === chrome.runtime.id && String(sender.url || '').startsWith(chrome.runtime.getURL(''))) { // from the menu's Send buttons
    chrome.storage.local.get('recent').then(async ({ recent = [] }) => {
      const e = recent.find(x => x.id === msg.id); if (!e || !e.hash) { reply({ ok: false }); return; }
      if (e.skipped) { e.skipped = false; await chrome.storage.local.set({ recent }); }
      await openLab(e.hash); reply({ ok: true });
    });
    return true;
  }
});
