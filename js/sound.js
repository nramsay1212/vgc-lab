/* Small sounds for answers, games and saves, made on the fly with the Web
 * Audio API (no sound files). On by default; turned off or quieter in
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

  // one note: frequency (or a slide from one to another), length, shape and loudness
  function note(c, t, f, len, type, g, f2) {
    const o = c.createOscillator(), v = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + len);
    const peak = (g || 0.2) * opts.vol;
    v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(peak, t + 0.012); v.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(v).connect(c.destination); o.start(t); o.stop(t + len + 0.02);
  }
  const SOUNDS = {
    tap: (c, t) => note(c, t, 660, 0.05, 'triangle', 0.08),
    right: (c, t) => { note(c, t, 880, 0.09, 'triangle', 0.18); note(c, t + 0.08, 1320, 0.14, 'triangle', 0.18); },
    wrong: (c, t) => { note(c, t, 220, 0.16, 'square', 0.06, 160); note(c, t + 0.1, 150, 0.2, 'square', 0.05, 110); },
    streak: (c, t) => [784, 988, 1175, 1568].forEach((f, i) => note(c, t + i * 0.06, f, 0.12, 'triangle', 0.15)),
    finish: (c, t) => [523, 659, 784, 1047].forEach((f, i) => note(c, t + i * 0.1, f, 0.22, 'triangle', 0.17)),
    best: (c, t) => { [523, 659, 784, 1047, 1319].forEach((f, i) => note(c, t + i * 0.08, f, 0.2, 'triangle', 0.17)); note(c, t + 0.45, 1568, 0.5, 'sine', 0.14); },
    tick: (c, t) => note(c, t, 1200, 0.03, 'square', 0.05),
    alarm: (c, t) => { note(c, t, 988, 0.12, 'square', 0.07); note(c, t + 0.16, 988, 0.12, 'square', 0.07); },
    save: (c, t) => { note(c, t, 587, 0.08, 'sine', 0.16); note(c, t + 0.07, 880, 0.16, 'sine', 0.16); },
    done: (c, t) => { note(c, t, 784, 0.07, 'triangle', 0.14); note(c, t + 0.06, 1175, 0.18, 'triangle', 0.14); },
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
