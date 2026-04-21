// Animal piece definitions.
// Compound Matter body + matching canvas painter — hitboxes follow the silhouette.
// Shapes intentionally have irregular contours (tails, ears, trunks, snouts,
// domed shells) so pieces are prone to rolling off when stacked.
// `rarity` weights spawn frequency. `big: true` marks hard-to-balance giants.

const ANIMALS = [
  {
    id: 'turtle',
    name: 'Turtle',
    rarity: 3,
    density: 0.002,
    parts: [
      // Domed shell: one dominant circle — rolls easily when tilted.
      { type: 'circle', x: 0, y: -6, r: 28, color: '#5db166' },
      { type: 'circle', x: 0, y: -8, r: 22, color: '#7fc987' },
      { type: 'circle', x: 0, y: -10, r: 14, color: '#9fe0a6' },
      // Stubby head & tail stick out — unbalance points.
      { type: 'circle', x: 30, y: 2, r: 11, color: '#7fc987' },
      { type: 'rect', x: -28, y: 0, w: 10, h: 6, color: '#5db166' },
      // Small feet — narrow contact base.
      { type: 'rect', x: -14, y: 18, w: 8, h: 7, color: '#5a9b63' },
      { type: 'rect', x: 14, y: 18, w: 8, h: 7, color: '#5a9b63' },
    ],
    eyes: [{ x: 34, y: 0, r: 2 }],
  },
  {
    id: 'rabbit',
    name: 'Rabbit',
    rarity: 3,
    density: 0.0012,
    parts: [
      { type: 'circle', x: 0, y: 8, r: 18, color: '#e9d6c4' },
      { type: 'circle', x: 0, y: -12, r: 13, color: '#e9d6c4' },
      // Tall ears — catch and rotate the piece.
      { type: 'rect', x: -8, y: -32, w: 6, h: 26, color: '#e9d6c4' },
      { type: 'rect', x: 8, y: -32, w: 6, h: 26, color: '#e9d6c4' },
      { type: 'rect', x: -8, y: -32, w: 3, h: 20, color: '#f6e5d4' },
      { type: 'rect', x: 8, y: -32, w: 3, h: 20, color: '#f6e5d4' },
      // Tail pom.
      { type: 'circle', x: -18, y: 14, r: 6, color: '#ffffff' },
      { type: 'rect', x: -10, y: 22, w: 8, h: 7, color: '#d4bba5' },
      { type: 'rect', x: 10, y: 22, w: 8, h: 7, color: '#d4bba5' },
    ],
    eyes: [{ x: -4, y: -12, r: 1.8 }, { x: 4, y: -12, r: 1.8 }],
    beak: { x: 0, y: -6, w: 3, h: 2, color: '#d06060' },
  },
  {
    id: 'penguin',
    name: 'Penguin',
    rarity: 2,
    density: 0.0018,
    parts: [
      // Rounded body — rocks side-to-side.
      { type: 'circle', x: 0, y: 6, r: 22, color: '#1a2340' },
      { type: 'circle', x: 0, y: 8, r: 15, color: '#f1f3ff' },
      { type: 'circle', x: 0, y: -18, r: 13, color: '#1a2340' },
      // Flipper wings sticking out.
      { type: 'rect', x: -20, y: 2, w: 6, h: 20, color: '#131a33' },
      { type: 'rect', x: 20, y: 2, w: 6, h: 20, color: '#131a33' },
      { type: 'rect', x: -10, y: 26, w: 10, h: 5, color: '#ffb84d' },
      { type: 'rect', x: 10, y: 26, w: 10, h: 5, color: '#ffb84d' },
    ],
    eyes: [{ x: -4, y: -18, r: 1.8, white: true }, { x: 4, y: -18, r: 1.8, white: true }],
    beak: { x: 0, y: -12, w: 6, h: 4, color: '#ffb84d' },
  },
  {
    id: 'fox',
    name: 'Fox',
    rarity: 2,
    density: 0.0015,
    parts: [
      { type: 'rect', x: 0, y: 4, w: 40, h: 24, color: '#e8803a' },
      { type: 'circle', x: 22, y: -6, r: 12, color: '#ef9752' },
      // Pointy ears.
      { type: 'rect', x: 16, y: -22, w: 5, h: 12, color: '#e8803a' },
      { type: 'rect', x: 28, y: -22, w: 5, h: 12, color: '#e8803a' },
      // Snout.
      { type: 'circle', x: 33, y: -2, r: 5, color: '#ffffff' },
      // Long bushy tail — offsets COM.
      { type: 'rect', x: -24, y: -4, w: 18, h: 7, color: '#e8803a' },
      { type: 'circle', x: -34, y: -6, r: 7, color: '#ffffff' },
      { type: 'rect', x: -16, y: 18, w: 8, h: 10, color: '#b95f22' },
      { type: 'rect', x: 14, y: 18, w: 8, h: 10, color: '#b95f22' },
    ],
    eyes: [{ x: 22, y: -6, r: 1.6 }],
    beak: { x: 33, y: -2, w: 3, h: 2, color: '#111' },
  },
  {
    id: 'owl',
    name: 'Owl',
    rarity: 2,
    density: 0.0017,
    parts: [
      { type: 'circle', x: 0, y: 0, r: 24, color: '#7d6a4c' },
      { type: 'circle', x: 0, y: 4, r: 18, color: '#b89a73' },
      // Ear tufts.
      { type: 'rect', x: -16, y: -22, w: 7, h: 14, color: '#5b4c36' },
      { type: 'rect', x: 16, y: -22, w: 7, h: 14, color: '#5b4c36' },
      // Wings on sides — unstable lateral mass.
      { type: 'circle', x: -20, y: 6, r: 10, color: '#6a5a40' },
      { type: 'circle', x: 20, y: 6, r: 10, color: '#6a5a40' },
      { type: 'rect', x: -6, y: 22, w: 6, h: 6, color: '#ffb84d' },
      { type: 'rect', x: 6, y: 22, w: 6, h: 6, color: '#ffb84d' },
    ],
    eyes: [{ x: -8, y: -2, r: 5, white: true, pupil: 2 }, { x: 8, y: -2, r: 5, white: true, pupil: 2 }],
    beak: { x: 0, y: 8, w: 4, h: 5, color: '#ffb84d' },
  },
  {
    id: 'bear',
    name: 'Bear',
    rarity: 2,
    density: 0.0022,
    parts: [
      { type: 'circle', x: 0, y: 2, r: 30, color: '#6e4e32' },
      { type: 'circle', x: 0, y: 2, r: 22, color: '#8a6142' },
      { type: 'circle', x: -22, y: -22, r: 9, color: '#6e4e32' },
      { type: 'circle', x: 22, y: -22, r: 9, color: '#6e4e32' },
      // Snout.
      { type: 'circle', x: 0, y: 10, r: 10, color: '#c99860' },
      // Paws sticking out.
      { type: 'circle', x: -28, y: 8, r: 8, color: '#6e4e32' },
      { type: 'circle', x: 28, y: 8, r: 8, color: '#6e4e32' },
    ],
    eyes: [{ x: -8, y: -2, r: 1.8 }, { x: 8, y: -2, r: 1.8 }],
    beak: { x: 0, y: 10, w: 4, h: 3, color: '#2a1d12' },
  },
  {
    id: 'elephant',
    name: 'Elephant',
    rarity: 1,
    density: 0.0023,
    parts: [
      { type: 'rect', x: 0, y: 0, w: 72, h: 50, color: '#8892b5' },
      { type: 'circle', x: 36, y: -12, r: 20, color: '#9aa3c6' },
      // Long trunk — protrudes forward.
      { type: 'rect', x: 56, y: 6, w: 10, h: 28, color: '#8892b5' },
      { type: 'circle', x: 56, y: 22, r: 7, color: '#8892b5' },
      { type: 'rect', x: 66, y: 22, w: 10, h: 6, color: '#8892b5' },
      // Flappy ears.
      { type: 'circle', x: 22, y: -18, r: 10, color: '#7b84a6' },
      { type: 'circle', x: 50, y: -22, r: 10, color: '#7b84a6' },
      // Legs — narrow stance to allow tipping.
      { type: 'rect', x: -24, y: 30, w: 11, h: 18, color: '#7b84a6' },
      { type: 'rect', x: -6, y: 30, w: 11, h: 18, color: '#7b84a6' },
      { type: 'rect', x: 12, y: 30, w: 11, h: 18, color: '#7b84a6' },
      { type: 'rect', x: 28, y: 30, w: 11, h: 18, color: '#7b84a6' },
      // Tail.
      { type: 'rect', x: -38, y: -2, w: 8, h: 5, color: '#7b84a6' },
    ],
    eyes: [{ x: 36, y: -14, r: 2 }],
  },
  {
    id: 'giraffe',
    name: 'Giraffe',
    rarity: 1,
    big: true,
    density: 0.0022,
    parts: [
      { type: 'rect', x: 0, y: 40, w: 56, h: 34, color: '#ecc66a' },
      // Long neck — top-heavy.
      { type: 'rect', x: 22, y: 2, w: 14, h: 62, color: '#ecc66a' },
      { type: 'circle', x: 30, y: -26, r: 13, color: '#ecc66a' },
      // Horns sticking up.
      { type: 'rect', x: 24, y: -40, w: 4, h: 10, color: '#ecc66a' },
      { type: 'rect', x: 36, y: -40, w: 4, h: 10, color: '#ecc66a' },
      { type: 'circle', x: 24, y: -44, r: 3, color: '#6b4a2a' },
      { type: 'circle', x: 36, y: -44, r: 3, color: '#6b4a2a' },
      // Legs + tail.
      { type: 'rect', x: -22, y: 66, w: 10, h: 22, color: '#d4ae4e' },
      { type: 'rect', x: -2, y: 66, w: 10, h: 22, color: '#d4ae4e' },
      { type: 'rect', x: 18, y: 66, w: 10, h: 22, color: '#d4ae4e' },
      { type: 'rect', x: -30, y: 32, w: 6, h: 14, color: '#d4ae4e' },
      // Spots.
      { type: 'circle', x: -12, y: 36, r: 5, color: '#a47a2a' },
      { type: 'circle', x: 10, y: 44, r: 4, color: '#a47a2a' },
      { type: 'circle', x: 22, y: 14, r: 3, color: '#a47a2a' },
      { type: 'circle', x: 22, y: 32, r: 3, color: '#a47a2a' },
    ],
    eyes: [{ x: 34, y: -26, r: 2 }],
  },
  {
    id: 'pig',
    name: 'Pig',
    rarity: 3,
    density: 0.0018,
    parts: [
      { type: 'circle', x: 0, y: 0, r: 24, color: '#f4a7b9' },
      { type: 'circle', x: 20, y: -2, r: 11, color: '#f4a7b9' },
      // Pointy triangle-ish ears.
      { type: 'rect', x: 14, y: -14, w: 5, h: 8, color: '#e69cae' },
      { type: 'rect', x: 24, y: -14, w: 5, h: 8, color: '#e69cae' },
      // Snout.
      { type: 'circle', x: 30, y: 2, r: 6, color: '#e88aa0' },
      // Curly tail — sticks out back.
      { type: 'circle', x: -24, y: -4, r: 5, color: '#f4a7b9' },
      { type: 'circle', x: -28, y: -10, r: 3, color: '#f4a7b9' },
      { type: 'rect', x: -14, y: 22, w: 8, h: 10, color: '#e08fa2' },
      { type: 'rect', x: 10, y: 22, w: 8, h: 10, color: '#e08fa2' },
    ],
    eyes: [{ x: 22, y: -3, r: 1.6 }],
    beak: { x: 30, y: 2, w: 4, h: 3, color: '#b56f84' },
  },
  {
    id: 'cow',
    name: 'Cow',
    rarity: 2,
    density: 0.0022,
    parts: [
      { type: 'rect', x: 0, y: 0, w: 60, h: 38, color: '#f7f3ea' },
      { type: 'circle', x: 28, y: -8, r: 14, color: '#f7f3ea' },
      // Horns.
      { type: 'rect', x: 20, y: -22, w: 10, h: 4, color: '#c8bfae' },
      { type: 'rect', x: 36, y: -22, w: 10, h: 4, color: '#c8bfae' },
      // Legs + tail.
      { type: 'rect', x: -24, y: 22, w: 9, h: 16, color: '#e8e2d3' },
      { type: 'rect', x: -6, y: 22, w: 9, h: 16, color: '#e8e2d3' },
      { type: 'rect', x: 12, y: 22, w: 9, h: 16, color: '#e8e2d3' },
      { type: 'rect', x: -28, y: 4, w: 5, h: 18, color: '#f7f3ea' },
      { type: 'circle', x: -28, y: 16, r: 4, color: '#2a2a2a' },
      // Black patches.
      { type: 'circle', x: -10, y: -4, r: 8, color: '#2a2a2a' },
      { type: 'circle', x: 8, y: 6, r: 6, color: '#2a2a2a' },
      { type: 'circle', x: -18, y: 10, r: 5, color: '#2a2a2a' },
    ],
    eyes: [{ x: 30, y: -10, r: 1.6 }],
    beak: { x: 36, y: -4, w: 5, h: 4, color: '#e8a6a0' },
  },
  {
    id: 'duck',
    name: 'Duck',
    rarity: 3,
    density: 0.0012,
    parts: [
      { type: 'circle', x: -2, y: 6, r: 20, color: '#fff5c8' },
      { type: 'circle', x: 16, y: -10, r: 12, color: '#fff5c8' },
      // Feathered tail tuft up-back.
      { type: 'circle', x: -20, y: -4, r: 6, color: '#fff5c8' },
      { type: 'rect', x: -10, y: 22, w: 5, h: 7, color: '#ffb84d' },
      { type: 'rect', x: 6, y: 22, w: 5, h: 7, color: '#ffb84d' },
    ],
    eyes: [{ x: 18, y: -12, r: 1.6 }],
    beak: { x: 28, y: -6, w: 12, h: 6, color: '#ff9a2e' },
  },
  {
    id: 'sheep',
    name: 'Sheep',
    rarity: 2,
    density: 0.0016,
    parts: [
      // Cloud-bumpy fleece — lots of small circles, very uneven contact.
      { type: 'circle', x: -14, y: 0, r: 12, color: '#f1f2f7' },
      { type: 'circle', x: -2, y: -8, r: 12, color: '#f1f2f7' },
      { type: 'circle', x: 10, y: -4, r: 12, color: '#f1f2f7' },
      { type: 'circle', x: -6, y: 10, r: 12, color: '#f1f2f7' },
      { type: 'circle', x: 6, y: 8, r: 10, color: '#f1f2f7' },
      { type: 'circle', x: 18, y: 6, r: 9, color: '#f1f2f7' },
      // Dark face & ears.
      { type: 'circle', x: 22, y: -4, r: 9, color: '#3a3040' },
      { type: 'rect', x: 18, y: -14, w: 4, h: 6, color: '#3a3040' },
      { type: 'rect', x: 26, y: -14, w: 4, h: 6, color: '#3a3040' },
      { type: 'rect', x: -10, y: 22, w: 6, h: 10, color: '#3a3040' },
      { type: 'rect', x: 8, y: 22, w: 6, h: 10, color: '#3a3040' },
    ],
    eyes: [{ x: 22, y: -5, r: 1.4, white: true, pupil: 0.8 }],
  },
  {
    id: 'frog',
    name: 'Frog',
    rarity: 3,
    density: 0.0015,
    parts: [
      { type: 'rect', x: 0, y: 6, w: 54, h: 24, color: '#5ec264' },
      { type: 'circle', x: -12, y: -8, r: 10, color: '#5ec264' },
      { type: 'circle', x: 12, y: -8, r: 10, color: '#5ec264' },
      // Big bug-eyes pop off the top.
      { type: 'circle', x: -12, y: -14, r: 7, color: '#f1f2f7' },
      { type: 'circle', x: 12, y: -14, r: 7, color: '#f1f2f7' },
      // Long hind legs sticking out sides.
      { type: 'rect', x: -30, y: 14, w: 12, h: 6, color: '#4ba050' },
      { type: 'rect', x: 24, y: 14, w: 12, h: 6, color: '#4ba050' },
      { type: 'rect', x: -26, y: 22, w: 8, h: 10, color: '#4ba050' },
      { type: 'rect', x: 20, y: 22, w: 8, h: 10, color: '#4ba050' },
    ],
    eyes: [
      { x: -12, y: -14, r: 3, white: false },
      { x: 12, y: -14, r: 3, white: false },
    ],
  },
  {
    id: 'hippo',
    name: 'Hippo',
    rarity: 1,
    big: true,
    density: 0.0026,
    parts: [
      { type: 'rect', x: 0, y: 0, w: 76, h: 42, color: '#9c8ea8' },
      { type: 'circle', x: -36, y: -4, r: 18, color: '#9c8ea8' },
      { type: 'rect', x: 36, y: -2, w: 26, h: 32, color: '#9c8ea8' },
      // Snout bump.
      { type: 'circle', x: 42, y: 8, r: 9, color: '#8b7d98' },
      { type: 'rect', x: 34, y: -20, w: 6, h: 6, color: '#9c8ea8' },
      { type: 'rect', x: 44, y: -20, w: 6, h: 6, color: '#9c8ea8' },
      // Tail.
      { type: 'rect', x: -52, y: -4, w: 6, h: 3, color: '#9c8ea8' },
      // Stubby legs.
      { type: 'rect', x: -26, y: 24, w: 11, h: 18, color: '#8b7d98' },
      { type: 'rect', x: -6, y: 24, w: 11, h: 18, color: '#8b7d98' },
      { type: 'rect', x: 14, y: 24, w: 11, h: 18, color: '#8b7d98' },
    ],
    eyes: [{ x: -30, y: -8, r: 2 }, { x: -40, y: -8, r: 2 }],
  },
  {
    id: 'cat',
    name: 'Cat',
    rarity: 3,
    density: 0.0014,
    parts: [
      { type: 'rect', x: 0, y: 4, w: 40, h: 26, color: '#c99860' },
      { type: 'circle', x: 18, y: -8, r: 13, color: '#c99860' },
      // Tall triangular ears.
      { type: 'rect', x: 10, y: -22, w: 5, h: 12, color: '#c99860' },
      { type: 'rect', x: 26, y: -22, w: 5, h: 12, color: '#c99860' },
      // Long curved tail — very unbalancing.
      { type: 'rect', x: -24, y: 0, w: 14, h: 5, color: '#c99860' },
      { type: 'rect', x: -32, y: -8, w: 5, h: 16, color: '#c99860' },
      { type: 'circle', x: -32, y: -16, r: 4, color: '#c99860' },
      // Legs.
      { type: 'rect', x: -14, y: 20, w: 6, h: 10, color: '#b07e4c' },
      { type: 'rect', x: 10, y: 20, w: 6, h: 10, color: '#b07e4c' },
    ],
    eyes: [{ x: 14, y: -8, r: 1.6 }, { x: 22, y: -8, r: 1.6 }],
    beak: { x: 18, y: -3, w: 3, h: 3, color: '#6b4a2a' },
  },
  {
    id: 'dog',
    name: 'Dog',
    rarity: 3,
    density: 0.0017,
    parts: [
      { type: 'rect', x: 0, y: 4, w: 44, h: 28, color: '#b07048' },
      { type: 'circle', x: 22, y: -6, r: 13, color: '#b07048' },
      // Floppy ears hanging down.
      { type: 'rect', x: 14, y: -16, w: 7, h: 16, color: '#8d583a' },
      { type: 'rect', x: 30, y: -16, w: 7, h: 16, color: '#8d583a' },
      // Long snout.
      { type: 'rect', x: 34, y: -2, w: 10, h: 8, color: '#b07048' },
      { type: 'circle', x: 40, y: -2, r: 4, color: '#2a1d12' },
      // Wagging tail sticking out.
      { type: 'rect', x: -28, y: -6, w: 12, h: 5, color: '#b07048' },
      { type: 'rect', x: -32, y: -14, w: 5, h: 10, color: '#b07048' },
      // Legs.
      { type: 'rect', x: -16, y: 20, w: 7, h: 12, color: '#8d583a' },
      { type: 'rect', x: 12, y: 20, w: 7, h: 12, color: '#8d583a' },
    ],
    eyes: [{ x: 18, y: -7, r: 1.6 }, { x: 26, y: -7, r: 1.6 }],
  },
];

