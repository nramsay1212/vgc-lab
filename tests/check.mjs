// Automatic checks: opens VGC Lab in a real browser and runs through the main flows.
// The publish workflow runs this before every publish; if anything here fails, the site keeps
// its last good version. Run it yourself with:  npm install --no-save playwright@1 && node tests/check.mjs
//
// It only looks for things breaking (crashes, empty pages, flows that stop working), not for
// how things look. Each check starts from an empty app, with no account.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon', '.gif': 'image/gif' };

// ---------- a tiny local web server for the app's files ----------
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const TEAM = ['Incineroar @ Sitrus Berry\nAbility: Intimidate\nLevel: 50\n- Fake Out\n- Flare Blitz\n- Parting Shot\n- Protect',
  'Garchomp @ Life Orb\nAbility: Rough Skin\nLevel: 50\n- Earthquake\n- Dragon Claw\n- Rock Slide\n- Protect',
  'Sylveon @ Choice Specs\nAbility: Pixilate\nLevel: 50\n- Hyper Voice\n- Moonblast\n- Shadow Ball\n- Quick Attack',
  'Amoonguss @ Rocky Helmet\nAbility: Regenerator\nLevel: 50\n- Spore\n- Rage Powder\n- Pollen Puff\n- Protect',
  'Kingambit @ Black Glasses\nAbility: Defiant\nLevel: 50\n- Kowtow Cleave\n- Sucker Punch\n- Iron Head\n- Protect',
  'Gholdengo @ Leftovers\nAbility: Good as Gold\nLevel: 50\n- Make It Rain\n- Shadow Ball\n- Nasty Plot\n- Protect'].join('\n\n');
const LOG = (me = 'TestPlayer', win = true) => ['|player|p1|Rival|1|1500', `|player|p2|${me}|2|1500`, '|gametype|doubles', '|tier|[Gen 9 Champions] VGC 2026 Reg M-C', '|rated|',
  ...['Rillaboom', 'Pelipper', 'Archaludon', 'Sneasler', 'Basculegion', 'Dragonite'].map(m => `|poke|p1|${m}, L50|`),
  ...['Incineroar', 'Garchomp', 'Sylveon', 'Amoonguss', 'Kingambit', 'Gholdengo'].map(m => `|poke|p2|${m}, L50|`),
  '|start', '|switch|p1a: Rillaboom|Rillaboom, L50|100/100', '|switch|p1b: Pelipper|Pelipper, L50|100/100', '|switch|p2a: Incineroar|Incineroar, L50|100/100', '|switch|p2b: Garchomp|Garchomp, L50|100/100',
  '|turn|1', '|move|p2a: Incineroar|Fake Out|p1a: Rillaboom', '|-damage|p1a: Rillaboom|90/100', '|turn|2', '|faint|p1a: Rillaboom', '|turn|3', `|win|${win ? me : 'Rival'}`].join('\n');

// ---------- running the checks ----------
const browser = await chromium.launch();
const results = [];
async function check(name, fn, { width = 1440, height = 900, setup = '', account = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  // nothing from outside: fonts, sprites and videos aren't needed to tell whether the app works
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(String(e.message || e).split('\n')[0]));
  await page.addInitScript(`localStorage.setItem('vgclab-toured2','1'); ${account ? '' : "localStorage.setItem('vgclab-noacct','1');"} ${setup}`);
  const t0 = Date.now();
  try {
    await page.goto(BASE + '#today'); await ready(page);
    await fn(page);
    if (errors.length) throw new Error('page error: ' + errors.join(' | '));
    results.push([true, name, Date.now() - t0]);
  } catch (e) {
    results.push([false, name, Date.now() - t0, String(e.message || e).split('\n')[0]]);
  }
  await ctx.close();
}
const ready = (page) => page.waitForFunction(() => window.VL && VL.D && VL.D.dex && VL.store, null, { timeout: 30000 });
const go = async (page, hash) => { await page.evaluate(h => { location.hash = h; }, hash); await page.waitForTimeout(400); };
const expect = (ok, msg) => { if (!ok) throw new Error(msg); };
const text = (page, sel) => page.evaluate(s => (document.querySelector(s) || {}).innerText || '', sel);
const seed = (page) => page.evaluate((paste) => {
  VL.store.put('teams', 'tMain', { ts: 1, name: 'Main team', paste, fmt: 'gen9championsvgc2026regmc' });
  const opp = ['Rillaboom', 'Pelipper', 'Archaludon', 'Sneasler'];
  for (let i = 0; i < 20; i++) VL.store.put('games', 'g' + i, { ts: Date.now() - i * 15 * 60e3, day: VL.dayKey(), fmt: 'gen9championsvgc2026regmc', result: i % 3 ? 'W' : 'L', mode: 'climb', style: 'doubles', team: 'tMain', opp, opplead: 'Rillaboom, Pelipper', mylead: 'Incineroar, Garchomp', oppName: 'Rival' + (i % 4), tags: i % 3 ? [] : ['Bad lead'], rating: 1500 + i });
}, TEAM);

