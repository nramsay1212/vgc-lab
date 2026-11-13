#!/usr/bin/env node
/*
 * Builds data/news.json for the News page.
 *
 *   node scripts/build-news.js [out.json]
 *
 * - headlines: recent competitive Pokémon headlines (title, source, date and
 *   link only) from Victory Road and Google News
 * - app: what changed in this app, from the project's own history
 * - calendar: upcoming major events from Limitless, when it can be read
 * - changes: kept as they are; build-data.js and build-meta.js add to them
 *   when Pokémon data or usage stats change
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'data', 'news.json'));
const UA = { 'User-Agent': 'toxicroak-vgc-lab (github.com/nramsay1212/vgc-lab)' };
const DEBUG = !!process.env.NEWS_DEBUG;

async function getText(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { const r = await fetch(url, { headers: UA }); if (r.ok) return await r.text(); } catch (e) { /* retry */ }
  }
  return '';
}
const unxml = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '')
  .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const tag = (item, name) => { const m = item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`)); return m ? unxml(m[1]) : ''; };
const day = (d) => { const t = new Date(d); return isNaN(t) ? '' : t.toISOString().slice(0, 10); };
const daysAgo = (d) => (Date.now() - new Date(d).getTime()) / 864e5;

async function feed(url, source, maxAgeDays, max) {
  const xml = await getText(url); if (!xml) { console.log(`  ${source || url}: could not read`); return null; }
  const items = xml.split(/<item[\s>]/).slice(1).map(it => {
    let t = tag(it, 'title'); const src = source || tag(it, 'source') || '';
    if (!source && src && t.endsWith(' - ' + src)) t = t.slice(0, -(src.length + 3));
    let u = tag(it, 'link'); u = u.replace(/[?&]utm_[^&]+/g, '').replace(/[?&]$/, '');
    return { t, u, s: src, d: day(tag(it, 'pubDate')) };
  }).filter(x => x.t && /^https:\/\//.test(x.u) && x.d && daysAgo(x.d) <= maxAgeDays && daysAgo(x.d) > -2);
  items.sort((a, b) => b.d.localeCompare(a.d));
  console.log(`  ${source || 'Google News'}: ${items.length} recent headlines`);
  return items.slice(0, max);
}

function appUpdates() {
  try {
    const log = execSync('git log --no-merges -n 150 --format=%cs%x09%an%x09%s', { cwd: path.join(__dirname, '..') }).toString().trim().split('\n');
    const out = [];
    for (const line of log) {
      const [d, who, ...rest] = line.split('\t'); const t = rest.join('\t').trim();
      if (!t || /github-actions/.test(who) || /^(probe|wip|merge|daily update|weekly update)/i.test(t)) continue;
      out.push({ d, t: t.replace(/\s+/g, ' ').slice(0, 260) });
      if (out.length >= 40) break;
    }
    return out;
  } catch (e) { return null; }
}

// Upcoming major events, read from Limitless's public calendar table. If the page changes shape this returns null and the app's built-in list is used.
async function calendar() {
  const html = await getText('https://limitlessvgc.com/tournaments/upcoming');
  if (!html) return null;
  if (DEBUG) { const i = html.indexOf('<table'); console.log('CALENDAR HTML\n' + html.slice(Math.max(0, i - 200), i + 3500)); }
  const rows = html.split(/<tr[\s>]/).slice(1); const out = [];
  for (const r of rows) {
    const cells = [...r.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => unxml(m[1]));
    const date = (r.match(/data-date="(\d{4}-\d{2}-\d{2})/) || r.match(/(\d{4}-\d{2}-\d{2})/) || [])[1];
    const name = (r.match(/data-name="([^"]+)"/) || [])[1] || cells.find(c => /Regional|International|World|Special|Championship/i.test(c));
    if (!date || !name) continue;
    const country = (r.match(/data-country="([A-Z]{2})"/) || r.match(/alt="([A-Z]{2})"/) || [])[1] || '';
    out.push({ d: date, n: unxml(name), c: country });
  }
  const upcoming = out.filter(e => daysAgo(e.d) < 3).sort((a, b) => a.d.localeCompare(b.d)).slice(0, 40);
  console.log(`  Calendar: ${upcoming.length} upcoming events`);
  return upcoming.length ? upcoming : null;
}

(async () => {
  let old = {}; try { old = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { old = {}; }
  console.log('Headlines:');
  const vr = await feed('https://victoryroad.pro/feed/', 'Victory Road', 45, 12);
  const gn = await feed('https://news.google.com/rss/search?q=%22Pokemon+Champions%22+OR+%22Pokemon+VGC%22+OR+%22Pokemon+World+Championships%22+when:21d&hl=en-US&gl=US&ceid=US:en', '', 21, 14);
  let headlines = null;
  if (vr || gn) {
    const seen = new Set(); headlines = [];
    for (const h of [...(vr || []), ...(gn || [])].sort((a, b) => b.d.localeCompare(a.d))) { const k = h.t.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60); if (seen.has(k)) continue; seen.add(k); headlines.push(h); }
    headlines = headlines.slice(0, 22);
  }
  const app = appUpdates();
  const cal = await calendar();
  const result = {
    v: 1, generated: new Date().toISOString(),
    changes: (old.changes || []).slice(0, 150),
    headlines: headlines || old.headlines || [],
    app: app && app.length ? app : (old.app || []),
    calendar: cal || old.calendar || [],
  };
  const comparable = (o) => JSON.stringify({ ...o, generated: null });
  if (comparable(old) === comparable(result)) { console.log('No news changes.'); return; }
  fs.writeFileSync(OUT, JSON.stringify(result));
  console.log(`Wrote ${OUT}: ${result.headlines.length} headlines, ${result.app.length} app updates, ${result.changes.length} data changes, ${result.calendar.length} calendar events`);
})();