// Master scale — tweak once here to grow/shrink every piece in lockstep.
// Sim is 1200×720; this keeps pieces readable without overwhelming the board.
const SIZE_SCALE = 1.6;

// Precompute each animal's weighted centre-of-mass and geometric (bbox) centre
// in DESIGN-space (unscaled). We use these at construction time to shift parts
// so that Matter's auto-computed COM lands on the visual centre of the piece.
// That lets every animal rest flat on the platform instead of tipping toward
// its heaviest cluster of parts.
for (const animal of ANIMALS) {
  let totalArea = 0, weightedX = 0, weightedY = 0;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of animal.parts) {
    const area = p.type === 'circle' ? Math.PI * p.r * p.r : p.w * p.h;
    weightedX += area * p.x;
    weightedY += area * p.y;
    totalArea += area;
    const hw = p.type === 'circle' ? p.r : p.w / 2;
    const hh = p.type === 'circle' ? p.r : p.h / 2;
    if (p.x - hw < minX) minX = p.x - hw;
    if (p.x + hw > maxX) maxX = p.x + hw;
    if (p.y - hh < minY) minY = p.y - hh;
    if (p.y + hh > maxY) maxY = p.y + hh;
  }
  animal._comX = weightedX / totalArea;
  animal._comY = weightedY / totalArea;
  animal._geoX = (minX + maxX) / 2;
  animal._geoY = (minY + maxY) / 2;
}

