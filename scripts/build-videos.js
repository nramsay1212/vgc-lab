#!/usr/bin/env node
/*
 * Builds data/videos.json: recent videos from competitive Pokémon YouTube
 * channels, sorted into team ideas, getting better, tournaments and battles.
 *
 *   node scripts/build-videos.js [out.json]
 *
 * Uses each channel's public RSS feed (no API key). Feeds only list the latest
 * 15 videos, so older ones are kept from the previous file. Team videos that
 * link a PokéPaste get the team's text saved, so the app can open it in the
 * Team builder.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'data', 'videos.json'));
const UA = { 'User-Agent': 'Mozilla/5.0 (toxicroak-vgc-lab; github.com/nramsay1212/vgc-lab)' };
const KEEP_PER_CHANNEL = 60, KEEP_DAYS = 730;

// style: which way the channel mostly plays; only: a title filter for channels that post much more than battles
const CHANNELS = [
  { handle: 'WolfeyVGC', id: 'UC9OZkS1Mhl5UvKSiPrYqsxg', name: 'WolfeyVGC', style: 'doubles' },
  { handle: 'CybertronVGC', name: 'CybertronVGC', style: 'doubles' },
  { user: 'bazandersonvgc', name: 'Baz Anderson', style: 'doubles' },
  { handle: 'pokemon', name: 'Pokémon (official)', style: 'doubles', only: /\bVGC\b|Championships?|Worlds|Regional|International|Champions Battle/i },
  { handle: 'PokeaimMD', name: 'PokeaimMD', style: 'singles' },
  { handle: 'Thunderblunder777', name: 'Thunderblunder777', style: 'singles' },
];

// streams, merch and other games that aren't about getting better at competitive battles
const OFF_TOPIC = /pokerogue|!merch|\blive\b|livestream|unboxing|opening|\btcg\b|pok[eé]mon go\b|nuzlocke|randomi[sz]er|minecraft|palworld/i;

async function get(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { const r = await fetch(url, { headers: UA }); if (r.ok) return await r.text(); if (r.status === 404) return null; } catch (e) { /* retry */ }
    await new Promise(res => setTimeout(res, 1500 * (attempt + 1)));
  }
  return null;
}
const decode = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n));
const tag = (xml, t) => { const m = xml.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)); return m ? decode(m[1]).trim() : ''; };

async function channelId(c, old) {
  if (c.id) return c.id;
  const known = old && old.channels && old.channels.find(x => x.name === c.name && x.id);
  if (known) return known.id;
  const page = await get(c.user ? `https://www.youtube.com/user/${c.user}` : `https://www.youtube.com/@${c.handle}`);
  const m = page && (page.match(/"externalId":"(UC[\w-]{22})"/) || page.match(/<meta itemprop="identifier" content="(UC[\w-]{22})"/) || page.match(/"channelId":"(UC[\w-]{22})"/));
  return m ? m[1] : null;
}

// what a video is mostly about, from its title (and whether it links a team)
function kind(title, hasPaste) {
  const t = title.toLowerCase();
  if (hasPaste || /\bteams?\b|team ?build|rental|team report|core\b|archetype/.test(t)) return 'team';
  if (/world(s| championship)|regional|international|\bnaic\b|\beuic\b|\blaic\b|\bocic\b|special (event|championship)|grand final|top cut|top 8|championship/.test(t)) return 'event';
  if (/guide|tips?\b|how to|improve|get better|better at|mistakes?|beginner|learn|explain|analy[sz]|coach|lesson|mechanic|speed tier|damage|understand|why |should you|tier list/.test(t)) return 'learn';
  return 'battle';
}

(async () => {
  let old = null; try { old = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { old = null; }
  const oldVids = new Map(((old && old.videos) || []).map(v => [v.id, v]));
  const channels = []; const fresh = [];
  for (const c of CHANNELS) {
    const id = await channelId(c, old);
    if (!id) { console.log(`  ${c.name}: channel not found`); continue; }
    channels.push({ id, name: c.name, style: c.style, url: `https://www.youtube.com/channel/${id}` });
    const xml = await get(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`);
    if (!xml) { console.log(`  ${c.name}: feed not available`); continue; }
    let n = 0;
    for (const entry of xml.split('<entry>').slice(1)) {
      const vid = tag(entry, 'yt:videoId'); const title = tag(entry, 'title'); if (!vid || !title) continue;
      if (c.only && !c.only.test(title)) continue;
      if (/#shorts/i.test(title) || OFF_TOPIC.test(title)) continue;
      const desc = tag(entry, 'media:description');
      const views = +((entry.match(/<media:statistics views="(\d+)"/) || [])[1] || 0);
      const date = tag(entry, 'published').slice(0, 10);
      const prev = oldVids.get(vid);
      const paste = (desc.match(/https?:\/\/pokepast\.es\/([0-9a-f]{8,})/i) || [])[1] || null;
      fresh.push({ id: vid, ch: id, title, date, views, desc: desc.slice(0, 400), paste, team: prev && prev.team, kind: null });
      n++;
    }
    console.log(`  ${c.name}: ${n} videos in the feed`);
  }
  if (!fresh.length && old) { console.log('No feeds could be read; keeping the old file.'); return; }

  // team text for videos that link a PokéPaste (saved once)
  for (const v of fresh) {
    if (!v.paste || v.team) continue;
    const raw = await get(`https://pokepast.es/${v.paste}/raw`);
    if (raw && /\n\s*-\s+\S/.test(raw)) v.team = raw.replace(/\r/g, '').trim().slice(0, 4000);
  }
  const byId = new Map();
  for (const v of [...oldVids.values(), ...fresh]) byId.set(v.id, { ...byId.get(v.id), ...v });
  const keepCh = new Set(channels.map(c => c.id));
  const now = Date.now();
  let videos = [...byId.values()].filter(v => keepCh.has(v.ch) && (now - new Date(v.date).getTime()) / 864e5 <= KEEP_DAYS);
  for (const v of videos) { v.kind = kind(v.title, !!v.team); if (!v.team) delete v.team; if (!v.paste) delete v.paste; }
  videos.sort((a, b) => b.date.localeCompare(a.date));
  const per = {}; videos = videos.filter(v => (per[v.ch] = (per[v.ch] || 0) + 1) <= KEEP_PER_CHANNEL);

  const result = { v: 1, generated: new Date().toISOString(), channels, videos };
  const comparable = (o) => JSON.stringify({ ...o, generated: null, videos: (o.videos || []).map(v => ({ ...v, views: null })) });
  if (old && comparable(old) === comparable(result)) { console.log('No new videos.'); return; }
  fs.writeFileSync(OUT, JSON.stringify(result));
  const count = (k) => videos.filter(v => v.kind === k).length;
  console.log(`Wrote ${OUT}: ${videos.length} videos (${count('team')} team, ${count('learn')} learning, ${count('event')} tournament, ${count('battle')} battles), ${videos.filter(v => v.team).length} with a team to open`);
})();
