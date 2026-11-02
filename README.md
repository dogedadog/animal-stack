# Animal Stack

Phase 1 MVP: physics-based stacking game with 8 animals (incl. the tall, hard-to-balance Giraffe), 3 maps (Meadow, Desert Dunes, Winter Lake), tap-to-rotate, drag-to-aim, and a practice-vs-bot mode.

## Run locally
Just open `index.html` in a browser — it's fully static. Or serve with any static server (e.g. `python -m http.server` from this folder) so Firebase's ES-module import works without CORS complaints.

## Deploy to Cloudflare Pages
1. Push this folder to a GitHub repo.
2. Cloudflare dashboard → Pages → **Create project** → Connect your repo.
3. Framework preset: **None**. Build command: *(leave empty)*. Output directory: `/` (root).
4. Deploy. That's it — no build step, everything is static + CDN-hosted libs.

## Firebase
Config is hard-coded in `js/firebase.js`. Keys are safe to ship (security is enforced by Realtime Database rules). Currently only initialized; real use arrives in Phase 3 (multiplayer lobbies).

## Firebase Realtime Database rules

For development / playtesting, paste these into **Firebase Console → Realtime Database → Rules**. They let any client read/write under `/lobbies`, which is fine for a public casual game. Tighten later if needed (per-UID write guards, expiry of stale lobbies).

```json
{
  "rules": {
    "lobbies": {
      ".read": true,
      ".write": true,
      ".indexOn": ["public", "status"]
    }
  }
}
```

`.read`/`.write` must be set on the `lobbies` node itself (not only on `$code`), otherwise listing public lobbies fails with `permission_denied at /lobbies`. If you see that error in the browser console, this is why.

## OVERHANG (casino-style demo)

A second, self-contained game lives in [`overhang/`](overhang/): slide a glass puck toward a ledge over the void and get paid by how far it hangs over the edge. Play-money demo, phone and desktop, zero assets, static files only. See [`overhang/README.md`](overhang/README.md) for controls and the fairness model. Deploys with the rest of the site at `/overhang/`.

## Phases
- **Phase 1**: practice + bots + maps + rotation + Firebase init. ✓
- **Phase 2**: bigger/complex animal shapes, slower gravity, platform-size option, strict settlement, lock-ish settled pieces. ✓
- **Phase 3 (current)**: public + private lobbies over Firebase Realtime DB, 4-char codes, turn-based sync. ✓
- **Phase 4**: polish — richer bot, sounds, per-lobby usernames, spectator mode, stale-lobby cleanup.
