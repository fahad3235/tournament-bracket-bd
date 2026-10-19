// Headless-Chrome smoke test via raw CDP (no deps). Run: node tests/smoke.mjs [mobile]
// Uses /opt/meta-chromium/chrome + built-in WebSocket. Pure ASCII source.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PAGE = "file://" + path.join(DIR, "..", "index.html");
const PORT = 9224 + Math.floor(Math.random() * 500);
const MOBILE = process.argv[2] === "mobile";
const chrome = spawn("/opt/meta-chromium/chrome", [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
  "--remote-debugging-port=" + PORT, "--remote-debugging-address=127.0.0.1",
  "about:blank",
], { stdio: "ignore" });

let checks = 0, failures = [];
function check(name, cond, extra) {
  checks++;
  if (cond) console.log("ok - " + name);
  else { failures.push(name); console.log("FAIL - " + name + (extra ? " :: " + extra : "")); }
}

async function waitForWs() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch("http://127.0.0.1:" + PORT + "/json/list");
      if (r.ok) {
        const targets = await r.json();
        const page = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
        if (page) return page.webSocketDebuggerUrl;
      }
    } catch (e) {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("chrome did not start");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let seq = 0;
const pending = new Map();
let ws;
const consoleErrors = [];
const pageErrors = [];
let loadResolve; const loaded = new Promise((r) => (loadResolve = r));

function send(method, params) {
  return new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
}
async function evaluate(expr) {
  const res = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
  if (res.result && res.result.exceptionDetails) {
    pageErrors.push(JSON.stringify(res.result.exceptionDetails).slice(0, 300));
    return undefined;
  }
  return res.result && res.result.result ? res.result.result.value : undefined;
}

try {
  const url = await waitForWs();
  ws = new WebSocket(url);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === "Page.loadEventFired") loadResolve();
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
      consoleErrors.push(JSON.stringify(m.params.args).slice(0, 300));
    if (m.method === "Runtime.exceptionThrown")
      pageErrors.push((m.params.exceptionDetails.exception?.description || "exception").slice(0, 300));
    if (m.method === "Log.entryAdded" && m.params.entry.level === "error")
      consoleErrors.push(m.params.entry.text.slice(0, 300));
  };
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Log.enable");
  if (MOBILE) await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send("Page.navigate", { url: PAGE });
  await loaded;
  await sleep(600);

  // Clean slate (a previous run may have left localStorage).
  await evaluate("localStorage.clear(); location.reload();");
  await sleep(800);

  check("title", (await evaluate("document.title"))?.includes("Tournament Bracket BD"));
  check("lang buttons present", (await evaluate("!!document.getElementById('langEn') && !!document.getElementById('langBn')")) === true);
  check("setup view visible", (await evaluate("!document.getElementById('setupView').hidden")) === true);

  // Validation: empty entrants -> error shown.
  await evaluate("document.getElementById('tourneyName').value = 'Cup'; document.getElementById('entrants').value = ''; document.getElementById('btnStart').click();");
  await sleep(200);
  check("empty entrants rejected", (await evaluate("!document.getElementById('setupErrors').hidden")) === true);

  // Duplicate entrants -> error shown.
  await evaluate("document.getElementById('entrants').value = 'Rahim\\nRahim\\nKarim'; document.getElementById('btnStart').click();");
  await sleep(200);
  check("duplicate entrants rejected", (await evaluate("document.getElementById('setupErrors').textContent"))?.includes("Duplicate"));

  // Valid 4-entrant tournament.
  await evaluate("document.getElementById('tourneyName').value = 'Test Cup'; document.getElementById('entrants').value = 'Rahim\\nKarim\\nSumon\\nNusrat'; document.getElementById('btnStart').click();");
  await sleep(300);
  check("bracket view visible", (await evaluate("!document.getElementById('bracketView').hidden")) === true);
  check("round headers Semi-final + Final", (await evaluate("document.querySelectorAll('.round-col').length")) === 2);
  check("3 match cards", (await evaluate("document.querySelectorAll('.match-card').length")) === 3);
  check("seed 1 vs seed 4 pairing", (await evaluate("document.querySelector('.match-card[data-round=\"0\"][data-match=\"0\"]').textContent"))?.includes("Rahim"));
  check("0 decided at start", (await evaluate("document.getElementById('results').textContent"))?.includes("0"));

  // Click Rahim (side a, match 0) -> advances to final slot a.
  await evaluate("document.querySelector('.player-btn[data-round=\"0\"][data-match=\"0\"][data-side=\"a\"]').click();");
  await sleep(250);
  check("winner advances to final", (await evaluate("document.querySelector('.match-card[data-round=\"1\"][data-match=\"0\"]').textContent"))?.includes("Rahim"));
  check("1 decided", (await evaluate("document.getElementById('results').textContent"))?.includes("1"));

  // Score entry on the decided semi.
  await evaluate("var c=document.querySelector('.match-card[data-round=\"0\"][data-match=\"0\"]'); c.querySelector('input[data-score-side=\"a\"]').value='21'; c.querySelector('input[data-score-side=\"b\"]').value='18'; c.querySelector('.save-score').click();");
  await sleep(250);
  check("score renders", (await evaluate("document.querySelector('.match-card[data-round=\"0\"][data-match=\"0\"]').textContent"))?.includes("21"));

  // Decide second semi (Sumon side b beats Karim side a? match 1 = B vs C = Karim vs Sumon; click side b = Sumon).
  await evaluate("document.querySelector('.player-btn[data-round=\"0\"][data-match=\"1\"][data-side=\"b\"]').click();");
  await sleep(250);
  check("final has both players", (await evaluate("document.querySelector('.match-card[data-round=\"1\"][data-match=\"0\"]').textContent"))?.includes("Sumon"));

  // Final: click Rahim -> champion banner.
  await evaluate("document.querySelector('.player-btn[data-round=\"1\"][data-match=\"0\"][data-side=\"a\"]').click();");
  await sleep(250);
  check("champion banner", (await evaluate("document.getElementById('championBanner')?.textContent"))?.includes("Rahim"));
  check("runner-up shown", (await evaluate("document.getElementById('results').textContent"))?.includes("Sumon"));
  check("3 decided", (await evaluate("document.getElementById('results').textContent"))?.includes("3"));

  // Undo the final -> champion banner gone, final reopened.
  await evaluate("document.querySelector('.undo-btn[data-round=\"1\"][data-match=\"0\"]').click();");
  await sleep(250);
  check("undo clears champion", (await evaluate("!!document.getElementById('championBanner')")) === false);
  check("final reopened with buttons", (await evaluate("!!document.querySelector('.player-btn[data-round=\"1\"][data-match=\"0\"]')")) === true);

  // Reload persistence: mid-tournament state survives.
  await evaluate("location.reload();");
  await sleep(900);
  check("reload restores bracket", (await evaluate("!document.getElementById('bracketView').hidden")) === true);
  check("reload keeps decided count", (await evaluate("document.getElementById('results').textContent"))?.includes("2"));

  // BN toggle renders Bengali title.
  await evaluate("document.getElementById('langBn').click();");
  await sleep(250);
  check("BN title renders", (await evaluate("document.querySelector('h1').textContent"))?.includes("\u099F\u09C1\u09B0\u09CD\u09A8\u09BE\u09AE\u09C7\u09A8\u09CD\u099F"));
  check("BN digits render", (await evaluate("document.getElementById('results').textContent"))?.includes("\u09E8"));
  await evaluate("document.getElementById('langEn').click();");
  await sleep(200);
  check("EN toggle back", (await evaluate("document.querySelector('h1').textContent"))?.includes("Tournament Bracket BD"));

  // Erase: wrong word is a no-op; DELETE erases.
  await evaluate("document.getElementById('btnErase').click();");
  await sleep(150);
  await evaluate("document.getElementById('eraseInput').value='DELETE1'; document.getElementById('btnEraseConfirm').click();");
  await sleep(200);
  check("wrong erase word keeps bracket", (await evaluate("!document.getElementById('bracketView').hidden")) === true);
  await evaluate("document.getElementById('eraseInput').value='DELETE'; document.getElementById('btnEraseConfirm').click();");
  await sleep(250);
  check("DELETE erases to setup", (await evaluate("!document.getElementById('setupView').hidden")) === true);

  // Sample tournament: 8 players, 7 matches, 3 byes decided.
  await evaluate("document.getElementById('btnSample').click();");
  await sleep(300);
  check("sample builds 7 matches", (await evaluate("document.querySelectorAll('.match-card').length")) === 7);
  check("sample 0 decided (8 entrants = no byes)", (await evaluate("document.querySelectorAll('.match-card .winner').length")) === 0);

  if (MOBILE) {
    const sw = await evaluate("document.documentElement.scrollWidth");
    check("390px no horizontal page overflow", sw <= 391, "scrollWidth=" + sw);
    const overflow = await evaluate("Array.from(document.querySelectorAll('*')).some((e) => e.scrollWidth > 391 && getComputedStyle(e).overflowX !== 'auto' && e !== document.documentElement && e !== document.body)");
    check("390px no overflowing element (outside scroll containers)", overflow === false);
  }

  check("zero console errors", consoleErrors.length === 0, JSON.stringify(consoleErrors).slice(0, 300));
  check("zero page errors", pageErrors.length === 0, JSON.stringify(pageErrors).slice(0, 300));
} catch (e) {
  failures.push("harness: " + e.message);
  console.log("FAIL - harness: " + e.message);
} finally {
  chrome.kill();
}
console.log("\n" + checks + " smoke checks, " + failures.length + " failures");
if (failures.length) { console.log("FAILURES: " + failures.join(", ")); process.exit(1); }
