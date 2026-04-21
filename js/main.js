// Screen routing + practice wiring. Lobby-specific logic lives in lobby.js.

(() => {
  const screens = ['menu', 'practice-setup', 'game', 'settings', 'public', 'private', 'waiting'];
  let selectedMap = 'grass';

  function show(id) {
    for (const s of screens) {
      const el = document.getElementById('screen-' + s);
      if (el) el.classList.toggle('active', s === id);
    }
    if (id !== 'public' && window.Lobby) window.Lobby.closePublicScreen();
    if (id === 'public' && window.Lobby) window.Lobby.openPublicScreen();
    // Leave game -> tear it down (but only when not in a net lobby; lobby.js handles that).
    if (id !== 'game' && !document.getElementById('screen-waiting').classList.contains('active')) {
      if (window.Game) window.Game.stop();
    }
  }
  window.AS_nav = show;

  function navTo(dest) {
    if (dest === 'practice') return show('practice-setup');
    if (dest === 'menu') return show('menu');
    if (dest === 'public') return show('public');
    if (dest === 'private') return show('private');
    if (dest === 'game') return show('game');
    if (dest === 'waiting') return show('waiting');
    if (dest === 'settings') { renderSettings(); return show('settings'); }
  }

  function renderMapList() {
    const container = document.getElementById('map-list');
    container.innerHTML = '';
    for (const m of listMaps()) {
      const card = document.createElement('div');
      card.className = 'map-card' + (m.id === selectedMap ? ' selected' : '');
      card.innerHTML = `<h3>${m.name}</h3><p>${m.blurb}</p>`;
      card.addEventListener('click', () => {
        selectedMap = m.id;
        renderMapList();
      });
      container.appendChild(card);
    }
  }

  function renderSettings() {
    const input = document.getElementById('username-input');
    const hint = document.getElementById('username-hint');
    input.value = window.Username.get();
    hint.textContent = window.Username.friendlyHint();
  }

  function toast(msg, ms = 1400) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), ms);
  }

  function startPracticeGame() {
    show('game');
    const withBot = document.getElementById('bot-toggle').checked;
    const youName = window.Username.get() || 'You';
    const size = window.Lobby.getPracticePlatformSize();

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
      mapId: selectedMap,
      platformSize: size,
      withBot,
      youName,
    });
    document.getElementById('hud-map').textContent = window.Game.getMapName();
  }

  function wire() {
    document.querySelectorAll('[data-nav]').forEach(btn => {
      btn.addEventListener('click', () => navTo(btn.dataset.nav));
    });

    document.getElementById('start-practice').addEventListener('click', startPracticeGame);

    const qp = document.getElementById('menu-quickplay');
    if (qp) qp.addEventListener('click', () => window.Lobby.quickPlay());

    document.getElementById('btn-rotate').addEventListener('click', () => window.Game.rotate());
    document.getElementById('btn-drop').addEventListener('click', () => window.Game.drop());

    document.getElementById('go-again').addEventListener('click', () => {
      document.getElementById('gameover').classList.add('hidden');
      if (window.Lobby && window.Lobby.isInNetGame && window.Lobby.isInNetGame()) {
        // Multiplayer: restart the round in place with the same roster.
        window.Lobby.restartNetRound();
      } else {
        startPracticeGame();
      }
    });
    document.querySelectorAll('#gameover [data-nav]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('gameover').classList.add('hidden');
        if (window.Lobby && window.Lobby.leaveInGame) window.Lobby.leaveInGame();
        else navTo(btn.dataset.nav);
      });
    });

    document.getElementById('save-username').addEventListener('click', () => {
      const input = document.getElementById('username-input');
      const res = window.Username.set(input.value);
      const hint = document.getElementById('username-hint');
      if (res.ok) {
        hint.textContent = `Saved as "${res.name}". Next change in 60 min.`;
        toast('Username saved');
      } else {
        hint.textContent = res.reason;
      }
    });

    // Code input uppercasing.
    const codeInput = document.getElementById('priv-join-code');
    if (codeInput) {
      codeInput.addEventListener('input', () => {
        codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
      });
    }

    // In-game chat wiring.
    const chatToggle = document.getElementById('chat-toggle');
    const chatPanel = document.getElementById('chat-panel');
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const chatClose = document.getElementById('chat-close');
    if (chatToggle && chatPanel) {
      chatToggle.addEventListener('click', () => {
        chatPanel.classList.toggle('hidden');
        if (!chatPanel.classList.contains('hidden')) chatInput.focus();
      });
    }
    if (chatClose) chatClose.addEventListener('click', () => chatPanel.classList.add('hidden'));
    if (chatForm) {
      chatForm.addEventListener('submit', e => {
        e.preventDefault();
        const text = chatInput.value.trim();
        if (!text) return;
        if (window.Lobby && window.Lobby.isInNetGame()) {
          window.Lobby.sendChatMessage(text);
        }
        chatInput.value = '';
      });
    }

    renderMapList();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
