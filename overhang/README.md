# OVERHANG

*The more it hangs, the more it pays.*

An original casino-style game demo. Pull a glass puck back and let it slide up a neon lane toward a ledge over the void. Stop short and win nothing. Slide off and lose. Land in the pay zone for a small win. Leave the puck hanging over the edge and **the multiplier is literally how far it hangs**, from about 1.3× with the nose just over, up to 10× (L puck), 14× (M) or 21× (S) at the tipping point.

Play-money only. No accounts, no purchases, no server.

## Run it

It is fully static: open `overhang/index.html` in a browser, or serve the repository with any static server (for example `python -m http.server` from the repo root and visit `/overhang/`). On Cloudflare Pages it deploys alongside the main site at `/overhang/` with no build step.

## Play

| Action | Touch (phone) | Mouse / keyboard (desktop) |
|---|---|---|
| Aim and launch | Drag down anywhere on the lane, let go | Click-drag down, or hold **Space** and release |
| Repeat the last pull | Tap **AGAIN** (hold to auto-repeat) | **Enter** or **R** (hold to auto-repeat) |
| Nudge the aim | Drag a little more or less | **←** / **→** (1% steps) |
| Bet | **−** / **+** (hold to step fast, long-press the value for max) | **↑** / **↓**, **Shift** for max/min |
| Puck size | Tap **S / M / L** | **1 / 2 / 3** |
| Fairness panel | Tap the balance or **ⓘ** | **F** |
| Mute / heat map | Tap the speaker | **M** / **H** |

A shallow pull shorts more and busts less. A deep pull busts more and hangs more. Every aim is priced to the same return, so the pull is a pure volatility choice, and the live odds strip plus the pay ruler printed on the lane show exactly what you are playing for before you let go.

## Fairness

- One random draw per round: the puck stops at `aim × wax`, where `wax = exp(0.10 · Z)` and `Z` is standard normal, derived from a 16-byte seed.
- The SHA-256 of the seed is shown in the corner **before** release; the seed is revealed after. Any round can be replayed from the console with `__overhang.setSeedHex(hex)`.
- Every pull is priced at 96.5% RTP before rounding (about 96.3% realised after flooring multipliers to 0.01×). The pricing factor depends only on your aim and is shown as "ALL PAYS ×1.13" when it is not ×1.00.
- Nothing adjusts the outcome afterward: no balance-aware weighting, no streak logic, no near-miss injection.

## Files

- `index.html` – markup, SVG icons, fairness panel
- `style.css` – tokens, phone stack and desktop console layouts, glass UI
- `game.js` – state machine, input, kinematics, camera, Canvas2D rendering, effects, HUD
- `math.js` – probabilities, flat-EV pricing, RNG, commit-reveal, kinematics helpers
- `audio.js` – WebAudio-synthesized sound set (no audio files)

Balance and settings persist in `localStorage` under the key `overhang.v2`. A `TOP UP +1,000` button appears when the balance runs out.
