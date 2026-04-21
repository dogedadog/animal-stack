// Lobby screens: private (create/join) + public list + waiting room + in-game
// net session. Talks to window.Net and window.Game. No physics here.

(() => {
  let currentLobbyCode = null;
  let unsubLobby = null;
  let unsubPublic = null;
  let lastLobby = null;

  // Private-lobby form state.
  const priv = { maxPlayers: 2, platformSize: 'normal', mapId: 'grass', isPublic: false };
  const practiceState = { platformSize: 'normal' };

  function setHint(id, msg) {
    const el = document.getElementById(id);
    if (el) el.textContent = msg || '';
  }

  function requireName() {
    const n = (window.Username.get() || '').trim();
    if (!n) {
      setHint('priv-hint', 'Set a username first (Menu → Username / Settings).');
      return null;
    }
    return n;
  }

  // ————— Private create / join —————

  function wirePrivateScreen() {
    document.querySelectorAll('#priv-max button').forEach(b => {
      b.addEventListener('click', () => {
        priv.maxPlayers = parseInt(b.dataset.n, 10);
        document.querySelectorAll('#priv-max button').forEach(x => x.classList.toggle('on', x === b));
      });
    });
    document.querySelectorAll('#priv-size button').forEach(b => {
      b.addEventListener('click', () => {
        priv.platformSize = b.dataset.size;
        document.querySelectorAll('#priv-size button').forEach(x => x.classList.toggle('on', x === b));
      });
    });
    document.getElementById('priv-map').addEventListener('change', e => {
      priv.mapId = e.target.value;
    });
    document.getElementById('priv-public').addEventListener('change', e => {
      priv.isPublic = e.target.checked;
    });
    document.getElementById('priv-create').addEventListener('click', onCreate);
    document.getElementById('priv-join').addEventListener('click', onJoinByCode);

    document.querySelectorAll('#practice-size button').forEach(b => {
      b.addEventListener('click', () => {
        practiceState.platformSize = b.dataset.size;
        document.querySelectorAll('#practice-size button').forEach(x => x.classList.toggle('on', x === b));
      });
    });
  }

  async function onCreate() {
    const name = requireName();
    if (!name) return;
    setHint('priv-hint', 'Creating…');
    try {
      const { code } = await window.Net.createLobby({
        maxPlayers: priv.maxPlayers,
        platformSize: priv.platformSize,
        mapId: priv.mapId,
        isPublic: priv.isPublic,
        hostName: name,
      });
      openLobby(code);
    } catch (e) {
      setHint('priv-hint', 'Could not create lobby. Check your Firebase rules.');
      console.error(e);
    }
  }

  async function onJoinByCode() {
    const name = requireName();
    if (!name) return;
    const raw = document.getElementById('priv-join-code').value.trim().toUpperCase();
    if (raw.length !== 4) { setHint('priv-hint', 'Code is 4 letters/digits.'); return; }
    setHint('priv-hint', 'Joining…');
    const res = await window.Net.joinLobby(raw, name);
    if (!res.ok) { setHint('priv-hint', res.error); return; }
    openLobby(res.code);
  }

  // ————— Public lobbies —————

  function openPublicScreen() {
    const list = document.getElementById('public-list');
    list.innerHTML = '<p class="muted">Loading…</p>';
    // Timer fires if the subscribe never calls back (usually means rules block reads).
    let firstResponse = false;
    const loadTimer = setTimeout(() => {
      if (!firstResponse) renderPublicError('no-response');
    }, 4000);

    if (unsubPublic) unsubPublic();
    unsubPublic = window.Net.subscribePublicLobbies(
      lobbies => {
        firstResponse = true;
        clearTimeout(loadTimer);
        renderPublicList(lobbies);
      },
      err => {
        firstResponse = true;
        clearTimeout(loadTimer);
        renderPublicError('denied', err);
      },
    );
  }

  function renderPublicList(lobbies) {
    const list = document.getElementById('public-list');
    list.innerHTML = '';
    if (!lobbies.length) {
      // Always-on behavior: let the first visitor spin up a public lobby so
      // there's always one running. Keeps empty-state actionable.
      const empty = document.createElement('div');
      empty.className = 'card';
      empty.innerHTML = `
        <h3>No one's here yet</h3>
        <p class="muted">Start a public lobby and wait for players to join — anyone can.</p>
        <button class="btn primary" id="public-quickstart">Start a public lobby</button>
      `;
      list.appendChild(empty);
      document.getElementById('public-quickstart').addEventListener('click', onPublicQuickStart);
      return;
    }
    for (const lb of lobbies) {
      const row = document.createElement('div');
      row.className = 'lobby-row';
      const hostName = lb.players && lb.host && lb.players[lb.host] ? lb.players[lb.host].name : 'Host';
      const count = lb.players ? Object.keys(lb.players).length : 0;
      row.innerHTML = `
        <div class="info">
          <div class="line1">${escapeHtml(hostName)}'s lobby — <span class="code">${lb.code}</span></div>
          <div class="line2">${mapName(lb.mapId)} · ${capitalize(lb.platformSize)} · ${count}/${lb.maxPlayers}</div>
        </div>
        <button class="btn primary">Join</button>
      `;
      row.querySelector('button').addEventListener('click', async () => {
        const name = (window.Username.get() || '').trim();
        if (!name) { alert('Set a username first (Settings).'); return; }
        const res = await window.Net.joinLobby(lb.code, name);
        if (!res.ok) { alert(res.error); return; }
        openLobby(lb.code);
      });
      list.appendChild(row);
    }
  }

  function renderPublicError(kind, err) {
    const list = document.getElementById('public-list');
    const msg = kind === 'denied'
      ? 'Your Firebase Realtime Database rules are blocking reads. Paste the rules from README.md into Firebase Console → Realtime Database → Rules, then refresh.'
      : 'Could not reach Firebase. Check your internet connection and that your database URL is correct.';
    list.innerHTML = `
      <div class="card">
        <h3>Can't load lobbies</h3>
        <p class="muted">${msg}</p>
      </div>`;
    if (err) console.error('public lobbies error', err);
  }

  async function onPublicQuickStart() {
    const name = (window.Username.get() || '').trim();
    if (!name) { alert('Set a username first (Menu → Username / Settings).'); return; }
    const btn = document.getElementById('public-quickstart');
    if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }
    try {
      const { code } = await window.Net.createLobby({
        maxPlayers: 4,
        platformSize: 'normal',
        mapId: 'grass',
        isPublic: true,
        hostName: name,
      });
      openLobby(code);
    } catch (e) {
      renderPublicError('denied', e);
    }
  }

  function closePublicScreen() {
    if (unsubPublic) unsubPublic();
    unsubPublic = null;
  }

  // ————— Waiting room / in-lobby state —————

  function openLobby(code) {
    currentLobbyCode = code;
    window.AS_nav('waiting');
    document.getElementById('wait-code').textContent = code;
    document.getElementById('wait-players').innerHTML = '';
    document.getElementById('wait-hint').textContent = '';
    document.getElementById('wait-start').disabled = true;

    if (unsubLobby) unsubLobby();
    unsubLobby = window.Net.subscribeLobby(code, lobby => handleLobbyUpdate(code, lobby));
  }

  function handleLobbyUpdate(code, lobby) {
    if (!lobby) {
      // Lobby dissolved.
      if (currentLobbyCode === code) {
        cleanupLobby();
        window.AS_nav('menu');
      }
      return;
    }
    lastLobby = lobby;

    if (lobby.status === 'playing') {
      if (document.getElementById('screen-game').classList.contains('active')) {
        // Already in game — push state updates to the engine.
        window.Game.applyNetUpdate({
          placements: lobbyPlacementsArray(lobby),
          turnSeat: lobby.turnSeat || 0,
          nextAnimalId: lobby.nextAnimalId,
          gameOver: lobby.gameOver,
        });
      } else {
        // Transition into game screen.
        enterNetGame(code, lobby);
      }
      return;
    }

    if (lobby.status === 'ended') {
      if (document.getElementById('screen-game').classList.contains('active')) {
        window.Game.applyNetUpdate({
          placements: lobbyPlacementsArray(lobby),
          turnSeat: lobby.turnSeat || 0,
          gameOver: lobby.gameOver,
        });
      }
      return;
    }

    // Waiting room.
    renderWaitingRoom(lobby);
  }

  function renderWaitingRoom(lobby) {
    document.getElementById('wait-map').textContent = 'Map: ' + mapName(lobby.mapId);
    document.getElementById('wait-size').textContent = 'Platform: ' + capitalize(lobby.platformSize);
    const players = window.Net.playersBySeat(lobby);
    document.getElementById('wait-slots').textContent = `${players.length} / ${lobby.maxPlayers}`;

    const host = lobby.host;
    const myUid = window.Net.UID;

    const listEl = document.getElementById('wait-players');
    listEl.innerHTML = '';
    for (let i = 0; i < lobby.maxPlayers; i++) {
      const p = players.find(pl => pl.seat === i);
      const row = document.createElement('div');
      row.className = 'player-row' + (p && p.uid === myUid ? ' me' : '');
      if (p) {
        row.innerHTML = `<span class="seat">${i + 1}</span>
          <span>${escapeHtml(p.name)}</span>
          ${p.uid === host ? '<span class="host-badge">HOST</span>' : ''}`;
      } else {
        row.innerHTML = `<span class="seat">${i + 1}</span><span class="muted">empty</span>`;
      }
      listEl.appendChild(row);
    }

    const startBtn = document.getElementById('wait-start');
    const isHost = myUid === host;
    startBtn.style.display = isHost ? '' : 'none';
    startBtn.disabled = !(isHost && players.length >= 2);
    document.getElementById('wait-hint').textContent =
      isHost
        ? (players.length >= 2 ? 'Ready. Press Start when everyone is in.' : 'Waiting for at least 1 more player…')
        : 'Waiting for host to start…';

    startBtn.onclick = async () => {
      if (!isHost) return;
      startBtn.disabled = true;
      const firstAnimalId = randomAnimalId();
      try { await window.Net.startGame(lobby.code, firstAnimalId); }
      catch (e) { console.error(e); startBtn.disabled = false; }
    };
  }

  function enterNetGame(code, lobby) {
    window.AS_nav('game');
    const players = window.Net.playersBySeat(lobby);
    const mySeat = players.findIndex(p => p.uid === window.Net.UID);
    document.getElementById('hud-map').textContent = mapName(lobby.mapId);

    window.Game.setCallbacks({
      onScore: s => document.getElementById('hud-score').textContent = s,
      onTurn: p => document.getElementById('hud-turn').textContent = p.name,
      onStatus: msg => {
        if (!msg) return;
        const el = document.getElementById('hud-turn');
        if (el) el.textContent = msg;
      },
      onGameOver: ({ loser, score }) => {
        document.getElementById('go-title').textContent = 'It fell!';
        document.getElementById('go-body').textContent =
          `${loser.name} placed the piece that tipped the stack. Stacked: ${score}.`;
        document.getElementById('gameover').classList.remove('hidden');
      },
    });

    window.Game.start({
      netMode: true,
      code,
      mySeat: mySeat >= 0 ? mySeat : 0,
      netPlayers: players,
      turnSeat: lobby.turnSeat || 0,
      initialAnimalId: lobby.nextAnimalId,
      initialPlacements: lobbyPlacementsArray(lobby),
      mapId: lobby.mapId,
      platformSize: lobby.platformSize,
      onBroadcastTurnEnd: async (placements, nextSeat, nextAnimalId) => {
        try { await window.Net.writeTurnSnapshot(code, placements, nextSeat, nextAnimalId); }
        catch (e) { console.error('turn snapshot write failed', e); }
      },
      onBroadcastGameOver: async (loserUid, loserName, score) => {
        try { await window.Net.writeGameOver(code, loserUid, loserName, score); } catch (_) {}
      },
    });
  }

  function lobbyPlacementsArray(lobby) {
    if (!lobby.placements) return [];
    // We write placements as map { p0, p1, ... }. Sort by key order.
    return Object.entries(lobby.placements)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([_, v]) => v);
  }

  function cleanupLobby() {
    if (unsubLobby) unsubLobby();
    unsubLobby = null;
    const code = currentLobbyCode;
    currentLobbyCode = null;
    lastLobby = null;
    if (code) { window.Net.leaveLobby(code).catch(() => {}); }
  }

  function leaveWaiting() {
    cleanupLobby();
    window.AS_nav('menu');
  }

  function leaveInGame() {
    if (currentLobbyCode) {
      window.Net.leaveLobby(currentLobbyCode).catch(() => {});
    }
    cleanupLobby();
    window.Game.stop();
    window.AS_nav('menu');
  }

  // ————— Helpers —————

  function randomAnimalId() {
    const a = pickRandomAnimal();
    return a.id;
  }
  function mapName(id) {
    const m = getMap(id);
    return m ? m.name : id;
  }
  function capitalize(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function getPracticePlatformSize() { return practiceState.platformSize; }

  document.addEventListener('DOMContentLoaded', () => {
    wirePrivateScreen();
    document.getElementById('wait-leave').addEventListener('click', leaveWaiting);
    document.getElementById('game-leave').addEventListener('click', () => {
      if (currentLobbyCode) leaveInGame();
      else { window.Game.stop(); window.AS_nav('menu'); }
    });
  });

  async function quickPlay() {
    const name = (window.Username.get() || '').trim();
    const hint = document.getElementById('menu-quickplay-hint');
    if (!name) {
      if (hint) hint.textContent = 'Set a username first (Menu → Username / Settings).';
      return;
    }
    if (hint) hint.textContent = 'Finding a lobby…';
    try {
      const open = await window.Net.listOpenPublicLobbies();
      if (open.length) {
        const target = open[0];
        const res = await window.Net.joinLobby(target.code, name);
        if (res.ok) { if (hint) hint.textContent = ''; openLobby(res.code); return; }
        // Fall through to create if the join race failed.
      }
      const { code } = await window.Net.createLobby({
        maxPlayers: 4, platformSize: 'normal', mapId: 'grass',
        isPublic: true, hostName: name,
      });
      if (hint) hint.textContent = '';
      openLobby(code);
    } catch (e) {
      if (hint) hint.textContent = 'Could not reach Firebase. Check your DB rules and connection.';
      console.error(e);
    }
  }

  window.Lobby = {
    openPublicScreen, closePublicScreen,
    cleanupLobby, leaveInGame,
    getPracticePlatformSize,
    isInNetGame: () => !!currentLobbyCode,
    quickPlay,
  };
})();
