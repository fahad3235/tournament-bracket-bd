// App wiring for tournament-bracket-bd. Depends on TBLogic + TBStrings.
(function () {
  "use strict";
  const L = window.TBLogic;
  const STR = window.TBStrings;
  const KEY = "tournament-bracket-bd:v1";

  let lang = "en";
  let state = null; // live tournament state or null (setup mode)
  let eraseOpen = false;

  const $ = (id) => document.getElementById(id);
  function t(key) { return (STR[lang] && STR[lang][key]) || STR.en[key] || key; }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function num(n) { return L.fmtNum(n, lang); }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data && (data.lang === "en" || data.lang === "bn")) lang = data.lang;
      if (data && data.state) {
        const res = L.importState({ app: L.APP, version: L.VERSION, state: data.state });
        if (res.ok) state = res.state;
      }
    } catch (e) { /* corrupted storage: start fresh */ }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ lang, state })); } catch (e) {}
  }

  function showMsg(text, isError) {
    const el = $("msg");
    el.textContent = text;
    el.className = "msg " + (isError ? "err" : "ok");
    el.hidden = !text;
  }

  function applyLang() {
    document.documentElement.lang = lang === "bn" ? "bn" : "en";
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
      el.placeholder = t(el.getAttribute("data-i18n-ph"));
    });
    $("langEn").classList.toggle("active", lang === "en");
    $("langBn").classList.toggle("active", lang === "bn");
  }

  function render() {
    applyLang();
    $("setupView").hidden = !!state;
    $("bracketView").hidden = !state;
    if (!state) { $("setupErrors").hidden = true; return; }
    renderResults();
    renderBracket();
  }

  function renderResults() {
    const r = L.results(state);
    const box = $("results");
    let html = "<div class='stat'><span class='stat-num'>" + num(r.decidedCount) + "</span><span class='stat-lbl'>" + t("matchesPlayed") + " " + t("of") + " " + num(r.totalMatches) + "</span></div>";
    if (r.champion) {
      html += "<div class='champion-banner' id='championBanner'>" + t("champion") + ": <strong>" + esc(r.champion) + "</strong></div>";
      if (r.runnerUp) html += "<div class='sub-result'>" + t("runnerUp") + ": " + esc(r.runnerUp) + "</div>";
      if (r.semifinalists.length) html += "<div class='sub-result'>" + t("semifinalists") + ": " + esc(r.semifinalists.join(", ")) + "</div>";
    } else {
      html += "<div class='hint'>" + t("pickWinner") + "</div>";
    }
    box.innerHTML = html;
  }

  function playerRow(match, side) {
    const slot = match[side];
    const score = side === "a" ? match.scoreA : match.scoreB;
    if (!slot) return "<div class='player waiting'>" + t("waiting") + "</div>";
    const isWinner = match.decided && match.winner === slot.name;
    const cls = "player" + (isWinner ? " winner" : "");
    const scoreTxt = score !== null && score !== undefined ? " <span class='score'>" + num(score) + "</span>" : "";
    const seedTxt = "<span class='seed'>#" + num(slot.seed) + "</span>";
    if (!match.decided && !match.bye && match.a && match.b) {
      return "<button type='button' class='" + cls + " player-btn' data-round='" + match.round + "' data-match='" + match.index + "' data-side='" + side + "'>" + seedTxt + " " + esc(slot.name) + scoreTxt + "</button>";
    }
    return "<div class='" + cls + "'>" + seedTxt + " " + esc(slot.name) + scoreTxt + "</div>";
  }

  function renderBracket() {
    const total = state.rounds.length;
    let html = "";
    for (let r = 0; r < total; r++) {
      html += "<section class='round-col' data-round='" + r + "'><h3>" + esc(L.roundName(r, total, lang)) + "</h3>";
      for (const m of state.rounds[r]) {
        html += "<article class='match-card' data-round='" + r + "' data-match='" + m.index + "'>";
        html += "<div class='match-head'>" + t("matchLabel") + " " + num(r + 1) + "." + num(m.index + 1) + (m.bye ? " <span class='bye-badge'>" + t("byeNote") + "</span>" : "") + "</div>";
        html += playerRow(m, "a");
        html += "<div class='vs'>" + t("vs") + "</div>";
        html += playerRow(m, "b");
        if (m.a && m.b && !m.bye) {
          html += "<div class='score-row'><label>" + t("score") + ": <input type='number' min='0' max='999' inputmode='numeric' class='score-input' data-score-side='a' data-round='" + r + "' data-match='" + m.index + "' value='" + (m.scoreA === null ? "" : m.scoreA) + "'></label> <span>\u2013</span> <label><input type='number' min='0' max='999' inputmode='numeric' class='score-input' data-score-side='b' data-round='" + r + "' data-match='" + m.index + "' value='" + (m.scoreB === null ? "" : m.scoreB) + "'></label> <button type='button' class='small-btn save-score' data-round='" + r + "' data-match='" + m.index + "'>" + t("saveScore") + "</button></div>";
        }
        if (m.decided && !m.bye) {
          html += "<button type='button' class='small-btn undo-btn' data-round='" + r + "' data-match='" + m.index + "'>" + t("undo") + "</button>";
        }
        html += "</article>";
      }
      html += "</section>";
    }
    $("bracket").innerHTML = html;
  }

  function setupErrorsFor(name, text) {
    const errs = [];
    if (!name.trim()) errs.push(t("nameRequired"));
    const parsed = L.parseEntrants(text);
    for (const e of parsed.errors) {
      if (e === "too-few") errs.push(t("tooFew"));
      else if (e === "too-many") errs.push(t("tooMany"));
      else if (e.startsWith("duplicate:")) errs.push(t("duplicate") + e.slice("duplicate:".length));
      else if (e.startsWith("name-too-long:")) errs.push(t("nameTooLong"));
    }
    return errs;
  }

  function startTournament(useSample) {
    const name = useSample ? "Sample Cup" : $("tourneyName").value;
    const text = useSample ? "\u09b0\u09b9\u09bf\u09ae\n\u0995\u09b0\u09bf\u09ae\n\u09b8\u09c1\u09ae\u09a8\n\u09a8\u09c1\u09b8\u09b0\u09be\u09a4\n\u09ab\u09be\u09b0\u09bf\u09af\u09bc\u09be\n\u09a4\u09be\u09a8\u09ad\u09c0\u09b0\n\u09ae\u09bf\u09ae\n\u0986\u09b0\u09bf\u09ab" : $("entrants").value;
    const errs = useSample ? [] : setupErrorsFor(name, text);
    if (errs.length) {
      $("setupErrors").innerHTML = errs.map((e) => "<div>" + esc(e) + "</div>").join("");
      $("setupErrors").hidden = false;
      return;
    }
    try {
      const parsed = L.parseEntrants(text);
      state = L.createTournament(name, parsed.names, { shuffle: !useSample && $("seeding").value === "random" });
      eraseOpen = false;
      $("eraseBox").hidden = true;
      save();
      showMsg(t("saved"), false);
      render();
    } catch (e) {
      $("setupErrors").innerHTML = "<div>" + esc(t("validation")) + "</div>";
      $("setupErrors").hidden = false;
    }
  }

  function onBracketClick(ev) {
    const btn = ev.target.closest("button");
    if (!btn) return;
    const round = Number(btn.getAttribute("data-round"));
    const matchIdx = Number(btn.getAttribute("data-match"));
    try {
      if (btn.classList.contains("player-btn")) {
        L.setWinner(state, round, matchIdx, btn.getAttribute("data-side"));
        save(); render();
      } else if (btn.classList.contains("undo-btn")) {
        L.clearMatch(state, round, matchIdx);
        save(); render();
      } else if (btn.classList.contains("save-score")) {
        const card = btn.closest(".match-card");
        const aEl = card.querySelector("input[data-score-side='a']");
        const bEl = card.querySelector("input[data-score-side='b']");
        const parse = (el) => {
          if (el.value === "") return null;
          const v = Number(el.value);
          return Number.isInteger(v) ? v : NaN;
        };
        const sa = parse(aEl), sb = parse(bEl);
        if (Number.isNaN(sa) || Number.isNaN(sb)) { showMsg(t("validation"), true); return; }
        L.setScore(state, round, matchIdx, sa, sb);
        save(); render();
        showMsg(t("saved"), false);
      }
    } catch (e) {
      showMsg(t("validation"), true);
    }
  }

  function exportJson() {
    if (!state) return;
    const blob = new Blob([JSON.stringify(L.exportState(state), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = t("exportFile");
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const res = L.importState(data);
        if (!res.ok) { showMsg(t("importBad") + res.error, true); return; }
        state = res.state;
        save(); render();
        showMsg(t("importOk"), false);
      } catch (e) {
        showMsg(t("importBad") + "invalid-json", true);
      }
    };
    reader.readAsText(file);
  }

  document.addEventListener("DOMContentLoaded", () => {
    load();
    $("langEn").addEventListener("click", () => { lang = "en"; save(); render(); });
    $("langBn").addEventListener("click", () => { lang = "bn"; save(); render(); });
    $("btnStart").addEventListener("click", () => startTournament(false));
    $("btnSample").addEventListener("click", () => startTournament(true));
    $("btnNew").addEventListener("click", () => { state = null; save(); render(); });
    $("btnPrint").addEventListener("click", () => window.print());
    $("btnExport").addEventListener("click", exportJson);
    $("btnImport").addEventListener("click", () => $("importFile").click());
    $("importFile").addEventListener("change", (ev) => {
      if (ev.target.files && ev.target.files[0]) importJson(ev.target.files[0]);
      ev.target.value = "";
    });
    $("btnErase").addEventListener("click", () => {
      eraseOpen = !eraseOpen;
      $("eraseBox").hidden = !eraseOpen;
    });
    $("btnEraseCancel").addEventListener("click", () => { eraseOpen = false; $("eraseBox").hidden = true; });
    $("btnEraseConfirm").addEventListener("click", () => {
      if ($("eraseInput").value.trim() !== "DELETE") { showMsg(t("eraseWrong"), true); return; }
      state = null;
      try { localStorage.removeItem(KEY); } catch (e) {}
      $("eraseInput").value = "";
      eraseOpen = false;
      $("eraseBox").hidden = true;
      render();
      showMsg(t("erased"), false);
    });
    $("bracket").addEventListener("click", onBracketClick);
    render();
  });
})();
