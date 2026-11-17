// Fills the live parts of Market Mood from /api/mood: the sector heatmap (week % change of
// SPY and the 11 sector SPDR ETFs), Kalshi odds for the next Fed meeting, and the 2s10s curve
// (10Y minus 2Y Treasury yield, from CNBC).
// Loads once per page view and again on each refresh (live.js "mb:refresh").
(function () {
  const $ = (s) => document.querySelector(s);
  if (!$("#sec-card")) return;

  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmtPct = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%`;
  const fmtP = (p) => (p < 1 && p > 0 ? "<1%" : Math.round(p) + "%");

  // Heat colour: green for gains, red for losses, stronger with size (full at ±4% a week).
  function heat(v) {
    const a = Math.min(1, Math.abs(v) / 4);
    const rgb = v >= 0 ? "52, 211, 153" : "248, 113, 113";
    return `rgba(${rgb}, ${(0.12 + a * 0.55).toFixed(2)})`;
  }

  function sectors(data) {
    if (!data || data.error) return;
    let usedDay = false;
    for (const el of document.querySelectorAll(".sec[data-sec]")) {
      const q = data[el.dataset.sec];
      const v = el.querySelector(".sec-v");
      // Week change; on a Monday before the first close Yahoo's week is empty, so fall back to the day.
      const w = q && typeof q.wkPct === "number" ? q.wkPct : null;
      const d = q && typeof q.dayPct === "number" ? q.dayPct : null;
      const show = w !== null ? w : d;
      if (show === null) {
        v.textContent = "n/a";
        el.style.background = "";
        continue;
      }
      if (w === null) usedDay = true;
      v.textContent = fmtPct(show);
      el.style.background = heat(show);
      const name = el.title.split(" · ")[0];
      el.title = `${name} · week ${w !== null ? fmtPct(w) : "n/a"} · day ${d !== null ? fmtPct(d) : "n/a"}`;
    }
    const basis = $("#sec-basis");
    if (basis) basis.textContent = usedDay ? "today" : "this week";
  }

  function fed(f) {
    const rows = $("#fed-rows");
    if (!f || f.error || !f.markets || !f.markets.length) {
      rows.innerHTML = '<div class="card-sub">Kalshi odds unavailable right now</div>';
      return;
    }
    const meet = $("#fed-meet");
    if (meet) meet.textContent = f.meeting ? `· ${f.meeting}` : "";
    rows.innerHTML = f.markets
      .slice(0, 3)
      .map(
        (m) => `<div class="fed-row"><span class="fed-l">${esc(m.label)}</span><span class="fed-bar"><span style="width:${Math.max(0, Math.min(100, m.prob)).toFixed(1)}%"></span></span><span class="fed-p">${fmtP(m.prob)}</span></div>`
      )
      .join("");
    const k = $("#fed-kalshi");
    if (k && f.url) k.href = f.url;
  }

  // 2s10s curve: spread in basis points, positive = normal slope, negative = inverted.
  const fmtBp = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}bp`;
  const toneCls = (v) => (v > 0 ? "chg-up" : v < 0 ? "chg-down" : "chg-flat");
  function curve(c) {
    const v = $("#curve-v");
    if (!v) return;
    if (!c || c.error || typeof c.bp !== "number") {
      v.textContent = "—";
      $("#curve-sub").textContent = "CNBC yields unavailable right now";
      return;
    }
    v.textContent = fmtBp(c.bp);
    const flag = $("#curve-flag");
    flag.textContent = c.bp < 0 ? "Inverted" : "Positive";
    flag.className = "card-flag " + (c.bp < 0 ? "tone-text-red" : "tone-text-teal");
    const parts = [];
    // Same style as the live strip: day change, then week change marked "wk".
    if (typeof c.chgBp === "number") parts.push(`<span class="${toneCls(c.chgBp)}">${fmtBp(c.chgBp)}</span>`);
    if (typeof c.wkBp === "number") parts.push(`<span class="${toneCls(c.wkBp)}">${fmtBp(c.wkBp)} wk</span>`);
    // Day/week change on one line, the two yields on the next (kept together).
    const yields = `<span style="white-space:nowrap">10Y ${c.y10.toFixed(2)}% · 2Y ${c.y2.toFixed(2)}%</span>`;
    $("#curve-sub").innerHTML = (parts.length ? `<span style="white-space:nowrap">${parts.join("&nbsp; ")}</span><br>` : "") + yields;
    const stamp = window.MBTime && c.time ? window.MBTime.stamp(c.time) : "";
    $("#curve-asof").textContent = `CNBC${stamp ? " · " + stamp : ""}`;
  }

  let loading = false;
  async function load() {
    if (loading) return;
    loading = true;
    try {
      const r = await fetch("/api/mood", { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      const data = await r.json();
      sectors(data.sectors);
      fed(data.fed);
      curve(data.curve);
    } catch (e) {
      const rows = $("#fed-rows");
      if (rows && /Loading/.test(rows.textContent)) rows.innerHTML = '<div class="card-sub">Kalshi odds unavailable right now</div>';
    } finally {
      loading = false;
    }
  }

  load();
  document.addEventListener("mb:refresh", load);
})();