// 1. every page opens, shows something, and doesn't crash (doubles and singles)
for (const style of ['doubles', 'singles']) {
  await check(`Every page opens (${style})`, async (page) => {
    await seed(page);
    if (style === 'singles') { await page.evaluate(() => VL.setStyle('singles')); await page.waitForTimeout(500); await ready(page); }
    const tabs = await page.evaluate(() => VL.hubs.list.flatMap(h => h[1]));
    expect(tabs.length > 10, 'the menu lists too few pages');
    for (const t of tabs) {
      await go(page, t);
      const on = await page.evaluate(() => (document.querySelector('.panel.on') || {}).id);
      expect(on === 'p-' + t, `${t} didn't open (showed ${on})`);
      const len = await page.evaluate(() => document.querySelector('.panel.on').innerText.trim().length);
      expect(len > 40, `${t} looks empty`);
    }
  });
}

// 2. phone size
await check('Phone: pages open and the bottom bar works', async (page) => {
  for (const t of ['today', 'log', 'review', 'study', 'teams', 'news']) { await go(page, t); expect(await page.evaluate(() => !!document.querySelector('.panel.on')), `${t} didn't open`); }
  await page.click('.bottombar a[href="#review"]'); await page.waitForTimeout(300);
  expect(await page.evaluate(() => document.querySelector('.panel.on').id) === 'p-review', 'the bottom bar Review button did nothing');
}, { width: 390, height: 844 });

// 3. log a game by hand
await check('Log a game', async (page) => {
  await go(page, 'log');
  await page.click('#lf-w'); await page.fill('#lf-oppname', 'Somebody');
  await page.click('#lf-save'); await page.waitForTimeout(400);
  const n = await page.evaluate(() => VL.store.list('games').length);
  expect(n === 1, `expected 1 saved game, found ${n}`);
  expect(await page.evaluate(() => document.querySelectorAll('#recent tbody tr, #recent .game-row, #recent tr').length) >= 1, 'the game is not in Recent games');
});

// 4. replays: the Log form's import and Replay review, both from the right side
await check('Import a replay log (finds your side)', async (page) => {
  await page.evaluate(() => VL.store.put('meta', 'sdaccounts', { list: { testplayer: { name: 'TestPlayer', mode: 'climb' } } }));
  await go(page, 'log');
  await page.evaluate((l) => { document.querySelectorAll('#p-log details').forEach(d => { d.open = true; }); document.getElementById('rp-log').value = l; document.getElementById('rp-logo').click(); }, LOG());
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => document.getElementById('lf-w').getAttribute('aria-pressed')) === 'true', 'the win was not filled in from your side');
  await go(page, 'replay');
  await page.evaluate((l) => { document.querySelectorAll('#p-replay details').forEach(d => { d.open = true; }); document.getElementById('rp-log2').value = l; document.getElementById('rp-loadlog').click(); }, LOG());
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => (document.querySelector('[data-rpme][aria-pressed=true]') || { dataset: {} }).dataset.rpme) === 'p2', 'Replay review did not open from your side');
});

