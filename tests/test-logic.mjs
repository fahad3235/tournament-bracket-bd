// Unit tests for js/logic.js -- run: node tests/test-logic.mjs
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const L = require("../js/logic.js");

let n = 0;
function ok(name, fn) { fn(); n++; console.log("ok - " + name); }

// nextPow2 / seedOrder / roundName
ok("nextPow2", () => {
  assert.equal(L.nextPow2(2), 2);
  assert.equal(L.nextPow2(3), 4);
  assert.equal(L.nextPow2(5), 8);
  assert.equal(L.nextPow2(8), 8);
  assert.equal(L.nextPow2(9), 16);
  assert.equal(L.nextPow2(64), 64);
  assert.equal(L.nextPow2(65), 128);
});
ok("seedOrder 2/4/8/16", () => {
  assert.deepEqual(L.seedOrder(2), [1, 2]);
  assert.deepEqual(L.seedOrder(4), [1, 4, 2, 3]);
  assert.deepEqual(L.seedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
  assert.deepEqual(L.seedOrder(16), [1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11]);
});
ok("seedOrder rejects non-power-of-two", () => {
  assert.throws(() => L.seedOrder(3), /power of two/);
  assert.throws(() => L.seedOrder(1), /power of two/);
});
ok("roundName EN/BN", () => {
  assert.equal(L.roundName(0, 1, "en"), "Final");
  assert.equal(L.roundName(0, 2, "en"), "Semi-final");
  assert.equal(L.roundName(0, 3, "en"), "Quarter-final");
  assert.equal(L.roundName(0, 4, "en"), "Round 1");
  assert.equal(L.roundName(3, 4, "en"), "Final");
  assert.equal(L.roundName(3, 4, "bn"), "\u09ab\u09be\u0987\u09a8\u09be\u09b2");
  assert.equal(L.roundName(0, 4, "bn"), "\u09b0\u09be\u0989\u09a8\u09cd\u09a1 1");
});

// parseEntrants
ok("parseEntrants valid + trims + drops blanks", () => {
  const r = L.parseEntrants("  Rahim \n\nKarim\n");
  assert.deepEqual(r.names, ["Rahim", "Karim"]);
  assert.deepEqual(r.errors, []);
});
ok("parseEntrants duplicate case-insensitive", () => {
  const r = L.parseEntrants("Rahim\nrahim\n");
  assert.ok(r.errors.some((e) => e.startsWith("duplicate:")), JSON.stringify(r.errors));
});
ok("parseEntrants too-few / too-many / name-too-long", () => {
  assert.ok(L.parseEntrants("Only").errors.includes("too-few"));
  assert.ok(L.parseEntrants("").errors.includes("too-few"));
  const many = Array.from({ length: 65 }, (_, i) => "P" + i).join("\n");
  assert.ok(L.parseEntrants(many).errors.includes("too-many"));
  assert.ok(L.parseEntrants("x".repeat(61) + "\nB").errors.some((e) => e.startsWith("name-too-long:")));
});
ok("parseEntrants exactly 64 ok", () => {
  const names = Array.from({ length: 64 }, (_, i) => "P" + i).join("\n");
  assert.deepEqual(L.parseEntrants(names).errors, []);
});

// shuffleArray
ok("shuffleArray preserves set, deterministic with seeded rand", () => {
  const arr = ["a", "b", "c", "d", "e"];
  const shuffled = L.shuffleArray(arr, () => 0.999);
  assert.deepEqual([...shuffled].sort(), [...arr].sort());
  assert.deepEqual(L.shuffleArray(arr, () => 0), L.shuffleArray(arr, () => 0));
});

// createTournament: 4 entrants, no byes
ok("createTournament 4 entrants: 2 rounds, seed pairings 1v4 2v3", () => {
  const s = L.createTournament("Cup", ["A", "B", "C", "D"]);
  assert.equal(s.rounds.length, 2);
  assert.equal(s.rounds[0].length, 2);
  assert.equal(s.rounds[1].length, 1);
  assert.equal(s.rounds[0][0].a.name, "A");
  assert.equal(s.rounds[0][0].b.name, "D");
  assert.equal(s.rounds[0][1].a.name, "B");
  assert.equal(s.rounds[0][1].b.name, "C");
  assert.equal(s.rounds[0][0].bye, false);
  assert.equal(s.status, "live");
});
ok("createTournament 5 entrants: size 8, exactly 3 byes, top seeds advance", () => {
  const s = L.createTournament("Cup", ["A", "B", "C", "D", "E"]);
  assert.equal(s.rounds[0].length, 4);
  const byes = s.rounds[0].filter((m) => m.bye);
  assert.equal(byes.length, 3);
  assert.deepEqual(byes.map((m) => m.winner).sort(), ["A", "B", "C"]);
  // Match 1 (4v5) is the only real first-round match.
  assert.equal(s.rounds[0][1].bye, false);
  assert.equal(s.rounds[0][1].a.name, "D");
  assert.equal(s.rounds[0][1].b.name, "E");
  // Semi slots: bye winners already placed.
  assert.equal(s.rounds[1][0].a.name, "A");
  assert.equal(s.rounds[1][0].b, null);
  assert.equal(s.rounds[1][1].a.name, "B");
  assert.equal(s.rounds[1][1].b.name, "C");
});
ok("createTournament 2 entrants: single final, no semi", () => {
  const s = L.createTournament("Cup", ["A", "B"]);
  assert.equal(s.rounds.length, 1);
  assert.equal(s.rounds[0][0].a.name, "A");
  assert.equal(s.rounds[0][0].b.name, "B");
});
ok("createTournament rejects bad name / bad entrants", () => {
  assert.throws(() => L.createTournament("  ", ["A", "B"]), /name-required/);
  assert.throws(() => L.createTournament("Cup", ["A"]), /invalid-entrants/);
  assert.throws(() => L.createTournament("Cup", ["A", "a"]), /invalid-entrants/);
});
ok("createTournament shuffle uses seeded rand", () => {
  const s = L.createTournament("Cup", ["A", "B", "C", "D"], { shuffle: true, rand: () => 0.999 });
  assert.deepEqual(s.entrants.map((e) => e.name).sort(), ["A", "B", "C", "D"]);
});

// setWinner / propagation / full tournament
ok("setWinner propagates to next round", () => {
  const s = L.createTournament("Cup", ["A", "B", "C", "D"]);
  L.setWinner(s, 0, 0, "a"); // A beats D
  assert.equal(s.rounds[1][0].a.name, "A");
  assert.equal(s.rounds[1][0].b, null);
  assert.equal(s.status, "live");
});
ok("setWinner rejects decided / bye / empty slot / bad side", () => {
  const s = L.createTournament("Cup", ["A", "B", "C", "D", "E"]);
  // A bye match is decided at creation, so the decided-check fires first.
  assert.throws(() => L.setWinner(s, 0, 0, "a"), /already-decided/);
  assert.throws(() => L.setWinner(s, 0, 1, "x"), /bad-side/);
  L.setWinner(s, 0, 1, "a");
  assert.throws(() => L.setWinner(s, 0, 1, "b"), /already-decided/);
  // Empty slot: fresh 5-entrant bracket, semi slot b is empty until match 1 is decided.
  const fresh = L.createTournament("Cup", ["A", "B", "C", "D", "E"]);
  assert.throws(() => L.setWinner(fresh, 1, 0, "b"), /empty-slot/);
});
ok("full 4-entrant tournament: champion, runner-up, semifinalists, results", () => {
  const s = L.createTournament("Cup", ["A", "B", "C", "D"]);
  L.setWinner(s, 0, 0, "a"); // A beats D
  L.setWinner(s, 0, 1, "b"); // C beats B
  assert.deepEqual(L.semifinalists(s).sort(), ["B", "D"]);
  L.setWinner(s, 1, 0, "b"); // C beats A in final
  assert.equal(L.champion(s), "C");
  assert.equal(L.runnerUp(s), "A");
  assert.equal(s.status, "done");
  const r = L.results(s);
  assert.equal(r.totalMatches, 3);
  assert.equal(r.decidedCount, 3);
});

// setScore
ok("setScore stores + validates", () => {
  const s = L.createTournament("Cup", ["A", "B", "C", "D"]);
  L.setScore(s, 0, 0, 21, 18);
  assert.equal(s.rounds[0][0].scoreA, 21);
  assert.equal(s.rounds[0][0].scoreB, 18);
  assert.throws(() => L.setScore(s, 0, 0, -1, 0), /bad-score/);
  assert.throws(() => L.setScore(s, 0, 0, 1000, 0), /bad-score/);
  assert.throws(() => L.setScore(s, 0, 0, 1.5, 0), /bad-score/);
  L.setScore(s, 0, 0, null, null);
  assert.equal(s.rounds[0][0].scoreA, null);
});
ok("setScore rejects match without two players", () => {
  const s = L.createTournament("Cup", ["A", "B", "C", "D", "E"]);
  assert.throws(() => L.setScore(s, 1, 0, 1, 0), /two-players/);
});

// clearMatch cascade
ok("clearMatch cascades downstream and reopens final", () => {
  const s = L.createTournament("Cup", ["A", "B", "C", "D"]);
  L.setWinner(s, 0, 0, "a"); // A -> final
  L.setWinner(s, 0, 1, "b"); // C -> final
  L.setWinner(s, 1, 0, "a"); // A champion
  assert.equal(L.champion(s), "A");
  L.clearMatch(s, 0, 0); // undo semi: A leaves final
  assert.equal(s.rounds[1][0].a, null);
  assert.equal(s.rounds[1][0].decided, false);
  assert.equal(s.rounds[1][0].winner, null);
  assert.equal(L.champion(s), null);
  assert.equal(s.status, "live");
});
ok("clearMatch on undecided match is a no-op", () => {
  const s = L.createTournament("Cup", ["A", "B", "C", "D"]);
  L.clearMatch(s, 0, 0);
  assert.equal(s.rounds[0][0].decided, false);
});
ok("clearMatch on bye match keeps the bye", () => {
  const s = L.createTournament("Cup", ["A", "B", "C"]);
  const byeMatch = s.rounds[0].find((m) => m.bye);
  assert.ok(byeMatch);
  L.clearMatch(s, byeMatch.round, byeMatch.index);
  assert.equal(byeMatch.decided, true);
  assert.equal(byeMatch.winner, byeMatch.a ? byeMatch.a.name : byeMatch.b.name);
});

// fmtNum / Bengali digits
ok("fmtNum Bengali digits", () => {
  assert.equal(L.fmtNum(0, "bn"), "\u09e6");
  assert.equal(L.fmtNum(1234567890, "bn"), "\u09e7\u09e8\u09e9\u09ea\u09eb\u09ec\u09ed\u09ee\u09ef\u09e6");
  assert.equal(L.fmtNum(42, "en"), "42");
  assert.equal(L.toBnDigits("3-2"), "\u09e9-\u09e8");
});

// export / import round-trip + strict rejection
ok("export/import round-trip preserves a mid-tournament state", () => {
  const s = L.createTournament("Cup", ["A", "B", "C", "D", "E"]);
  L.setWinner(s, 0, 1, "b"); // E beats D
  L.setScore(s, 0, 1, 15, 21);
  const data = L.exportState(s);
  const res = L.importState(JSON.parse(JSON.stringify(data)));
  assert.equal(res.ok, true, res.error);
  assert.deepEqual(res.state, JSON.parse(JSON.stringify(s)));
  // Imported state stays playable: finish it.
  L.setWinner(res.state, 1, 0, "a");
  L.setWinner(res.state, 1, 1, "a");
  L.setWinner(res.state, 2, 0, "a");
  assert.ok(L.champion(res.state));
});
ok("import rejects wrong app/version, dupes, tampered propagation", () => {
  const s = L.createTournament("Cup", ["A", "B", "C", "D"]);
  const good = L.exportState(s);
  const wrongApp = JSON.parse(JSON.stringify(good)); wrongApp.app = "other";
  assert.equal(L.importState(wrongApp).ok, false);
  const wrongVer = JSON.parse(JSON.stringify(good)); wrongVer.version = 99;
  assert.equal(L.importState(wrongVer).ok, false);
  const dupes = JSON.parse(JSON.stringify(good)); dupes.state.entrants[1].name = "A";
  assert.equal(L.importState(dupes).ok, false);
  const badSeed = JSON.parse(JSON.stringify(good)); badSeed.state.entrants[0].seed = 2;
  assert.equal(L.importState(badSeed).ok, false);
  const badProp = JSON.parse(JSON.stringify(good));
  L.setWinner(s, 0, 0, "a");
  const mid = L.exportState(s);
  mid.state.rounds[1][0].a = { name: "B", seed: 2 };
  assert.equal(L.importState(mid).ok, false);
  const badWinner = JSON.parse(JSON.stringify(good));
  badWinner.state.rounds[0][0].winner = "B";
  badWinner.state.rounds[0][0].decided = true;
  assert.equal(L.importState(badWinner).ok, false);
  const badFirst = JSON.parse(JSON.stringify(good));
  badFirst.state.rounds[0][0].b = { name: "B", seed: 2 };
  assert.equal(L.importState(badFirst).ok, false);
});
ok("import never throws on garbage", () => {
  for (const junk of [null, undefined, 42, "x", [], {}, { app: "tournament-bracket-bd" }, { app: "tournament-bracket-bd", version: 1, state: null }]) {
    assert.equal(L.importState(junk).ok, false, JSON.stringify(junk));
  }
});

console.log("\n" + n + " unit checks passed");
