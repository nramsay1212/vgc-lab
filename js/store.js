/* VGC Lab storage: everything lives in one state object on this device
 * (IndexedDB, falling back to localStorage) and, optionally, in one private
 * GitHub gist so several devices share it. Every record carries `u`, its
 * last-change time; merging keeps the newer copy of each record, and deletes
 * are kept as tombstones so they sync too. */
(function () {
  'use strict';
  const VL = (window.VL = window.VL || {});
  const COLLS = ['meta', 'games', 'matchups', 'teams', 'days', 'reports', 'drills', 'recaps', 'playbook', 'events', 'opponents', 'predictions', 'arcade'];
  const empty = () => Object.fromEntries([['v', 1], ...COLLS.map(c => [c, {}])]);
  let state = empty();
  const listeners = new Set();

  // ---------- persistence on this device ----------
  const DB_NAME = 'vgclab', STORE = 'kv', KEY = 'state', LS_KEY = 'vgclab-state';
  function idb() {
    return new Promise((res, rej) => {
      if (!('indexedDB' in window)) return rej(new Error('no idb'));
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function loadLocal() {
    try {
      const db = await idb();
      const v = await new Promise((res, rej) => { const t = db.transaction(STORE).objectStore(STORE).get(KEY); t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error); });
      if (v) return v;
    } catch (e) { /* fall through */ }
    try { const raw = localStorage.getItem(LS_KEY); if (raw) return JSON.parse(raw); } catch (e) { /* ignore */ }
    return null;
  }
  let saveTimer = null;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveLocal, 250);
  }
  async function saveLocal() {
    const snapshot = JSON.parse(JSON.stringify(state));
    try {
      const db = await idb();
      await new Promise((res, rej) => { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(snapshot, KEY); t.oncomplete = res; t.onerror = () => rej(t.error); });
      return;
    } catch (e) { /* fall back */ }
    try { localStorage.setItem(LS_KEY, JSON.stringify(snapshot)); } catch (e) { VL.toast && VL.toast('Could not save on this device. Download a backup.'); }
  }
  function normalize(s) {
    const out = empty();
    if (!s || typeof s !== 'object') return out;
    for (const c of COLLS) if (s[c] && typeof s[c] === 'object') out[c] = s[c];
    return out;
  }
  function merge(a, b) {
    const out = empty(); let changed = false;
    for (const c of COLLS) {
      const A = a[c] || {}, B = b[c] || {};
      const ids = new Set([...Object.keys(A), ...Object.keys(B)]);
      for (const id of ids) {
        const x = A[id], y = B[id];
        const pick = !x ? y : !y ? x : ((y.u || 0) > (x.u || 0) ? y : x);
        out[c][id] = pick;
        if (pick !== x) changed = true;
      }
    }
    return { state: out, changed };
  }
  function emit(fromSync) { for (const fn of listeners) { try { fn(fromSync); } catch (e) { console.error(e); } } }

  const store = {
    ready: null,
    onChange(fn) { listeners.add(fn); },
    list(c) { return Object.entries(state[c] || {}).filter(([, r]) => r && !r.del).map(([id, r]) => ({ id, ...r })); },
    get(c, id) { const r = state[c] && state[c][id]; return r && !r.del ? { id, ...r } : null; },
    put(c, id, body) {
      const rec = { ...body, u: Date.now() }; delete rec.id;
      state[c][id] = rec; scheduleSave(); emit(false); sync.soon();
    },
    del(c, id) { state[c][id] = { del: true, u: Date.now() }; scheduleSave(); emit(false); sync.soon(); },
    exportJSON() { return JSON.stringify(state, null, 1); },
    importJSON(obj) {
      const m = merge(state, normalize(obj)); state = m.state; scheduleSave(); emit(true); sync.soon();
    },
  };
  store.ready = loadLocal().then(s => { state = normalize(s); emit(true); });
  VL.store = store;
  VL.newId = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // ---------- sync through a private gist ----------
  const TOKEN_KEY = 'vgclab-token', GIST_KEY = 'vgclab-gist', FILE = 'vgc-lab.json', DESC = 'VGC Lab data (do not edit)';
  const API = 'https://api.github.com';
  const sync = {
    status: 'off', message: '', last: null, running: false, again: false, timer: null,
    token() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } },
    setToken(t) { try { if (t) localStorage.setItem(TOKEN_KEY, t); else { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(GIST_KEY); } } catch (e) { /* ignore */ } },
    set(status, message) { this.status = status; this.message = message; VL.onSync && VL.onSync(status, message); },
    soon() { if (!this.token()) return; clearTimeout(this.timer); this.timer = setTimeout(() => this.run(), 4000); },
    async api(path, opts = {}) {
      const r = await fetch(API + path, { ...opts, headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + this.token(), 'X-GitHub-Api-Version': '2022-11-28', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) } });
      if (r.status === 401) throw new Error('GitHub rejected the token. Make a new one with Gists set to Read and write.');
      if (r.status === 403 || r.status === 404) throw new Error('The token can\'t reach gists. Check that Gists is set to Read and write.');
      if (!r.ok) throw new Error('GitHub answered ' + r.status + '. Try again in a minute.');
      return r.json();
    },
    async findGist() {
      let id = ''; try { id = localStorage.getItem(GIST_KEY) || ''; } catch (e) { /* ignore */ }
      if (id) return id;
      for (let page = 1; page <= 5; page++) {
        const list = await this.api('/gists?per_page=100&page=' + page);
        const hit = list.find(g => g.description === DESC && g.files && g.files[FILE]);
        if (hit) { id = hit.id; break; }
        if (list.length < 100) break;
      }
      if (id) try { localStorage.setItem(GIST_KEY, id); } catch (e) { /* ignore */ }
      return id;
    },
    async run() {
      if (!this.token()) { this.set('off', 'Not set up'); return; }
      if (!navigator.onLine) { this.set('err', 'Offline. Will sync when you\'re back online.'); return; }
      if (this.running) { this.again = true; return; }
      this.running = true; this.set('busy', 'Syncing…');
      try {
        await store.ready;
        let id = await this.findGist();
        if (!id) {
          const g = await this.api('/gists', { method: 'POST', body: JSON.stringify({ description: DESC, public: false, files: { [FILE]: { content: JSON.stringify(state) } } }) });
          id = g.id; try { localStorage.setItem(GIST_KEY, id); } catch (e) { /* ignore */ }
        } else {
          const g = await this.api('/gists/' + id);
          const f = g.files && g.files[FILE];
          let remote = null;
          if (f) {
            let text = f.content;
            if (f.truncated && f.raw_url) text = await (await fetch(f.raw_url)).text();
            try { remote = JSON.parse(text); } catch (e) { remote = null; }
          }
          const m = merge(state, normalize(remote));
          const before = JSON.stringify(state);
          state = m.state;
          if (JSON.stringify(state) !== before) { scheduleSave(); emit(true); }
          const merged = JSON.stringify(state);
          if (!remote || merged !== JSON.stringify(normalize(remote))) {
            await this.api('/gists/' + id, { method: 'PATCH', body: JSON.stringify({ files: { [FILE]: { content: merged } } }) });
          }
        }
        this.last = new Date();
        this.set('ok', 'Synced ' + this.last.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
      } catch (e) {
        if (String(e.message || '').includes('gist') || String(e.message).includes('token')) { try { localStorage.removeItem(GIST_KEY); } catch (x) { /* ignore */ } }
        this.set('err', e.message || 'Sync failed. Your data is still saved on this device.');
      } finally {
        this.running = false;
        if (this.again) { this.again = false; this.soon(); }
      }
    },
  };
  VL.sync = sync;
  window.addEventListener('online', () => sync.soon());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync.soon(); });
  setInterval(() => { if (document.visibilityState === 'visible') sync.run(); }, 5 * 60 * 1000);
})();
