// Lobby / multiplayer wrapper over Firebase Realtime DB.
// Exposes window.Net.
//
// Lobby schema (/lobbies/<CODE>):
//   host, code, public, status ('waiting'|'playing'|'ended'),
//   maxPlayers, mapId, platformSize, createdAt,
//   players/<uid> = { name, joinedAt, seat },
//   turnSeat, nextAnimalId,
//   placements/<pushId> = { animalId, x, y, angle, placedBy, placedAt },
//   gameOver = { loserUid, loserName, score, at }

(() => {
  // Stable anonymous UID stored locally — simple and rule-friendly.
  let UID = localStorage.getItem('as:uid');
  if (!UID) {
    UID = ('u_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4));
    localStorage.setItem('as:uid', UID);
  }

  const fb = () => window.AS_firebase;

  function whenReady() {
    return new Promise(resolve => {
      if (fb()) return resolve();
      window.addEventListener('as-firebase-ready', () => resolve(), { once: true });
    });
  }

  const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function randomCode() {
    let s = '';
    for (let i = 0; i < 4; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    return s;
  }

  async function createLobby(opts) {
    await whenReady();
    const { ref, set, get } = fb();
    const now = Date.now();
    let code = null;
    for (let tries = 0; tries < 6; tries++) {
      const candidate = randomCode();
      const snap = await get(ref(fb().db, 'lobbies/' + candidate));
      if (!snap.exists()) { code = candidate; break; }
    }
    if (!code) throw new Error('Could not allocate lobby code.');

    const lobby = {
      code,
      host: UID,
      public: !!opts.isPublic,
      status: 'waiting',
      maxPlayers: Math.max(2, Math.min(4, opts.maxPlayers || 2)),
      mapId: opts.mapId || 'grass',
      platformSize: opts.platformSize || 'normal',
      createdAt: now,
      players: {
        [UID]: { name: opts.hostName || 'Host', joinedAt: now, seat: 0 },
      },
      turnSeat: 0,
      nextAnimalId: null,
    };
    await set(ref(fb().db, 'lobbies/' + code), lobby);
    return { code, lobby };
  }

  async function joinLobby(code, name) {
    await whenReady();
    const { ref, get, update } = fb();
    code = code.toUpperCase();
    const lobbyRef = ref(fb().db, 'lobbies/' + code);
    const snap = await get(lobbyRef);
    if (!snap.exists()) return { ok: false, error: 'Lobby not found.' };
    const lobby = snap.val();
    if (lobby.status && lobby.status !== 'waiting') return { ok: false, error: 'Game already started.' };
    const players = lobby.players || {};
    if (players[UID]) return { ok: true, code };
    if (Object.keys(players).length >= lobby.maxPlayers) return { ok: false, error: 'Lobby full.' };
    const usedSeats = new Set(Object.values(players).map(p => p.seat));
    let seat = 0; while (usedSeats.has(seat)) seat++;
    await update(ref(fb().db, `lobbies/${code}/players/${UID}`), {
      name, joinedAt: Date.now(), seat,
    });
    return { ok: true, code };
  }

  function subscribeLobby(code, cb) {
    let unsub = () => {};
    whenReady().then(() => {
      const { ref, onValue, off } = fb();
      const lobbyRef = ref(fb().db, 'lobbies/' + code);
      const handler = onValue(lobbyRef, snap => cb(snap.exists() ? snap.val() : null));
      unsub = () => off(lobbyRef, 'value', handler);
    });
    return () => unsub();
  }

  async function updateLobby(code, partial) {
    await whenReady();
    const { ref, update } = fb();
    await update(ref(fb().db, 'lobbies/' + code), partial);
  }

  async function leaveLobby(code) {
    await whenReady();
    const { ref, get, update, remove } = fb();
    const lobbyRef = ref(fb().db, 'lobbies/' + code);
    const snap = await get(lobbyRef);
    if (!snap.exists()) return;
    const lobby = snap.val();
    const players = { ...(lobby.players || {}) };
    delete players[UID];
    if (Object.keys(players).length === 0) {
      await remove(lobbyRef);
      return;
    }
    const updates = { [`players/${UID}`]: null };
    if (lobby.host === UID) updates.host = Object.keys(players)[0];
    await update(lobbyRef, updates);
  }

  function subscribePublicLobbies(cb, onError) {
    let unsub = () => {};
    whenReady().then(() => {
      const { ref, onValue, off } = fb();
      const lobbiesRef = ref(fb().db, 'lobbies');
      const handler = onValue(lobbiesRef, snap => {
        const out = [];
        if (snap.exists()) {
          snap.forEach(child => {
            const v = child.val();
            if (v && v.public && v.status === 'waiting') {
              const playerCount = v.players ? Object.keys(v.players).length : 0;
              if (playerCount < v.maxPlayers) out.push(v);
            }
          });
        }
        out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        cb(out);
      }, err => {
        if (onError) onError(err);
      });
      unsub = () => off(lobbiesRef, 'value', handler);
    });
    return () => unsub();
  }

  // One-shot read of open public lobbies (for Quick Play).
  async function listOpenPublicLobbies() {
    await whenReady();
    const { ref, get } = fb();
    const snap = await get(ref(fb().db, 'lobbies'));
    const out = [];
    if (snap.exists()) {
      snap.forEach(child => {
        const v = child.val();
        if (v && v.public && v.status === 'waiting') {
          const count = v.players ? Object.keys(v.players).length : 0;
          if (count < v.maxPlayers) out.push(v);
        }
      });
    }
    out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return out;
  }

  async function startGame(code, firstAnimalId) {
    await updateLobby(code, {
      status: 'playing',
      turnSeat: 0,
      nextAnimalId: firstAnimalId,
      placements: null,
      gameOver: null,
      currentPreview: null,
      currentDrop: null,
    });
  }

  // Start another round with the same roster — any client can trigger it.
  async function restartRound(code, firstAnimalId) {
    await updateLobby(code, {
      status: 'playing',
      turnSeat: 0,
      nextAnimalId: firstAnimalId,
      placements: null,
      gameOver: null,
      currentPreview: null,
      currentDrop: null,
    });
  }

  // Write a full turn-end snapshot: placements map, next turn seat, next animal.
  // Also clears the live preview + drop so spectators stop rendering the old
  // falling piece — the rebuild happens from `placements` now.
  async function writeTurnSnapshot(code, placements, nextTurnSeat, nextAnimalId) {
    await whenReady();
    const { ref, update } = fb();
    const placementsMap = {};
    placements.forEach((p, i) => {
      placementsMap['p' + String(i).padStart(4, '0')] = p;
    });
    await update(ref(fb().db, 'lobbies/' + code), {
      placements: placementsMap,
      turnSeat: nextTurnSeat,
      nextAnimalId,
      currentPreview: null,
      currentDrop: null,
    });
  }

  // Live aim ghost — active player writes this while moving the piece.
  async function writePreview(code, data) {
    await whenReady();
    const { ref, set } = fb();
    await set(ref(fb().db, `lobbies/${code}/currentPreview`), data);
  }

  // Fires once when the active player taps Drop. Spectators use it to
  // render a local fall animation before the authoritative snapshot lands.
  async function writeDropEvent(code, data) {
    await whenReady();
    const { ref, set } = fb();
    await set(ref(fb().db, `lobbies/${code}/currentDrop`), data);
  }

  async function writeGameOver(code, loserUid, loserName, score) {
    await updateLobby(code, {
      status: 'ended',
      gameOver: { loserUid, loserName, score, at: Date.now() },
    });
  }

  // Convenience — return the list of players sorted by seat.
  function playersBySeat(lobby) {
    if (!lobby || !lobby.players) return [];
    return Object.entries(lobby.players)
      .map(([uid, p]) => ({ uid, ...p }))
      .sort((a, b) => a.seat - b.seat);
  }

  window.Net = {
    get UID() { return UID; },
    whenReady,
    createLobby, joinLobby, subscribeLobby, updateLobby, leaveLobby,
    subscribePublicLobbies, listOpenPublicLobbies, startGame, restartRound,
    writeTurnSnapshot, writePreview, writeDropEvent, writeGameOver,
    playersBySeat,
  };
})();
