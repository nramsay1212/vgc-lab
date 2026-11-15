/* Word-by-word search over a name and a description, for lists like items and
 * abilities. "rock 1.2" finds Hard Stone ("Holder's Rock-type attacks have 1.2×
 * power"): every word has to appear somewhere, in any order. It also reads
 * 1.2x as 1.2×, ignores plurals and filler words, and treats boost, raise,
 * increase and stronger as power. If nothing matches every word, the closest
 * matches (all but one word) are shown instead. */
(function () {
  'use strict';
  const VL = (window.VL = window.VL || {});

  const FILLER = new Set(['the', 'a', 'an', 'that', 'which', 'what', 'item', 'items', 'ability', 'abilities', 'by', 'of', 'to', 'for', 'and', 'with', 'is', 'it', 'its', 'my', 'pokemon', 'pokémon', 'holder', 'holders', 'move', 'moves']);
  const SAME = [
    ['power', 'boost', 'boosts', 'raise', 'raises', 'increase', 'increases', 'stronger', 'strengthen', 'strengthens', 'powers', 'multiplier'],
    ['attack', 'attacks', 'damage', 'hit', 'hits'],
    ['heal', 'heals', 'restore', 'restores', 'recover', 'recovers', 'hp'],
    ['speed', 'faster', 'fast'],
    ['lower', 'lowers', 'reduce', 'reduces', 'weaken', 'weakens', 'less'],
    ['crit', 'critical'],
    ['super', 'supereffective'],
  ];
  const group = {}; SAME.forEach((g, i) => g.forEach(w => { group[w] = i; }));

  const norm = (s) => String(s || '').toLowerCase().replace(/[×✕]/g, 'x').replace(/[‘’']/g, '').replace(/-/g, ' ');
  // 1.2x → 1.2, attacks → attack
  const stem = (w) => { w = w.replace(/^(\d+(\.\d+)?)x$/, '$1'); if (w.length > 4 && w.endsWith('es') && !w.endsWith('ses')) return w.slice(0, -1); if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1); return w; };
  function words(q) {
    return norm(q).split(/[^a-z0-9.]+/).map(w => w.replace(/^\.+|\.+$/g, '')).filter(w => w && !FILLER.has(w));
  }
  // does one query word appear in the text (or a word that means the same)?
  function hit(w, text) {
    const s = stem(w);
    if (text.includes(s)) return true;
    const gi = group[w] ?? group[s];
    if (gi === undefined) return false;
    return SAME[gi].some(x => text.includes(stem(x)));
  }
  // list: array of anything; get(x) → [name, description]. Returns the matches, best first.
  VL.searchText = function (query, list, get) {
    const ws = words(query);
    if (!ws.length) return list.slice();
    const scored = list.map(x => {
      const [name, desc] = get(x); const n = norm(name), t = n + ' ' + norm(desc);
      const hits = ws.filter(w => hit(w, t)).length;
      const inName = ws.filter(w => n.includes(stem(w))).length;
      return { x, hits, inName };
    });
    const all = scored.filter(r => r.hits === ws.length);
    const pool = all.length || ws.length < 2 ? all : scored.filter(r => r.hits >= ws.length - 1);
    return pool.sort((a, b) => b.hits - a.hits || b.inName - a.inName).map(r => r.x);
  };
})();