// the offline file: it was once emptied by mistake, so make sure it's whole and its version matches the page's
await check('Offline support file is intact', async (page) => {
  const [sw, html] = await page.evaluate(() => Promise.all([fetch('sw.js').then(r => r.text()), fetch('index.html').then(r => r.text())]));
  const v = (html.match(/\?v=([0-9a-z]+)"/) || [])[1];
  expect(sw.includes("addEventListener('fetch'") && new RegExp(`'vgclab-v?${v}'`).test(sw), `sw.js is empty or its version doesn't match index.html (v${v})`);
});

// 5. a game sent by the Showdown extension
await check('Game from the Showdown extension', async (page) => {
  await page.evaluate((p) => VL.store.put('teams', 'tMain', { ts: 1, name: 'Main team', paste: p, fmt: 'gen9championsvgc2026regmc' }), TEAM);
  const h = await page.evaluate(async (l) => 'sd1.' + await VL.autoimport.deflate(JSON.stringify({ v: 1, id: 'gen9championsvgc2026regmc-99', me: 'TestPlayer', log: l })), LOG());
  await page.evaluate((x) => { location.hash = 'import=' + x; }, h); await page.waitForTimeout(1500);
  const g = await page.evaluate(() => VL.store.list('games')[0]);
  expect(g && g.result === 'W' && g.team === 'tMain' && g.mode === 'climb', 'the game was not saved as a climb win with the right team');
  expect((await text(page, '#ai-note')).startsWith('Imported'), 'no confirmation note');
  // answers from the box on Showdown go into that same game
  const h2 = await page.evaluate(async (l) => 'sd1.' + await VL.autoimport.deflate(JSON.stringify({ v: 1, id: 'gen9championsvgc2026regmc-99', me: 'TestPlayer', log: l, extra: { arch: 'Trick Room', tags: ['calc', 'made-up'], note: 'test note' } })), LOG());
  await page.evaluate((x) => { location.hash = 'import=' + x; }, h2); await page.waitForTimeout(1500);
  const gs = await page.evaluate(() => VL.store.list('games'));
  expect(gs.length === 1 && gs[0].arch === 'Trick Room' && gs[0].tags.join() === 'calc' && gs[0].note.includes('test note'), 'answers from Showdown did not update the game');
  // a game of a best-of-3 set: Showdown's marker groups it, and the (Bo3) format counts as the format itself
  const bo3 = LOG().replace('|tier|', '|uhtml|bestof|<h2><strong>Game 2</strong> of <a href="/game-bestof3-gen9championsvgc2026regmcbo3-55">a best-of-3</a></h2>\n|tier|');
  const h3 = await page.evaluate(async (l) => 'sd1.' + await VL.autoimport.deflate(JSON.stringify({ v: 1, id: 'gen9championsvgc2026regmcbo3-98', me: 'TestPlayer', log: l })), bo3);
  await page.evaluate((x) => { location.hash = 'import=' + x; }, h3); await page.waitForTimeout(1500);
  const g3 = await page.evaluate(() => VL.store.list('games').find(g => g.battle === 'gen9championsvgc2026regmcbo3-98'));
  expect(g3 && g3.set === 'bo3-gen9championsvgc2026regmcbo3-55' && g3.setGame === 2 && g3.fmt === 'gen9championsvgc2026regmc', 'a best-of-3 game did not join its set');
});

// 6. Team builder
await check('Team builder: import a team and open the analysis', async (page) => {
  await go(page, 'teams'); await page.waitForTimeout(600);
  await page.click('[data-bd="import"]'); await page.fill('#bm-paste', TEAM); await page.click('#bm-go'); await page.waitForTimeout(1500);
  const t = await text(page, '#p-teams');
  expect(t.includes('Garchomp') && t.includes('Gholdengo'), 'the imported Pokémon are not shown');
  expect(await page.evaluate(() => VL.store.list('teams').length) >= 1, 'the team was not saved');
});

// 7. damage calculator
await check('Damage calculator', async (page) => {
  await seed(page);
  await page.evaluate(() => VL.calc.openTrouble('Garchomp', 'tMain')); await page.waitForTimeout(2500);
  expect(await page.evaluate(() => document.querySelector('.panel.on').id) === 'p-calc', 'the calculator did not open');
  expect(/Garchomp/.test(await text(page, '#p-calc')), 'Garchomp was not loaded');
});

// 8. Study drills
await check('Study: run a few drills', async (page) => {
  await go(page, 'study'); await page.waitForTimeout(500);
  for (const d of ['typemon', 'basespeed', 'items', 'mechanics']) {
    await page.evaluate((id) => { const b = document.querySelector(`[data-drill="${id}"]`); if (b && !b.disabled) b.click(); }, d); await page.waitForTimeout(400);
    const opts = await page.$$('[data-opt]'); expect(opts.length >= 2, `${d}: no answers to pick`);
    await opts[0].click(); await page.waitForTimeout(200);
    await go(page, 'today'); await go(page, 'study');
  }
});

// 9. Games
await check('Games: every game starts and ends', async (page) => {
  await go(page, 'games'); await page.waitForTimeout(500);
  const games = await page.evaluate(() => VL.arcadeGames.map(g => [g.id, g.modes[0][0]]));
  expect(games.length >= 5, 'too few games');
  for (const [id, mode] of games) {
    await page.evaluate(([g, m]) => VL.arcade.start(g, m), [id, mode]); await page.waitForTimeout(id === 'damage' ? 2500 : 600);
    expect((await text(page, '#ar-play')).length > 20, `${id} shows nothing`);
    await page.evaluate(() => VL.arcade.stop());
  }
});

// 10. Test
await check('Test: start a quick test and answer', async (page) => {
  await go(page, 'test'); await page.waitForTimeout(500);
  await page.click('[data-te="quick"]'); await page.waitForTimeout(800);
  for (let i = 0; i < 3; i++) { const o = await page.$('[data-teopt]'); expect(!!o, 'no answers to pick'); await o.click(); await page.waitForTimeout(300); const n = await page.$('#te-next, [data-te="next"]'); if (n) await n.click(); await page.waitForTimeout(200); }
});

// 11. Team sheet practice, timed
await check('Team sheet practice (timed)', async (page) => {
  await seed(page); await go(page, 'sheets'); await page.waitForTimeout(800);
  await page.check('#sh-timed');
  await page.evaluate((p) => { document.querySelectorAll('#sh-root details').forEach(d => { d.open = true; }); document.getElementById('sh-paste').value = p; }, TEAM);
  await page.click('[data-sh="paste"]'); await page.waitForTimeout(600);
  expect(!!(await page.$('#sh-clock')), 'no clock');
  await page.click('[data-sh="lock"]'); await page.waitForTimeout(500);
  expect((await text(page, '.sh-timed-res')).includes('Locked in'), 'locking in did not show the result');
});

// 12. Review, News, Progress
await check('Review, News and Progress', async (page) => {
  await seed(page);
  await go(page, 'review'); await page.waitForTimeout(500);
  expect((await text(page, '#rv-tilt')).includes('%'), 'Sessions and tilt is empty');
  await go(page, 'news'); await page.waitForTimeout(1200);
  await page.click('[data-nwf="meta"]'); await page.waitForTimeout(800);
  expect(!!(await page.$('#rr-card')), 'the regulation report is missing');
  await go(page, 'progress'); await page.waitForTimeout(500);
});

// 13. settings: colors, style, theme
await check('Settings: colors, style and theme', async (page) => {
  await go(page, 'settings');
  for (const sel of ['[data-palette="original"]', '[data-look="minimal"]', '[data-theme-set="light"]', '[data-palette="shiny"]', '[data-look="standard"]']) {
    const b = await page.$(sel); if (b) { await b.click(); await page.waitForTimeout(150); }
  }
});

// 14. accounts: switching to an account downloads all of its data (the bug from Nov 21)
await check('Accounts: signing in downloads everything', async (page) => {
  const t = 1795200000000;
  const server = { users: { real: [{ c: 'meta', i: 'profile', d: JSON.stringify({ format: 'gen9championsvgc2026regmc', focus: 'Late game', u: t }), s: t }, ...Array.from({ length: 12 }, (_, k) => ({ c: 'games', i: 'g' + k, d: JSON.stringify({ ts: t, day: '2026-11-01', fmt: 'gen9championsvgc2026regmc', result: 'W', mode: 'climb', style: 'doubles', u: t }), s: t + k }))] } };
  await page.evaluate(([s, t]) => { localStorage.setItem('__fakeServer', JSON.stringify(s)); localStorage.setItem('vgclab-acct-pull-real', String(t + 5e8)); localStorage.setItem('vgclab-owner', 'local'); }, [server, t]);
  await page.addInitScript(() => {
    const save = () => localStorage.setItem('__fakeServer', JSON.stringify(window.__srv));
    window.__srv = JSON.parse(localStorage.getItem('__fakeServer') || '{"users":{}}'); let cur = JSON.parse(localStorage.getItem('__fakeUser') || 'null');
    window.VL_FAKE_BACKEND = {
      signIn: async (email) => { cur = { uid: email.split('@')[0], email }; localStorage.setItem('__fakeUser', JSON.stringify(cur)); return cur; },
      signUp: async (email) => { cur = { uid: email.split('@')[0], email }; localStorage.setItem('__fakeUser', JSON.stringify(cur)); return cur; },
      signOut: async () => { cur = null; localStorage.removeItem('__fakeUser'); }, onAuth: (f) => setTimeout(() => f(cur), 50), changePassword: async () => {},
      pull: async (uid, since) => (window.__srv.users[uid] || []).filter(x => x.s > since).map(x => ({ c: x.c, i: x.i, r: JSON.parse(x.d), s: x.s })),
      push: async (uid, list) => { const L = window.__srv.users[uid] ||= []; for (const { c, i, r } of list) { const k = L.findIndex(x => x.c === c && x.i === i); const rec = { c, i, d: JSON.stringify(r), s: Date.now() }; if (k >= 0) L[k] = rec; else L.push(rec); } save(); },
      getPrivate: async () => ({ k: 'x', rid: 'y' }), setPrivate: async () => {}, getRecovery: async () => null, setRecovery: async () => {}, delRecovery: async () => {},
    };
  });
  await page.reload(); await page.waitForTimeout(2000);
  await page.fill('#auth-user', 'real'); await page.fill('#auth-pass', 'secret1'); await page.click('#auth-go'); await page.waitForTimeout(2500);
  const n = await page.evaluate(() => VL.store.list('games').length);
  expect(n === 12, `expected all 12 games after signing in, found ${n}`);
  expect(await page.evaluate(() => (VL.store.get('meta', 'profile') || {}).focus) === 'Late game', 'the profile did not come back');
}, { account: true });

await browser.close(); server.close();

// ---------- the report ----------
const failed = results.filter(r => !r[0]);
for (const [ok, name, ms, why] of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${(ms / 1000).toFixed(1)}s)${ok ? '' : '\n      ' + why}`);
console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
process.exit(failed.length ? 1 : 0);