// Build a compound Matter body for an animal at (x, y) with rotation in radians.
// (x, y) is the body's centre of mass AND visual centre — parts are pre-shifted
// by (geoCentre − weightedCOM) so the auto-computed Matter COM lands on the
// bbox centre. Every animal therefore balances around its visual middle and
// rests flat on the platform instead of tipping toward a heavy tail/neck.
function makeAnimalBody(animal, x, y, angle = 0) {
  const s = SIZE_SCALE;
  const shiftX = (animal._geoX - animal._comX) * s;
  const shiftY = (animal._geoY - animal._comY) * s;
  const bodyParts = animal.parts.map(p => {
    if (p.type === 'circle') {
      return Matter.Bodies.circle(p.x * s + shiftX, p.y * s + shiftY, p.r * s, { render: { color: p.color } });
    }
    return Matter.Bodies.rectangle(p.x * s + shiftX, p.y * s + shiftY, p.w * s, p.h * s, { render: { color: p.color } });
  });
  const compound = Matter.Body.create({
    parts: bodyParts,
    friction: 0.9,
    frictionStatic: 1.3,
    frictionAir: 0.015,
    restitution: 0,
    density: (animal.density || 0.002) * 0.6,
    label: 'animal:' + animal.id,
    slop: 0.05,
  });
  Matter.Body.setPosition(compound, { x, y });
  if (angle) Matter.Body.setAngle(compound, angle);
  compound.animalId = animal.id;
  return compound;
}

