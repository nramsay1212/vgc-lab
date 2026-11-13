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

  // ---------- state ----------
  const A = (VL.account = { user: null, enabled: false, resolved: false, status: 'off', message: '' });
  const nameOf = (u) => (u && u.email ? u.email.split('@')[0] : '');
  function setStatus(status, message) {
    A.status = status; A.message = message;
    for (const id of ['syncdot', 'syncdot2']) { const el = $(id); if (!el) continue; el.className = 'syncdot ' + (status === 'ok' ? 'ok' : status === 'err' ? 'err' : status === 'busy' ? 'busy' : ''); el.textContent = message; }
    renderCard();
  }
  function friendly(e) {
    const code = String((e && e.code) || e && e.message || e);
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
    A.user = user;
    hideGate();
    await syncNow();
  }

  // ---------- sign-in screen ----------
  let mode = 'in';
  function showGate(m) {
    mode = m || mode;
    $('auth').hidden = false;
    document.querySelectorAll('[data-authmode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.authmode === mode)));
    $('auth-confirm-wrap').hidden = mode !== 'up';
    $('auth-go').textContent = mode === 'up' ? 'Create account' : 'Sign in';
    $('auth-note').innerHTML = mode === 'up'
      ? 'Usernames use letters, numbers and underscores. <b>Write your password down</b>: there\'s no email on the account, so a forgotten password can\'t be reset.'
      : 'Sign in to load your data on this device.';
    $('auth-err').textContent = '';
    setTimeout(() => $('auth-user').focus(), 30);
  }
  function hideGate() { $('auth').hidden = true; }
  A.showGate = showGate;
  document.querySelectorAll('[data-authmode]').forEach(b => b.onclick = () => showGate(b.dataset.authmode));
  $('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = $('auth-user').value.trim().toLowerCase(); const pw = $('auth-pass').value;
    if (!/^[a-z0-9_]{3,20}$/.test(user)) { $('auth-err').textContent = 'Usernames are 3 to 20 letters, numbers or underscores.'; return; }
    if (pw.length < 6) { $('auth-err').textContent = 'Use a password with at least 6 characters.'; return; }
    if (mode === 'up' && pw !== $('auth-confirm').value) { $('auth-err').textContent = 'The passwords don\'t match.'; return; }
    $('auth-go').disabled = true; $('auth-err').textContent = '';
    try {
      const be = await backend(); if (!be) throw new Error('unavailable');
      const u = mode === 'up' ? await be.signUp(`${user}@${DOMAIN}`, pw) : await be.signIn(`${user}@${DOMAIN}`, pw);
      ls.del(NOACCT);
      $('auth-pass').value = ''; $('auth-confirm').value = '';
      await adopt(u);
      VL.toast && VL.toast(mode === 'up' ? `Welcome, ${user}` : `Signed in as ${user}`);
    } catch (err) { $('auth-err').textContent = friendly(err); }
    finally { $('auth-go').disabled = false; }
  });
  $('auth-skip').onclick = () => { ls.set(NOACCT, '1'); if (!ls.get(OWNER)) ls.set(OWNER, 'local'); hideGate(); };

  // ---------- settings card ----------
  function renderCard() {
    const el = $('acct-body'); if (!el) return;
    if (!A.enabled) { el.innerHTML = '<p class="sub">Accounts aren\'t switched on yet. Your data saves on this device in the meantime.</p>'; return; }
    if (!A.user) {
      el.innerHTML = `<p class="sub">You're using the app without an account, so your data is only on this device. Sign in or create an account to keep it safe and use it on your phone and computer.</p>
        <div class="row"><button class="btn" data-acct="in">Sign in</button><button class="btn ghost" data-acct="up">Create account</button></div>`;
      return;
    }
    el.innerHTML = `<div class="kv" style="justify-content:space-between"><div><div class="sub">Signed in as</div><div style="font-size:18px;font-weight:600">${esc(nameOf(A.user))}</div></div><span class="syncdot ${A.status === 'ok' ? 'ok' : A.status === 'err' ? 'err' : A.status === 'busy' ? 'busy' : ''}">${esc(A.message)}</span></div>
      <div class="row"><button class="btn ghost" data-acct="sync">Sync now</button><button class="btn ghost" data-acct="pw">Change password</button><button class="btn ghost" data-acct="out">Sign out</button></div>
      <div id="acct-pw" hidden class="row"><label for="pw-old">Current password<input type="password" id="pw-old" autocomplete="current-password"></label><label for="pw-new">New password<input type="password" id="pw-new" autocomplete="new-password"></label><button class="btn small" data-acct="pwsave" style="height:36px">Save</button></div>
      <p class="sub">Signing out removes your data from this device. It stays safe in your account.</p>`;
  }
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-acct]'); if (!b) return;
    const k = b.dataset.acct;
    if (k === 'in' || k === 'up') showGate(k);
    if (k === 'sync') syncNow();
    if (k === 'pw') { $('acct-pw').hidden = !$('acct-pw').hidden; }
    if (k === 'pwsave') {
      const np = $('pw-new').value; if (np.length < 6) { VL.toast('Use at least 6 characters'); return; }
      try { const be = await backend(); await be.changePassword($('pw-old').value, np); VL.toast('Password changed'); $('acct-pw').hidden = true; }
      catch (err) { VL.toast(friendly(err)); }
    }
    if (k === 'out') {
      VL.armDelete(b, async () => {
        await syncNow().catch(() => {});
        const be = await backend(); await be.signOut();
        A.user = null; await VL.store.clearAll(); ls.set(OWNER, 'local');
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
