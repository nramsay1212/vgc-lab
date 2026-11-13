/* Accounts: a username and password unlock your data on any device.
 * Backed by Firebase Authentication and Firestore (free tier). A username is
 * stored as <username>@vgclab.example.com behind the scenes, so no email is
 * needed. Each record is its own document under users/<uid>/records, and
 * sync only moves what changed since the last sync.
 * Config lives in js/firebase-config.js; with no config, accounts stay off. */
(function () {
  'use strict';
  const VL = (window.VL = window.VL || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DOMAIN = 'vgclab.example.com';
  const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
  const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }, del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } } };
  const OWNER = 'vgclab-owner', NOACCT = 'vgclab-noacct';
  const docId = (c, i) => `${c}~${String(i).replace(/\//g, '%2F')}`;

  // ---------- backend: Firebase, or a fake one injected for testing ----------
  let bePromise = null;
  function backend() {
    if (bePromise) return bePromise;
    if (window.VL_FAKE_BACKEND) return (bePromise = Promise.resolve(window.VL_FAKE_BACKEND));
    const cfg = window.VL_FIREBASE;
    if (!cfg || !cfg.apiKey) return (bePromise = Promise.resolve(null));
    bePromise = Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js')]).then(async ([app, auth, fs]) => {
      const a = app.initializeApp(cfg); const au = auth.getAuth(a); const db = fs.getFirestore(a);
      try { await auth.setPersistence(au, auth.browserLocalPersistence); } catch (e) { /* default persistence */ }
      return {
        signUp: (email, pw) => auth.createUserWithEmailAndPassword(au, email, pw).then(c => c.user),
        signIn: (email, pw) => auth.signInWithEmailAndPassword(au, email, pw).then(c => c.user),
        signOut: () => auth.signOut(au),
        onAuth: (cb) => auth.onAuthStateChanged(au, cb),
        changePassword: async (oldPw, newPw) => {
          const u = au.currentUser; const cred = auth.EmailAuthProvider.credential(u.email, oldPw);
          await auth.reauthenticateWithCredential(u, cred); await auth.updatePassword(u, newPw);
        },
        async pull(uid, since) {
          const q = fs.query(fs.collection(db, 'users', uid, 'records'), fs.where('s', '>', fs.Timestamp.fromMillis(Math.max(0, since))), fs.orderBy('s'));
          const snap = await fs.getDocs(q);
          return snap.docs.map(d => { const x = d.data(); let r = null; try { r = JSON.parse(x.d); } catch (e) { r = null; } return { c: x.c, i: x.i, r, s: x.s ? x.s.toMillis() : 0 }; }).filter(x => x.r);
        },
        async getRecovery(id) { const x = await fs.getDoc(fs.doc(db, 'recovery', id)); return x.exists() ? x.data() : null; },
        setRecovery: (id, d) => fs.setDoc(fs.doc(db, 'recovery', id), d),
        delRecovery: (id) => fs.deleteDoc(fs.doc(db, 'recovery', id)),
        async getPrivate(uid) { const x = await fs.getDoc(fs.doc(db, 'users', uid, 'private', 'recovery')); return x.exists() ? x.data() : null; },
        setPrivate: (uid, d) => fs.setDoc(fs.doc(db, 'users', uid, 'private', 'recovery'), d),
        async push(uid, list) {
          for (let k = 0; k < list.length; k += 400) {
            const b = fs.writeBatch(db);
            for (const { c, i, r } of list.slice(k, k + 400)) b.set(fs.doc(db, 'users', uid, 'records', docId(c, i)), { c, i, u: r.u || 0, d: JSON.stringify(r), s: fs.serverTimestamp() });
            await b.commit();
          }
        },
      };
    }).catch(() => null);
    return bePromise;
  }

  // ---------- recovery codes ----------
  // The code never leaves the device. A public doc, named by a hash of username+code,
  // holds the password encrypted with a random key, and that key encrypted with the code.
  // Without the code you can't find the doc or unlock it. The random key also sits in the
  // user's private area, so changing the password keeps the code working.
  const ALPH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const te = new TextEncoder(), td = new TextDecoder();
  const b64 = (u8) => btoa(String.fromCharCode(...new Uint8Array(u8)));
  const unb64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const rand = (n) => crypto.getRandomValues(new Uint8Array(n));
  function newCode() {
    let out = '';
    while (out.length < 12) for (const b of rand(16)) if (b < 248 && out.length < 12) out += ALPH[b % 31];
    return out.match(/.{4}/g).join('-');
  }
  const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  async function recId(user, code) {
    const h = await crypto.subtle.digest('SHA-256', te.encode(`vgclab-recovery|${user}|${normCode(code)}`));
    return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  async function codeKey(code, salt) {
    const base = await crypto.subtle.importKey('raw', te.encode(normCode(code)), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  const rawKey = (k) => crypto.subtle.importKey('raw', k, 'AES-GCM', false, ['encrypt', 'decrypt']);
  async function enc(key, bytes) { const iv = rand(12); return { iv: b64(iv), ct: b64(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes)) }; }
  const dec = async (key, iv, ct) => new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(ct)));
  const codeErr = () => { const e = new Error('bad-code'); e.code = 'bad-code'; return e; };

  async function makeRecovery(be, uid, user, pw) {
    const code = newCode(), K = rand(32), salt = rand(16);
    const w = await enc(await codeKey(code, salt), K);
    const p = await enc(await rawKey(K), te.encode(pw));
    const id = await recId(user, code);
    await be.setRecovery(id, { uid, v: 1, salt: b64(salt), wiv: w.iv, wk: w.ct, piv: p.iv, pct: p.ct });
    const old = await be.getPrivate(uid).catch(() => null);
    if (old && old.rid && old.rid !== id) await be.delRecovery(old.rid).catch(() => {});
    await be.setPrivate(uid, { k: b64(K), rid: id });
    A.hasRecovery = true;
    return code;
  }
  async function rewrapPassword(be, uid, pw, K, id) {
    if (!K) { const priv = await be.getPrivate(uid); if (!priv) return; K = unb64(priv.k); id = priv.rid; }
    const rec = await be.getRecovery(id); if (!rec) return;
    const p = await enc(await rawKey(K), te.encode(pw));
    await be.setRecovery(id, { ...rec, piv: p.iv, pct: p.ct });
  }
  async function recover(be, user, code, newPw) {
    const id = await recId(user, code);
    const rec = await be.getRecovery(id); if (!rec) throw codeErr();
    let K; try { K = await dec(await codeKey(code, unb64(rec.salt)), rec.wiv, rec.wk); } catch (e) { throw codeErr(); }
    const oldPw = td.decode(await dec(await rawKey(K), rec.piv, rec.pct));
    let u; try { u = await be.signIn(`${user}@${DOMAIN}`, oldPw); } catch (e) { const x = new Error('stale-recovery'); x.code = 'stale-recovery'; throw x; }
    await be.changePassword(oldPw, newPw);
    await rewrapPassword(be, u.uid, newPw, K, id).catch(() => {});
    return u;
  }

  // ---------- state ----------
  const A = (VL.account = { user: null, enabled: false, resolved: false, status: 'off', message: '', hasRecovery: null });
  const nameOf = (u) => (u && u.email ? u.email.split('@')[0] : '');
  function setStatus(status, message) {
    A.status = status; A.message = message;
    for (const id of ['syncdot', 'syncdot2']) { const el = $(id); if (!el) continue; el.className = 'syncdot ' + (status === 'ok' ? 'ok' : status === 'err' ? 'err' : status === 'busy' ? 'busy' : ''); el.textContent = message; }
    const el = $('acct-body'), st = $('acct-status');
    if (el && st && el.dataset.who === who()) { st.className = 'syncdot ' + (status === 'ok' ? 'ok' : status === 'err' ? 'err' : status === 'busy' ? 'busy' : ''); st.textContent = message; }
    else renderCard();
  }
  function friendly(e) {
    const code = String((e && e.code) || e && e.message || e);
    if (/bad-code/.test(code)) return 'That username and recovery code don\'t match. Check for typos.';
    if (/stale-recovery/.test(code)) return 'That recovery code is out of date. If you made a newer code, use that one.';
    if (/email-already-in-use/.test(code)) return 'That username is taken. Pick another, or sign in if it\'s yours.';
    if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(code)) return 'Wrong username or password.';
    if (/weak-password/.test(code)) return 'Use a password with at least 6 characters.';
    if (/too-many-requests/.test(code)) return 'Too many tries. Wait a few minutes and try again.';
    if (/network|unavailable|offline|Failed to fetch/i.test(code)) return 'Couldn\'t reach the server. Check your connection.';
    if (/permission/.test(code)) return 'The server refused access. The Firestore rules may not be set up yet.';
    return 'Something went wrong. Try again.';
  }

  // ---------- sync ----------
  let running = false, again = false, timer = null;
  A.soon = function () { if (!A.user) return; clearTimeout(timer); timer = setTimeout(syncNow, 3000); };
  async function syncNow() {
    if (!A.user) return;
    if (running) { again = true; return; }
    running = true; setStatus('busy', 'Syncing…');
    try {
      const be = await backend(); const uid = A.user.uid;
      const pk = 'vgclab-acct-pull-' + uid, sk = 'vgclab-acct-push-' + uid;
      // pull with a one-minute overlap so writes that commit out of order aren't missed
      const since = +(ls.get(pk) || 0);
      const got = await be.pull(uid, since ? since - 60000 : 0);
      if (got.length) { VL.store.mergeRecords(got); ls.set(pk, got.reduce((m, g) => Math.max(m, g.s || 0), since)); }
      const pushedU = +(ls.get(sk) || 0);
      const out = VL.store.changedSince(pushedU);
      if (out.length) { await be.push(uid, out); ls.set(sk, out.reduce((m, o) => Math.max(m, o.r.u || 0), pushedU)); }
      setStatus('ok', `${nameOf(A.user)} · synced ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
    } catch (e) {
      setStatus('err', friendly(e));
    } finally {
      running = false;
      if (again) { again = false; A.soon(); }
    }
  }
  A.syncNow = syncNow;

  // a different account's data must never mix with this one's on a shared device
  let adopting = null;
  async function adopt(user) {
    if (adopting === user.uid || (A.user && A.user.uid === user.uid)) return;
    adopting = user.uid;
    try { await adoptInner(user); } finally { adopting = null; }
  }
  async function adoptInner(user) {
    await VL.store.ready;
    const owner = ls.get(OWNER);
    if (owner && owner !== 'local' && owner !== user.uid) {
      await VL.store.clearAll();
      ls.del('vgclab-acct-pull-' + user.uid); ls.del('vgclab-acct-push-' + user.uid);
    } else if ((!owner || owner === 'local') && VL.store.count()) {
      // data made before signing in on this device joins the account
      ls.del('vgclab-acct-push-' + user.uid);
      VL.toast && VL.toast('Added this device\'s data to your account');
    }
    ls.set(OWNER, user.uid);
    A.user = user; A.hasRecovery = null;
    hideGate();
    await syncNow();
    backend().then(be => be.getPrivate(user.uid)).then(p => { if (A.user && A.user.uid === user.uid) { A.hasRecovery = !!p; renderCard(); } }).catch(() => {});
  }

  // ---------- sign-in screen ----------
  let mode = 'in', codePending = false;
  function showGate(m) {
    mode = m || mode;
    $('auth').hidden = false;
    const form = mode !== 'code';
    $('auth-form').hidden = !form; $('auth-code-view').hidden = form;
    document.querySelector('.authbox .seg').hidden = !form;
    $('auth-skip').hidden = !form;
    document.querySelectorAll('[data-authmode]').forEach(b => { const on = b.dataset.authmode === mode; b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-checked', String(on)); });
    $('auth-confirm-wrap').hidden = !(mode === 'up' || mode === 'reset');
    $('auth-rcode-wrap').hidden = mode !== 'reset';
    $('auth-pass-label').textContent = mode === 'reset' ? 'New password' : 'Password';
    $('auth-pass').autocomplete = mode === 'in' ? 'current-password' : 'new-password';
    $('auth-go').textContent = mode === 'up' ? 'Create account' : mode === 'reset' ? 'Reset password' : 'Sign in';
    $('auth-forgot').hidden = mode === 'up';
    $('auth-forgot').textContent = mode === 'reset' ? 'Back to sign in' : 'Forgot password?';
    $('auth-note').innerHTML = mode === 'up'
      ? 'Usernames use letters, numbers and underscores. After you sign up you\'ll get a <b>recovery code</b>: it\'s the only way to reset a forgotten password, so keep it somewhere safe.'
      : mode === 'reset' ? 'Enter your username, the recovery code you saved when you made the account, and a new password.'
      : 'Sign in to load your data on this device.';
    $('auth-err').textContent = '';
    if (form) setTimeout(() => $('auth-user').focus(), 30);
  }
  function showCode(code) {
    codePending = true;
    $('auth-code').textContent = code;
    showGate('code');
    $('auth-code-done').focus();
  }
  function hideGate() { if (!codePending) $('auth').hidden = true; }
  A.showGate = showGate;
  document.querySelectorAll('[data-authmode]').forEach(b => b.onclick = () => showGate(b.dataset.authmode));
  $('auth-forgot').onclick = () => showGate(mode === 'reset' ? 'in' : 'reset');
  $('auth-code-copy').onclick = async () => {
    try { await navigator.clipboard.writeText($('auth-code').textContent); VL.toast && VL.toast('Code copied'); }
    catch (e) { VL.toast && VL.toast('Copy didn\'t work. Select the code and copy it by hand.'); }
  };
  $('auth-code-done').onclick = () => { codePending = false; $('auth-code').textContent = ''; hideGate(); renderCard(); };
  $('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = $('auth-user').value.trim().toLowerCase(); const pw = $('auth-pass').value;
    const err = (t) => { $('auth-err').textContent = t; };
    if (!/^[a-z0-9_]{3,20}$/.test(user)) return err('Usernames are 3 to 20 letters, numbers or underscores.');
    if (mode === 'reset' && normCode($('auth-rcode').value).length !== 12) return err('Recovery codes are 12 letters and numbers, like ABCD-EFGH-JKMN.');
    if (pw.length < 6) return err('Use a password with at least 6 characters.');
    if ((mode === 'up' || mode === 'reset') && pw !== $('auth-confirm').value) return err('The passwords don\'t match.');
    const m = mode;
    $('auth-go').disabled = true; err('');
    try {
      const be = await backend(); if (!be) throw new Error('unavailable');
      let u, code = null;
      if (m === 'up') {
        u = await be.signUp(`${user}@${DOMAIN}`, pw);
        codePending = true;
        try { code = await makeRecovery(be, u.uid, user, pw); } catch (x) { codePending = false; }
      } else if (m === 'reset') {
        u = await recover(be, user, $('auth-rcode').value, pw);
      } else {
        u = await be.signIn(`${user}@${DOMAIN}`, pw);
      }
      ls.del(NOACCT);
      $('auth-pass').value = ''; $('auth-confirm').value = ''; $('auth-rcode').value = '';
      await adopt(u);
      if (code) { showCode(code); VL.toast && VL.toast(`Welcome, ${user}`); }
      else {
        hideGate();
        if (VL.toast) VL.toast(m === 'up' ? 'Account made, but the recovery code couldn\'t be saved. Set one up in Account settings.' : m === 'reset' ? 'Password reset. You\'re signed in.' : `Signed in as ${user}`);
      }
    } catch (x) { codePending = false; err(friendly(x)); }
    finally { $('auth-go').disabled = false; }
  });
  $('auth-skip').onclick = () => { ls.set(NOACCT, '1'); if (!ls.get(OWNER)) ls.set(OWNER, 'local'); hideGate(); };

  // ---------- settings card ----------
  const who = () => (A.enabled ? (A.user ? A.user.uid : '-') : 'off') + '|' + A.hasRecovery;
  function renderCard() {
    const el = $('acct-body'); if (!el) return;
    el.dataset.who = who();
    if (!A.enabled) { el.innerHTML = '<p class="sub">Accounts aren\'t switched on yet. Your data saves on this device in the meantime.</p>'; return; }
    if (!A.user) {
      el.innerHTML = `<p class="sub">You're using the app without an account, so your data is only on this device. Sign in or create an account to keep it safe and use it on your phone and computer.</p>
        <div class="row"><button class="btn" data-acct="in">Sign in</button><button class="btn ghost" data-acct="up">Create account</button></div>`;
      return;
    }
    const rc = A.hasRecovery === null ? '<span class="sub">Checking your recovery code…</span>'
      : A.hasRecovery ? '<span class="sub">Recovery code: <b style="color:var(--win)">set up</b>. Lost it? Make a new one and the old one stops working.</span>'
      : '<span class="sub">Recovery code: <b style="color:var(--loss)">not set up</b>. Without one, a forgotten password can\'t be reset.</span>';
    el.innerHTML = `<div class="kv" style="justify-content:space-between"><div><div class="sub">Signed in as</div><div style="font-size:18px;font-weight:600">${esc(nameOf(A.user))}</div></div><span id="acct-status" class="syncdot ${A.status === 'ok' ? 'ok' : A.status === 'err' ? 'err' : A.status === 'busy' ? 'busy' : ''}">${esc(A.message)}</span></div>
      <div class="row"><button class="btn ghost" data-acct="sync">Sync now</button><button class="btn ghost" data-acct="pw">Change password</button><button class="btn ghost" data-acct="out">Sign out</button></div>
      <div id="acct-pw" hidden class="row"><label for="pw-old">Current password<input type="password" id="pw-old" autocomplete="current-password"></label><label for="pw-new">New password<input type="password" id="pw-new" autocomplete="new-password"></label><button class="btn small" data-acct="pwsave" style="height:36px">Save</button></div>
      <div class="row" style="align-items:center;justify-content:space-between">${rc}${A.hasRecovery === null ? '' : `<button class="btn ghost" data-acct="rc">${A.hasRecovery ? 'Make a new recovery code' : 'Set up a recovery code'}</button>`}</div>
      <div id="acct-rc" hidden class="row"><label for="rc-pw">Your password<input type="password" id="rc-pw" autocomplete="current-password"></label><button class="btn small" data-acct="rcsave" style="height:36px">Make code</button></div>
      <p class="sub">Signing out removes your data from this device. It stays safe in your account.</p>`;
  }
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-acct]'); if (!b) return;
    const k = b.dataset.acct;
    if (k === 'in' || k === 'up') showGate(k);
    if (k === 'sync') syncNow();
    if (k === 'pw') { $('acct-pw').hidden = !$('acct-pw').hidden; }
    if (k === 'rc') { $('acct-rc').hidden = !$('acct-rc').hidden; if (!$('acct-rc').hidden) $('rc-pw').focus(); }
    if (k === 'pwsave') {
      const np = $('pw-new').value; if (np.length < 6) { VL.toast('Use at least 6 characters'); return; }
      try {
        const be = await backend(); await be.changePassword($('pw-old').value, np);
        await rewrapPassword(be, A.user.uid, np).catch(() => {});
        VL.toast('Password changed'); $('acct-pw').hidden = true; $('pw-old').value = ''; $('pw-new').value = '';
      } catch (err) { VL.toast(friendly(err)); }
    }
    if (k === 'rcsave') {
      const pw = $('rc-pw').value; if (!pw) { VL.toast('Enter your password'); return; }
      b.disabled = true;
      try {
        const be = await backend();
        await be.signIn(A.user.email, pw); // proves the password is right before it's stored
        const code = await makeRecovery(be, A.user.uid, nameOf(A.user), pw);
        $('rc-pw').value = ''; renderCard(); showCode(code);
      } catch (err) { VL.toast(friendly(err)); }
      finally { b.disabled = false; }
    }
    if (k === 'out') {
      VL.armDelete(b, async () => {
        await syncNow().catch(() => {});
        const be = await backend(); await be.signOut();
        A.user = null; A.hasRecovery = null; await VL.store.clearAll(); ls.set(OWNER, 'local');
        setStatus('off', 'Not signed in'); showGate('in');
      });
    }
  });

  // ---------- start ----------
  backend().then(be => {
    A.enabled = !!be;
    if (!be) { A.resolved = true; renderCard(); return; }
    let first = true;
    be.onAuth(async (u) => {
      A.resolved = true;
      if (u) await adopt(u);
      else {
        A.user = null; setStatus('off', 'Not signed in');
        if (first && !ls.get(NOACCT)) showGate('in');
      }
      first = false; renderCard();
    });
  });
  setInterval(() => { if (A.user && document.visibilityState === 'visible') syncNow(); }, 3 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') A.soon(); });
  window.addEventListener('online', () => A.soon());
})();