function drawAnimal(ctx, body, animal, { ghost = false } = {}) {
  ctx.save();
  ctx.globalAlpha = ghost ? 0.55 : 1;

  const startIdx = body.parts.length > 1 ? 1 : 0;
  for (let i = startIdx; i < body.parts.length; i++) {
    const part = body.parts[i];
    ctx.fillStyle = (part.render && part.render.color) || '#fff';
    if (part.circleRadius) {
      ctx.beginPath();
      ctx.arc(part.position.x, part.position.y, part.circleRadius, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const v = part.vertices;
      ctx.beginPath();
      ctx.moveTo(v[0].x, v[0].y);
      for (let k = 1; k < v.length; k++) ctx.lineTo(v[k].x, v[k].y);
      ctx.closePath();
      ctx.fill();
    }
  }

  const s = SIZE_SCALE;
  // Eyes/beak design coords were not shifted when parts were (makeAnimalBody
  // applies the COM shift directly to parts). Apply the same shift here so
  // decorations paint on the same spot on the body.
  const shiftX = (animal._geoX - animal._comX) * s;
  const shiftY = (animal._geoY - animal._comY) * s;
  const cx = body.position.x, cy = body.position.y, ang = body.angle;
  const cos = Math.cos(ang), sin = Math.sin(ang);
  const project = (ox, oy) => {
    const dx = ox + shiftX, dy = oy + shiftY;
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
  };

  if (animal.eyes) {
    for (const eye of animal.eyes) {
      const p = project(eye.x * s, eye.y * s);
      const er = eye.r * s;
      if (eye.white) {
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(p.x, p.y, er, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.arc(p.x, p.y, (eye.pupil || eye.r * 0.5) * s, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.arc(p.x, p.y, er, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  if (animal.beak) {
    const p = project(animal.beak.x * s, animal.beak.y * s);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(ang);
    ctx.fillStyle = animal.beak.color || '#ffb84d';
    const w = (animal.beak.w || 4) * s, h = (animal.beak.h || 4) * s;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.restore();
  }

  ctx.restore();
}

function pickRandomAnimal() {
  const pool = [];
  for (const a of ANIMALS) for (let i = 0; i < a.rarity; i++) pool.push(a);
  return pool[Math.floor(Math.random() * pool.length)];
}

function getAnimal(id) { return ANIMALS.find(a => a.id === id); }
