/*
 * OVERHANG — audio.js
 * WebAudio synthesis module (spec §8). Pure static, no modules: attaches ONE
 * global, window.OverhangAudio, via an IIFE. Works from file://.
 *
 * Lifecycle: nothing is created until unlock() is called from a user gesture.
 * Before that every cue is a silent no-op. Every cue is also guarded so it can
 * never throw into the game loop (Safari quirks, closed contexts, etc.).
 *
 * Master chain (spec §8):
 *   voices -> masterGain(0.7) -> DynamicsCompressor(-18 dB, 3:1)
 *          -> BiquadFilter lowpass 14 kHz -> destination
 *   plus a shared feedback-delay send (320 ms, feedback 0.3, wet 0.25) used by
 *   the zone chime and the hang arpeggio.
 */
(function () {
  'use strict';

  var AC = window.AudioContext || window.webkitAudioContext || null;

  var MASTER_GAIN = 0.7;   // spec §8 master level
  var MAX_VOICES = 16;     // spec §8 simultaneous-voice budget
  var MUTE_RAMP = 0.06;    // 60 ms mute/unmute ramp
  var FLOOR = 0.0005;      // target for exponential decays (never 0)

  // --- module state --------------------------------------------------------
  var ctx = null;          // AudioContext, created once by unlock()
  var master = null;       // masterGain
  var delayIn = null;      // input of the shared delay send
  var pinkBuf = null;      // 2 s pink noise (built once)
  var whiteBuf = null;     // 1 s white noise (built once)
  var muted = false;       // preference; applied to masterGain
  var unlocked = false;    // true once unlock() has created a context
  var live = 0;            // approximate count of sounding voices

  // Continuous voices
  var glide = null;        // { src, filter, gain }
  var pad = null;          // { oscA, oscB, filter, gain }

  function noop() {}
  function now() { return ctx.currentTime; }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : (x === x ? x : 0); }

  // --- voice budget --------------------------------------------------------
  // acquire(n) reserves n voices or returns false (the cue is dropped, never
  // thrown). release(n) is called from the source's 'ended' handler.
  function acquire(n) {
    if (live + n > MAX_VOICES) return false;
    live += n;
    return true;
  }
  function release(n) { live = Math.max(0, live - n); }

  // Disconnect a list of nodes when `src` ends, and give back `n` voices.
  function cleanupOnEnded(src, nodes, n) {
    src.onended = function () {
      for (var i = 0; i < nodes.length; i++) { try { nodes[i].disconnect(); } catch (e) { /* already gone */ } }
      release(n);
    };
  }

  // --- noise buffers -------------------------------------------------------
  function buildNoiseBuffers() {
    var sr = ctx.sampleRate;
    // White: 1 s uniform noise.
    whiteBuf = ctx.createBuffer(1, sr, sr);
    var w = whiteBuf.getChannelData(0);
    for (var i = 0; i < w.length; i++) w[i] = Math.random() * 2 - 1;
    // Pink: 2 s, Paul Kellet's 7-stage filtered white (spec allows this).
    pinkBuf = ctx.createBuffer(1, sr * 2, sr);
    var p = pinkBuf.getChannelData(0);
    var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (var j = 0; j < p.length; j++) {
      var x = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + x * 0.0555179;
      b1 = 0.99332 * b1 + x * 0.0750759;
      b2 = 0.96900 * b2 + x * 0.1538520;
      b3 = 0.86650 * b3 + x * 0.3104856;
      b4 = 0.55000 * b4 + x * 0.5329522;
      b5 = -0.7616 * b5 - x * 0.0168980;
      p[j] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11;
      b6 = x * 0.115926;
    }
  }

  // --- master chain --------------------------------------------------------
  function buildChain() {
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_GAIN;
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 14000;
    master.connect(comp);
    comp.connect(lp);
    lp.connect(ctx.destination);

    // Shared feedback delay send: delayIn -> delay -> wet -> master, delay -> fb -> delay.
    delayIn = ctx.createGain();
    var delay = ctx.createDelay(1.0);
    delay.delayTime.value = 0.32;
    var fb = ctx.createGain();
    fb.gain.value = 0.3;
    var wet = ctx.createGain();
    wet.gain.value = 0.25;
    delayIn.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    wet.connect(master);
  }

  // --- synthesis helpers (spec §8) -----------------------------------------
  // Envelope convention shared by tone()/noise(): attack -> hold -> decay,
  // where `decay` is an exponential fall to silence. `sustain` and `release`
  // are accepted as aliases for hold and decay respectively.
  function envelope(param, t, peak, o) {
    var attack = o.attack || 0.001;
    var hold = o.hold || o.sustain || 0;
    var decay = o.decay || o.release || 0.05;
    param.setValueAtTime(FLOOR, t);
    param.linearRampToValueAtTime(peak, t + attack);
    if (hold) param.setValueAtTime(peak, t + attack + hold);
    param.exponentialRampToValueAtTime(FLOOR, t + attack + hold + decay);
    return attack + hold + decay;
  }

  // tone({type, freq, freqEnd, glide, attack, hold/sustain, decay/release, gain, when, send, detune})
  // One oscillator through its own gain. `send` (0..1) also feeds the delay.
  function tone(o) {
    if (!acquire(1)) return null;
    var t = now() + (o.when || 0);
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.detune) osc.detune.value = o.detune;
    var len = envelope(g.gain, t, o.gain || 0.1, o);
    if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(o.freqEnd, t + (o.glide || len));
    osc.connect(g);
    g.connect(master);
    if (o.send) { var s = ctx.createGain(); s.gain.value = o.send; g.connect(s); s.connect(delayIn); }
    cleanupOnEnded(osc, [osc, g], 1);
    osc.start(t);
    osc.stop(t + len + 0.02);
    return osc;
  }

  // noise({buffer, filterType, cutoff, cutoffEnd, q, duration, gain, attack, when})
  // One-shot buffer source through a biquad. `duration` is attack + decay.
  function noise(o) {
    if (!acquire(1)) return null;
    var t = now() + (o.when || 0);
    var src = ctx.createBufferSource();
    src.buffer = o.buffer || whiteBuf;
    var f = ctx.createBiquadFilter();
    f.type = o.filterType || 'lowpass';
    f.Q.value = o.q || 0.7;
    f.frequency.setValueAtTime(o.cutoff || 2000, t);
    if (o.cutoffEnd) f.frequency.exponentialRampToValueAtTime(o.cutoffEnd, t + o.duration);
    var g = ctx.createGain();
    var attack = o.attack || 0.002;
    var len = envelope(g.gain, t, o.gain || 0.1, { attack: attack, decay: Math.max(0.005, o.duration - attack) });
    src.connect(f);
    f.connect(g);
    g.connect(master);
    cleanupOnEnded(src, [src, f, g], 1);
    src.start(t);
    src.stop(t + len + 0.02);
    return src;
  }

  // fm({carrier, ratio, index, indexTime, decay, gain}): 2-op FM, modulator
  // depth in Hz = index * carrier, ramped to 0 over `indexTime`.
  function fm(o) {
    if (!acquire(1)) return null;
    var t = now();
    var car = ctx.createOscillator();
    var mod = ctx.createOscillator();
    var modG = ctx.createGain();
    var g = ctx.createGain();
    car.frequency.value = o.carrier;
    mod.frequency.value = o.carrier * o.ratio;
    modG.gain.setValueAtTime(o.index * o.carrier, t);
    modG.gain.linearRampToValueAtTime(0, t + (o.indexTime || 0.04));
    var len = envelope(g.gain, t, o.gain || 0.1, { attack: 0.001, decay: o.decay });
    mod.connect(modG);
    modG.connect(car.frequency);
    car.connect(g);
    g.connect(master);
    cleanupOnEnded(car, [car, mod, modG, g], 1);
    mod.start(t); car.start(t);
    mod.stop(t + len + 0.02); car.stop(t + len + 0.02);
    return car;
  }

  // Wrap a cue so it is a no-op before unlock and never throws afterwards.
  function guard(fn) {
    return function () {
      if (!ctx || ctx.state === 'closed') return;
      try { fn.apply(null, arguments); } catch (e) { /* audio is never fatal */ }
    };
  }

  // Ramp an AudioParam from its current value with no clicks.
  function rampTo(param, value, seconds) {
    var t = now();
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    param.linearRampToValueAtTime(value, t + seconds);
  }

  // --- lifecycle -----------------------------------------------------------
  function unlock() {
    if (ctx) { // idempotent: just make sure it is running
      try { var r = ctx.resume(); if (r && r.catch) r.catch(noop); } catch (e) { /* ignore */ }
      return;
    }
    if (!AC) return;
    try {
      ctx = new AC();
      buildChain();
      buildNoiseBuffers();
      unlocked = true;
      var p = ctx.resume();
      if (p && p.catch) p.catch(noop);
    } catch (e) {
      // Construction failed (e.g. hardware limits on iOS): stay in 'none'.
      ctx = null; master = null; delayIn = null; unlocked = false;
    }
  }

  function setMuted(flag) {
    muted = !!flag;
    if (!master) return; // applied when the chain is built
    try { rampTo(master.gain, muted ? 0 : MASTER_GAIN, MUTE_RAMP); } catch (e) { /* ignore */ }
  }

  function onVisibility(hidden) {
    if (!ctx || !unlocked) return;
    try {
      var p = hidden ? ctx.suspend() : ctx.resume();
      if (p && p.catch) p.catch(noop);
    } catch (e) { /* ignore */ }
  }

  // --- one-shot cues (spec §8 table) ---------------------------------------
  // Aim tick / zone-line tick: sine 1200 Hz, 15 ms, 1 ms attack, 12 ms decay, gain 0.15.
  function tick1200() { tone({ type: 'sine', freq: 1200, attack: 0.001, decay: 0.012, gain: 0.15 }); }

  // Launch "shhk": white noise 120 ms, lowpass 2200 -> 400 Hz (Q 0.7), gain 0.25, 5 ms attack.
  function launch() {
    noise({ buffer: whiteBuf, cutoff: 2200, cutoffEnd: 400, q: 0.7, duration: 0.12, attack: 0.005, gain: 0.25 });
  }

  // Stop "tok": triangle 180 Hz, 2 ms attack, 60 ms decay, gain 0.3 + 3 ms white click gain 0.2.
  function stopTok() {
    tone({ type: 'triangle', freq: 180, attack: 0.002, decay: 0.06, gain: 0.3 });
    noise({ buffer: whiteBuf, filterType: 'highpass', cutoff: 1500, duration: 0.003, attack: 0.0005, gain: 0.2 });
  }

  // Short: sine 140 Hz, 80 ms exp decay, gain 0.12 (muted feel, no chime).
  function short() { tone({ type: 'sine', freq: 140, attack: 0.002, decay: 0.08, gain: 0.12 }); }

  // Zone win chime: E5 then B5, 90 ms each, 10 ms attack, 120 ms release, gain 0.22, delay send.
  function zoneWin() {
    tone({ freq: 659, attack: 0.01, hold: 0.09, release: 0.12, gain: 0.22, send: 1 });
    tone({ freq: 988, attack: 0.01, hold: 0.09, release: 0.12, gain: 0.22, send: 1, when: 0.09 });
  }

  // Hang arpeggio: one sine per 10% overhang, C5 E5 G5 B5 D6; 20 ms attack, 180 ms decay, gain 0.2, delay send.
  var ARP = [523, 659, 784, 988, 1175];
  function hangNote(i) {
    var f = ARP[Math.max(0, Math.min(ARP.length - 1, i | 0))];
    tone({ freq: f, attack: 0.02, decay: 0.18, gain: 0.2, send: 1 });
  }

  // Dead hang (tier 3+): 50 Hz sub hit (5 ms attack, 500 ms decay, gain 0.5) + 3 shimmer sines.
  function deadHang() {
    tone({ freq: 50, attack: 0.005, decay: 0.5, gain: 0.5 });
    [2100, 2900, 3700].forEach(function (hz) { tone({ freq: hz, attack: 0.005, decay: 0.3, gain: 0.05 }); });
  }

  // Tier 4 (full hang): saw chord 110/165/220 Hz, lowpass 1200, swells 600 ms, then x1.5 over 300 ms; 2 s total.
  function fullHang() {
    if (!acquire(3)) return;
    var t = now();
    var f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 1200;
    var g = ctx.createGain();
    g.gain.setValueAtTime(FLOOR, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.6);
    g.gain.setValueAtTime(0.06, t + 1.2);
    g.gain.exponentialRampToValueAtTime(FLOOR, t + 2.0);
    f.connect(g); g.connect(master);
    var oscs = [110, 165, 220].map(function (hz) {
      var o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(hz, t);
      o.frequency.setValueAtTime(hz, t + 0.6);
      o.frequency.exponentialRampToValueAtTime(hz * 1.5, t + 0.9); // up a fifth
      o.connect(f); o.start(t); o.stop(t + 2.05);
      return o;
    });
    cleanupOnEnded(oscs[0], oscs.concat([f, g]), 3);
  }

  // Bust: saw 220 -> 60 Hz over 350 ms through lowpass 900, gain 0.25; + 55 Hz thump 200 ms gain 0.4; + 40 ms click.
  function bust() {
    if (acquire(1)) {
      var t = now();
      var osc = ctx.createOscillator();
      var f = ctx.createBiquadFilter();
      var g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(60, t + 0.35);
      f.type = 'lowpass'; f.frequency.value = 900;
      envelope(g.gain, t, 0.25, { attack: 0.005, hold: 0.25, decay: 0.1 });
      osc.connect(f); f.connect(g); g.connect(master);
      cleanupOnEnded(osc, [osc, f, g], 1);
      osc.start(t); osc.stop(t + 0.4);
    }
    tone({ freq: 55, attack: 0.005, decay: 0.2, gain: 0.4 });
    noise({ buffer: whiteBuf, filterType: 'highpass', cutoff: 2000, duration: 0.04, attack: 0.001, gain: 0.15 });
  }

  // Chip count tick: FM carrier 1800 Hz + 30 Hz per tick (max 20), ratio 2.5, index 3 -> 0 over 40 ms, 50 ms decay, gain 0.12.
  function chipTick(i) {
    var n = Math.max(0, Math.min(20, i | 0));
    fm({ carrier: 1800 + 30 * n, ratio: 2.5, index: 3, indexTime: 0.04, decay: 0.05, gain: 0.12 });
  }

  // NEW BEST: sine A5 880 -> A6 1760 Hz glide over 120 ms, gain 0.2.
  function newBest() { tone({ freq: 880, freqEnd: 1760, glide: 0.12, attack: 0.005, hold: 0.08, decay: 0.12, gain: 0.2 }); }

  // Button tap: 6 ms white-noise click, highpass 3 kHz, gain 0.08.
  function buttonTap() { noise({ buffer: whiteBuf, filterType: 'highpass', cutoff: 3000, duration: 0.006, attack: 0.001, gain: 0.08 }); }

  // Settle whish: 80 ms pink noise, bandpass 900 Hz Q 1, gain 0.06.
  function settleWhish() { noise({ buffer: pinkBuf, filterType: 'bandpass', cutoff: 900, q: 1, duration: 0.08, attack: 0.01, gain: 0.06 }); }

  // --- continuous: glide loop (spec §8 "Glide loop") -----------------------
  // Looping pink noise -> lowpass -> gain. glideUpdate only automates params
  // (no allocations); glideStop ramps the gain to 0 over 80 ms then stops.
  function glideStart() {
    if (glide) glideStop();
    if (!acquire(1)) return;
    var src = ctx.createBufferSource();
    src.buffer = pinkBuf; src.loop = true;
    var f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 300; f.Q.value = 0.7;
    var g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(master);
    cleanupOnEnded(src, [src, f, g], 1);
    src.start(now());
    glide = { src: src, filter: f, gain: g };
  }
  function glideUpdate(ratio) {
    if (!glide) return;
    var r = clamp01(ratio), t = now();
    glide.filter.frequency.setTargetAtTime(300 + 2500 * r, t, 0.03);
    glide.gain.gain.setTargetAtTime(0.12 * Math.pow(r, 0.7), t, 0.03);
  }
  function glideStop() {
    if (!glide) return;
    var v = glide, t = now();
    glide = null;
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setValueAtTime(v.gain.gain.value, t);
    v.gain.gain.linearRampToValueAtTime(0, t + 0.08);
    v.src.stop(t + 0.1);
  }

  // --- continuous: detuned-saw pad under the creep (spec §8 "Hang arpeggio") -
  // Two saws at 110 Hz +-7 cents -> lowpass 300 -> 1800 Hz with progress, gain 0.06.
  function padStart() {
    if (pad) padStop();
    if (!acquire(2)) return;
    var t = now();
    var f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 300; f.Q.value = 1;
    var g = ctx.createGain();
    g.gain.setValueAtTime(FLOOR, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.12);
    var a = ctx.createOscillator(), b = ctx.createOscillator();
    a.type = b.type = 'sawtooth';
    a.frequency.value = b.frequency.value = 110;
    a.detune.value = 7; b.detune.value = -7;
    a.connect(f); b.connect(f); f.connect(g); g.connect(master);
    cleanupOnEnded(a, [a, b, f, g], 2);
    a.start(t); b.start(t);
    pad = { oscA: a, oscB: b, filter: f, gain: g };
  }
  function padUpdate(progress) {
    if (!pad) return;
    pad.filter.frequency.setTargetAtTime(300 + 1500 * clamp01(progress), now(), 0.03);
  }
  function padStop() {
    if (!pad) return;
    var v = pad, t = now();
    pad = null;
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setValueAtTime(v.gain.gain.value, t);
    v.gain.gain.linearRampToValueAtTime(0, t + 0.15); // 150 ms release
    v.oscA.stop(t + 0.17); v.oscB.stop(t + 0.17);
  }

  // --- public API ----------------------------------------------------------
  window.OverhangAudio = {
    init: function (opts) { if (opts && typeof opts.muted !== 'undefined') setMuted(opts.muted); },
    unlock: function () { try { unlock(); } catch (e) { /* stay in 'none' */ } },
    isUnlocked: function () { return unlocked && !!ctx; },
    state: function () { return ctx ? ctx.state : 'none'; },
    setMuted: setMuted,
    isMuted: function () { return muted; },
    onVisibility: onVisibility,
    voices: function () { return live; },

    aimTick: guard(tick1200),
    launch: guard(launch),
    zoneTick: guard(tick1200),
    stopTok: guard(stopTok),
    short: guard(short),
    zoneWin: guard(zoneWin),
    hangNote: guard(hangNote),
    deadHang: guard(deadHang),
    fullHang: guard(fullHang),
    bust: guard(bust),
    chipTick: guard(chipTick),
    newBest: guard(newBest),
    buttonTap: guard(buttonTap),
    settleWhish: guard(settleWhish),

    glideStart: guard(glideStart),
    glideUpdate: guard(glideUpdate),
    glideStop: guard(glideStop),
    padStart: guard(padStart),
    padUpdate: guard(padUpdate),
    padStop: guard(padStop)
  };
})();
