'use strict';
const DEFAULTS = { enabled: true, lossesOnly: false, format: 'gen9championsvgc2026regmc', headsUp: true, askAfter: true };
const $ = (id) => document.getElementById(id);

async function load() {
  const s = { ...DEFAULTS, ...(await chrome.storage.sync.get(Object.keys(DEFAULTS))) };
  $('enabled').checked = s.enabled; $('lossesOnly').checked = s.lossesOnly; $('headsUp').checked = s.headsUp; $('askAfter').checked = s.askAfter; $('format').value = s.format;
  $('state').textContent = s.enabled ? (s.lossesOnly ? 'On: sending losses only' : 'On: sending every ladder game') : 'Off: nothing is sent';
  const { recent = [] } = await chrome.storage.local.get('recent');
  const box = $('recent');
  if (!recent.length) return;
  box.textContent = '';
  for (const g of recent) {
    const row = document.createElement('div'); row.className = 'game';
    const p = document.createElement('span'); p.className = 'pill ' + g.result; p.textContent = g.result === 'W' ? 'Win' : 'Loss';
    const who = document.createElement('span'); who.className = 'who';
    who.textContent = (g.skipped ? '(skipped) ' : '') + (g.opp && g.opp.length ? g.opp.join(', ') : 'Opponent');
    who.title = (g.oppName ? g.oppName + ': ' : '') + (g.opp || []).join(', ') + ' · ' + new Date(g.t).toLocaleString();
    row.append(p, who);
    if (g.hash) {
      const b = document.createElement('button'); b.textContent = g.skipped ? 'Send' : 'Send again';
      b.onclick = async () => { b.disabled = true; b.textContent = 'Sending…'; const r = await chrome.runtime.sendMessage({ type: 'resend', id: g.id }); b.textContent = r && r.ok ? 'Sent' : 'Couldn\'t send'; };
      row.append(b);
    }
    box.append(row);
  }
}
for (const k of ['enabled', 'lossesOnly', 'askAfter', 'headsUp']) $(k).addEventListener('change', async () => { await chrome.storage.sync.set({ [k]: $(k).checked }); load(); });
$('format').addEventListener('change', async () => { const v = $('format').value.trim().toLowerCase().replace(/[^a-z0-9]/g, '') || DEFAULTS.format; await chrome.storage.sync.set({ format: v }); load(); });
load();
