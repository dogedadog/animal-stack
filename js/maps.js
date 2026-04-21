// Map definitions. Platforms are shorter + higher up than a floor — skill test.
// Platform size is chosen per-match (practice/lobby): small|normal|big.

// Tuned for the 1200×720 landscape sim. Platform sits a little past half-way
// down and varies from compact (skill test) to roomy (easy mode).
const PLATFORM = { yFrac: 0.72, thick: 20 };
const PLATFORM_W_FRAC = { small: 0.13, normal: 0.19, big: 0.28 };

function platformWFrac(size) {
  return PLATFORM_W_FRAC[size] || PLATFORM_W_FRAC.normal;
}

const MAPS = {
  grass: {
    id: 'grass',
    name: 'Meadow',
    blurb: 'Flat, friendly, good for learning.',
    sky: ['#8ec6ff', '#d9f0ff'],
    makeGround(world, w, h, size = 'normal') {
      const y = h * PLATFORM.yFrac;
      const pw = w * platformWFrac(size);
      return [
        Matter.Bodies.rectangle(w / 2, y, pw, PLATFORM.thick, {
          isStatic: true, friction: 0.9, label: 'ground',
        }),
      ];
    },
    paintBackground(ctx, w, h, size = 'normal') {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#8ec6ff'); g.addColorStop(1, '#e8f7ff');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#9dd0a4';
      ctx.beginPath(); ctx.moveTo(0, h - 80);
      for (let x = 0; x <= w; x += 40) ctx.lineTo(x, h - 80 - Math.sin(x * 0.02) * 16 - 16);
      ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
      const y = h * PLATFORM.yFrac, pw = w * platformWFrac(size);
      ctx.fillStyle = 'rgba(90,160,90,0.35)';
      ctx.fillRect(w / 2 - pw * 0.1, y + 10, pw * 0.2, h - y);
    },
    paintGround(ctx, w, h, size = 'normal') {
      const y = h * PLATFORM.yFrac, pw = w * platformWFrac(size);
      ctx.fillStyle = '#3a7a3a';
      ctx.fillRect(w / 2 - pw / 2, y - PLATFORM.thick / 2, pw, PLATFORM.thick);
      ctx.fillStyle = '#2a5a2a';
      ctx.fillRect(w / 2 - pw / 2, y + PLATFORM.thick / 2 - 2, pw, 6);
    },
  },

  desert: {
    id: 'desert',
    name: 'Desert Dunes',
    blurb: 'Uneven sand dunes — pieces tilt as they land.',
    sky: ['#ffd27a', '#ffb066'],
    _spans(w, h, size) {
      const baseY = h * PLATFORM.yFrac;
      const pw = w * platformWFrac(size);
      return [
        { cx: w / 2 - pw * 0.33, y: baseY - 2, w: pw * 0.42, a: -0.12 },
        { cx: w / 2 + pw * 0.04, y: baseY - 10, w: pw * 0.38, a: 0.10 },
        { cx: w / 2 + pw * 0.36, y: baseY - 4, w: pw * 0.36, a: -0.06 },
      ];
    },
    makeGround(world, w, h, size = 'normal') {
      return this._spans(w, h, size).map(s => Matter.Bodies.rectangle(s.cx, s.y, s.w, PLATFORM.thick, {
        isStatic: true, angle: s.a, friction: 0.85, label: 'ground',
      }));
    },
    paintBackground(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#ffd27a'); g.addColorStop(1, '#ffe6b0');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fff3c2';
      ctx.beginPath(); ctx.arc(w * 0.8, h * 0.18, 36, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e0a55b';
      ctx.beginPath(); ctx.moveTo(0, h - 100);
      for (let x = 0; x <= w; x += 30) ctx.lineTo(x, h - 100 - Math.sin(x * 0.015) * 26);
      ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
    },
    paintGround(ctx, w, h, size = 'normal') {
      for (const s of this._spans(w, h, size)) {
        ctx.save();
        ctx.translate(s.cx, s.y); ctx.rotate(s.a);
        ctx.fillStyle = '#e8c079'; ctx.fillRect(-s.w / 2, -PLATFORM.thick / 2, s.w, PLATFORM.thick);
        ctx.fillStyle = '#c99a57'; ctx.fillRect(-s.w / 2, PLATFORM.thick / 2 - 2, s.w, 5);
        ctx.restore();
      }
    },
  },

  winter: {
    id: 'winter',
    name: 'Winter Lake',
    blurb: 'Slippery ice — pieces slide before they settle.',
    sky: ['#b9d7ff', '#e9f3ff'],
    makeGround(world, w, h, size = 'normal') {
      const y = h * PLATFORM.yFrac;
      const pw = w * platformWFrac(size);
      return [
        Matter.Bodies.rectangle(w / 2, y, pw, PLATFORM.thick, {
          isStatic: true, friction: 0.03, frictionStatic: 0.05, label: 'ground',
        }),
      ];
    },
    paintBackground(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#b9d7ff'); g.addColorStop(1, '#eef6ff');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#4a6a80';
      for (let i = 0; i < 6; i++) {
        const x = (i + 0.5) * (w / 6);
        ctx.beginPath();
        ctx.moveTo(x - 18, h - 90);
        ctx.lineTo(x, h - 150);
        ctx.lineTo(x + 18, h - 90);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (let i = 0; i < 50; i++) {
        const x = (i * 97) % w, y = (i * 53) % (h - 160);
        ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill();
      }
    },
    paintGround(ctx, w, h, size = 'normal') {
      const y = h * PLATFORM.yFrac, pw = w * platformWFrac(size);
      ctx.fillStyle = '#cfe6ff';
      ctx.fillRect(w / 2 - pw / 2, y - PLATFORM.thick / 2, pw, PLATFORM.thick);
      ctx.fillStyle = '#9ac0e6';
      ctx.fillRect(w / 2 - pw / 2, y + PLATFORM.thick / 2 - 2, pw, 5);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(w / 2 - pw / 2 + 16, y - PLATFORM.thick / 2 + 3, pw * 0.3, 2);
    },
  },
};

function listMaps() { return Object.values(MAPS); }
function getMap(id) { return MAPS[id] || MAPS.grass; }
function pickRandomMap() {
  const ids = ['grass', 'grass', 'desert', 'winter'];
  return MAPS[ids[Math.floor(Math.random() * ids.length)]];
}
