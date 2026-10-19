// Pure logic for tournament-bracket-bd \u2014 single-elimination bracket engine.
// No DOM, no I/O. CommonJS so node tests can require it; also loaded in the
// browser via a plain <script> tag (exports attached to window.TBLogic).
(function (root) {
  "use strict";

  const APP = "tournament-bracket-bd";
  const VERSION = 1;
  const MIN_ENTRANTS = 2;
  const MAX_ENTRANTS = 64;
  const MAX_NAME_LEN = 60;
  const MAX_SCORE = 999;

  function nextPow2(n) {
    let p = 1;
    while (p < n) p *= 2;
    return p;
  }

  // Standard seeding order for a power-of-two bracket: P(2) = [1,2],
  // P(2n) interleaves each p with (2n+1-p). P(8) = [1,8,4,5,2,7,3,6].
  function seedOrder(size) {
    if (size < 2 || (size & (size - 1)) !== 0) throw new Error("size must be a power of two >= 2");
    let order = [1, 2];
    while (order.length < size) {
      const m = order.length * 2 + 1;
      const next = [];
      for (const p of order) { next.push(p); next.push(m - p); }
      order = next;
    }
    return order;
  }

  function roundCount(size) { return Math.log2(size); }

  function roundName(roundIdx, totalRounds, lang) {
    const bn = lang === "bn";
    if (roundIdx === totalRounds - 1) return bn ? "\u09ab\u09be\u0987\u09a8\u09be\u09b2" : "Final";
    if (roundIdx === totalRounds - 2) return bn ? "\u09b8\u09c7\u09ae\u09bf-\u09ab\u09be\u0987\u09a8\u09be\u09b2" : "Semi-final";
    if (roundIdx === totalRounds - 3) return bn ? "\u0995\u09cb\u09af\u09bc\u09be\u09b0\u09cd\u099f\u09be\u09b0-\u09ab\u09be\u0987\u09a8\u09be\u09b2" : "Quarter-final";
    return (bn ? "\u09b0\u09be\u0989\u09a8\u09cd\u09a1 " : "Round ") + (roundIdx + 1);
  }

  // Bengali digits 0-9.
  const BN_DIGITS = ["\u09e6", "\u09e7", "\u09e8", "\u09e9", "\u09ea", "\u09eb", "\u09ec", "\u09ed", "\u09ee", "\u09ef"];
  function toBnDigits(str) {
    return String(str).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
  }
  function fmtNum(n, lang) {
    const s = String(n);
    return lang === "bn" ? toBnDigits(s) : s;
  }

  // Parse the entrant textarea: one name per line.
  // Returns { names, errors }. Names keep original casing; duplicates are
  // compared case-insensitively after trimming.
  function parseEntrants(text) {
    const errors = [];
    const raw = String(text == null ? "" : text).split(/\r?\n/);
    const names = [];
    const seen = new Set();
    for (const line of raw) {
      const name = line.trim();
      if (!name) continue;
      if (name.length > MAX_NAME_LEN) { errors.push("name-too-long:" + name.slice(0, 30)); continue; }
      const key = name.toLowerCase();
      if (seen.has(key)) { errors.push("duplicate:" + name); continue; }
      seen.add(key);
      names.push(name);
    }
    if (names.length < MIN_ENTRANTS) errors.push("too-few");
    if (names.length > MAX_ENTRANTS) errors.push("too-many");
    return { names, errors };
  }

  // Fisher-Yates. rand defaults to Math.random; tests pass a seeded fn.
  function shuffleArray(arr, rand) {
    const out = arr.slice();
    const r = rand || Math.random;
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out;
  }

  function makeSlot(name, seed) { return { name, seed }; }

  function makeMatch(round, index) {
    return { round, index, a: null, b: null, winner: null, scoreA: null, scoreB: null, decided: false, bye: false };
  }

  // Propagate a decided match's winner into the next round's slot.
  function propagate(state, round, matchIdx) {
    const match = state.rounds[round][matchIdx];
    if (!match.decided) return;
    const total = state.rounds.length;
    if (round + 1 >= total) return;
    const next = state.rounds[round + 1][Math.floor(matchIdx / 2)];
    const slot = matchIdx % 2 === 0 ? "a" : "b";
    next[slot] = makeSlot(match.winner, slotSeedOf(state, match.winner));
    if (next.a && next.b) next.bye = false;
  }

  // Seed of an entrant by name (seed = position in the entrants list + 1).
  function slotSeedOf(state, name) {
    for (let i = 0; i < state.entrants.length; i++) {
      if (state.entrants[i].name === name) return state.entrants[i].seed;
    }
    return null;
  }

  function createTournament(name, names, opts) {
    const options = opts || {};
    const cleanName = String(name == null ? "" : name).trim();
    if (!cleanName) throw new Error("tournament-name-required");
    if (cleanName.length > 80) throw new Error("tournament-name-too-long");
    const parsed = parseEntrants(names.join("\n"));
    if (parsed.errors.length) throw new Error("invalid-entrants:" + parsed.errors.join(","));
    let ordered = parsed.names.slice();
    if (options.shuffle) ordered = shuffleArray(ordered, options.rand);
    const entrants = ordered.map((n, i) => ({ name: n, seed: i + 1 }));
    const size = nextPow2(entrants.length);
    const order = seedOrder(size);
    const total = roundCount(size);
    const rounds = [];
    for (let r = 0; r < total; r++) {
      const matches = [];
      const count = size / Math.pow(2, r + 1);
      for (let m = 0; m < count; m++) matches.push(makeMatch(r, m));
      rounds.push(matches);
    }
    const state = { name: cleanName, entrants, rounds, status: "live" };
    // Round 0 pairings from the seeding order; a seed beyond the entrant
    // count is a bye, so its opponent auto-advances.
    const first = rounds[0];
    for (let m = 0; m < first.length; m++) {
      const seedA = order[2 * m], seedB = order[2 * m + 1];
      const a = seedA <= entrants.length ? makeSlot(entrants[seedA - 1].name, seedA) : null;
      const b = seedB <= entrants.length ? makeSlot(entrants[seedB - 1].name, seedB) : null;
      first[m].a = a;
      first[m].b = b;
      if ((a && !b) || (!a && b)) {
        first[m].bye = true;
        first[m].winner = (a || b).name;
        first[m].decided = true;
        propagate(state, 0, m);
      }
    }
    updateStatus(state);
    return state;
  }

  function updateStatus(state) {
    const final = state.rounds[state.rounds.length - 1][0];
    state.status = final && final.decided ? "done" : "live";
  }

  function getMatch(state, round, matchIdx) {
    if (!state || !Array.isArray(state.rounds)) throw new Error("bad-state");
    const r = state.rounds[round];
    if (!r || !r[matchIdx]) throw new Error("match-not-found");
    return r[matchIdx];
  }

  function setWinner(state, round, matchIdx, side) {
    const match = getMatch(state, round, matchIdx);
    if (side !== "a" && side !== "b") throw new Error("bad-side");
    if (match.decided) throw new Error("match-already-decided");
    if (match.bye) throw new Error("bye-match");
    const slot = match[side];
    if (!slot) throw new Error("empty-slot");
    match.winner = slot.name;
    match.decided = true;
    propagate(state, round, matchIdx);
    updateStatus(state);
    return match;
  }

  function setScore(state, round, matchIdx, scoreA, scoreB) {
    const match = getMatch(state, round, matchIdx);
    if (!match.a || !match.b) throw new Error("score-needs-two-players");
    for (const s of [scoreA, scoreB]) {
      if (s !== null && (!Number.isInteger(s) || s < 0 || s > MAX_SCORE)) throw new Error("bad-score");
    }
    match.scoreA = scoreA;
    match.scoreB = scoreB;
    return match;
  }

  // Clear a decided match and everything downstream that depended on it.
  function clearMatch(state, round, matchIdx) {
    const match = getMatch(state, round, matchIdx);
    if (!match.decided) return match;
    const prevWinner = match.winner;
    match.winner = null;
    match.decided = false;
    match.scoreA = null;
    match.scoreB = null;
    if (match.bye) {
      // A bye match is structural: re-decide it immediately.
      match.winner = prevWinner;
      match.decided = true;
      return match;
    }
    clearDownstream(state, round, matchIdx, prevWinner);
    updateStatus(state);
    return match;
  }

  function clearDownstream(state, round, matchIdx, winnerName) {
    const total = state.rounds.length;
    if (round + 1 >= total) return;
    const next = state.rounds[round + 1][Math.floor(matchIdx / 2)];
    const slot = matchIdx % 2 === 0 ? "a" : "b";
    if (!next[slot] || next[slot].name !== winnerName) return;
    const nextPrevWinner = next.winner;
    next[slot] = null;
    if (next.decided) {
      next.winner = null;
      next.decided = false;
      next.scoreA = null;
      next.scoreB = null;
      if (nextPrevWinner) clearDownstream(state, round + 1, next.index, nextPrevWinner);
    }
  }

  function champion(state) {
    const final = state.rounds[state.rounds.length - 1][0];
    return final && final.decided ? final.winner : null;
  }

  function runnerUp(state) {
    const final = state.rounds[state.rounds.length - 1][0];
    if (!final || !final.decided) return null;
    if (final.a && final.a.name !== final.winner) return final.a.name;
    if (final.b && final.b.name !== final.winner) return final.b.name;
    return null;
  }

  function semifinalists(state) {
    const total = state.rounds.length;
    if (total < 2) return [];
    const semi = state.rounds[total - 2];
    const out = [];
    for (const m of semi) {
      if (!m.decided) continue;
      if (m.a && m.a.name !== m.winner) out.push(m.a.name);
      if (m.b && m.b.name !== m.winner) out.push(m.b.name);
    }
    return out;
  }

  function results(state) {
    let totalMatches = 0, decidedCount = 0;
    for (const round of state.rounds) {
      for (const m of round) {
        totalMatches++;
        if (m.decided) decidedCount++;
      }
    }
    return {
      champion: champion(state),
      runnerUp: runnerUp(state),
      semifinalists: semifinalists(state),
      totalMatches,
      decidedCount,
    };
  }

  function exportState(state) {
    return { app: APP, version: VERSION, state: JSON.parse(JSON.stringify(state)) };
  }

  function isIntIn(v, lo, hi) {
    return Number.isInteger(v) && v >= lo && v <= hi;
  }

  // Strict import validation. Returns { ok, state } or { ok:false, error }.
  // Never throws on malformed input.
  function importState(data) {
    try {
      if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, error: "not-an-object" };
      if (data.app !== APP) return { ok: false, error: "wrong-app" };
      if (data.version !== VERSION) return { ok: false, error: "wrong-version" };
      const s = data.state;
      if (!s || typeof s !== "object" || Array.isArray(s)) return { ok: false, error: "bad-state" };
      if (typeof s.name !== "string" || !s.name.trim() || s.name.length > 80) return { ok: false, error: "bad-name" };
      if (!Array.isArray(s.entrants) || s.entrants.length < MIN_ENTRANTS || s.entrants.length > MAX_ENTRANTS) return { ok: false, error: "bad-entrants" };
      const names = new Set();
      for (let i = 0; i < s.entrants.length; i++) {
        const e = s.entrants[i];
        if (!e || typeof e.name !== "string" || !e.name.trim() || e.name.length > MAX_NAME_LEN) return { ok: false, error: "bad-entrant" };
        if (e.seed !== i + 1) return { ok: false, error: "bad-seed" };
        const key = e.name.toLowerCase();
        if (names.has(key)) return { ok: false, error: "duplicate-entrant" };
        names.add(key);
      }
      const size = nextPow2(s.entrants.length);
      const total = roundCount(size);
      if (!Array.isArray(s.rounds) || s.rounds.length !== total) return { ok: false, error: "bad-rounds" };
      if (s.status !== "live" && s.status !== "done") return { ok: false, error: "bad-status" };
      const order = seedOrder(size);
      for (let r = 0; r < total; r++) {
        const round = s.rounds[r];
        const expectCount = size / Math.pow(2, r + 1);
        if (!Array.isArray(round) || round.length !== expectCount) return { ok: false, error: "bad-round-size" };
        for (let m = 0; m < round.length; m++) {
          const match = round[m];
          if (!match || typeof match !== "object") return { ok: false, error: "bad-match" };
          if (match.round !== r || match.index !== m) return { ok: false, error: "bad-match-id" };
          if (typeof match.bye !== "boolean" || typeof match.decided !== "boolean") return { ok: false, error: "bad-match-flags" };
          for (const side of ["a", "b"]) {
            const slot = match[side];
            if (slot !== null) {
              if (typeof slot !== "object" || typeof slot.name !== "string" || !names.has(slot.name.toLowerCase())) return { ok: false, error: "bad-slot" };
              if (slot.seed !== slotSeedOf(s, slot.name)) return { ok: false, error: "bad-slot-seed" };
            }
          }
          if (match.winner !== null && (typeof match.winner !== "string" || !names.has(match.winner.toLowerCase()))) return { ok: false, error: "bad-winner" };
          if (match.decided !== (match.winner !== null)) return { ok: false, error: "decided-mismatch" };
          if (match.decided) {
            const inSlots = (match.a && match.a.name === match.winner) || (match.b && match.b.name === match.winner);
            if (!inSlots) return { ok: false, error: "winner-not-in-slots" };
          }
          for (const sc of [match.scoreA, match.scoreB]) {
            if (sc !== null && !isIntIn(sc, 0, MAX_SCORE)) return { ok: false, error: "bad-score" };
          }
          if (r === 0) {
            // Round-0 slots must equal the deterministic seeding placement.
            const seedA = order[2 * m], seedB = order[2 * m + 1];
            const expA = seedA <= s.entrants.length ? s.entrants[seedA - 1].name : null;
            const expB = seedB <= s.entrants.length ? s.entrants[seedB - 1].name : null;
            const gotA = match.a ? match.a.name : null;
            const gotB = match.b ? match.b.name : null;
            if (gotA !== expA || gotB !== expB) return { ok: false, error: "bad-first-round" };
            const bye = (expA === null) !== (expB === null);
            if (match.bye !== bye) return { ok: false, error: "bad-bye-flag" };
          } else {
            if (match.bye) return { ok: false, error: "bye-only-round-0" };
            // Later-round slots must be the winners of the two feeder matches.
            const prev = s.rounds[r - 1];
            const expA = prev[2 * m].winner;
            const expB = prev[2 * m + 1].winner;
            const gotA = match.a ? match.a.name : null;
            const gotB = match.b ? match.b.name : null;
            if (gotA !== expA || gotB !== expB) return { ok: false, error: "bad-propagation" };
          }
        }
      }
      const final = s.rounds[total - 1][0];
      if (s.status !== (final.decided ? "done" : "live")) return { ok: false, error: "bad-status-value" };
      return { ok: true, state: JSON.parse(JSON.stringify(s)) };
    } catch (e) {
      return { ok: false, error: "exception:" + e.message };
    }
  }

  const api = {
    APP, VERSION, MIN_ENTRANTS, MAX_ENTRANTS, MAX_NAME_LEN, MAX_SCORE,
    nextPow2, seedOrder, roundCount, roundName, toBnDigits, fmtNum,
    parseEntrants, shuffleArray, createTournament, getMatch, setWinner,
    setScore, clearMatch, champion, runnerUp, semifinalists, results,
    exportState, importState,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TBLogic = api;
})(typeof window !== "undefined" ? window : globalThis);
