/* Test: an exam over the Study material. Mixed categories, no feedback
 * until the end, then a grade, a breakdown by category, rating changes and
 * a review of every miss. */
(function () {
  'use strict';
  const VL = (window.VL = window.VL || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const strip = (h) => { const d = document.createElement('div'); d.innerHTML = String(h).replace(/<\/div>/g, '</div> · '); return d.textContent.replace(/(\s·\s*)+$/, '').replace(/\s+/g, ' ').trim(); };

  const KIND_AREA = { typebasic: 'types', typemon: 'types', weakness: 'types', basespeed: 'speed', whofirst: 'speed', priority: 'order', items: 'items', abilities: 'items', mechanics: 'mechanics', commonsets: 'meta' };
  const KIND_DIFF = { typebasic: 900, typemon: 1100, weakness: 1000, basespeed: 1200, whofirst: 1300, priority: 1150, items: 1100, abilities: 1200, mechanics: 1250, commonsets: 1250 };
  const AREA_KINDS = {}; for (const [k, a] of Object.entries(KIND_AREA)) (AREA_KINDS[a] ||= []).push(k);
  const kindName = (k) => (VL.study.DRILLS.find(d => d.id === k) || { name: k }).name;
  const areaName = (a) => (VL.progress.AREAS.find(x => x.id === a) || { n: a }).n;

  let T = null; let clock = null;

  function ctx() { return VL.study.ctxFor($('te-format').value, $('te-pool').value); }
  function build(plan, label) {
    const c = ctx(); const used = new Set(); const qs = [];
    for (const [kind, count] of plan) {
      if (!VL.study.hasQuestions(kind, c)) continue;
      for (let i = 0; i < count; i++) { const q = VL.study.randomQuestion(kind, c, used); if (!q) break; used.add(kind + ':' + q.key); qs.push({ kind, q }); }
    }
    if (!qs.length) { VL.toast('No questions available for this format and pool'); return; }
    T = { label, fmt: c.fmt, items: shuffle(qs), i: 0, answers: [], t0: Date.now() };
    $('te-setup').hidden = true; $('te-run').hidden = false;
    clearInterval(clock); clock = setInterval(tick, 1000);
    renderQ();
    $('te-run').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  const kindsAvailable = () => { const c = ctx(); return Object.keys(KIND_AREA).filter(k => VL.study.hasQuestions(k, c)); };
  function startFull() { build(kindsAvailable().map(k => [k, 4]), 'Full test'); }
  function startQuick() { build(kindsAvailable().map(k => [k, 2]), 'Quick test'); }
  function startArea(area) {
    const ks = (AREA_KINDS[area] || []).filter(k => kindsAvailable().includes(k));
    if (!ks.length) { VL.toast('No questions for that area in this format yet'); return; }
    const per = Math.ceil(15 / ks.length);
    build(ks.map(k => [k, per]), `${areaName(area)} test`);
  }
  function tick() { const el = $('te-clock'); if (el && T) { const s = Math.floor((Date.now() - T.t0) / 1000); el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; } }

  function renderQ() {
    const it = T.items[T.i]; const q = it.q; const n = T.items.length;
    $('te-run').innerHTML = `<div class="card-head"><h3>${esc(T.label)} <span class="sub">${esc(T.fmt.name)}</span></h3><div class="kv"><span class="pill m">Question ${T.i + 1} of ${n}</span><span class="pill n"><span id="te-clock">0:00</span></span><button class="linkbtn" id="te-end">End test</button></div></div>
      <div class="progress">${T.items.map((_, k) => `<span class="${k < T.i ? 'c' : ''}"></span>`).join('')}</div>
      <div class="quiz"><span class="mini">${esc(kindName(it.kind))}</span><div class="q">${q.q}</div>${q.ctx ? `<div class="ctx" style="${q.stack ? 'flex-direction:column;align-items:flex-start;gap:2px' : ''}">${q.ctx}</div>` : ''}
        <div class="opts ${q.six ? 'six' : ''}" style="${q.long ? 'grid-template-columns:1fr' : ''}">${q.opts.map((o, k) => `<button class="opt" data-teopt="${k}">${q.html ? o.label : esc(o.label)}</button>`).join('')}</div>
        <p class="sub">No feedback until the end, like a real test. Keys 1–${q.opts.length} answer on a computer.</p></div>`;
    tick();
    $('te-end').onclick = () => finish();
  }
  function answer(k) {
    if (!T || T.done) return;
    const it = T.items[T.i]; const o = it.q.opts[k]; if (!o) return;
    T.answers.push({ kind: it.kind, ok: !!o.ok, yours: k });
    T.i++;
    if (T.i >= T.items.length) finish(); else renderQ();
  }
  function finish() {
    clearInterval(clock);
    if (!T || T.done) return;
    T.done = true;
    const secs = Math.round((Date.now() - T.t0) / 1000);
    const n = T.answers.length; const correct = T.answers.filter(a => a.ok).length; const pct = n ? Math.round(100 * correct / n) : 0;
    const byKind = {}; T.answers.forEach(a => { (byKind[a.kind] ||= { n: 0, c: 0 }); byKind[a.kind].n++; if (a.ok) byKind[a.kind].c++; });
    const misses = T.answers.map((a, k) => ({ a, it: T.items[k] })).filter(x => !x.a.ok).map(({ a, it }) => {
      const right = it.q.opts.find(o => o.ok); const yours = it.q.opts[a.yours];
      return { q: it.q.q + (it.q.ctx && it.kind === 'whofirst' ? ' ' + esc(strip(it.q.ctx)) : ''), yours: esc(it.q.html ? strip(yours.label) : yours.label), right: esc(it.q.html ? strip(right.label) : right.label), ex: it.q.ex };
    });
    let changes = null;
    if (n) {
      VL.store.put('tests', VL.newId('t'), { ts: Date.now(), label: T.label, fmt: T.fmt.id, fmtName: T.fmt.name, n, correct, pct, secs, byKind, misses: misses.slice(0, 50) });
      changes = VL.progress.apply(T.answers.map(a => ({ a: KIND_AREA[a.kind], d: KIND_DIFF[a.kind] || 1150, s: a.ok ? 1 : 0 })), { src: 'test', label: T.label, points: correct * 10 });
      VL.markDone && VL.markDone('drill');
    }
    const g = VL.progress.grade(pct);
    const prev = VL.store.list('tests').filter(t => t.label === T.label && t.fmt === T.fmt.id).sort((a, b) => b.ts - a.ts)[1];
    $('te-run').innerHTML = `<div class="card-head"><h3>${esc(T.label)}: ${correct}/${n}</h3><span class="pill ${pct >= 80 ? 'w' : pct >= 60 ? 'n' : 'l'}" style="font-size:14px">Grade ${g} · ${pct}%</span></div>
      <div class="tiles"><div class="tile"><div class="k">Score</div><div class="v">${pct}%</div>${prev ? `<div class="mini">Last time: ${prev.pct}% (${pct - prev.pct >= 0 ? '+' : ''}${pct - prev.pct})</div>` : ''}</div><div class="tile"><div class="k">Grade</div><div class="v">${g}</div></div><div class="tile"><div class="k">Time</div><div class="v">${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}</div></div><div class="tile"><div class="k">Points</div><div class="v">${correct * 10}</div></div></div>
      <div><div class="section-label">By category</div><div class="bars">${Object.entries(byKind).sort((a, b) => a[1].c / a[1].n - b[1].c / b[1].n).map(([k, v]) => `<div class="bar"><span>${esc(kindName(k))}</span><span class="track"><span class="fill acc" style="display:block;width:${Math.round(100 * v.c / v.n)}%"></span></span><span class="n">${v.c}/${v.n}</span></div>`).join('')}</div></div>
      ${VL.progress.changesHtml(changes)}
      ${misses.length ? `<div><div class="section-label">Review your misses</div><div class="misses">${misses.map(m => `<div class="miss">${m.q}<br><span class="sub">You answered: ${m.yours} · Correct: <b>${m.right}</b></span><br><span class="sub">${m.ex}</span></div>`).join('')}</div></div>` : (n ? '<p>Perfect score.</p>' : '')}
      <div class="row"><button class="btn" id="te-again">Take it again</button><button class="btn ghost" id="te-back">Back to tests</button><a class="btn ghost" href="#progress">See progress</a></div>`;
    $('te-again').onclick = () => { const l = T.label; T = null; if (l === 'Full test') startFull(); else if (l === 'Quick test') startQuick(); else { const a = VL.progress.AREAS.find(x => `${x.n} test` === l); if (a) startArea(a.id); } };
    $('te-back').onclick = close;
  }
  function close() { clearInterval(clock); T = null; $('te-run').hidden = true; $('te-setup').hidden = false; render(); }

  $('te-run').addEventListener('click', e => { const b = e.target.closest('[data-teopt]'); if (b) answer(+b.dataset.teopt); });
  document.addEventListener('keydown', e => {
    if (!T || T.done || !$('p-test').classList.contains('on')) return;
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    if (/^[1-6]$/.test(e.key)) { e.preventDefault(); answer(+e.key - 1); }
  });

  function render() {
    if (!VL.D.dex || (T && !T.done)) return;
    const fs = $('te-format'); const cur = fs.value || (VL.curFormatId && VL.curFormatId());
    fs.innerHTML = VL.D.formats().map(f => `<option value="${esc(f.id)}">${esc(f.name)} · ${esc(f.game)}</option>`).join(''); fs.value = VL.D.format(cur).id;
    if (!$('te-pool').dataset.init) { $('te-pool').dataset.init = '1'; if (VL.meta.forFormat(fs.value)) $('te-pool').value = 'meta'; }
    const avail = kindsAvailable();
    const tests = VL.store.list('tests');
    const best = (label) => { const t = tests.filter(x => x.label === label && x.fmt === fs.value); return t.length ? Math.max(...t.map(x => x.pct)) : null; };
    const areas = VL.progress.AREAS.filter(a => a.test && (AREA_KINDS[a.test] || []).some(k => avail.includes(k)));
    $('te-types').innerHTML = `
      <div class="drill-card gamecard"><h4>Full test</h4><span class="sub">About ${avail.length * 4} questions across every category. The best measure of where you stand. About 15 minutes.</span><div class="kv"><button class="btn small" data-te="full">Start full test</button>${best('Full test') !== null ? `<span class="mini">Best ${best('Full test')}%</span>` : ''}</div></div>
      <div class="drill-card gamecard"><h4>Quick test</h4><span class="sub">About ${avail.length * 2} questions across every category. About 7 minutes.</span><div class="kv"><button class="btn ghost small" data-te="quick">Start quick test</button>${best('Quick test') !== null ? `<span class="mini">Best ${best('Quick test')}%</span>` : ''}</div></div>
      ${areas.map(a => `<div class="drill-card gamecard"><h4>${esc(a.n)}</h4><span class="sub">15 questions on just this area.</span><div class="kv"><button class="btn ghost small" data-tearea="${a.test}">Start</button>${best(`${a.n} test`) !== null ? `<span class="mini">Best ${best(`${a.n} test`)}%</span>` : ''}</div></div>`).join('')}`;
  }
  $('te-types').addEventListener('click', e => {
    const b = e.target.closest('[data-te]'); if (b) return b.dataset.te === 'full' ? startFull() : startQuick();
    const a = e.target.closest('[data-tearea]'); if (a) startArea(a.dataset.tearea);
  });
  $('te-format').addEventListener('change', render);
  $('te-pool').addEventListener('change', render);

  VL.test = { render, startArea, stop() { clearInterval(clock); } };
})();
