# Tournament Bracket BD

Single-elimination tournament bracket generator + manager for school, club and
neighbourhood tournaments in Bangladesh. Offline, bilingual English / বাংলা,
zero network requests.

## Problem

Running a small knockout tournament (inter-class cricket, school football,
a neighbourhood badminton cup) usually means a hand-drawn bracket on paper
that gets messy the moment a result is corrected. This app generates a
correctly seeded bracket, advances winners with a tap, handles byes, keeps
scores, lets you undo a result (with the downstream cascade), and saves
everything on the device.

## Features

- **Bracket generation** — 2–64 entrants, one per line; bracket size is the
  next power of two; byes go to the top seeds and auto-advance.
- **Standard seeding** — seed order P(2)=[1,2], P(2n) interleaves each seed p
  with (2n+1−p), so seed 1 meets seed N in round 1, never a fellow favourite.
- **Play the tournament** — tap a player to advance them; optional per-match
  scores (0–999); Undo reopens a match and clears everything downstream that
  depended on it.
- **Results** — champion, runner-up, semi-finalists, matches-decided counter.
- **Seeding options** — as-entered (line 1 = top seed) or random draw.
- **Sample bracket** — one tap loads an 8-player sample tournament.
- **Data** — JSON export / strict import (import re-validates the whole
  bracket: seeding placement, winner propagation, seeds, scores), typed-DELETE
  erase-all, localStorage persistence across reloads.
- **Bilingual** — EN / বাংলা toggle, persisted; Bengali digits in BN mode.
- **Print** — print-CSS bracket poster (controls and score inputs hidden).
- **Mobile** — 390px layout verified; bracket columns scroll horizontally
  inside their container, the page itself never overflows.

## Stack

Vanilla HTML + CSS + JavaScript. No build step, no dependencies, no backend.
`js/logic.js` holds the pure bracket engine (also required by the node unit
tests via CommonJS); `js/i18n.js` holds the strings; `js/app.js` wires the DOM.

## Prerequisites

Any modern browser. For the tests: Node.js 18+ (uses the built-in `fetch`
and `WebSocket` in the smoke harness) and Chromium at
`/opt/meta-chromium/chrome` for the smoke tests.

## Install

No install. Open `index.html` in a browser, or serve the folder statically:

```sh
python3 -m http.server 8000
# open http://localhost:8000/
```

## Dev commands

```sh
node tests/test-logic.mjs   # 26 unit checks (pure engine)
node tests/smoke.mjs        # 30 headless-Chrome checks (desktop)
node tests/smoke.mjs mobile # 32 headless-Chrome checks (390px)
```

## Environment

None. No API keys, no environment variables, no network calls by design.

## Testing

- `tests/test-logic.mjs` — seeding orders (2/4/8/16), entrant parsing
  (duplicates, limits, name length), 5-entrant bye placement (3 byes, top
  seeds advance), winner propagation, full 4-entrant tournament
  (champion / runner-up / semi-finalists), score validation, undo cascade,
  export → import round-trip, and strict-import rejection (wrong app/version,
  duplicates, tampered propagation, winner-not-in-slots, bad first round).
- `tests/smoke.mjs` — real Chromium: validation errors, bracket generation,
  winner clicks, score entry, champion banner, undo, reload persistence,
  BN toggle (Bengali title + digits), wrong-word vs DELETE erase, sample
  bracket, mobile 390px no-overflow, zero console/page errors.

## Deployment

Static hosting (GitHub Pages). Push the repo contents; enable Pages on
`main` / root. Live at <https://fahad3235.github.io/tournament-bracket-bd/>.

## Limitations

- Single elimination only — no double elimination, round-robin groups, or
  third-place playoff.
- Byes only occur in round 1 and always go to the top seeds; there is no
  manual bye placement.
- Scores are decorative: they never decide a winner (the tap does).
- Data lives in one browser's localStorage; use Export JSON to move a
  tournament to another device.
- Personal offline tool — not affiliated with any sports body.

## Status

MVP complete. Unit + desktop + mobile smoke tests green, 0 console errors.
