/* Small 8-bit style sounds for answers, games and saves, made on the fly with
 * the Web Audio API (no sound files, all tunes original). On by default; turned off or quieter in
 * Account, backup & theme, or with the speaker button on Games. */
(function () {
  'use strict';
  const VL = (window.VL = window.VL || {});
  const KEY = 'vgclab-sound';
  let opts = { on: true, vol: 0.6 };
  try { opts = { ...opts, ...(JSON.parse(localStorage.getItem(KEY) || '{}') || {}) }; } catch (e) { /* ignore */ }
  let ctx = null;
  const ac = () => {
    if (!ctx) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ctx = new A(); }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  };

  // 8-bit style, like a handheld game's sound chip: pulse waves (12.5%, 25% and 50% wide),
  // a triangle for bass and a noise channel for thuds. Sharp attack, quick stepped fade. All tunes are original.
  const waves = {};
  function pulse(c, duty) {
    const key = String(duty); if (waves[key] && waves[key].c === c) return waves[key].w;
    const n = 48, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    const w = c.createPeriodicWave(re, im); waves[key] = { c, w }; return w;
  }
  const NOTE = { C4: 262, G4: 392, C5: 523, D5: 587, E5: 659, F5: 698, G5: 784, A5: 880, B5: 988, C6: 1047, D6: 1175, E6: 1319, F6: 1397, G6: 1568, A6: 1760, B6: 1976, C7: 2093 };
  // one note: pitch (or a slide to f2), length, wave ('p12', 'p25', 'p50' or 'tri'), loudness
  function note(c, t, f, len, wave, g, f2) {
    const o = c.createOscillator(), v = c.createGain();
    if (wave === 'tri') o.type = 'triangle'; else o.setPeriodicWave(pulse(c, wave === 'p12' ? 0.125 : wave === 'p50' ? 0.5 : 0.25));
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.linearRampToValueAtTime(f2, t + len);
    const peak = (g || 0.12) * opts.vol;
    // stepped fade: hold, then drop in a few steps like the old volume envelopes
    v.gain.setValueAtTime(peak, t);
    const steps = 4; for (let k = 1; k <= steps; k++) v.gain.setValueAtTime(peak * (1 - k / (steps + 1)), t + len * (0.45 + 0.55 * k / steps));
    v.gain.setValueAtTime(0, t + len);
    o.connect(v).connect(c.destination); o.start(t); o.stop(t + len + 0.02);
  }
  function noise(c, t, len, g, hi) {
    const n = Math.floor(c.sampleRate * len), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    let v = 0; const hold = hi ? 2 : 12; for (let k = 0; k < n; k++) { if (k % hold === 0) v = Math.random() * 2 - 1; d[k] = v * (1 - k / n); }
    const s = c.createBufferSource(), gn = c.createGain(); s.buffer = buf; gn.gain.value = (g || 0.08) * opts.vol;
    s.connect(gn).connect(c.destination); s.start(t);
  }
  const run = (c, t, list, step, len, wave, g) => list.forEach((n, i) => note(c, t + i * step, NOTE[n] || n, len, wave, g));
  const SOUNDS = {
    tap: (c, t) => note(c, t, NOTE.C6, 0.04, 'p12', 0.08),
    right: (c, t) => { note(c, t, NOTE.B5, 0.06, 'p25', 0.12); note(c, t + 0.06, NOTE.E6, 0.14, 'p25', 0.12); },
    wrong: (c, t) => { note(c, t, 196, 0.12, 'p50', 0.09, 170); note(c, t + 0.11, 147, 0.2, 'p50', 0.09, 120); noise(c, t, 0.08, 0.06); },
    streak: (c, t) => { run(c, t, ['C6', 'E6', 'G6', 'C7'], 0.045, 0.06, 'p12', 0.1); note(c, t + 0.18, NOTE.E6, 0.1, 'p25', 0.08); },
    finish: (c, t) => {
      run(c, t, ['G5', 'C6', 'E6'], 0.09, 0.08, 'p25', 0.11); note(c, t + 0.27, NOTE.G6, 0.32, 'p25', 0.11);
      note(c, t, NOTE.C4, 0.27, 'tri', 0.16); note(c, t + 0.27, NOTE.G4, 0.32, 'tri', 0.16);
    },
    best: (c, t) => {
      run(c, t, ['G5', 'A5', 'B5', 'D6'], 0.08, 0.07, 'p25', 0.11);
      note(c, t + 0.32, NOTE.C6, 0.12, 'p25', 0.12); note(c, t + 0.44, NOTE.E6, 0.12, 'p25', 0.12); note(c, t + 0.56, NOTE.G6, 0.45, 'p25', 0.12);
      note(c, t + 0.56, NOTE.E6, 0.45, 'p12', 0.07);
      note(c, t, NOTE.C4, 0.32, 'tri', 0.16); note(c, t + 0.32, NOTE.G4, 0.24, 'tri', 0.16); note(c, t + 0.56, NOTE.C5, 0.45, 'tri', 0.16);
    },
    tick: (c, t) => note(c, t, 1976, 0.02, 'p12', 0.05),
    alarm: (c, t) => { note(c, t, NOTE.G6, 0.08, 'p25', 0.08); note(c, t + 0.12, NOTE.G6, 0.08, 'p25', 0.08); },
    save: (c, t) => { note(c, t, NOTE.E6, 0.05, 'p12', 0.1); note(c, t + 0.05, NOTE.A6, 0.12, 'p12', 0.1); },
    done: (c, t) => { note(c, t, NOTE.A5, 0.04, 'p25', 0.1); note(c, t + 0.04, NOTE.E6, 0.1, 'p25', 0.1); },
    // a neutral "answer saved" blip: the same for right and wrong, for the Test
    answer: (c, t) => { note(c, t, NOTE.D6, 0.035, 'p12', 0.08); note(c, t + 0.04, NOTE.D6, 0.035, 'p12', 0.06); },
  };
  function play(name) {
    if (!opts.on || !SOUNDS[name]) return;
    try { const c = ac(); if (c) SOUNDS[name](c, c.currentTime + 0.01); } catch (e) { /* sound is never worth an error */ }
  }
  function set(patch) { opts = { ...opts, ...patch }; try { localStorage.setItem(KEY, JSON.stringify(opts)); } catch (e) { /* ignore */ } sync(); }
  // the switches in Settings and on Games show the same thing
  function sync() {
    document.querySelectorAll('[data-sound-toggle]').forEach(b => { b.setAttribute('aria-pressed', String(opts.on)); b.textContent = opts.on ? '🔊 Sound on' : '🔇 Sound off'; });
    const on = document.getElementById('snd-on'); if (on) on.checked = opts.on;
    const vol = document.getElementById('snd-vol'); if (vol) { vol.value = Math.round(opts.vol * 100); vol.disabled = !opts.on; }
  }
  document.addEventListener('click', (e) => { if (e.target.closest('[data-sound-toggle]')) { set({ on: !opts.on }); if (opts.on) play('right'); } });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'snd-on') { set({ on: e.target.checked }); if (opts.on) play('right'); }
    if (e.target.id === 'snd-vol') { set({ vol: (+e.target.value || 0) / 100 }); play('right'); }
  });
  document.addEventListener('DOMContentLoaded', sync);
  VL.sound = { play, set, sync, get on() { return opts.on; } };
})();
