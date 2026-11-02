/*!
 * OVERHANG — math.js
 * ------------------------------------------------------------------------------------
 * The complete math model, RNG + commit-reveal helpers and slide kinematics for the
 * OVERHANG demo (build spec §3, §4, §5.4, §9.9, Appendix A).
 *
 * Plain <script> file: attaches exactly ONE global, `window.OverhangMath`, and also
 * sets `module.exports` when loaded by Node so the test suite can `require()` it.
 * No dependencies, no build step, works from file://.
 *
 * Every function here is a pure function of its arguments and of the constants in
 * MATH. Nothing reads the balance, round history, DOM, clock or seed state — the
 * pricing factor is a function of aim and size only (spec §3.8), and the draw is a
 * function of the seed bytes only.
 *
 * EXAMPLE SEEDS (all for size L, aim 0.97; spec §9.9). Found at dev time by looping
 * over crypto-random seeds (scratchpad/tests/find-seeds.js). Only the first 8 bytes
 * feed the draw; the remaining 8 are just part of the committed seed.
 *
 *   short     4d01380b9bc61683d12198ef529e9bf7  -> s_stop 0.8599999  SHORT (clear short, no "by" suffix; no slow-mo)
 *   zone      8201b088b2e9fe9c7c760b3262cbed27  -> s_stop 0.9350000  ZONE, pays 1.25x
 *   hang375   ecdc0fae29d45da737bfb0c598b4df7b  -> s_stop 0.9900000  HANG 37.5%, 6.00x (the §2 timeline round)
 *   hang45    6e8a4f72c8a1f4bf14ab4ec1edb0b73c  -> s_stop 0.9968000  HANG 46.0%, 8.55x (tier 3 DEAD HANG)
 *   creepBust e39818c7e2a3221cbb03265fc0f3bc3c  -> s_stop 1.0060000  BUST, "over by 0.6%" (creeping tip, slow-mo fires)
 *
 * (s_stop = 0.97 * seedToDraw(hexToBytes(hex)).X, rounded to 7 decimals.)
 * ------------------------------------------------------------------------------------
 */
