# TEST_RESULTS — tournament-bracket-bd

Run: 2026-10-19, 11:00 slot. All results real, from the commands below.

## Unit — 26/26 pass

`node tests/test-logic.mjs` — 26 checks, 0 failures.

Hand-verified cases:
- seedOrder(8) = [1,8,4,5,2,7,3,6]; seedOrder(16) = [1,16,8,9,4,13,5,12,2,15,7,10,3,14,6,11].
- 5 entrants -> size 8, exactly 3 byes; bye winners A, B, C; only real
  first-round match is 4v5 (D vs E); semi slots pre-filled A / B / C.
- Full 4-entrant tournament: A beats D, C beats B, C beats A in the final
  -> champion C, runner-up A, semi-finalists B + D, 3/3 matches decided.
- Undo cascade: clearing semi 1 after the final reopens the final, clears
  the champion, and returns status to live.
- Export -> import round-trip preserves a mid-tournament 5-entrant state
  byte-for-byte (deep-equal); the imported state stays playable to a champion.
- Strict import rejects: wrong app, wrong version, duplicate entrants,
  wrong seed, tampered propagation (final slot changed to B),
  winner-not-in-slots, tampered first-round pairing; import never throws
  on garbage (null / number / string / [] / {} / missing state).

Repairs during testing (3 test-side fixes, 0 app-logic bugs):
1. seedOrder(16) expectation corrected (pairs interleave in order:
   [1,16,8,9,4,13,...], not [1,16,8,9,5,12,4,13,...]).
2. setWinner bye test: a bye match is already decided, so the
   decided-check fires first (expected /already-decided/, not /bye-match/).
3. Empty-slot test needed a fresh state: after deciding match 1, that semi
   slot is filled, so the empty-slot case is checked before any decision.

## Smoke desktop — 30/30 pass, 0 console/page errors

`node tests/smoke.mjs` (raw CDP, /opt/meta-chromium/chrome, file://):
title, lang buttons, setup visible; empty entrants rejected; duplicate
entrants rejected ("Duplicate"); bracket view with 2 round columns
(Semi-final + Final), 3 match cards, seed 1 vs seed 4 pairing; winner click
advances to final; score 21–18 renders; second semi + final produce the
champion banner (Rahim) with runner-up (Sumon); undo clears the champion
and reopens the final; reload restores the bracket with 2 decided;
BN toggle renders the Bengali title + Bengali digits; EN toggle back;
wrong erase word keeps the bracket; DELETE erases to setup; sample builds
7 matches with 0 winners (8 entrants = no byes).

## Smoke mobile — 32/32 pass, 0 console/page errors

`node tests/smoke.mjs mobile` (390px device metrics): all desktop checks
plus 390px no horizontal page overflow (scrollWidth <= 391) and no
overflowing element outside scroll containers.

## Hygiene

- Pure-ASCII sources: Bengali written as \uXXXX escapes in JS and numeric
  entities in HTML; `grep -P '[^\x00-\x7F]'` over *.js/*.mjs/*.html = zero
  matches. Tests re-run green after the escaping pass.
- Zero network requests by design (static files only, no CDN).
