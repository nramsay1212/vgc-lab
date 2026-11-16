/* Small, soft sounds for answers, games and saves (bells and marimba tones), made
 * on the fly with the Web Audio API (no sound files, all tunes original). On by default; turned off or quieter in
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

  // Soft, polished sounds: bell and marimba tones made with gentle FM synthesis (a sine shaped by a
  // second sine whose brightness fades), smooth fades, a warm low-pass and a little room echo.
  // Notes come from a major pentatonic scale so everything sounds consonant together. All tunes original.
  let bus = null;
  function out(c) {
    if (bus && bus.c === c) return bus.in;
    const input = c.createGain(), warm = c.createBiquadFilter(), comp = c.createDynamicsCompressor(), dry = c.createGain(), wet = c.createGain(), verb = c.createConvolver();
    warm.type = 'lowpass'; warm.frequency.value = 7000; warm.Q.value = 0.5;
    comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.003; comp.release.value = 0.2;
    // a short, soft room: decaying filtered noise as the echo's shape
    const len = Math.floor(c.sampleRate * 1.1), ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); let lp = 0; for (let k = 0; k < len; k++) { lp = lp * 0.6 + (Math.random() * 2 - 1) * 0.4; d[k] = lp * Math.pow(1 - k / len, 3); } }
    verb.buffer = ir; dry.gain.value = 0.85; wet.gain.value = 0.22;
    input.connect(warm); warm.connect(dry).connect(comp); warm.connect(verb).connect(wet).connect(comp); comp.connect(c.destination);
    bus = { c, in: input }; return input;
  }
  const NOTE = { C4: 261.6, E4: 329.6, G4: 392, A4: 440, C5: 523.3, D5: 587.3, E5: 659.3, G5: 784, A5: 880, C6: 1046.5, D6: 1174.7, E6: 1318.5, G6: 1568, A6: 1760, C7: 2093 };
  const hz = (n) => (typeof n === 'number' ? n : NOTE[n]);
  // a bell or marimba tone. ratio: the modulator's pitch (2 = warm, 3.5 = glassy); bright: how much shimmer at the start
  function bell(c, t, n, len, g, ratio, bright) {
    const f = hz(n); const o = c.createOscillator(), m = c.createOscillator(), mg = c.createGain(), v = c.createGain();
    o.type = 'sine'; m.type = 'sine'; o.frequency.value = f; m.frequency.value = f * (ratio || 2);
    const idx = f * (bright ?? 1.2);
    mg.gain.setValueAtTime(idx, t); mg.gain.exponentialRampToValueAtTime(Math.max(1, idx * 0.02), t + len * 0.6);
    const peak = (g || 0.14) * opts.vol;
    v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(peak, t + 0.006); v.gain.exponentialRampToValueAtTime(0.0001, t + len);
    m.connect(mg).connect(o.frequency); o.connect(v).connect(out(c));
    o.start(t); m.start(t); o.stop(t + len + 0.05); m.stop(t + len + 0.05);
  }
  // a soft, rounded tone with a gentle pitch glide (for taps and the "not quite" sound)
  function soft(c, t, f1, f2, len, g, type) {
    const o = c.createOscillator(), v = c.createGain(), lp = c.createBiquadFilter();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f1, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + len * 0.7);
    lp.type = 'lowpass'; lp.frequency.value = 1800;
    const peak = (g || 0.12) * opts.vol;
    v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(peak, t + 0.01); v.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(lp).connect(v).connect(out(c)); o.start(t); o.stop(t + len + 0.05);
  }
  const arp = (c, t, notes, step, len, g, ratio, bright) => notes.forEach((n, i) => bell(c, t + i * step, n, len, g, ratio, bright));
  const SOUNDS = {
    // a light pop for taps and picks
    tap: (c, t) => soft(c, t, 880, 620, 0.09, 0.2),
    // a bright two-note chime, rising
    right: (c, t) => { bell(c, t, 'G5', 0.35, 0.11, 2, 1); bell(c, t + 0.075, 'C6', 0.55, 0.12, 2, 1); },
    // a gentle, low "not quite": two soft marimba notes stepping down
    wrong: (c, t) => { bell(c, t, 'E4', 0.3, 0.12, 4, 0.6); bell(c, t + 0.12, 'C4', 0.45, 0.12, 4, 0.6); },
    // a quick sparkle up the scale every 5 in a row
    streak: (c, t) => arp(c, t, ['C6', 'D6', 'E6', 'G6', 'A6'], 0.05, 0.4, 0.07, 3.5, 0.8),
    // the end of a game: a warm chord that blooms upward
    finish: (c, t) => { arp(c, t, ['C5', 'E5', 'G5'], 0.07, 1.1, 0.09, 2, 0.9); bell(c, t + 0.24, 'C6', 1.3, 0.1, 2, 1); },
    // a new best: a longer rising run with a glassy shimmer on top
    best: (c, t) => {
      arp(c, t, ['C5', 'E5', 'G5', 'C6'], 0.08, 1.2, 0.09, 2, 0.9);
      bell(c, t + 0.34, 'E6', 1.4, 0.09, 2, 1); bell(c, t + 0.42, 'G6', 1.6, 0.07, 3.5, 0.7); bell(c, t + 0.5, 'C7', 1.8, 0.05, 3.5, 0.6);
    },
    // a soft wooden tick for the last seconds
    tick: (c, t) => bell(c, t, 'A5', 0.08, 0.1, 5, 0.4),
    alarm: (c, t) => { bell(c, t, 'A5', 0.3, 0.09, 2, 1); bell(c, t + 0.18, 'A5', 0.4, 0.09, 2, 1); },
    // saved: a clean little "ding-dong" up
    save: (c, t) => { bell(c, t, 'E5', 0.3, 0.09, 2, 0.8); bell(c, t + 0.09, 'A5', 0.5, 0.1, 2, 0.8); },
    // ticking something off: a short bright pluck
    done: (c, t) => { bell(c, t, 'C6', 0.25, 0.09, 3, 0.8); bell(c, t + 0.06, 'E6', 0.35, 0.08, 3, 0.8); },
    // the Test's neutral "answer saved": the same soft pop whether right or wrong
    answer: (c, t) => soft(c, t, 660, 560, 0.12, 0.2),
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