(function () {
  'use strict';

  // ==================================================================================
  // 1. Constants — spec Appendix A, copied verbatim.
  // ==================================================================================

  const MATH = {
    SIGMA: 0.10,            // wax lognormal sigma
    ZONE_START: 0.90,       // 90% line
    ZONE_MULT: 1.25,        // flat zone pay (base)
    K: Math.log(8) / 0.5,   // 4.1588830833596715 → 8x across the hang window
    RTP: 0.965,
    AIM_MIN: 0.90, AIM_MAX: 1.03,
    S0: 0.5,                // foot of the visible slab; puck rests here (presentation only)
    PULL_DEAD_PX: 8, PULL_RANGE_PX: 130, CANCEL_UP_PX: 20,
    SIZES: {
      S: { r: 0.016, a: 2.60, label: 'to 21×', freq: '1 in 16' },
      M: { r: 0.026, a: 1.74, label: 'to 14×', freq: '1 in 10' },
      L: { r: 0.040, a: 1.26, label: 'to 10×', freq: '1 in 6'  },
    },
    SLIDE_MS: 1300, SLIDE_MIN_MS: 800, SLIDE_MAX_MS: 1700,   // T = clamp(SLIDE_MS * sqrt(d / (1 - S0)), ...)
    SLOWMO: 0.3, SLOWMO_IN_MS: 150, SLOWMO_OUT_MS: 200, CREEP_CAP_MS: 1200,
    CAM_ZOOM: 1.3, CAM_START_S: 0.80, CAM_PIVOT_DY: 60,
    LAYOUT: { LANE_W_PHONE: 300, LANE_W_DESKTOP: 400, FOOT_PAD: 40, FOOT_PAD_SHORT: 16, SHORT_CANVAS_H: 480, LEDGE_Y_MIN: 100, LEDGE_Y_FLOOR: 60, PX_PER_UNIT_MIN: 560, PX_PER_UNIT_MAX: 1100 },
    PRICE_CHIP_MIN: 1.02,   // show "ALL PAYS ×c" only when c >= this
    BET_LADDER: [1, 2, 5, 10, 25, 50, 100, 250],
    START_BALANCE_CENTS: 100000,
    TIERS: [ [0.00, 'HANG'], [0.20, 'BIG HANG'], [0.40, 'DEAD HANG'], [0.47, 'FULL HANG'] ], // [minOverhang f, label]; ZONE is tier 0 by outcome
  };

  /** Defensive pricing clamp (spec §3.4): an assertion that never binds in [AIM_MIN, AIM_MAX]. */
  const C_MIN = 1.0;
  const C_MAX = 1.35;
  /** Simpson intervals for the hang integral (spec §3.4: 200, accurate to ~1e-7). */
  const SIMPSON_N = 200;
  const SQRT_2PI = Math.sqrt(2 * Math.PI);
  const TWO_32 = 4294967296; // 2^32

  // Guard the constants against accidental mutation by game code.
  deepFreeze(MATH);

  // ==================================================================================
  // 2. Small helpers
  // ==================================================================================

  function deepFreeze(o) {
    Object.freeze(o);
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v);
    }
    return o;
  }

  function clamp(x, lo, hi) {
    return x < lo ? lo : (x > hi ? hi : x);
  }

  /**
   * Floor to 0.01 with an epsilon so that values which are mathematically exact
   * hundredths (e.g. 1.25 * 1.0 = 1.25) never floor down to 1.24 because of binary
   * representation. All quoted multipliers go through this (spec §3.4 "floored to 0.01×").
   */
  function floor2(x) {
    return Math.floor(x * 100 + 1e-9) / 100;
  }

  /** Look up a size record by key, failing loudly on a typo ('S' | 'M' | 'L'). */
  function sizeOf(sizeKey) {
    if (!Object.prototype.hasOwnProperty.call(MATH.SIZES, sizeKey)) {
      throw new RangeError('OverhangMath: unknown puck size "' + sizeKey + '" (expected S, M or L)');
    }
    return MATH.SIZES[sizeKey];
  }

  /** Standard normal pdf φ(z). */
  function phi(z) {
    return Math.exp(-0.5 * z * z) / SQRT_2PI;
  }

  /**
   * erf(x) — Abramowitz & Stegun 7.1.26, max absolute error 1.5e-7.
   * Good enough for display and pricing (the Fairness panel quotes 1 decimal).
   */
  function erf(x) {
    const sign = x < 0 ? -1 : 1;
    const ax = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * ax);
    const poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
    return sign * (1 - poly * Math.exp(-ax * ax));
  }

  // ==================================================================================
  // 3. Probabilities, pricing and payouts (spec §3.2 – §3.6)
  // ==================================================================================

  /** Standard normal CDF Φ(x), via the A&S 7.1.26 erf approximation. */
  function Phi(x) {
    return 0.5 * (1 + erf(x / Math.SQRT2));
  }

  /**
   * Closed-form outcome probabilities for aim A and puck size (spec §3.3).
   * Returns fractions that sum to 1: { short, zone, hang, bust }.
   */
  function probs(aim, sizeKey) {
    const sz = sizeOf(sizeKey);
    const s = MATH.SIGMA;
    const pShortEdge = Phi(Math.log(MATH.ZONE_START / aim) / s); // P(s_stop < 0.90)
    const pNoseEdge = Phi(Math.log((1 - sz.r) / aim) / s);       // P(s_stop < 1 - r)
    const pLip = Phi(Math.log(1 / aim) / s);                     // P(s_stop <= 1)
    return {
      short: pShortEdge,
      zone: pNoseEdge - pShortEdge,
      hang: pLip - pNoseEdge,
      bust: 1 - pLip,
    };
  }

  /**
   * Base expected return per unit bet before pricing (spec §3.4):
   *   EV_base(A) = Z·P(zone) + ∫_{z1}^{z2} a·e^(K·f(A·e^(σz)))·φ(z) dz
   * The zone term is closed form; the hang integral uses Simpson's rule with 200
   * intervals strictly inside the hang window [z1, z2], where the integrand is smooth.
   * Cost ≈ 400 exp calls, well under 0.05 ms — safe to call every frame while aiming.
   */
  function evBase(aim, sizeKey) {
    const sz = sizeOf(sizeKey);
    const p = probs(aim, sizeKey);
    return MATH.ZONE_MULT * p.zone + hangMoment(aim, sz, 1);
  }

  /**
   * ∫_{z1}^{z2} (a·e^(K·f(A·e^(σz))))^pow · φ(z) dz by Simpson's rule, SIMPSON_N intervals.
   * pow = 1 is the base hang contribution to EV; pow = 2 gives the second moment used
   * for the payout standard deviation. The window [z1, z2] is exactly the hang region, so
   * the integrand is smooth everywhere it is sampled.
   */
  function hangMoment(aim, sz, pow) {
    const nose = 1 - sz.r;
    const twoR = 2 * sz.r;
    const z1 = Math.log(nose / aim) / MATH.SIGMA; // nose exactly at the edge (f = 0)
    const z2 = Math.log(1 / aim) / MATH.SIGMA;    // centre exactly on the lip (f = 0.5)
    const h = (z2 - z1) / SIMPSON_N;

    const g = function (z) {
      const sStop = aim * Math.exp(MATH.SIGMA * z);
      const f = (sStop - nose) / twoR;
      const m = sz.a * Math.exp(MATH.K * f);
      return (pow === 1 ? m : Math.pow(m, pow)) * phi(z);
    };

    let sum = g(z1) + g(z2);
    for (let i = 1; i < SIMPSON_N; i++) {
      sum += (i % 2 === 1 ? 4 : 2) * g(z1 + i * h);
    }
    return sum * h / 3;
  }

  let priceClampWarned = false;

  /**
   * Price factor c(A) = RTP / EV_base(A), clamped to [1.0, 1.35] (spec §3.4).
   * The clamp is an assertion: c ≥ 1.0023 for every aim in [AIM_MIN, AIM_MAX], so it
   * never binds; if it ever does we warn once (never console.error in normal play).
   */
  function price(aim, sizeKey) {
    const c = MATH.RTP / evBase(aim, sizeKey);
    if (c >= C_MIN && c <= C_MAX) return c;
    if (!priceClampWarned) {
      priceClampWarned = true;
      console.warn('OverhangMath.price: clamp bound for aim ' + aim + ' size ' + sizeKey + ' (c = ' + c + ')');
    }
    return clamp(c, C_MIN, C_MAX);
  }

  /**
   * Standard deviation of the priced payout per unit bet for an aim and size (before
   * flooring; spec §3.6 variance notes: ≈ 1.80 L, 2.05 M, 2.46 S at aim 0.97). The
   * Fairness panel's "±{se} points at this sample size" is 100 · payoutSd / sqrt(rounds).
   */
  function payoutSd(aim, sizeKey) {
    const sz = sizeOf(sizeKey);
    const c = price(aim, sizeKey);
    const p = probs(aim, sizeKey);
    const secondMoment = c * c * (MATH.ZONE_MULT * MATH.ZONE_MULT * p.zone + hangMoment(aim, sz, 2));
    const mean = c * evBase(aim, sizeKey); // = RTP unless the clamp bound
    return Math.sqrt(Math.max(secondMoment - mean * mean, 0));
  }

  /**
   * The full priced multiplier set for an aim and size — what game.js freezes at
   * release and prints on the ruler while aiming.
   *   zoneMult  = floor(ZONE_MULT·c·100)/100
   *   multAt(f) = floor(a·c·e^(K·f)·100)/100 for overhang fraction f (clamped to 0..0.5)
   *   hangBase  = multAt(0), hangMax = multAt(0.5)
   * Also carries r and a for convenience (nose position is 1 − r).
   */
  function priced(aim, sizeKey) {
    const sz = sizeOf(sizeKey);
    const c = price(aim, sizeKey);
    const ac = sz.a * c;
    const multAt = function (f) {
      return floor2(ac * Math.exp(MATH.K * clamp(f, 0, 0.5)));
    };
    return {
      aim: aim,
      size: sizeKey,
      r: sz.r,
      a: sz.a,
      c: c,
      zoneMult: floor2(MATH.ZONE_MULT * c),
      hangBase: multAt(0),
      hangMax: multAt(0.5),
      multAt: multAt,
    };
  }

  /**
   * Classify a stop position (puck centre, lane units) for a puck size (spec §3.2).
   * Returns { kind: 'short'|'zone'|'hang'|'bust', f } where f is the overhang fraction
   * (0 = nose at the edge, 0.5 = centre on the lip) for a hang and null otherwise.
   */
  function outcomeFor(sStop, sizeKey) {
    const sz = sizeOf(sizeKey);
    if (sStop > 1) return { kind: 'bust', f: null };
    if (sStop < MATH.ZONE_START) return { kind: 'short', f: null };
    const nose = 1 - sz.r;
    if (sStop < nose) return { kind: 'zone', f: null };
    return { kind: 'hang', f: clamp((sStop - nose) / (2 * sz.r), 0, 0.5) };
  }

  /**
   * Celebration tier (spec §5.4). zone → tier 0 'ZONE'; hang → tiers 1–4 by the TIERS
   * thresholds on f (HANG, BIG HANG, DEAD HANG, FULL HANG). Losing outcomes return
   * tier -1 with the lockup label ('SHORT' / 'BUST') so callers never need a null check.
   */
  function tierFor(kind, f) {
    if (kind === 'zone') return { tier: 0, label: 'ZONE' };
    if (kind === 'hang') {
      const ff = typeof f === 'number' ? f : 0;
      for (let i = MATH.TIERS.length - 1; i >= 0; i--) {
        if (ff >= MATH.TIERS[i][0]) return { tier: i + 1, label: MATH.TIERS[i][1] };
      }
      return { tier: 1, label: MATH.TIERS[0][1] };
    }
    if (kind === 'short') return { tier: -1, label: 'SHORT' };
    if (kind === 'bust') return { tier: -1, label: 'BUST' };
    throw new RangeError('OverhangMath.tierFor: unknown outcome kind "' + kind + '"');
  }

  /**
   * Payout in integer cents for a bet in cents and a (floored) multiplier:
   * floor(betCents · mult), with an epsilon so exact products never lose a cent to
   * binary rounding (spec §3.4 integer-cent arithmetic).
   */
  function roundWinCents(betCents, mult) {
    return Math.floor(betCents * mult + 1e-9);
  }

  // ==================================================================================
  // 4. RNG and commit-reveal (spec §3.8)
  // ==================================================================================

  /** Lower-case hex string of a byte array. */
  function bytesToHex(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
      out += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    }
    return out;
  }

  /** Byte array of a hex string (either case). Throws on odd length or non-hex characters. */
  function hexToBytes(hex) {
    if (typeof hex !== 'string' || hex.length % 2 !== 0 || /[^0-9a-fA-F]/.test(hex)) {
      throw new RangeError('OverhangMath.hexToBytes: not an even-length hex string');
    }
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
  }

  /**
   * Fresh 16-byte seed from a cryptographic source: crypto.getRandomValues in browsers
   * (available in every browsing context, secure or not), Node's crypto.randomBytes
   * otherwise. Throws rather than silently falling back to Math.random.
   */
  function newSeed() {
    const bytes = new Uint8Array(16);
    const webCrypto = (typeof globalThis !== 'undefined' && globalThis.crypto &&
      typeof globalThis.crypto.getRandomValues === 'function') ? globalThis.crypto : null;
    if (webCrypto) {
      webCrypto.getRandomValues(bytes);
    } else if (typeof require === 'function') {
      bytes.set(require('crypto').randomBytes(16));
    } else {
      throw new Error('OverhangMath.newSeed: no cryptographic random source available');
    }
    return { bytes: bytes, hex: bytesToHex(bytes) };
  }

  /** Big-endian uint32 from four bytes starting at offset. */
  function uint32be(bytes, o) {
    return bytes[o] * 16777216 + bytes[o + 1] * 65536 + bytes[o + 2] * 256 + bytes[o + 3];
  }

  /**
   * Deterministic draw from a seed (spec §3.8), exactly:
   *   u1 = (uint32be(bytes 0..3) + 0.5) / 2^32
   *   u2 = (uint32be(bytes 4..7) + 0.5) / 2^32
   *   Z  = sqrt(−2 ln u1) · cos(2π u2), clamped to [−6, 6]
   *   X  = exp(σ · Z)                      (the "wax"; s_stop = aim · X)
   * Accepts the seed as a Uint8Array (≥ 8 bytes) or as its hex string.
   */
  function seedToDraw(bytes) {
    const b = typeof bytes === 'string' ? hexToBytes(bytes) : bytes;
    if (!b || b.length < 8) throw new RangeError('OverhangMath.seedToDraw: seed needs at least 8 bytes');
    const u1 = (uint32be(b, 0) + 0.5) / TWO_32;
    const u2 = (uint32be(b, 4) + 0.5) / TWO_32;
    const Z = clamp(Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2), -6, 6);
    const X = Math.exp(MATH.SIGMA * Z);
    return { u1: u1, u2: u2, Z: Z, X: X };
  }

  /** UTF-8 bytes of a string (TextEncoder where available, manual encoder otherwise). */
  function utf8Bytes(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    const out = [];
    for (let i = 0; i < str.length; i++) {
      let cp = str.codePointAt(i);
      if (cp > 0xffff) i++; // surrogate pair consumed
      if (cp < 0x80) out.push(cp);
      else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
      else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    }
    return new Uint8Array(out);
  }

  /**
   * SHA-256 of a string (UTF-8) as lower-case hex — the round commit is
   * sha256Hex(seedHex). Resolves to null when no digest is available (e.g. a browser in
   * a non-secure context without crypto.subtle); the caller then shows `#--------`.
   * Never rejects.
   */
  function sha256Hex(str) {
    try {
      const subtle = (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) ?
        globalThis.crypto.subtle : null;
      if (subtle && typeof subtle.digest === 'function') {
        return Promise.resolve(subtle.digest('SHA-256', utf8Bytes(str)))
          .then(function (buf) { return bytesToHex(new Uint8Array(buf)); })
          .catch(function () { return null; });
      }
      if (typeof require === 'function') {
        return Promise.resolve(require('crypto').createHash('sha256').update(str, 'utf8').digest('hex'));
      }
    } catch (e) {
      /* fall through to null */
    }
    return Promise.resolve(null);
  }

  // ==================================================================================
  // 5. Slide kinematics (spec §6.6 / §9.4) — constant deceleration, exact stop
  //    s(t) = S0 + d·(1 − (1 − u)²), u = t / T, d = s_stop − S0
  // ==================================================================================

  /** Travel distance from the foot of the slab; floored at 0.001 so T and v0 stay finite. */
  function travel(sStop) {
    return Math.max(sStop - MATH.S0, 0.001);
  }

  /** Slide duration T in ms: clamp(SLIDE_MS · sqrt(d / (1 − S0)), SLIDE_MIN_MS, SLIDE_MAX_MS). */
  function slideDuration(sStop) {
    const d = travel(sStop);
    return clamp(MATH.SLIDE_MS * Math.sqrt(d / (1 - MATH.S0)), MATH.SLIDE_MIN_MS, MATH.SLIDE_MAX_MS);
  }

  /** Puck centre position (lane units) at sim time tSim ms after launch. Exactly sStop at t ≥ T. */
  function slidePos(sStop, tSim) {
    const d = travel(sStop);
    const u = clamp(tSim / slideDuration(sStop), 0, 1);
    if (u >= 1) return MATH.S0 + d; // === sStop whenever sStop ≥ S0 + 0.001
    const w = 1 - u;
    return MATH.S0 + d * (1 - w * w);
  }

  /**
   * Inverse of slidePos: the sim time (ms) at which the centre first reaches sTarget,
   * or null if the puck stops before getting there. Used for t_nose (slow-mo trigger at
   * sTarget = 1 − r) and t_lip (bust tip at sTarget = 1).
   *   u = 1 − sqrt(1 − (sTarget − S0) / d)
   */
  function slideTimeTo(sStop, sTarget) {
    if (!(sTarget <= sStop)) return null;
    if (sTarget <= MATH.S0) return 0;
    const ratio = Math.min((sTarget - MATH.S0) / travel(sStop), 1);
    return (1 - Math.sqrt(1 - ratio)) * slideDuration(sStop);
  }

  /**
   * Puck speed in lane units per ms at sim time tSim: v(t) = 2d(1 − u)/T.
   * v0 = slideSpeed(sStop, 0) = 2d/T; the glide audio uses v / v0. Exactly 0 at t ≥ T.
   */
  function slideSpeed(sStop, tSim) {
    const d = travel(sStop);
    const T = slideDuration(sStop);
    const u = clamp(tSim / T, 0, 1);
    return 2 * d * (1 - u) / T;
  }

  // ==================================================================================
  // 6. Fairness table and formatting (spec §3.6 step 10, §4)
  // ==================================================================================

  /**
   * Pricing table for one size, aims 0.90 … 1.03 in 0.01 steps (14 rows):
   * { aim, pShort, pZone, pHang, pBust, c, zoneMult, hangMin, hangMax, ev }
   * ev = c · EV_base = RTP for every row (before flooring).
   */
  function table(sizeKey) {
    const rows = [];
    const steps = Math.round((MATH.AIM_MAX - MATH.AIM_MIN) / 0.01);
    for (let i = 0; i <= steps; i++) {
      const aim = Math.round((MATH.AIM_MIN + i * 0.01) * 1000) / 1000;
      const p = probs(aim, sizeKey);
      const pr = priced(aim, sizeKey);
      rows.push({
        aim: aim,
        pShort: p.short,
        pZone: p.zone,
        pHang: p.hang,
        pBust: p.bust,
        c: pr.c,
        zoneMult: pr.zoneMult,
        hangMin: pr.hangBase,
        hangMax: pr.hangMax,
        ev: pr.c * evBase(aim, sizeKey),
      });
    }
    return rows;
  }

  /**
   * Chips from integer cents: '1,000' | '1,031.25' | '0.5' — thousands separators, up to
   * two decimals, trailing zeros trimmed. Negative values are not expected but render
   * with a leading '-' rather than garbage.
   */
  function fmtChips(cents) {
    let n = Math.round(Number(cents) || 0);
    const neg = n < 0;
    if (neg) n = -n;
    const whole = Math.floor(n / 100);
    const frac = n % 100;
    let out = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (frac !== 0) {
      out += '.' + (frac < 10 ? '0' + frac : String(frac)).replace(/0$/, '');
    }
    return (neg ? '-' : '') + out;
  }

  /** Multiplier text, always two decimals with the × sign: 6 → '6.00×'. */
  function fmtMult(m) {
    return Number(m).toFixed(2) + '×';
  }

  // ==================================================================================
  // 7. Example seeds (size L, aim 0.97) — see the header comment for how they were found.
  // ==================================================================================

  const EXAMPLE_SEEDS = Object.freeze({
    short: '4d01380b9bc61683d12198ef529e9bf7',     // s_stop 0.8599999 → SHORT
    zone: '8201b088b2e9fe9c7c760b3262cbed27',      // s_stop 0.9350000 → ZONE, 1.25×
    hang375: 'ecdc0fae29d45da737bfb0c598b4df7b',   // s_stop 0.9900000 → HANG f = 0.375, 6.00×
    hang45: '6e8a4f72c8a1f4bf14ab4ec1edb0b73c',    // s_stop 0.9968000 → HANG f = 0.460, 8.55×
    creepBust: 'e39818c7e2a3221cbb03265fc0f3bc3c', // s_stop 1.0060000 → BUST, over by 0.6%
  });

  // ==================================================================================
  // 8. Public API
  // ==================================================================================

  const OverhangMath = Object.freeze(Object.assign({}, MATH, {
    MATH: MATH, // the whole Appendix A block, for the __overhang debug hook (spec §9.9)

    Phi: Phi,
    probs: probs,
    evBase: evBase,
    price: price,
    payoutSd: payoutSd,
    priced: priced,
    outcomeFor: outcomeFor,
    tierFor: tierFor,
    roundWinCents: roundWinCents,

    newSeed: newSeed,
    hexToBytes: hexToBytes,
    bytesToHex: bytesToHex,
    seedToDraw: seedToDraw,
    sha256Hex: sha256Hex,

    slideDuration: slideDuration,
    slidePos: slidePos,
    slideTimeTo: slideTimeTo,
    slideSpeed: slideSpeed,

    table: table,
    fmtChips: fmtChips,
    fmtMult: fmtMult,

    EXAMPLE_SEEDS: EXAMPLE_SEEDS,
  }));

  if (typeof window !== 'undefined') window.OverhangMath = OverhangMath;
  if (typeof module !== 'undefined' && module.exports) module.exports = OverhangMath;
})();
