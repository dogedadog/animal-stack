/* OVERHANG — game engine.
 * Pure static, vanilla JS. Depends on math.js (window.OverhangMath) and, optionally, audio.js (window.OverhangAudio).
 * Sections: helpers · persistence · layout · sprites/static layer · state machine · input · update · render · HUD · fairness · test hook.
 */
(() => {
  'use strict';
  const M = window.OverhangMath;
  const A = window.OverhangAudio || null;
  if (!M) { console.error('OVERHANG: math.js did not load'); return; }

  // ------------------------------------------------------------------ helpers
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const easeInCubic = (t) => { t = clamp(t, 0, 1); return t * t * t; };
  const easeInOutCubic = (t) => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(t, 0, 1)));
  const easeOutBack = (t) => { t = clamp(t, 0, 1); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  const smoothstep = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const $ = (id) => document.getElementById(id);
  const snd = (name, ...args) => { if (A && typeof A[name] === 'function') { try { A[name](...args); } catch (e) { /* audio must never break play */ } } };
  const vibrate = (p) => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* ignore */ } };
  const fmt2 = (cents) => (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtPct = (f) => (f * 100).toFixed(1) + '%';
  const fmtChips = (cents) => (cents % 100 === 0 ? M.fmtChips(cents) : fmt2(cents));
  const setText = (el, s) => { if (el && el.__t !== s) { el.__t = s; el.textContent = s; } };

  const C = {
    zone: '#2EF2C8', ledge: '#FFB547', gold: '#FFE08A', bust: '#FF3D81', short: '#5B6B8A',
    puck: '#EAFBFF', ring: '#9FD8FF', deck: '#121A2C', void0: '#03030A', void1: '#140C2A', text: '#E8EDF7',
    teal: [46, 242, 200], amber: [255, 181, 71], magenta: [255, 61, 129], white: [255, 255, 255], goldRGB: [255, 224, 138],
  };

  // ------------------------------------------------------------------ DOM
  const el = {
    stage: $('stage'), canvas: $('canvas'),
    balanceBtn: $('balanceBtn'), balance: $('balance'),
    statBest: $('statBest'), statBiggest: $('statBiggest'), statRtp: $('statRtp'),
    infoBtn: $('infoBtn'), muteBtn: $('muteBtn'),
    odds: $('odds'), oddsShort: $('oddsShort'), oddsZone: $('oddsZone'), oddsHang: $('oddsHang'), oddsBust: $('oddsBust'), oddsChip: $('oddsChip'),
    oddsCard: $('oddsCard'), oddsPays: $('oddsPays'), oddsChipCard: $('oddsChipCard'),
    corner: $('corner'), cornerNext: $('cornerNext'), cornerLast: $('cornerLast'),
    lockup: $('lockup'), lockupTier: $('lockupTier'), lockupMult: $('lockupMult'), lockupSub: $('lockupSub'), lockupWin: $('lockupWin'),
    caption: $('caption'), hint: $('hint'), hintClose: $('hintClose'),
    betPill: $('betPill'), betDown: $('betDown'), betUp: $('betUp'), betValue: $('betValue'), betNum: $('betNum'), ladder: $('ladder'),
    sizeSeg: $('sizeSeg'), aimRead: $('aimRead'),
    againBtn: $('againBtn'), topupBtn: $('topupBtn'),
    results: $('results'), openFairness: $('openFairness'),
    sheet: $('fairness'), backdrop: $('sheetBackdrop'), fairClose: $('fairClose'),
    fairSize: $('fairSize'), fairTable: $('fairTable'), logTable: $('logTable'), fairSession: $('fairSession'),
    fairBest: $('fairBest'), fairBiggest: $('fairBiggest'), fairHangs: $('fairHangs'), fairTopups: $('fairTopups'),
    togReduce: $('togReduce'), togHeat: $('togHeat'), live: $('live'),
  };
  const ctx = el.canvas.getContext('2d', { alpha: true });

  // ------------------------------------------------------------------ persistence
  const STORE_KEY = 'overhang.v2';
  const SIZE_KEYS = Object.keys(M.SIZES);
  const defaults = () => ({
    v: 2, balanceCents: M.START_BALANCE_CENTS, bet: 10, size: 'L', lastAim: 0.97, muted: false, heatMap: true, reduceMotion: null,
    bestOverhang: 0, bestWinCents: 0, hangs: 0, rounds: 0, wageredCents: 0, returnedCents: 0, topUps: 0, stops: [], hintSeen: false, log: [],
  });
  function loadProfile() {
    let o = null;
    try { const raw = localStorage.getItem(STORE_KEY); if (raw) o = JSON.parse(raw); } catch (e) { o = null; }
    if (!o || typeof o !== 'object' || o.v !== 2) return defaults();
    const p = Object.assign(defaults(), o);
    if (!Number.isFinite(p.balanceCents) || p.balanceCents < 0) p.balanceCents = M.START_BALANCE_CENTS;
    p.balanceCents = Math.round(p.balanceCents);
    if (!M.BET_LADDER.includes(p.bet)) p.bet = 10;
    if (!SIZE_KEYS.includes(p.size)) p.size = 'L';
    if (!Number.isFinite(p.lastAim)) p.lastAim = 0.97;
    p.lastAim = clamp(p.lastAim, M.AIM_MIN, M.AIM_MAX);
    if (!Array.isArray(p.stops)) p.stops = [];
    if (!Array.isArray(p.log)) p.log = [];
    p.stops = p.stops.filter(Number.isFinite).slice(-40);
    p.log = p.log.slice(-20);
    return p;
  }
  const P = loadProfile();
  let saveTimer = 0;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { try { localStorage.setItem(STORE_KEY, JSON.stringify(P)); } catch (e) { /* storage may be unavailable */ } }, 100);
  }
  const SES = { wagered: 0, returned: 0, rounds: 0, streak: 0 };

  const mqReduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener() {} };
  const RM = () => (P.reduceMotion === null || P.reduceMotion === undefined ? !!mqReduce.matches : !!P.reduceMotion);
  function applyReduceClass() { document.documentElement.classList.toggle('reduce-motion', RM()); }

  // ------------------------------------------------------------------ layout
  const L = { cssW: 0, cssH: 0, dpr: 1, laneW: 300, laneX: 0, laneLeft: 0, laneRight: 0, pxPerUnit: 1000, ledgeY: 100, footY: 0, R: 40, desktop: false, balX: 0, balY: 0, slabBottom: 0 };
  const yOf = (s) => L.ledgeY + (1 - s) * L.pxPerUnit;
  const Rof = (sizeKey) => M.SIZES[sizeKey].r * L.pxPerUnit;

  let staticCanvas = document.createElement('canvas');
  let staticDirty = true;
  let lastDpr = 0;
  const sprites = { glow: {}, puck: {}, refl: {}, shadow: null, cloudTeal: null, cloudMag: null };
  let vignetteGrad = null;

  function relayout() {
    const rect = el.stage.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width));
    const cssH = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    L.cssW = cssW; L.cssH = cssH; L.dpr = dpr;
    el.canvas.width = Math.round(cssW * dpr);
    el.canvas.height = Math.round(cssH * dpr);
    L.desktop = window.matchMedia('(min-width: 900px)').matches;
    const LY = M.LAYOUT;
    L.laneW = Math.min(L.desktop ? LY.LANE_W_DESKTOP : LY.LANE_W_PHONE, cssW - 40);
    L.laneX = cssW / 2;
    L.laneLeft = L.laneX - L.laneW / 2;
    L.laneRight = L.laneX + L.laneW / 2;
    // foot padding grows with the largest puck so a resting L puck is never clipped by the canvas edge
    const rMax = Math.max.apply(null, SIZE_KEYS.map((k) => M.SIZES[k].r));
    const basePad = cssH < LY.SHORT_CANVAS_H ? LY.FOOT_PAD_SHORT : LY.FOOT_PAD;
    let ppu = clamp((cssH - basePad - LY.LEDGE_Y_MIN) / (1 - M.S0 + rMax), LY.PX_PER_UNIT_MIN, LY.PX_PER_UNIT_MAX);
    const footPad = Math.max(basePad, rMax * ppu + 8);
    L.footY = cssH - footPad;
    L.pxPerUnit = clamp((L.footY - LY.LEDGE_Y_MIN) / (1 - M.S0), LY.PX_PER_UNIT_MIN, LY.PX_PER_UNIT_MAX);
    if (L.pxPerUnit < ppu) ppu = L.pxPerUnit;
    L.pxPerUnit = Math.min(L.pxPerUnit, ppu);
    L.ledgeY = Math.max(LY.LEDGE_Y_FLOOR, L.footY - L.pxPerUnit * (1 - M.S0));
    L.slabBottom = cssH + 24;
    L.R = Rof(P.size);
    el.lockup.style.top = Math.round(L.ledgeY + 140) + 'px';
    el.lockup.style.width = Math.min(L.laneW + 20, cssW - 24) + 'px';
    // chip target: balance element centre in canvas CSS px
    const b = el.balance.getBoundingClientRect();
    L.balX = b.left + b.width / 2 - rect.left;
    L.balY = b.top + b.height / 2 - rect.top;
    const ob = el.odds.querySelector('.odds-bar'); L.oddsW = ob ? ob.clientWidth : 0; L.cardW = el.oddsCard ? el.oddsCard.clientWidth : 0;
    oddsCache = { aim: -1, size: '' }; updateOdds(shownAim, P.size);
    if (dpr !== lastDpr) { buildGlowSprites(); lastDpr = dpr; }
    buildPuckSprites();
    vignetteGrad = ctx.createRadialGradient(cssW / 2, cssH / 2, Math.min(cssW, cssH) * 0.25, cssW / 2, cssH / 2, Math.max(cssW, cssH) * 0.75);
    vignetteGrad.addColorStop(0, 'rgba(255,181,71,0)');
    vignetteGrad.addColorStop(1, 'rgba(255,181,71,1)');
    staticDirty = true;
    seedDust();
  }

  // ------------------------------------------------------------------ sprites
  function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
  function buildGlowSprites() {
    const px = 64 * L.dpr;
    const build = (rgb) => {
      const c = makeCanvas(px, px); const g = c.getContext('2d');
      const img = g.createImageData(px, px); const d = img.data; const half = px / 2;
      for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
        const dx = (x + 0.5 - half) / half, dy = (y + 0.5 - half) / half; const dd = dx * dx + dy * dy;
        const a = dd >= 1 ? 0 : (1 - dd) * (1 - dd);
        const i = (y * px + x) * 4; d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = Math.round(a * 255);
      }
      g.putImageData(img, 0, 0); return c;
    };
    sprites.glow.teal = build(C.teal); sprites.glow.amber = build(C.amber); sprites.glow.magenta = build(C.magenta); sprites.glow.white = build(C.white); sprites.glow.gold = build(C.goldRGB);
    sprites.shadow = build([0, 0, 0]);
    // probability cloud: 1 x 128 vertical Gaussian alpha profile over ±2.5σ
    const buildCloud = (rgb) => {
      const h = 128, w = 32; const c = makeCanvas(w, h); const g = c.getContext('2d'); const img = g.createImageData(w, h); const d = img.data;
      for (let y = 0; y < h; y++) { const x = ((y + 0.5) / h - 0.5) * 5; const ay = 0.22 * Math.exp(-x * x / 2);
        for (let k = 0; k < w; k++) { const hx = ((k + 0.5) / w - 0.5) * 2; const ax = Math.pow(Math.max(0, 1 - hx * hx), 0.6);
          const i = (y * w + k) * 4; d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = Math.round(ay * ax * 255); } }
      g.putImageData(img, 0, 0); return c;
    };
    sprites.cloudTeal = buildCloud(C.teal); sprites.cloudMag = buildCloud(C.magenta);
  }
  function buildPuckSprites() {
    for (const k of SIZE_KEYS) {
      const R = Rof(k); const pad = 4; const size = Math.ceil((R + pad) * 2 * L.dpr);
      const c = makeCanvas(size, size); const g = c.getContext('2d'); g.scale(L.dpr, L.dpr);
      const cx = R + pad, cy = R + pad;
      const face = g.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R);
      face.addColorStop(0, '#FFFFFF'); face.addColorStop(0.45, C.puck); face.addColorStop(1, '#BFE6F5');
      g.fillStyle = face; g.beginPath(); g.arc(cx, cy, R - 1, 0, Math.PI * 2); g.fill();
      g.strokeStyle = C.ring; g.lineWidth = Math.max(1.5, R * 0.06); g.beginPath(); g.arc(cx, cy, R - 1.5, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, R - 3.5, 0, Math.PI * 2); g.stroke();
      sprites.puck[k] = c;
      // reflection: same disc, alpha fading toward the top (into the void)
      const rc = makeCanvas(size, size); const rg = rc.getContext('2d'); rg.scale(L.dpr, L.dpr);
      rg.drawImage(c, 0, 0, size / L.dpr, size / L.dpr);
      rg.globalCompositeOperation = 'destination-in';
      const fade = rg.createLinearGradient(0, 0, 0, size / L.dpr); fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
      rg.fillStyle = fade; rg.fillRect(0, 0, size / L.dpr, size / L.dpr);
      sprites.refl[k] = c && rc;
    }
  }
  function drawGlow(name, x, y, diameter, alpha) {
    const s = sprites.glow[name]; if (!s || alpha <= 0) return;
    const prev = ctx.globalAlpha; ctx.globalAlpha = prev * alpha; ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(s, x - diameter / 2, y - diameter / 2, diameter, diameter);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = prev;
  }
  const hashOffset = (s) => { const v = Math.sin(s * 12345.678) * 43758.5453; return (v - Math.floor(v) - 0.5) * 0.7; };

  function buildStatic() {
    const W = L.cssW, H = L.cssH, dpr = L.dpr;
    if (staticCanvas.width !== Math.round(W * dpr) || staticCanvas.height !== Math.round(H * dpr)) { staticCanvas.width = Math.round(W * dpr); staticCanvas.height = Math.round(H * dpr); }
    const g = staticCanvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const { laneLeft, laneRight, laneW, ledgeY, slabBottom, pxPerUnit } = L;
    const R = L.R;
    // void: opaque near-black at the top, fading to transparent at the ledge
    const vg = g.createLinearGradient(0, 0, 0, ledgeY + 40);
    vg.addColorStop(0, C.void0); vg.addColorStop(0.55, C.void1); vg.addColorStop(1, 'rgba(20,12,42,0)');
    g.fillStyle = vg; g.fillRect(0, 0, W, ledgeY + 40);
    // slab glow + fill (shadowBlur is fine here: this layer renders only on resize)
    g.save(); g.shadowColor = 'rgba(46,242,200,0.10)'; g.shadowBlur = 24;
    g.fillStyle = 'rgba(255,255,255,0.05)';
    roundRectPath(g, laneLeft, ledgeY, laneW, slabBottom - ledgeY, [0, 0, 18, 18]); g.fill(); g.restore();
    g.save(); roundRectPath(g, laneLeft, ledgeY, laneW, slabBottom - ledgeY, [0, 0, 18, 18]); g.clip();
    // deck
    const y90 = yOf(M.ZONE_START);
    g.fillStyle = C.deck; g.fillRect(laneLeft, y90, laneW, slabBottom - y90);
    // perspective grid at s = 0.6, 0.7, 0.8 (slightly inset toward the ledge)
    g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 0.6;
    for (const s of [0.6, 0.7, 0.8]) { const y = Math.round(yOf(s)) + 0.5; const inset = 6 + (s - 0.5) * 24; g.beginPath(); g.moveTo(laneLeft + inset, y); g.lineTo(laneRight - inset, y); g.stroke(); }
    // pay zone
    const zoneTop = ledgeY + R;
    const zg = g.createLinearGradient(0, zoneTop, 0, y90); zg.addColorStop(0, 'rgba(46,242,200,0.14)'); zg.addColorStop(1, 'rgba(46,242,200,0.22)');
    g.fillStyle = zg; g.fillRect(laneLeft, zoneTop, laneW, y90 - zoneTop);
    // hang strip
    const hg = g.createLinearGradient(0, zoneTop, 0, ledgeY); hg.addColorStop(0, 'rgba(255,181,71,0.28)'); hg.addColorStop(1, 'rgba(255,224,138,0.45)');
    g.fillStyle = hg; g.fillRect(laneLeft, ledgeY, laneW, R);
    // 90% line
    g.strokeStyle = 'rgba(46,242,200,0.9)'; g.lineWidth = 1; g.beginPath(); g.moveTo(laneLeft, Math.round(y90) + 0.5); g.lineTo(laneRight, Math.round(y90) + 0.5); g.stroke();
    // inner highlight (left edge + a soft top-left)
    g.strokeStyle = 'rgba(255,255,255,0.14)'; g.lineWidth = 1; g.beginPath(); g.moveTo(laneLeft + 0.5, ledgeY); g.lineTo(laneLeft + 0.5, slabBottom); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.06)'; g.beginPath(); g.moveTo(laneRight - 0.5, ledgeY); g.lineTo(laneRight - 0.5, slabBottom); g.stroke();
    // heat-map dots (last 40 stops)
    if (P.heatMap) {
      for (let i = 0; i < P.stops.length; i++) {
        const s = P.stops[i]; if (s > 1.02 || s < M.S0) continue;
        const x = L.laneX + hashOffset(s) * laneW; const y = yOf(Math.min(s, 1.0));
        const kind = s < M.ZONE_START ? 'short' : s > 1 ? 'bust' : s >= 1 - M.SIZES[P.size].r ? 'hang' : 'zone';
        g.fillStyle = kind === 'short' ? 'rgba(91,107,138,0.45)' : kind === 'bust' ? 'rgba(255,61,129,0.35)' : kind === 'hang' ? 'rgba(255,181,71,0.45)' : 'rgba(46,242,200,0.35)';
        g.beginPath(); g.arc(x, y, 2, 0, Math.PI * 2); g.fill();
      }
    }
    g.restore();
    // ledge hairline (crisp, 2 px)
    g.fillStyle = C.ledge; g.fillRect(laneLeft, ledgeY - 1, laneW, 2);
    g.fillStyle = 'rgba(255,224,138,0.35)'; g.fillRect(laneLeft, ledgeY - 3, laneW, 1);
    staticDirty = false;
  }
  function roundRectPath(g, x, y, w, h, r) {
    const [tl, tr, br, bl] = r;
    g.beginPath(); g.moveTo(x + tl, y); g.lineTo(x + w - tr, y); if (tr) g.arcTo(x + w, y, x + w, y + tr, tr); else g.lineTo(x + w, y);
    g.lineTo(x + w, y + h - br); if (br) g.arcTo(x + w, y + h, x + w - br, y + h, br); else g.lineTo(x + w, y + h);
    g.lineTo(x + bl, y + h); if (bl) g.arcTo(x, y + h, x, y + h - bl, bl); else g.lineTo(x, y + h);
    g.lineTo(x, y + tl); if (tl) g.arcTo(x, y, x + tl, y, tl); else g.lineTo(x, y); g.closePath();
  }

  // ------------------------------------------------------------------ time, camera, timescale
  let rawLast = 0;          // performance.now() of the previous frame
  let now = 0;              // virtual clock (ms); advances by rawDt * speed
  let speed = 1;            // 1 normally; 3 while a skip pointer is held; 30 under __overhang.skip()
  let skipping = false;
  let skipPointer = null;
  const tsT = { from: 1, to: 1, t0: 0, dur: 1 };  // timescale tween (slow-mo)
  let ts = 1;
  function tweenTs(to, dur) { tsT.from = ts; tsT.to = to; tsT.t0 = now; tsT.dur = Math.max(1, dur); }
  function updateTs() { const u = clamp((now - tsT.t0) / tsT.dur, 0, 1); ts = lerp(tsT.from, tsT.to, easeInOutCubic(u)); }
  let camK = 1, camTarget = 1;
  const shake = { amp: 0, t0: 0, dur: 1, x: 0, y: 0 };
  function startShake(amp, dur) { if (RM()) return; shake.amp = amp; shake.t0 = now; shake.dur = dur; }
  let currentShakeAmp = 0;
  const perf = { times: new Float32Array(240), n: 0, i: 0, mean: 0, p95: 0, frames: 0 };

  // ------------------------------------------------------------------ state machine
  let state = 'IDLE';
  let stateT0 = 0;
  let live = null;            // the live round (owns the moving puck)
  let lastFrozen = null;      // last frozen pricing (for the ruler / odds when idle)
  let shownAim = P.lastAim;   // aim whose numbers the odds strip / ruler currently show
  const fx = [];              // fire-and-forget effects with their own clocks
  let fairnessOpen = false;
  let hintVisible = false;
  let idlePuckAlpha = 1, idlePuckScale = 1, idleT0 = 0;
  let lastLaunchT = -1e9;
  let roundCounter = 0;

  const pending = { bytes: null, hex: '', commit: '' };
  function newPending(hex) {
    let s;
    if (hex) { const bytes = M.hexToBytes(hex); s = { bytes, hex: M.bytesToHex(bytes) }; } else s = M.newSeed();
    pending.bytes = s.bytes; pending.hex = s.hex; pending.commit = '';
    setText(el.cornerNext, 'next #--------');
    const mine = s.hex;
    Promise.resolve(M.sha256Hex(s.hex)).then((h) => {
      if (pending.hex !== mine) return;
      pending.commit = h || '';
      setText(el.cornerNext, 'next #' + (h ? h.slice(0, 8) : '--------'));
    }).catch(() => {});
  }

  function canStartRound() {
    return (state === 'IDLE' || state === 'PAYOUT' || state === 'SETTLE') && !fairnessOpen && P.balanceCents >= 100;
  }
  function setState(s) { state = s; stateT0 = now; onEnter(s); }

  function onEnter(s) {
    if (s === 'IDLE') {
      idleT0 = now; idlePuckAlpha = 0; idlePuckScale = 0.9;
      updateControls();
    } else if (s === 'AIMING') {
      el.canvas.classList.add('aiming');
      updateControls();
    } else if (s === 'PAYOUT') {
      startPayoutCount();
    } else if (s === 'SETTLE') {
      if (live && live.visible && !live.dissolveT0) live.dissolveT0 = now;
      el.lockup.classList.remove('show');
      el.againBtn.classList.remove('pulse'); void el.againBtn.offsetWidth; el.againBtn.classList.add('pulse');
      snd('settleWhish');
      updateControls();
    }
  }

  // ---- launch -------------------------------------------------------------
  function launch(aimIn, opts) {
    opts = opts || {};
    if (!(state === 'AIMING' || canStartRound())) return null;
    clampBet();
    const betCents = P.bet * 100;
    if (P.balanceCents < betCents || P.balanceCents < 100) { updateControls(); return null; }
    const aim = clamp(+aimIn || P.lastAim, M.AIM_MIN, M.AIM_MAX);
    const size = P.size; const r = M.SIZES[size].r;
    const priced = M.priced(aim, size);
    // previous puck (overlapping rounds) becomes a dissolve effect
    if (live && live.visible) { pushDissolve(live, 400); }
    // draw from the committed seed, then commit the next one immediately
    const seedHex = pending.hex; const commit = pending.commit; const draw = M.seedToDraw(pending.bytes);
    newPending();
    const sStop = aim * draw.X;
    const T = M.slideDuration(sStop);
    P.balanceCents -= betCents; P.rounds += 1; P.wageredCents += betCents; SES.wagered += betCents; SES.rounds += 1;
    tweenBalance(P.balanceCents, 200, false);
    roundCounter += 1;
    live = {
      id: roundCounter, aim, size, r, betCents, priced, seedHex, commit, X: draw.X, Z: draw.Z, sStop, T,
      tSim: 0, s: M.S0, noseT: M.slideTimeTo(sStop, 1 - r), lipT: sStop > 1 ? M.slideTimeTo(sStop, 1) : null,
      crossed90: false, noseOver: false, notes: 0, outcome: null, f: null, mult: 0, winCents: 0, tier: null, tierLabel: '',
      alpha: 1, scale: 1, scaleY: 1, rot: 0, visible: true, stopT: null, dissolveT0: null, bustT0: null, freezeMs: 0, isBest: false,
      launchT: now, trail: [], trailLast: -1e9, glow: streakGlow(), bracketT0: null, lockupMultShown: 0,
    };
    lastFrozen = priced; shownAim = aim; P.lastAim = aim;
    lastLaunchT = now;
    dismissHint();
    resetLockup();
    setText(el.aimRead, Math.round(aim * 100) + '%');
    updateOdds(aim, size);
    if (opts.instant) {
      live.tSim = T; live.s = sStop;
      if (sStop > 1) live.s = 1;
      const out = M.outcomeFor(sStop, size);
      resolveLive(out, true);
      const rec = P.log[P.log.length - 1];
      live = null; setState('IDLE'); idlePuckAlpha = 1; idlePuckScale = 1;
      save();
      return rec;
    }
    setState('SLIDING');
    el.canvas.classList.remove('aiming');
    snd('launch'); snd('glideStart'); vibrate(20);
    save();
    return live;
  }

  function pushDissolve(rd, dur) {
    const snap = { x: puckX(rd), y: yOf(rd.s), R: Rof(rd.size), size: rd.size, alpha: rd.alpha, scale: rd.scale, scaleY: rd.scaleY, rot: rd.rot, glow: rd.glow, t0: now, dur };
    fx.push({ t0: now, dur, world: true, draw(g, u) { drawPuckAt(snap.x, snap.y, snap.R, snap.size, snap.alpha * (1 - easeInCubic(u)), snap.scale, snap.scaleY, snap.rot, snap.glow, null); } });
    rd.visible = false;
  }
  function streakGlow() { const n = SES.streak; return n >= 4 ? 'white' : n >= 2 ? 'amber' : 'teal'; }
  const puckX = (rd) => L.laneX;

  // ---- resolve ------------------------------------------------------------
  function resolveLive(out, instant) {
    const rd = live; const kind = out.kind; const f = out.f;
    rd.outcome = kind; rd.f = f;
    let mult = 0;
    if (kind === 'zone') mult = rd.priced.zoneMult; else if (kind === 'hang') mult = rd.priced.multAt(f);
    const winCents = mult > 0 ? M.roundWinCents(rd.betCents, mult) : 0;
    rd.mult = mult; rd.winCents = winCents;
    P.balanceCents += winCents; P.returnedCents += winCents; SES.returned += winCents;
    const paying = winCents > 0;
    SES.streak = paying ? SES.streak + 1 : 0;
    const tier = M.tierFor(kind, f);
    rd.tier = tier ? tier.tier : null; rd.tierLabel = tier ? tier.label : '';
    if (kind === 'hang') {
      P.hangs += 1;
      const pct = f * 100;
      if (pct > P.bestOverhang + 1e-9) { rd.isBest = P.hangs > 1; P.bestOverhang = pct; }
    }
    if (winCents > P.bestWinCents) P.bestWinCents = winCents;
    P.stops.push(+rd.sStop.toFixed(5)); if (P.stops.length > 40) P.stops.splice(0, P.stops.length - 40);
    const rec = { n: P.rounds, commit: rd.commit || '', seed: rd.seedHex, aim: +rd.aim.toFixed(4), size: rd.size, betCents: rd.betCents, X: +rd.X.toFixed(6), Z: +rd.Z.toFixed(6), sStop: +rd.sStop.toFixed(6), outcome: kind, f: f === null ? null : +f.toFixed(6), mult, winCents, c: +rd.priced.c.toFixed(6) };
    if (!rec.commit) { Promise.resolve(M.sha256Hex(rd.seedHex)).then((h) => { if (h) rec.commit = h; }).catch(() => {}); }
    P.log.push(rec); if (P.log.length > 20) P.log.splice(0, P.log.length - 20);
    staticDirty = true;
    save();
    renderResults(); updateStats();
    setText(el.cornerLast, 'last ' + rd.seedHex.slice(0, 4) + '… · wax ×' + rd.X.toFixed(3));
    if (instant) return;
    // presentation
    rd.freezeMs = 0;
    if (kind === 'hang' && rd.tier >= 3) rd.freezeMs = RM() ? 200 : (rd.tier === 4 ? 600 : 400);
    if (kind === 'short') { setState('RESOLVE_SHORT'); showShort(rd); snd('short'); }
    else if (kind === 'zone') { setState('RESOLVE_ZONE'); showZone(rd); }
    else if (kind === 'hang') { setState('RESOLVE_HANG'); showHang(rd); }
    else { setState('RESOLVE_BUST'); showBust(rd); }
    announce(rd);
  }

  function announce(rd) {
    let s = '';
    if (rd.outcome === 'hang') s = 'Hang ' + (rd.f * 100).toFixed(1) + ' percent, ' + rd.mult.toFixed(2) + ' times, plus ' + fmt2(rd.winCents);
    else if (rd.outcome === 'zone') s = 'Pay zone, ' + rd.mult.toFixed(2) + ' times, plus ' + fmt2(rd.winCents);
    else if (rd.outcome === 'short') s = 'Short';
    else s = 'Bust';
    setText(el.live, s);
  }

  // ---- stop / bust ----------------------------------------------------------
  function stopPuck() {
    const rd = live; rd.s = rd.sStop; rd.stopT = now;
    tweenTs(1, M.SLOWMO_OUT_MS);
    snd('glideStop'); snd('padStop'); snd('stopTok');
    const out = M.outcomeFor(rd.sStop, rd.size);
    if (out.kind === 'hang') vibrate([30, 40, 30]);
    resolveLive(out, false);
  }
  function beginBust() {
    const rd = live; rd.s = 1; rd.bustT0 = now;
    tweenTs(1, 1);
    snd('glideStop'); snd('padStop'); snd('bust'); vibrate(60);
    startShake(4, 300);
    resolveLive({ kind: 'bust', f: null }, false);
  }

  // ---- presentation per outcome --------------------------------------------
  function resetLockup() {
    el.lockup.classList.remove('show');
    el.lockupMult.className = 'lockup-mult num'; el.lockupSub.className = 'lockup-sub num'; el.lockupWin.className = 'lockup-win num'; el.lockupTier.className = 'lockup-tier';
    setText(el.lockupTier, ''); setText(el.lockupMult, ''); setText(el.lockupSub, ''); setText(el.lockupWin, '');
    lockupAnim = null;
  }
  let lockupAnim = null; // { kind:'pct'|'win', from, to, t0, dur }
  function popMult(cls, text) {
    el.lockupMult.className = 'lockup-mult num ' + cls; setText(el.lockupMult, text);
    el.lockupMult.classList.remove('pop'); void el.lockupMult.offsetWidth; el.lockupMult.classList.add('pop');
    el.lockup.classList.add('show');
  }
  function showShort(rd) {
    popMult('short', 'SHORT');
    const by = M.ZONE_START - rd.sStop;
    setText(el.lockupSub, by <= 0.015 ? 'by ' + (by * 100).toFixed(1) + '%' : '');
    rd.dissolveT0 = now + 300;
  }
  function showZone(rd) {
    popMult('zone', M.fmtMult(rd.mult));
    setText(el.lockupSub, 'PAY ZONE');
    fx.push(flareFx(120, 'zone'));
    snd('zoneWin');
    scheduleChips(rd, 150, 8, 'teal');
  }
  function showHang(rd) {
    const pct = rd.f * 100; const t = rd.tier;
    el.lockupMult.className = 'lockup-mult num ' + (t >= 3 ? 'gold' : 'hang'); setText(el.lockupMult, M.fmtMult(rd.mult));
    el.lockupMult.classList.remove('pop'); void el.lockupMult.offsetWidth; el.lockupMult.classList.add(t >= 2 ? 'big' : 'pop');
    el.lockup.classList.add('show');
    if (rd.isBest) { el.lockupSub.className = 'lockup-sub num best'; setText(el.lockupSub, 'NEW BEST ' + pct.toFixed(1) + '%'); snd('newBest'); }
    else { setText(el.lockupSub, pct.toFixed(1) + '% OVER THE EDGE'); }
    if (t >= 3) {
      setText(el.lockupTier, rd.tierLabel); el.lockupTier.classList.add('in');
      // percentage ticks in digit by digit over the freeze
      lockupAnim = { kind: 'pct', to: pct, t0: now, dur: rd.freezeMs, best: rd.isBest };
      snd('deadHang'); if (t === 4) { snd('fullHang'); document.body.classList.add('goldwash'); setTimeout(() => document.body.classList.remove('goldwash'), 2500); }
    }
    const after = rd.freezeMs;
    const x = L.laneX, y = yOf(rd.sStop);
    const haloR = t >= 2 ? 260 : 160;
    fx.push(haloFx(x, y, haloR, after, t >= 3 ? 'gold' : 'amber'));
    if (t >= 2) { fx.push(haloFx(x, y, haloR * 0.8, after + 150, 'amber')); fx.push(flareFx(400, 'ledge', after)); }
    else fx.push(flareFx(250, 'ledge', after));
    emitSparks(x, y, t >= 2 ? 18 : 12, after, t >= 3 ? 'gold' : 'amber');
    if (t >= 3 && !RM()) { fx.push(vignetteFx(900, after)); }
    if (t === 3) startShakeAt(3, 250, after);
    const chips = t === 4 ? 60 : t === 3 ? 40 : t === 2 ? 28 : 16;
    scheduleChips(rd, after + 200, chips, t >= 3 ? 'gold' : 'amber', t === 4);
  }
  function showBust(rd) {
    popMult('bust', 'BUST');
    const over = rd.sStop - 1;
    setText(el.lockupSub, over <= 0.02 ? 'over by ' + (over * 100).toFixed(1) + '%' : '');
  }
  let pendingShake = null;
  function startShakeAt(amp, dur, delay) { if (delay <= 0) startShake(amp, dur); else pendingShake = { amp, dur, at: now + delay }; }

  // ---- effects --------------------------------------------------------------
  function haloFx(x, y, r1, delay, color) {
    return { t0: now + delay, dur: 600, world: true, draw(g, u) {
      const e = easeOutCubic(u); const r = r1 * e; const a = 0.5 * (1 - u);
      drawGlow(color, x, y, r * 2.2, a * 0.8);
      g.strokeStyle = color === 'gold' ? 'rgba(255,224,138,' + a + ')' : 'rgba(255,181,71,' + a + ')'; g.lineWidth = lerp(3, 1, u);
      g.beginPath(); g.arc(x, y, Math.max(1, r), 0, Math.PI * 2); g.stroke();
    } };
  }
  function flareFx(dur, which, delay) {
    return { t0: now + (delay || 0), dur, world: true, draw(g, u) {
      const w = lerp(2, 6, Math.sin(u * Math.PI)); const a = lerp(1, 0.6, u) * (1 - u * 0.5);
      if (which === 'ledge') { g.fillStyle = 'rgba(255,224,138,' + a + ')'; g.fillRect(L.laneLeft, L.ledgeY - w / 2, L.laneW, w); drawGlow('amber', L.laneX, L.ledgeY, L.laneW * 1.1, a * 0.35); }
      else { const y90 = yOf(M.ZONE_START); const top = L.ledgeY + L.R; g.fillStyle = 'rgba(46,242,200,' + (0.25 * (1 - u)) + ')'; g.fillRect(L.laneLeft, top, L.laneW, y90 - top); }
    } };
  }
  function vignetteFx(dur, delay) {
    return { t0: now + delay, dur, screen: true, draw(g, u) { const a = 0.35 * Math.sin(u * Math.PI); g.globalAlpha = a; g.fillStyle = vignetteGrad; g.fillRect(0, 0, L.cssW, L.cssH); g.globalAlpha = 1; } };
  }

  // particle pool: chips (screen space), sparks + dust (world space)
  const POOL = 300; const parts = [];
  for (let i = 0; i < POOL; i++) parts.push({ on: false, kind: 0, x: 0, y: 0, x0: 0, y0: 0, cx: 0, cy: 0, x1: 0, y1: 0, vx: 0, vy: 0, t0: 0, dur: 1, size: 4, color: 'amber', tick: false });
  let partsLive = 0;
  function allocPart() { for (let i = 0; i < POOL; i++) if (!parts[i].on) { parts[i].on = true; partsLive++; return parts[i]; } return null; }
  function scheduleChips(rd, delay, n, color, twoWaves) {
    if (RM()) return;
    const sx = worldToScreenX(L.laneX), sy = worldToScreenY(yOf(Math.min(rd.sStop, 1)));
    const spawn = (count, extra) => { for (let i = 0; i < count; i++) { const p = allocPart(); if (!p) return;
      p.kind = 1; p.color = color; p.x0 = sx + (Math.random() - 0.5) * 24; p.y0 = sy + (Math.random() - 0.5) * 24; p.x1 = L.balX; p.y1 = L.balY;
      p.cx = (p.x0 + p.x1) / 2 + (Math.random() - 0.5) * 120; p.cy = (p.y0 + p.y1) / 2 + (Math.random() - 0.5) * 120;
      p.t0 = now + delay + extra + i * 12; p.dur = 500 + Math.random() * 300; p.size = 6; p.x = p.x0; p.y = p.y0; } };
    spawn(twoWaves ? Math.ceil(n / 2) : n, 0);
    if (twoWaves) spawn(Math.floor(n / 2), 260);
  }
  function emitSparks(x, y, n, delay, color) {
    if (RM()) return;
    for (let i = 0; i < n; i++) { const p = allocPart(); if (!p) return; const ang = Math.random() * Math.PI * 2; const sp = 90 + Math.random() * 160;
      p.kind = 2; p.color = color; p.x0 = x; p.y0 = y; p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp - 40; p.t0 = now + delay; p.dur = 420 + Math.random() * 220; p.size = 3 + Math.random() * 3; p.x = x; p.y = y; }
  }
  function emitDust(x, y, n) {
    if (RM()) return;
    for (let i = 0; i < n; i++) { const p = allocPart(); if (!p) return; const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.2; const sp = 40 + Math.random() * 90;
      p.kind = 3; p.color = 'magenta'; p.x0 = x; p.y0 = y; p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp; p.t0 = now; p.dur = 400 + Math.random() * 200; p.size = 2 + Math.random() * 2; p.x = x; p.y = y; }
  }
  // ambient void dust
  const dust = [];
  function seedDust() {
    dust.length = 0; const n = L.desktop ? 60 : 44;
    for (let i = 0; i < n; i++) dust.push({ x: Math.random() * L.cssW, y: Math.random() * Math.max(10, L.ledgeY - 4), v: 4 + Math.random() * 4, a: 0.15 + Math.random() * 0.25, s: 1 + Math.random(), ph: Math.random() * 6.28 });
  }

  // ---- balance / payout tweens ---------------------------------------------
  const bal = { shown: P.balanceCents, from: P.balanceCents, to: P.balanceCents, t0: 0, dur: 1, pulse: false, tickCents: 0, lastTickAt: 0, ticks: 0 };
  function tweenBalance(to, dur, pulse) { bal.from = bal.shown; bal.to = to; bal.t0 = now; bal.dur = Math.max(1, dur); bal.pulse = pulse; bal.ticks = 0; bal.tickCents = 0; }
  let payout = null; // { t0, dur, winCents, cls }
  function startPayoutCount() {
    const rd = live; if (!rd || !rd.winCents) return;
    const delay = 80;
    payout = { t0: now + delay, dur: rd.tier === 4 ? 1200 : 600, winCents: rd.winCents, cls: rd.outcome === 'hang' ? (rd.tier >= 3 ? 'gold' : 'hang') : '' };
    el.lockupWin.className = 'lockup-win num ' + payout.cls;
    setTimeoutV(delay, () => { tweenBalance(P.balanceCents, payout.dur, true); });
  }
  // virtual-clock timeouts (so skipping also accelerates them)
  const vtimers = [];
  function setTimeoutV(delay, fn) { vtimers.push({ at: now + delay, fn }); }

  // ------------------------------------------------------------------ bet / controls
  function clampBet() {
    const maxAff = Math.floor(P.balanceCents / 100);
    if (P.bet > maxAff) {
      let nb = 1; for (const v of M.BET_LADDER) if (v <= maxAff) nb = v;
      if (nb !== P.bet) { P.bet = nb; renderBet(true); save(); }
    }
  }
  function stepBet(dir) {
    const i = M.BET_LADDER.indexOf(P.bet); let j = clamp(i + dir, 0, M.BET_LADDER.length - 1);
    const maxAff = Math.max(1, Math.floor(P.balanceCents / 100));
    while (j > 0 && M.BET_LADDER[j] > maxAff) j--;
    if (M.BET_LADDER[j] !== P.bet) { P.bet = M.BET_LADDER[j]; renderBet(false); save(); snd('buttonTap'); }
    updateControls();
  }
  function maxBet() { const maxAff = Math.floor(P.balanceCents / 100); let nb = 1; for (const v of M.BET_LADDER) if (v <= maxAff) nb = v; if (nb !== P.bet) { P.bet = nb; save(); } renderBet(true); updateControls(); }
  function minBet() { if (P.bet !== 1) { P.bet = 1; save(); } renderBet(true); updateControls(); }
  function renderBet(flash) {
    setText(el.betNum, String(P.bet));
    if (flash) { el.betValue.classList.remove('flash'); void el.betValue.offsetWidth; el.betValue.classList.add('flash'); }
    if (el.ladder) { if (!el.ladder.childElementCount) for (let i = 0; i < M.BET_LADDER.length; i++) el.ladder.appendChild(document.createElement('i'));
      const kids = el.ladder.children; for (let i = 0; i < kids.length; i++) kids[i].classList.toggle('on', M.BET_LADDER[i] <= P.bet); }
  }
  function setSize(k) {
    if (!M.SIZES[k] || k === P.size) return;
    P.size = k; save(); L.R = Rof(k); staticDirty = true;
    renderSize(); updateOdds(shownAim, k); lastFrozen = M.priced(shownAim, k); renderFairTable(); snd('buttonTap');
  }
  function renderSize() {
    const idx = SIZE_KEYS.indexOf(P.size);
    el.sizeSeg.style.setProperty('--seg-idx', String(idx));
    for (const b of el.sizeSeg.querySelectorAll('.seg-btn')) b.setAttribute('aria-pressed', b.dataset.size === P.size ? 'true' : 'false');
    setText(el.fairSize, P.size);
  }
  function updateControls() {
    const broke = P.balanceCents < 100;
    el.topupBtn.hidden = !broke; el.againBtn.hidden = broke;
    el.caption.hidden = !broke; el.stage.classList.toggle('locked', broke);
    const canAgain = !broke && P.rounds > 0 && state !== 'AIMING' && P.balanceCents >= Math.min(P.bet, 1) * 100;
    el.againBtn.disabled = !canAgain;
    el.betUp.disabled = P.bet >= M.BET_LADDER[M.BET_LADDER.length - 1] || (P.bet * 100 >= P.balanceCents && M.BET_LADDER.indexOf(P.bet) >= 0 && P.bet >= Math.floor(P.balanceCents / 100));
    el.betDown.disabled = P.bet <= 1;
  }
  function topUp() { P.balanceCents += M.START_BALANCE_CENTS; P.topUps += 1; save(); tweenBalance(P.balanceCents, 600, true); updateControls(); updateStats(); snd('zoneWin'); }

  // ------------------------------------------------------------------ odds / ruler / stats
  let oddsCache = { aim: -1, size: '' };
  function updateOdds(aim, size) {
    const a = Math.round(aim * 1000) / 1000;
    if (oddsCache.aim === a && oddsCache.size === size) return;
    oddsCache = { aim: a, size };
    const p = M.probs(aim, size); const pr = M.priced(aim, size);
    const vals = [p.short, p.zone, p.hang, p.bust];
    const names = ['short', 'zone', 'hang', 'bust'];
    const apply = (root, barW) => {
      if (!root) return; const segs = root.querySelectorAll('.seg');
      for (let i = 0; i < 4; i++) { const pct = vals[i] * 100; const s = segs[i]; if (!s) continue; const pxw = Math.max(3, pct) / 100 * (barW || 360);
        s.style.flexBasis = Math.max(3, pct) + '%'; s.classList.toggle('narrow', pxw < 68); s.classList.toggle('tiny', pxw < 30);
        setText(s.querySelector('b'), String(Math.round(pct))); s.title = names[i] + ' ' + pct.toFixed(1) + '%'; }
    };
    apply(el.odds.querySelector('.odds-bar'), L.oddsW); apply(el.oddsCard, L.cardW);
    const showChip = pr.c >= M.PRICE_CHIP_MIN; const chipText = 'ALL PAYS ×' + pr.c.toFixed(2);
    el.oddsChip.hidden = !showChip; setText(el.oddsChip, chipText);
    if (el.oddsChipCard) { el.oddsChipCard.hidden = !showChip; setText(el.oddsChipCard, chipText); }
    setText(el.oddsPays, 'ZONE ' + M.fmtMult(pr.zoneMult) + ' · HANG ' + pr.hangBase.toFixed(2) + '–' + M.fmtMult(pr.hangMax));
    setText(el.aimRead, Math.round(aim * 100) + '%');
  }
  function updateStats() {
    const best = P.bestOverhang > 0 ? P.bestOverhang.toFixed(1) + '%' : '—';
    const big = P.bestWinCents > 0 ? fmtChips(P.bestWinCents) : '—';
    const rtp = '96.5%';
    setText(el.statBest, best); setText(el.statBiggest, big); setText(el.statRtp, rtp);
    setText(el.fairBest, best); setText(el.fairBiggest, big); setText(el.fairHangs, String(P.hangs)); setText(el.fairTopups, String(P.topUps));
    const se = SES.rounds > 0 ? (190 / Math.sqrt(SES.rounds)).toFixed(0) : '—';
    setText(el.fairSession, SES.rounds + ' rounds · wagered ' + M.fmtChips(SES.wagered) + ' · returned ' + M.fmtChips(SES.returned) + ' · realised RTP ' + (SES.wagered > 0 ? (SES.returned / SES.wagered * 100).toFixed(1) + '%' : '—') + (SES.rounds > 0 ? ' (±' + se + ' points at this sample size — swings are normal)' : ''));
  }
  function renderResults() {
    if (!el.results) return;
    const items = P.log.slice(-10).reverse();
    const html = items.map((r) => {
      const m = r.outcome === 'short' || r.outcome === 'bust' ? '—' : M.fmtMult(r.mult);
      const w = r.winCents > 0 ? '+' + fmt2(r.winCents) : '−' + fmt2(r.betCents);
      const pct = r.outcome === 'hang' ? (r.f * 100).toFixed(1) + '%' : r.outcome.toUpperCase();
      return '<li class="' + r.outcome + '"><span class="g"></span><span class="m">' + m + '</span><span>' + pct + '</span><span class="w">' + w + '</span></li>';
    }).join('');
    if (el.results.__h !== html) { el.results.__h = html; el.results.innerHTML = html; }
  }

  // ------------------------------------------------------------------ fairness panel
  function renderFairTable() {
    const tb = el.fairTable.querySelector('tbody'); const rows = M.table(P.size); const cur = Math.round(shownAim * 100);
    tb.innerHTML = rows.map((r) => '<tr' + (Math.round(r.aim * 100) === cur ? ' class="cur"' : '') + '><td>' + Math.round(r.aim * 100) + '%</td><td class="short">' + (r.pShort * 100).toFixed(1) + '</td><td class="zone">' + (r.pZone * 100).toFixed(1) + '</td><td class="hang">' + (r.pHang * 100).toFixed(1) + '</td><td class="bust">' + (r.pBust * 100).toFixed(1) + '</td><td>×' + r.c.toFixed(3) + '</td><td class="zone">' + M.fmtMult(r.zoneMult) + '</td><td class="hang">' + r.hangMin.toFixed(2) + '–' + M.fmtMult(r.hangMax) + '</td></tr>').join('');
  }
  function renderLog() {
    const tb = el.logTable.querySelector('tbody'); const items = P.log.slice().reverse();
    tb.innerHTML = items.map((r) => { const res = r.outcome === 'hang' ? 'HANG ' + (r.f * 100).toFixed(1) + '% ' + M.fmtMult(r.mult) : r.outcome === 'zone' ? 'ZONE ' + M.fmtMult(r.mult) : r.outcome.toUpperCase();
      return '<tr><td>' + r.n + '</td><td class="seed" title="' + (r.commit || '') + '">' + (r.commit ? r.commit.slice(0, 8) : '—') + '</td><td class="seed" title="' + r.seed + '">' + r.seed.slice(0, 8) + '…</td><td>' + Math.round(r.aim * 100) + '%</td><td>' + r.size + '</td><td>' + M.fmtChips(r.betCents) + '</td><td>' + r.X.toFixed(4) + '</td><td>' + (r.sStop * 100).toFixed(2) + '%</td><td class="' + r.outcome + '">' + res + '</td><td>' + (r.winCents ? '+' + fmt2(r.winCents) : '0') + '</td></tr>'; }).join('') || '<tr><td colspan="10" class="muted">No rounds yet.</td></tr>';
  }
  let lastFocus = null;
  function openFairness() {
    if (fairnessOpen) return;
    if (state === 'AIMING') cancelAim();
    fairnessOpen = true; lastFocus = document.activeElement;
    renderFairTable(); renderLog(); updateStats();
    el.togReduce.checked = RM(); el.togHeat.checked = !!P.heatMap;
    el.backdrop.hidden = false; el.sheet.hidden = false;
    requestAnimationFrame(() => { el.backdrop.classList.add('open'); el.sheet.classList.add('open'); });
    el.fairClose.focus();
    updateControls();
  }
  function closeFairness() {
    if (!fairnessOpen) return;
    fairnessOpen = false; el.backdrop.classList.remove('open'); el.sheet.classList.remove('open');
    setTimeout(() => { if (!fairnessOpen) { el.backdrop.hidden = true; el.sheet.hidden = true; } }, 280);
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) { /* ignore */ } }
    updateControls();
  }
  el.sheet.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const f = el.sheet.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])'); if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // ------------------------------------------------------------------ hint
  function showHint() { if (P.hintSeen) return; el.hint.hidden = false; hintVisible = true; requestAnimationFrame(() => el.hint.classList.add('show')); }
  function dismissHint() {
    if (!hintVisible) return; hintVisible = false; P.hintSeen = true; save();
    el.hint.classList.remove('show'); setTimeout(() => { if (!hintVisible) el.hint.hidden = true; }, 320);
  }

  // ------------------------------------------------------------------ input
  let aimPointer = null, startY = 0, pull = 0, aim = M.AIM_MIN, cancelRegion = false, aimMode = 'drag', chargeT0 = 0;
  let ghostA = M.AIM_MIN, ghostAlpha = 0, cloudAlpha = 0, ghostFlashT = -1e9;
  let ghostCrossed90 = false, ghostCrossedEdge = false;
  let audioUnlocked = false;
  function unlockAudio() { if (audioUnlocked) return; audioUnlocked = true; snd('init', { muted: !!P.muted }); snd('unlock'); snd('setMuted', !!P.muted); }

  function beginAim(mode) {
    clampBet();
    if (P.balanceCents < 100) { updateControls(); return false; }
    aimMode = mode; aim = M.AIM_MIN; pull = 0; cancelRegion = false; ghostA = P.lastAim; ghostAlpha = 0; cloudAlpha = 0; ghostCrossed90 = false; ghostCrossedEdge = false;
    if (mode === 'charge') { chargeT0 = now; }
    setState('AIMING');
    return true;
  }
  function cancelAim() {
    aimPointer = null; el.canvas.classList.remove('aiming');
    if (state !== 'AIMING') return;
    if (live && live.outcome && live.visible) { pushDissolve(live, 300); live = null; }
    setState('IDLE'); idlePuckAlpha = 1; idlePuckScale = 1;
  }
  el.canvas.addEventListener('pointerdown', (e) => {
    unlockAudio(); dismissHint();
    if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
    if (aimPointer !== null || (state === 'AIMING' && aimMode === 'charge')) return;
    if (canStartRound()) {
      if (!beginAim('drag')) return;
      aimPointer = e.pointerId; startY = e.clientY;
      try { el.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    } else if (state === 'SLIDING' || state.indexOf('RESOLVE') === 0) {
      if (!skipPointer) skipPointer = { id: e.pointerId, t0: now };
    }
  });
  el.canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== aimPointer || state !== 'AIMING') return;
    pull = e.clientY - startY;
    cancelRegion = pull < -M.CANCEL_UP_PX;
    aim = M.AIM_MIN + (M.AIM_MAX - M.AIM_MIN) * clamp((pull - M.PULL_DEAD_PX) / M.PULL_RANGE_PX, 0, 1);
  });
  const endPointer = (e) => {
    if (skipPointer && e.pointerId === skipPointer.id) { skipPointer = null; if (!skipping) speed = 1; }
    if (e.pointerId !== aimPointer) return;
    aimPointer = null; el.canvas.classList.remove('aiming');
    if (state !== 'AIMING') return;
    if (pull >= M.PULL_DEAD_PX && !cancelRegion) launch(aim); else cancelAim();
  };
  el.canvas.addEventListener('pointerup', endPointer);
  el.canvas.addEventListener('pointercancel', endPointer);
  el.canvas.addEventListener('lostpointercapture', (e) => { if (e.pointerId === aimPointer && state === 'AIMING') endPointer(e); });
  el.stage.addEventListener('contextmenu', (e) => e.preventDefault());
  el.corner.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
  el.corner.addEventListener('click', () => { unlockAudio(); openFairness(); });
  el.corner.style.pointerEvents = 'auto'; el.corner.style.cursor = 'pointer';

  // AGAIN: fires on pointerdown; held >= 450 ms = auto-repeat every 250 ms
  let againHold = null, againArmAt = 0;
  const againPress = () => {
    unlockAudio(); if (now < againArmAt) return; againArmAt = now + 200;
    againHold = { t0: now };
    if (canStartRound()) { launch(P.lastAim); snd('buttonTap'); }
  };
  const againRelease = () => { againHold = null; };
  el.againBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); if (el.againBtn.disabled) return; try { el.againBtn.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } againPress(); });
  el.againBtn.addEventListener('pointerup', againRelease); el.againBtn.addEventListener('pointercancel', againRelease); el.againBtn.addEventListener('lostpointercapture', againRelease);
  el.againBtn.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') e.preventDefault(); });
  el.topupBtn.addEventListener('click', () => { unlockAudio(); topUp(); });

  // bet pill
  let betHold = null;
  const holdStart = (dir) => (e) => { e.preventDefault(); unlockAudio(); if (e.currentTarget.disabled) return; try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } stepBet(dir); betHold = { dir, t0: now, last: now + 400 }; };
  const holdEnd = () => { betHold = null; };
  el.betDown.addEventListener('pointerdown', holdStart(-1)); el.betUp.addEventListener('pointerdown', holdStart(1));
  for (const b of [el.betDown, el.betUp]) { b.addEventListener('pointerup', holdEnd); b.addEventListener('pointercancel', holdEnd); b.addEventListener('lostpointercapture', holdEnd); }
  let valueHold = null;
  el.betValue.addEventListener('pointerdown', (e) => { unlockAudio(); valueHold = { t0: now, x: e.clientX, y: e.clientY, fired: false }; try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } });
  el.betValue.addEventListener('pointermove', (e) => { if (valueHold && Math.hypot(e.clientX - valueHold.x, e.clientY - valueHold.y) > 10) valueHold = null; });
  const valueEnd = () => { valueHold = null; };
  el.betValue.addEventListener('pointerup', valueEnd); el.betValue.addEventListener('pointercancel', valueEnd);

  // size segments (activate on click = pointerup inside)
  let segArmAt = 0;
  el.sizeSeg.addEventListener('click', (e) => { const b = e.target.closest('.seg-btn'); if (!b || now < segArmAt) return; segArmAt = now + 200; unlockAudio(); setSize(b.dataset.size); });
  // top bar
  el.balanceBtn.addEventListener('click', () => { unlockAudio(); openFairness(); });
  el.infoBtn.addEventListener('click', () => { unlockAudio(); if (fairnessOpen) closeFairness(); else openFairness(); });
  if (el.openFairness) el.openFairness.addEventListener('click', () => { unlockAudio(); openFairness(); });
  el.fairClose.addEventListener('click', closeFairness); el.backdrop.addEventListener('click', closeFairness);
  el.hintClose.addEventListener('click', dismissHint);
  function toggleMute() { P.muted = !P.muted; save(); el.muteBtn.setAttribute('aria-pressed', P.muted ? 'true' : 'false'); snd('setMuted', P.muted); }
  el.muteBtn.addEventListener('click', () => { unlockAudio(); toggleMute(); });
  el.togReduce.addEventListener('change', () => { P.reduceMotion = el.togReduce.checked; save(); applyReduceClass(); });
  el.togHeat.addEventListener('change', () => { P.heatMap = el.togHeat.checked; save(); staticDirty = true; });
  mqReduce.addEventListener && mqReduce.addEventListener('change', applyReduceClass);

  // keyboard
  let enterHold = null;
  document.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) || '';
    if (e.key === 'Escape') { if (fairnessOpen) { closeFairness(); return; } if (state === 'AIMING') { cancelAim(); return; } if (hintVisible) dismissHint(); return; }
    if (fairnessOpen || tag === 'INPUT' || tag === 'TEXTAREA') return;
    unlockAudio();
    switch (e.code) {
      case 'Space':
        e.preventDefault(); if (e.repeat) return;
        if (state === 'AIMING' || aimPointer !== null) return;
        if (canStartRound()) beginAim('charge');
        return;
      case 'Enter': case 'KeyR':
        e.preventDefault(); if (e.repeat) return; dismissHint();
        enterHold = { t0: now };
        if (canStartRound()) launch(P.lastAim);
        return;
      case 'ArrowLeft': e.preventDefault(); nudgeAim(-0.01); return;
      case 'ArrowRight': e.preventDefault(); nudgeAim(0.01); return;
      case 'ArrowUp': e.preventDefault(); if (e.shiftKey) maxBet(); else stepBet(1); return;
      case 'ArrowDown': e.preventDefault(); if (e.shiftKey) minBet(); else stepBet(-1); return;
      case 'Equal': case 'NumpadAdd': stepBet(1); return;
      case 'Minus': case 'NumpadSubtract': stepBet(-1); return;
      case 'Digit1': setSize('S'); return;
      case 'Digit2': setSize('M'); return;
      case 'Digit3': setSize('L'); return;
      case 'KeyM': toggleMute(); return;
      case 'KeyF': openFairness(); return;
      case 'KeyH': P.heatMap = !P.heatMap; save(); staticDirty = true; return;
      default: return;
    }
  });
  document.addEventListener('keyup', (e) => {
    if (e.code === 'Space') { if (state === 'AIMING' && aimMode === 'charge') launch(aim); }
    if (e.code === 'Enter' || e.code === 'KeyR') enterHold = null;
  });
  function nudgeAim(d) { P.lastAim = +clamp(Math.round((P.lastAim + d) * 100) / 100, M.AIM_MIN, M.AIM_MAX).toFixed(2); save(); ghostFlashT = now; shownAim = P.lastAim; lastFrozen = M.priced(P.lastAim, P.size); updateOdds(P.lastAim, P.size); snd('aimTick'); }
  window.addEventListener('blur', () => { againHold = null; enterHold = null; betHold = null; valueHold = null; if (!skipping) speed = 1; skipPointer = null; });
  document.addEventListener('visibilitychange', () => { snd('onVisibility', document.hidden); if (document.hidden) { againHold = null; enterHold = null; betHold = null; } });

  // ------------------------------------------------------------------ update
  function update(dt) {
    // virtual timers
    for (let i = vtimers.length - 1; i >= 0; i--) if (now >= vtimers[i].at) { const t = vtimers[i]; vtimers.splice(i, 1); t.fn(); }
    if (pendingShake && now >= pendingShake.at) { startShake(pendingShake.amp, pendingShake.dur); pendingShake = null; }
    // hold inputs
    if (skipPointer && !skipping && now - skipPointer.t0 >= 300) speed = 3;
    const holdAgain = againHold || enterHold;
    if (holdAgain && now - holdAgain.t0 >= 450 && now - lastLaunchT >= 250 && canStartRound()) { if (launch(P.lastAim)) vibrate(8); }
    if (betHold && now >= betHold.last) { stepBet(betHold.dir); betHold.last = now + 150; }
    if (valueHold && !valueHold.fired && now - valueHold.t0 >= 600) { valueHold.fired = true; maxBet(); }
    updateTs();
    const simDt = dt * ts;

    if (state === 'AIMING') {
      if (aimMode === 'charge') { const ph = ((now - chargeT0) / 1200) % 2; aim = M.AIM_MIN + (M.AIM_MAX - M.AIM_MIN) * (ph < 1 ? ph : 2 - ph); }
      const visible = aimMode === 'charge' || pull >= M.PULL_DEAD_PX;
      const k = 1 - Math.exp(-dt / 80);
      ghostA += (aim - ghostA) * k;
      ghostAlpha += ((visible ? 1 : 0) - ghostAlpha) * (1 - Math.exp(-dt / (visible ? 120 : 80)));
      cloudAlpha += ((visible ? 1 : 0) - cloudAlpha) * (1 - Math.exp(-dt / 200));
      if (visible) {
        updateOdds(aim, P.size); shownAim = aim; lastFrozen = M.priced(aim, P.size);
        const r = M.SIZES[P.size].r;
        if (!ghostCrossed90 && ghostA >= M.ZONE_START) { ghostCrossed90 = true; vibrate(8); snd('aimTick'); }
        if (ghostCrossed90 && ghostA < M.ZONE_START - 0.004) ghostCrossed90 = false;
        if (!ghostCrossedEdge && ghostA >= 1 - r) { ghostCrossedEdge = true; vibrate(8); snd('aimTick'); fx.push(flareFx(300, 'ledge', 0)); }
        if (ghostCrossedEdge && ghostA < 1 - r - 0.004) ghostCrossedEdge = false;
      }
      camTarget = 1;
    } else if (state === 'SLIDING') {
      updateSlide(simDt);
    } else {
      // resolve / payout / settle / idle timers
      const t = now - stateT0;
      if (state === 'RESOLVE_SHORT' && t >= 900) setState('SETTLE');
      else if (state === 'RESOLVE_ZONE' && t >= 800) setState('PAYOUT');
      else if (state === 'RESOLVE_HANG' && t >= 800 + (live ? live.freezeMs : 0)) setState('PAYOUT');
      else if (state === 'RESOLVE_BUST' && t >= 900) setState('SETTLE');
      else if (state === 'PAYOUT' && t >= 650) setState('SETTLE');
      else if (state === 'SETTLE' && t >= 400) { if (live && live.visible && !live.dissolveT0) live.dissolveT0 = now; live = null; setState('IDLE'); }
      if (state === 'IDLE') { camTarget = 1; const u = clamp((now - idleT0) / 300, 0, 1); idlePuckAlpha = easeOutCubic(u); idlePuckScale = lerp(0.9, 1, easeOutCubic(u)); }
      else if (state === 'SETTLE') camTarget = 1;
      if (live && live.bustT0 !== null) updateBust();
      if (live && live.stopT !== null && live.bustT0 === null) { const u = clamp((now - live.stopT) / 240, 0, 1); live.scale = 1 - 0.03 * Math.sin(u * Math.PI) * (1 - u); }
      if (live && live.dissolveT0 !== null) { const u = clamp((now - live.dissolveT0) / 400, 0, 1); live.alpha = 1 - easeInCubic(u); if (u >= 1) live.visible = false; }
    }
    // camera smoothing
    const tau = state === 'SLIDING' ? 90 : 150;
    camK += (camTarget - camK) * (1 - Math.exp(-dt / tau));
    if (RM()) camK = 1;
    // shake
    if (shake.amp > 0) { const u = (now - shake.t0) / shake.dur; if (u >= 1) { shake.amp = 0; shake.x = shake.y = 0; currentShakeAmp = 0; } else { const a = shake.amp * (1 - u) * (1 - u); currentShakeAmp = a; shake.x = (Math.random() * 2 - 1) * a; shake.y = (Math.random() * 2 - 1) * a; } }
    else { shake.x = shake.y = 0; currentShakeAmp = 0; }
    // balance tween
    if (bal.shown !== bal.to) {
      const u = clamp((now - bal.t0) / bal.dur, 0, 1); const e = easeOutCubic(u);
      const v = Math.round(lerp(bal.from, bal.to, e));
      if (bal.pulse && bal.ticks === 0 && v !== bal.from) { el.balance.classList.remove('pulse'); void el.balance.offsetWidth; el.balance.classList.add('pulse'); }
      if (bal.pulse && v > bal.shown) { const step = Math.max(1000, (bal.to - bal.from) / 20); if (v - bal.tickCents >= step && now - bal.lastTickAt >= 33) { bal.tickCents = v; bal.lastTickAt = now; snd('chipTick', bal.ticks); bal.ticks++; } }
      bal.shown = u >= 1 ? bal.to : v;
      setText(el.balance, fmtChips(bal.shown));
    }
    // payout line count-up
    if (payout) { const u = clamp((now - payout.t0) / payout.dur, 0, 1); const v = Math.round(lerp(0, payout.winCents, easeOutCubic(u))); setText(el.lockupWin, u > 0 ? '+' + fmt2(v) : ''); if (u >= 1) payout = null; }
    if (lockupAnim && lockupAnim.kind === 'pct') { const u = clamp((now - lockupAnim.t0) / Math.max(1, lockupAnim.dur), 0, 1); const v = lockupAnim.to * easeOutCubic(u); setText(el.lockupSub, (lockupAnim.best ? 'NEW BEST ' : '') + v.toFixed(1) + '%' + (lockupAnim.best ? '' : ' OVER THE EDGE')); if (u >= 1) lockupAnim = null; }
    // particles
    updateParticles(dt);
    // fx expiry
    for (let i = fx.length - 1; i >= 0; i--) if (now - fx[i].t0 >= fx[i].dur) fx.splice(i, 1);
    // void dust
    for (const d of dust) { d.y -= d.v * dt / 1000; if (d.y < -4) { d.y = L.ledgeY - 2; d.x = Math.random() * L.cssW; } }
    // lip shimmer phase is derived from now in render
  }

  function updateSlide(simDt) {
    const rd = live; if (!rd) { setState('IDLE'); return; }
    const r = rd.r;
    rd.tSim += simDt;
    let s = M.slidePos(rd.sStop, rd.tSim);
    if (!rd.crossed90 && s >= M.ZONE_START) { rd.crossed90 = true; popMult('zone', M.fmtMult(rd.priced.zoneMult)); snd('zoneTick'); }
    if (!rd.noseOver && s >= 1 - r) {
      rd.noseOver = true; rd.bracketT0 = now;
      const remainingNormal = (rd.lipT !== null ? rd.lipT : rd.T) - rd.tSim;
      let target = RM() ? 0.5 : M.SLOWMO;
      if (remainingNormal / target > M.CREEP_CAP_MS) target = Math.min(1, remainingNormal / M.CREEP_CAP_MS);
      if (remainingNormal > 100 * target) tweenTs(target, M.SLOWMO_IN_MS); // a fast bust stays fast
      snd('padStart');
    }
    if (rd.noseOver && s <= 1) {
      const f = clamp((s - (1 - r)) / (2 * r), 0, 0.5);
      const idx = Math.min(4, Math.floor(f * 10));
      while (rd.notes <= idx && rd.notes <= 4) { snd('hangNote', rd.notes); rd.notes++; }
      snd('padUpdate', f * 2);
      const m = rd.priced.multAt(f);
      if (m !== rd.lockupMultShown) { rd.lockupMultShown = m; el.lockupMult.className = 'lockup-mult num hang'; setText(el.lockupMult, M.fmtMult(m)); el.lockup.classList.add('show'); }
    }
    if (rd.sStop > 1 && s >= 1) { rd.s = 1; beginBust(); return; }
    rd.s = s;
    // trail sampling every 16 ms of sim time
    if (rd.tSim - rd.trailLast >= 16) { rd.trailLast = rd.tSim; rd.trail.push({ s, t: rd.tSim }); if (rd.trail.length > 10) rd.trail.shift(); }
    // puck spin: one turn per 0.25 lane
    rd.rot = (s - M.S0) / 0.25 * Math.PI * 2;
    // launch stretch
    const lu = clamp((now - rd.launchT) / 120, 0, 1); rd.scaleY = lerp(1.15, 1, easeOutBack(lu));
    // camera
    camTarget = RM() ? 1 : 1 + (M.CAM_ZOOM - 1) * smoothstep((s - M.CAM_START_S) / (0.20 - r));
    // glide audio follows speed
    const sp = M.slideSpeed(rd.sStop, rd.tSim); snd('glideUpdate', sp.v0 > 0 ? clamp(sp.v / sp.v0, 0, 1) * ts : 0);
    if (rd.tSim >= rd.T) stopPuck();
  }
  function updateBust() {
    const rd = live; const t = now - rd.bustT0;
    const R = Rof(rd.size);
    if (t < 250) { const u = t / 250; rd.scaleY = Math.max(0.1, Math.cos(u * u * Math.PI / 2)); rd.fallY = -R * 0.45 * u * u; rd.rot += 0.1; if (!rd.dusted && u > 0.9) { rd.dusted = true; emitDust(L.laneX, L.ledgeY, 10); } }
    else if (t < 700) { const u = (t - 250) / 450; const e = easeInCubic(u); rd.fallY = -R * 0.45 - 180 * e; rd.scale = lerp(1, 0.4, e); rd.alpha = 1 - e; rd.scaleY = lerp(0.1, 0.5, u); }
    else { rd.visible = false; }
  }
  function updateParticles(dt) {
    for (let i = 0; i < POOL; i++) { const p = parts[i]; if (!p.on) continue;
      const age = now - p.t0; if (age < 0) continue;
      const u = age / p.dur;
      if (u >= 1) { p.on = false; partsLive--; if (p.kind === 1 && !p.tick) { /* arrival */ } continue; }
      if (p.kind === 1) { const e = easeInOutCubic(u); const a = 1 - e; p.x = a * a * p.x0 + 2 * a * e * p.cx + e * e * p.x1; p.y = a * a * p.y0 + 2 * a * e * p.cy + e * e * p.y1; }
      else { p.vy += (p.kind === 2 ? 220 : 120) * dt / 1000; p.x += p.vx * dt / 1000; p.y += p.vy * dt / 1000; }
    }
  }

  // ------------------------------------------------------------------ render
  const worldToScreenX = (x) => L.laneX + (x - L.laneX) * camK + shake.x;
  const worldToScreenY = (y) => (L.ledgeY + M.CAM_PIVOT_DY) + (y - (L.ledgeY + M.CAM_PIVOT_DY)) * camK + shake.y;
  function render() {
    const g = ctx; const W = L.cssW, H = L.cssH;
    if (staticDirty) buildStatic();
    g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0); g.clearRect(0, 0, W, H);
    // ---- world pass
    g.save();
    const px = L.laneX, py = L.ledgeY + M.CAM_PIVOT_DY;
    g.translate(shake.x, shake.y); g.translate(px, py); g.scale(camK, camK); g.translate(-px, -py);
    g.drawImage(staticCanvas, 0, 0, W, H);
    drawDust(g); drawShimmer(g);
    const aiming = state === 'AIMING';
    if (aiming) drawCloud(g);
    for (const f of fx) if (f.world && now >= f.t0) { const u = clamp((now - f.t0) / f.dur, 0, 1); g.save(); f.draw(g, u); g.restore(); }
    drawRuler(g, lastFrozen || M.priced(P.lastAim, P.size), aiming);
    if (aiming) drawGhost(g, ghostA, ghostAlpha * 0.3, cancelRegion, aim > 1.0);
    else if (now - ghostFlashT < 600) drawGhost(g, P.lastAim, 0.3 * (1 - (now - ghostFlashT) / 600), false, P.lastAim > 1.0);
    drawWorldParticles(g);
    // idle puck at the foot
    if ((state === 'IDLE' || state === 'AIMING') && P.balanceCents >= 100) {
      const breath = 0.35 + 0.12 * Math.sin(now / 2400 * Math.PI * 2);
      drawPuckAt(L.laneX, L.footY, L.R, P.size, idlePuckAlpha, idlePuckScale, 1, 0, streakGlow(), null, breath);
    }
    if (live && live.visible) drawLive(g);
    g.restore();
    // ---- screen pass
    g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    drawChips(g);
    for (const f of fx) if (f.screen && now >= f.t0) { const u = clamp((now - f.t0) / f.dur, 0, 1); g.save(); f.draw(g, u); g.restore(); }
  }
  function drawDust(g) {
    g.fillStyle = '#FFFFFF';
    for (const d of dust) { const a = d.a * (0.7 + 0.3 * Math.sin(now / 1000 + d.ph)); g.globalAlpha = a; g.fillRect(d.x, d.y, d.s, d.s); }
    g.globalAlpha = 1;
  }
  function drawShimmer(g) {
    const ph = (now / 6000) % 1; const x = L.laneLeft + ph * L.laneW;
    drawGlow('white', x, L.ledgeY, 70, 0.28);
  }
  function drawCloud(g) {
    if (cloudAlpha <= 0.01) return;
    const A0 = ghostA; const half = 2.5 * M.SIGMA * A0 * L.pxPerUnit; const yc = yOf(A0);
    const r = M.SIZES[P.size].r; const edgeY = L.ledgeY;
    g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = cloudAlpha;
    g.save(); g.beginPath(); g.rect(L.laneLeft, edgeY, L.laneW, L.cssH); g.clip();
    g.drawImage(sprites.cloudTeal, L.laneLeft, yc - half, L.laneW, half * 2); g.restore();
    g.save(); g.beginPath(); g.rect(L.laneLeft - 40, -40, L.laneW + 80, edgeY + 40); g.clip();
    g.drawImage(sprites.cloudMag, L.laneLeft, yc - half, L.laneW, half * 2); g.restore();
    g.restore();
    // pay zone brightens when the ghost is inside it
    if (A0 >= M.ZONE_START && A0 < 1 - r) { const y90 = yOf(M.ZONE_START); const top = L.ledgeY + L.R; g.fillStyle = 'rgba(46,242,200,' + (0.08 * cloudAlpha) + ')'; g.fillRect(L.laneLeft, top, L.laneW, y90 - top); }
  }
  function drawGhost(g, a, alpha, grey, magenta) {
    if (alpha <= 0.005) return;
    const y = yOf(a); const R = L.R;
    g.save(); g.globalAlpha = alpha; g.setLineDash([4, 4]); g.lineWidth = 1.5;
    g.strokeStyle = grey ? 'rgba(160,170,190,1)' : magenta ? C.bust : '#CFF3FF';
    g.beginPath(); g.arc(L.laneX, y, R - 1, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]); g.fillStyle = grey ? 'rgba(160,170,190,0.25)' : magenta ? 'rgba(255,61,129,0.18)' : 'rgba(207,243,255,0.22)';
    g.beginPath(); g.arc(L.laneX, y, R - 1, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  function drawRuler(g, pr, liveNums) {
    if (!pr) return;
    const x = L.laneRight - 8; const R = L.R; const ledgeY = L.ledgeY; const y90 = yOf(M.ZONE_START);
    g.save(); g.font = '600 11px ' + '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'; g.textAlign = 'right'; g.textBaseline = 'middle';
    const tick = (y, color, alpha) => { g.globalAlpha = alpha; g.fillStyle = color; g.fillRect(L.laneRight - 10, Math.round(y) - 0.5, 10, 1); };
    const label = (y, text, color, alpha) => { g.globalAlpha = alpha; g.fillStyle = color; g.fillText(text, x - 12, y); tick(y, color, alpha * 0.9); };
    label(ledgeY - 25, 'BUST', C.bust, 0.5);
    label(ledgeY - 9, 'to ' + M.fmtMult(pr.hangMax), C.gold, 1);
    if (R >= 30) label(ledgeY + R / 2, M.fmtMult(pr.multAt(0.25)), C.ledge, 0.95);
    label(ledgeY + R + (R < 24 ? 4 : 1), M.fmtMult(pr.hangBase), C.ledge, 0.95);
    label(y90 + 1, M.fmtMult(pr.zoneMult), C.zone, 0.95);
    g.restore(); g.globalAlpha = 1;
  }
  function drawPuckAt(x, y, R, size, alpha, scale, scaleY, rot, glow, rim, glowAlpha) {
    if (alpha <= 0.003) return;
    const sp = sprites.puck[size]; if (!sp) return;
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.scale(scale, scale * scaleY);
    drawGlow(glow || 'teal', 0, 0, R * 4.4, glowAlpha === undefined ? 0.35 : glowAlpha);
    // soft shadow toward the foot
    ctx.globalAlpha = alpha * 0.45; ctx.drawImage(sprites.shadow, -R * 1.15, -R * 1.15 + 6, R * 2.3, R * 2.3); ctx.globalAlpha = alpha;
    const pad = 4; ctx.drawImage(sp, -R - pad, -R - pad, (R + pad) * 2, (R + pad) * 2);
    // rotating ring highlight (60° arc)
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = Math.max(1.5, R * 0.06); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, 0, R - 1.5, rot, rot + Math.PI / 3); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.arc(-R * 0.36, -R * 0.36, Math.max(1.5, R * 0.08), 0, Math.PI * 2); ctx.fill();
    if (rim) { ctx.strokeStyle = rim; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, R - 0.5, 0, Math.PI * 2); ctx.stroke(); drawGlow('magenta', 0, 0, R * 3, 0.35); }
    ctx.restore();
  }
  function drawLive(g) {
    const rd = live; const R = Rof(rd.size); const x = L.laneX; const y = yOf(rd.s) + (rd.fallY || 0);
    // trail
    if (rd.bustT0 === null && rd.stopT === null) {
      const n = RM() ? 5 : 10; const tr = rd.trail; const start = Math.max(0, tr.length - n);
      for (let i = start; i < tr.length; i++) { const t = tr[i]; const age = rd.tSim - t.t; const a = Math.exp(-age / 120) * 0.45; const k = Math.pow(0.9, tr.length - 1 - i);
        drawGlow(rd.glow, x, yOf(t.s), R * 2.6 * k, a); }
    }
    // reflection beyond the ledge
    const dEdge = (1 - rd.s) * L.pxPerUnit; const near = 3 * R;
    if (rd.bustT0 === null && dEdge < near && dEdge > -R) { const a = 0.25 * (1 - Math.max(0, dEdge) / near) * rd.alpha; const ry = 2 * L.ledgeY - yOf(rd.s); const sp = sprites.refl[rd.size];
      if (sp && a > 0.01) { g.save(); g.globalAlpha = a; g.translate(x, ry); g.scale(1, -0.8); const pad = 4; g.drawImage(sp, -R - pad, -R - pad, (R + pad) * 2, (R + pad) * 2); g.restore(); } }
    // puck
    const rim = rd.bustT0 !== null ? C.bust : null;
    const glowA = rd.outcome === 'hang' ? 0.5 : 0.35;
    drawPuckAt(x, y, R, rd.size, rd.alpha, rd.scale, rd.scaleY, rd.rot, rd.glow, rim, glowA);
    // overhang bracket
    if (rd.noseOver && rd.bustT0 === null && rd.s <= 1 + 1e-9) {
      const f = clamp((rd.s - (1 - rd.r)) / (2 * rd.r), 0, 0.5);
      const bx = x - R - 10; const noseY = yOf(rd.s) - R; const grow = easeOutCubic((now - rd.bracketT0) / 180);
      const top = L.ledgeY + (noseY - L.ledgeY) * grow;
      const color = rd.tier !== null && rd.tier >= 3 ? C.gold : rd.isBest ? C.gold : C.ledge;
      g.save(); g.globalAlpha = rd.alpha; g.strokeStyle = color; g.lineWidth = 1.5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(bx, L.ledgeY); g.lineTo(bx, top); g.moveTo(bx - 3, L.ledgeY); g.lineTo(bx + 3, L.ledgeY); g.moveTo(bx - 3, top); g.lineTo(bx + 3, top); g.stroke();
      g.font = '600 12px "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'; g.textAlign = 'right'; g.textBaseline = 'middle'; g.fillStyle = color;
      g.fillText((f * 100).toFixed(1) + '%', bx - 8, (L.ledgeY + top) / 2);
      g.restore();
    }
  }
  function drawWorldParticles(g) {
    for (let i = 0; i < POOL; i++) { const p = parts[i]; if (!p.on || p.kind === 1 || now < p.t0) continue; const u = (now - p.t0) / p.dur;
      if (p.kind === 2) drawGlow(p.color, p.x, p.y, p.size * 4 * (1 - u * 0.5), 0.8 * (1 - u));
      else { g.globalAlpha = 0.5 * (1 - u); g.fillStyle = '#3A1230'; g.fillRect(p.x, p.y, p.size, p.size); g.globalAlpha = 1; } }
  }
  function drawChips(g) {
    for (let i = 0; i < POOL; i++) { const p = parts[i]; if (!p.on || p.kind !== 1 || now < p.t0) continue; const u = (now - p.t0) / p.dur;
      const size = lerp(6, 3, u); const a = u > 0.85 ? (1 - u) / 0.15 : 1;
      drawGlow(p.color, p.x, p.y, size * 5, 0.5 * a);
      g.globalAlpha = a; g.fillStyle = p.color === 'teal' ? C.zone : p.color === 'gold' ? C.gold : C.ledge; g.beginPath(); g.arc(p.x, p.y, size / 2, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
  }

  // ------------------------------------------------------------------ main loop
  function frame(raw) {
    const rawDt = rawLast ? Math.min(raw - rawLast, 50) : 16; rawLast = raw;
    if (document.hidden) { requestAnimationFrame(frame); return; }
    const t0 = performance.now();
    const dt = rawDt * speed; now += dt;
    update(dt);
    render();
    const cost = performance.now() - t0;
    perf.times[perf.i] = cost; perf.i = (perf.i + 1) % perf.times.length; perf.n = Math.min(perf.n + 1, perf.times.length); perf.frames++;
    if ((perf.frames & 31) === 0) { const arr = Array.from(perf.times.subarray(0, perf.n)).sort((a, b) => a - b); perf.mean = arr.reduce((s, v) => s + v, 0) / Math.max(1, arr.length); perf.p95 = arr[Math.floor(arr.length * 0.95)] || 0; perf.rawDt = rawDt; }
    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------------ boot
  function boot() {
    applyReduceClass();
    el.muteBtn.setAttribute('aria-pressed', P.muted ? 'true' : 'false');
    snd('init', { muted: !!P.muted });
    renderBet(false); renderSize(); updateStats(); renderResults();
    setText(el.balance, fmtChips(P.balanceCents));
    lastFrozen = M.priced(P.lastAim, P.size); shownAim = P.lastAim; updateOdds(P.lastAim, P.size);
    newPending();
    relayout();
    if ('ResizeObserver' in window) new ResizeObserver(() => relayout()).observe(el.stage);
    window.addEventListener('resize', relayout); window.addEventListener('orientationchange', () => setTimeout(relayout, 60));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', relayout);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { staticDirty = true; }).catch(() => {});
    updateControls();
    setTimeout(showHint, 400);
    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------------ test / debug hook
  window.__overhang = {
    getState() {
      return {
        state, timeScale: ts, cameraK: camK, shakeAmp: currentShakeAmp, speed,
        aim: state === 'AIMING' ? aim : null, pull, lastAim: P.lastAim, bet: P.bet, size: P.size,
        layout: { pxPerUnit: L.pxPerUnit, ledgeY: L.ledgeY, R: L.R, laneW: L.laneW, laneX: L.laneX, cssW: L.cssW, cssH: L.cssH, dpr: L.dpr, footY: L.footY, canvasW: el.canvas.width, canvasH: el.canvas.height },
        frozen: lastFrozen ? { aim: lastFrozen.aim, c: lastFrozen.c, zoneMult: lastFrozen.zoneMult, hangBase: lastFrozen.hangBase, hangMax: lastFrozen.hangMax } : null,
        perf: { mean: perf.mean, p95: perf.p95, frames: perf.frames, rawDt: perf.rawDt || 0 },
        audioUnlocked, audioState: A && A.state ? A.state() : 'none', muted: !!P.muted, particlesLive: partsLive, fxLive: fx.length,
        live: live ? { id: live.id, s: live.s, sStop: live.sStop, aim: live.aim, size: live.size, tSim: live.tSim, T: live.T, outcome: live.outcome, f: live.f, mult: live.mult, winCents: live.winCents, tier: live.tier, noseOver: live.noseOver, visible: live.visible, X: live.X, seed: live.seedHex, commit: live.commit } : null,
        pendingCommit: pending.commit, pendingSeed: pending.hex, hintVisible, fairnessOpen, reduceMotion: RM(), rounds: P.rounds, hangs: P.hangs, bestOverhang: P.bestOverhang, bestWinCents: P.bestWinCents, topUps: P.topUps, streak: SES.streak, session: { wagered: SES.wagered, returned: SES.returned, rounds: SES.rounds },
        balanceShown: bal.shown,
      };
    },
    getBalanceCents: () => P.balanceCents,
    setSeedHex(hex) { newPending(String(hex)); return pending.hex; },
    setAim(a) { P.lastAim = clamp(+a, M.AIM_MIN, M.AIM_MAX); shownAim = P.lastAim; lastFrozen = M.priced(P.lastAim, P.size); updateOdds(P.lastAim, P.size); save(); return P.lastAim; },
    launch(a) { const r = launch(a === undefined ? P.lastAim : +a); return !!r; },
    playInstant(a, seedHex) { if (seedHex) newPending(String(seedHex)); if (!(state === 'IDLE' || state === 'PAYOUT' || state === 'SETTLE')) return null; return launch(a === undefined ? P.lastAim : +a, { instant: true }); },
    skip(on) { skipping = on === undefined ? true : !!on; speed = skipping ? 30 : 1; },
    setBalanceCents(c) { P.balanceCents = Math.max(0, Math.round(+c)); bal.shown = bal.to = P.balanceCents; setText(el.balance, fmtChips(P.balanceCents)); save(); updateControls(); },
    setSize, setBet(b) { if (M.BET_LADDER.includes(+b)) { P.bet = +b; renderBet(false); save(); updateControls(); } return P.bet; },
    openFairness, closeFairness, topUp,
    getLog: () => P.log.slice(), getProfile: () => JSON.parse(JSON.stringify(P)),
    math: M, config: { get reduceMotion() { return RM(); }, set reduceMotion(v) { P.reduceMotion = v; save(); applyReduceClass(); } },
  };

  boot();
})();
