// Local username storage with a 1-hour change cooldown.
// Phase 3 will sync this to Firebase when joining a lobby.

(() => {
  const KEY_NAME = 'as:username';
  const KEY_TS = 'as:usernameSetAt';
  const COOLDOWN_MS = 60 * 60 * 1000;

  function get() {
    return localStorage.getItem(KEY_NAME) || '';
  }

  function setAtTs() {
    const raw = localStorage.getItem(KEY_TS);
    return raw ? parseInt(raw, 10) : 0;
  }

  function remainingCooldownMs() {
    const setAt = setAtTs();
    if (!setAt) return 0;
    const elapsed = Date.now() - setAt;
    return Math.max(0, COOLDOWN_MS - elapsed);
  }

  function canChange() {
    return !get() || remainingCooldownMs() === 0;
  }

  function sanitize(name) {
    return (name || '').trim().replace(/\s+/g, ' ').slice(0, 16);
  }

  function set(name) {
    const clean = sanitize(name);
    if (!clean) return { ok: false, reason: 'Name cannot be empty.' };
    if (!/^[\w\- .]{1,16}$/.test(clean)) {
      return { ok: false, reason: 'Only letters, numbers, spaces, - and _ (max 16 chars).' };
    }
    if (!canChange()) {
      const mins = Math.ceil(remainingCooldownMs() / 60000);
      return { ok: false, reason: `You can change again in ${mins} min.` };
    }
    localStorage.setItem(KEY_NAME, clean);
    localStorage.setItem(KEY_TS, String(Date.now()));
    return { ok: true, name: clean };
  }

  function friendlyHint() {
    const current = get();
    if (!current) return 'Pick a username to appear in lobbies.';
    const remain = remainingCooldownMs();
    if (remain === 0) return `Current: "${current}". You can change it now.`;
    const mins = Math.ceil(remain / 60000);
    return `Current: "${current}". Next change in ${mins} min.`;
  }

  window.Username = { get, set, canChange, friendlyHint, sanitize };
})();
