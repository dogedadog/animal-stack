// Core game: Matter.js loop, input, turn system, bot AI, plus a net mode
// where the active player simulates locally and broadcasts the full stack
// snapshot on turn end. window.Game is the public surface.

(() => {
  const ROTATE_STEP = Math.PI / 4;
  const DROP_Y = 40;
  const FALL_MARGIN = 300;
  const OFFSCREEN_X_MARGIN = 150;
  const FALL_MIN_DOWN_V = 2;

  // Fixed simulation dimensions — all physics, positions broadcast over the
  // network, and coordinates in animal/map/preview code are expressed in this
  // 400×800 "sim space". The canvas renders by letterboxing sim space into
  // whatever CSS size the device gives us, so a piece at sim x=250 looks like
  // the same spot on every phone.
  const SIM_W = 400;
  const SIM_H = 800;

  const SETTLE_LIN_V = 0.08;
  const SETTLE_ANG_V = 0.005;
  const SETTLE_FRAMES = 28;
  const MIN_SETTLE_MS = 600;

  // When a piece settles we put it to sleep (Matter's built-in dormancy) and
  // bump friction. Sleeping = no jitter and it holds position exactly, but a
  // new piece colliding with it wakes it back up so collisions still transfer
  // momentum. Much nicer feel than setStatic.
  const LOCK_FRICTION = 1.8;
  const LOCK_FRICTION_AIR = 0.06;

  let engine, world, runner;
  let canvas, ctx;
  let W = SIM_W, H = SIM_H, DPR = 1;
  // Letterbox transform state: sim (0..W, 0..H) maps to canvas pixels via scale+offset.
  let renderScale = 1, renderOffsetX = 0, renderOffsetY = 0;

  let map = null;
  let platformSize = 'normal';
  let groundBodies = [];
  let placedBodies = [];

  let preview = null;
  let currentTurn = 0;
  let players = [];       // [{ name, type: 'you'|'bot'|'net' }]
  let score = 0;
  let running = false;
  let gameOverCalled = false;
  let ignoreUntil = 0;
  let inputLocked = false;

  let settlingBody = null;
  let settlingStartedAt = 0;
  let stillFrames = 0;

  // Net mode state — only populated when start({ netMode: true }).
  let net = null;   // { code, mySeat, playersNet: [{uid,name,seat}], onBroadcastTurnEnd, onBroadcastGameOver }
  let lastAppliedTurnSeat = -1;

  let onGameOver = null;
  let onScore = null;
  let onTurn = null;
  let onStatus = null;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = rect.width, cssH = rect.height;
    canvas.width = Math.round(cssW * DPR);
    canvas.height = Math.round(cssH * DPR);
    // Sim dimensions are fixed — devices differ only in the CSS→sim scale.
    W = SIM_W; H = SIM_H;
    renderScale = Math.min(cssW / SIM_W, cssH / SIM_H);
    renderOffsetX = (cssW - SIM_W * renderScale) / 2;
    renderOffsetY = (cssH - SIM_H * renderScale) / 2;
  }

  function buildMap() {
    for (const g of groundBodies) Matter.World.remove(world, g);
    groundBodies = map.makeGround(world, W, H, platformSize);
    Matter.World.add(world, groundBodies);
  }

  function clearPieces() {
    for (const b of placedBodies) Matter.World.remove(world, b);
    placedBodies = [];
    settlingBody = null;
  }

  function groundBottomY() {
    let bot = 0;
    for (const g of groundBodies) bot = Math.max(bot, g.bounds.max.y);
    return bot;
  }

  function pickLocalAnimal() { return pickRandomAnimal(); }

  function spawnPreview(animalId) {
    const animal = animalId ? getAnimal(animalId) : pickLocalAnimal();
    preview = { animal, x: W / 2, angle: 0 };
  }

  function dropPreview() {
    if (!preview || inputLocked) return;
    const body = makeAnimalBody(preview.animal, preview.x, DROP_Y, preview.angle);
    body.placedBy = currentTurn;
    Matter.World.add(world, body);
    placedBodies.push(body);
    ignoreUntil = performance.now() + 400;

    settlingBody = body;
    settlingStartedAt = performance.now();
    stillFrames = 0;

    inputLocked = true;
    preview = null;
    score = placedBodies.length;
    if (onScore) onScore(score);
    if (onStatus) onStatus('Settling…');
  }

  function onPieceSettled(body) {
    Matter.Body.set(body, 'friction', LOCK_FRICTION);
    Matter.Body.set(body, 'frictionAir', LOCK_FRICTION_AIR);
    Matter.Sleeping.set(body, true);
    body.settled = true;

    if (!running || gameOverCalled) return;

    if (net) {
      // Broadcast full snapshot + next turn + next animal. Remote update will
      // drive the turn change on every client (including us).
      const placements = placedBodies.map(b => ({
        animalId: b.animalId,
        x: b.position.x,
        y: b.position.y,
        angle: b.angle,
        placedBy: b.placedByUid || (net.playersNet[b.placedBy] && net.playersNet[b.placedBy].uid) || null,
      }));
      const nextSeat = (currentTurn + 1) % net.playersNet.length;
      const nextAnimalId = pickLocalAnimal().id;
      if (onStatus) onStatus('');
      if (net.onBroadcastTurnEnd) net.onBroadcastTurnEnd(placements, nextSeat, nextAnimalId);
      // Keep input locked until we receive the remote echo (which re-spawns preview if it's our turn next).
      return;
    }

    currentTurn = (currentTurn + 1) % players.length;
    spawnPreview();
    inputLocked = false;
    if (onTurn) onTurn(players[currentTurn]);
    if (onStatus) onStatus('');

    if (players[currentTurn].type === 'bot') {
      setTimeout(botMove, 700 + Math.random() * 500);
    }
  }

  function updateSettling() {
    if (!settlingBody) return;
    const now = performance.now();
    if (now - settlingStartedAt < MIN_SETTLE_MS) return;

    const v = Math.hypot(settlingBody.velocity.x, settlingBody.velocity.y);
    const av = Math.abs(settlingBody.angularVelocity);
    if (v < SETTLE_LIN_V && av < SETTLE_ANG_V) {
      stillFrames++;
      if (stillFrames >= SETTLE_FRAMES) {
        const done = settlingBody;
        settlingBody = null;
        stillFrames = 0;
        onPieceSettled(done);
      }
    } else {
      stillFrames = 0;
    }
  }

  function botMove() {
    if (!running || gameOverCalled || !preview) return;
    const target = topOfStackX();
    const jitter = (Math.random() - 0.5) * 40;
    preview.x = clampX(target + jitter);
    if (Math.random() < 0.4) preview.angle += ROTATE_STEP;
    setTimeout(() => { if (running && !gameOverCalled) dropPreview(); }, 500);
  }

  function topOfStackX() {
    if (placedBodies.length === 0) return W / 2;
    let highest = null;
    for (const b of placedBodies) {
      if (!highest || b.bounds.min.y < highest.bounds.min.y) highest = b;
    }
    return highest.position.x;
  }

  function clampX(x) {
    const margin = 20;
    return Math.max(margin, Math.min(W - margin, x));
  }

  let touchStart = null;
  function attachInput() {
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
  }
  function detachInput() {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp);
  }
  function localX(e) {
    // Convert screen pixel → sim-space x, undoing the letterbox transform.
    const r = canvas.getBoundingClientRect();
    const cssX = e.clientX - r.left;
    return (cssX - renderOffsetX) / renderScale;
  }
  function isMyTurn() {
    if (net) return currentTurn === net.mySeat;
    return players[currentTurn] && players[currentTurn].type !== 'bot';
  }
  function onDown(e) {
    if (inputLocked || !preview || !isMyTurn()) return;
    canvas.setPointerCapture(e.pointerId);
    touchStart = { x: localX(e), t: performance.now(), moved: false, pointerId: e.pointerId };
  }
  function onMove(e) {
    if (!touchStart || e.pointerId !== touchStart.pointerId) return;
    const x = localX(e);
    if (Math.abs(x - touchStart.x) > 5) touchStart.moved = true;
    if (preview) preview.x = clampX(x);
  }
  function onUp(e) {
    if (!touchStart || e.pointerId !== touchStart.pointerId) return;
    const dt = performance.now() - touchStart.t;
    if (!touchStart.moved && dt < 300 && preview) {
      preview.angle += ROTATE_STEP;
    }
    touchStart = null;
  }

  function applyMapEffects() {
    if (map.id !== 'desert') return;
    for (const b of placedBodies) {
      if (b.isStatic || b.isSleeping) continue;
      if (Math.abs(b.velocity.y) < 0.2 && Math.abs(b.velocity.x) < 0.2) {
        for (const g of groundBodies) {
          const dx = b.position.x - g.position.x;
          const dy = b.position.y - g.position.y;
          if (Math.abs(dx) < g.bounds.max.x - g.position.x + 10 && dy < 0 && dy > -80) {
            const tilt = Math.sin(g.angle);
            Matter.Body.applyForce(b, b.position, { x: tilt * 0.0006 * b.mass, y: 0 });
          }
        }
      }
    }
  }

  function checkFellOff() {
    if (performance.now() < ignoreUntil) return;
    // Authority rule for net mode: only the active player runs fall detection.
    if (net && currentTurn !== net.mySeat) return;
    const yLimit = groundBottomY() + FALL_MARGIN;
    for (const b of placedBodies) {
      const below = b.position.y > yLimit;
      const offSide = b.position.x < -OFFSCREEN_X_MARGIN || b.position.x > W + OFFSCREEN_X_MARGIN;
      // Sleeping or resting pieces never trigger — only pieces that are
      // actively moving downward (really falling) can end the game.
      const falling = !b.isSleeping && b.velocity.y > FALL_MIN_DOWN_V;
      if ((below && falling) || (offSide && falling)) {
        console.log('[animal-stack] fall-off triggered',
          b.animalId, 'pos', Math.round(b.position.x), Math.round(b.position.y),
          'vy', b.velocity.y.toFixed(2), 'limit', Math.round(yLimit));
        triggerGameOver(b);
        return;
      }
    }
  }

  function triggerGameOver(fallenBody) {
    if (gameOverCalled) return;
    gameOverCalled = true;
    running = false;
    inputLocked = true;
    if (onStatus) onStatus('');

    if (net) {
      // Only the active player (who simulates) should broadcast — but be safe
      // and let the first detector write; Firebase write-wins handles the race.
      const loserSeat = fallenBody.placedBy;
      const loser = net.playersNet[loserSeat] || net.playersNet[0];
      if (net.onBroadcastGameOver) net.onBroadcastGameOver(loser.uid, loser.name, placedBodies.length - 1);
      return;
    }

    const loser = players[fallenBody.placedBy] || players[0];
    if (onGameOver) onGameOver({ loser, score: placedBodies.length - 1 });
  }

  function drawSettlingHighlight() {
    if (!settlingBody) return;
    const b = settlingBody;
    const cx = b.position.x, cy = b.position.y;
    const w = b.bounds.max.x - b.bounds.min.x;
    const h = b.bounds.max.y - b.bounds.min.y;
    const r = Math.max(w, h) / 2 + 6 + 3 * Math.sin(performance.now() / 140);
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 184, 77, 0.75)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  function loop() {
    if (!ctx) return;

    // Clear the full backing canvas in screen space, then set the sim transform
    // so all game drawing happens in 0..SIM_W × 0..SIM_H coordinates.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b1020';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(DPR * renderScale, 0, 0, DPR * renderScale,
                     DPR * renderOffsetX, DPR * renderOffsetY);

    map.paintBackground(ctx, W, H, platformSize);
    map.paintGround(ctx, W, H, platformSize);

    for (const b of placedBodies) {
      const animal = getAnimal(b.animalId);
      drawAnimal(ctx, b, animal);
    }
    drawSettlingHighlight();

    if (preview && running && !gameOverCalled && isMyTurn()) {
      const previewBody = makeAnimalBody(preview.animal, preview.x, DROP_Y, preview.angle);
      drawAnimal(ctx, previewBody, preview.animal, { ghost: true });
    }

    if (running) {
      applyMapEffects();
      updateSettling();
      checkFellOff();
    }

    requestAnimationFrame(loop);
  }

  function rebuildFromPlacements(placements) {
    for (const b of placedBodies) Matter.World.remove(world, b);
    placedBodies = [];
    if (!placements) return;
    for (const p of placements) {
      const animal = getAnimal(p.animalId);
      if (!animal) continue;
      const body = makeAnimalBody(animal, p.x, p.y, p.angle || 0);
      Matter.Body.setAngle(body, p.angle || 0);
      body.placedByUid = p.placedBy || null;
      // Map uid back to seat index for local authoring.
      if (net) {
        const seat = net.playersNet.findIndex(pl => pl.uid === p.placedBy);
        body.placedBy = seat >= 0 ? seat : 0;
      }
      body.settled = true;
      Matter.Body.set(body, 'friction', LOCK_FRICTION);
      Matter.Body.set(body, 'frictionAir', LOCK_FRICTION_AIR);
      Matter.Sleeping.set(body, true);
      Matter.World.add(world, body);
      placedBodies.push(body);
    }
  }

  function applyNetUpdate({ placements, turnSeat, nextAnimalId, gameOver }) {
    if (!net) return;

    if (gameOver) {
      if (gameOverCalled) return;
      gameOverCalled = true;
      running = false;
      inputLocked = true;
      if (onStatus) onStatus('');
      if (onGameOver) onGameOver({ loser: { name: gameOver.loserName || '—' }, score: gameOver.score || 0 });
      return;
    }

    const nextSeat = (typeof turnSeat === 'number') ? turnSeat : currentTurn;
    // If this update is the active player's OWN echo (turn just moved away from
    // me), my local stack already matches the broadcast — don't rip bodies out
    // and re-add them, that momentarily wakes sleepers and can cause drift.
    const isMyEcho = lastAppliedTurnSeat === net.mySeat && nextSeat !== net.mySeat && placedBodies.length === (placements ? placements.length : 0);
    if (isMyEcho) {
      // Make sure every piece is asleep & locked, then hand turn off.
      for (const b of placedBodies) {
        Matter.Body.set(b, 'friction', LOCK_FRICTION);
        Matter.Body.set(b, 'frictionAir', LOCK_FRICTION_AIR);
        if (!b.isSleeping) Matter.Sleeping.set(b, true);
        b.settled = true;
      }
    } else {
      rebuildFromPlacements(placements);
    }

    currentTurn = nextSeat;
    lastAppliedTurnSeat = nextSeat;
    score = placedBodies.length;
    if (onScore) onScore(score);
    if (onTurn && net.playersNet[currentTurn]) onTurn(net.playersNet[currentTurn]);

    if (currentTurn === net.mySeat) {
      spawnPreview(nextAnimalId);
      inputLocked = false;
      ignoreUntil = performance.now() + 300;
    } else {
      preview = null;
      inputLocked = true;
    }
  }

  function bootEngine() {
    engine = Matter.Engine.create();
    engine.gravity.y = 0.65;
    engine.positionIterations = 10;
    engine.velocityIterations = 8;
    // Let Matter auto-sleep low-motion bodies — kills jitter on thin
    // protrusions (fox tail, giraffe legs) without forcing them static.
    engine.enableSleeping = true;
    world = engine.world;
    runner = Matter.Runner.create();
    Matter.Runner.run(runner, engine);
  }

  function start(opts) {
    canvas = document.getElementById('game-canvas');
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);

    bootEngine();

    map = getMap(opts.mapId || 'grass');
    platformSize = opts.platformSize || 'normal';
    buildMap();
    clearPieces();

    if (opts.netMode) {
      net = {
        code: opts.code,
        mySeat: opts.mySeat,
        playersNet: opts.netPlayers,
        onBroadcastTurnEnd: opts.onBroadcastTurnEnd,
        onBroadcastGameOver: opts.onBroadcastGameOver,
      };
      players = opts.netPlayers.map(p => ({ name: p.name, type: 'net' }));
      currentTurn = opts.turnSeat || 0;
    } else {
      net = null;
      players = [{ name: opts.youName || 'You', type: 'you' }];
      if (opts.withBot) players.push({ name: 'Bot', type: 'bot' });
      currentTurn = 0;
    }

    score = 0;
    gameOverCalled = false;
    running = true;
    inputLocked = false;
    ignoreUntil = performance.now() + 500;

    if (net) {
      // Initial state from opts, then wait for network updates.
      applyNetUpdate({
        placements: opts.initialPlacements || [],
        turnSeat: opts.turnSeat || 0,
        nextAnimalId: opts.initialAnimalId,
      });
    } else {
      spawnPreview();
      if (onTurn) onTurn(players[currentTurn]);
      if (onScore) onScore(score);
      if (onStatus) onStatus('');
    }

    attachInput();
    requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    detachInput();
    if (runner) Matter.Runner.stop(runner);
    if (engine) Matter.Engine.clear(engine);
    window.removeEventListener('resize', resize);
    clearPieces();
    groundBodies = [];
    preview = null;
    settlingBody = null;
    net = null;
    lastAppliedTurnSeat = -1;
  }

  function drop() { dropPreview(); }
  function rotate() { if (preview && !inputLocked) preview.angle += ROTATE_STEP; }
  function getMapName() { return map ? map.name : ''; }

  window.Game = {
    start, stop, drop, rotate, getMapName, applyNetUpdate,
    setCallbacks(cbs) {
      onGameOver = cbs.onGameOver || null;
      onScore = cbs.onScore || null;
      onTurn = cbs.onTurn || null;
      onStatus = cbs.onStatus || null;
    },
  };
})();
