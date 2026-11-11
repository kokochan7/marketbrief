// Updates the Kalshi / Polymarket meters (stories and earnings tickers) from /api/odds.
(function () {
  const R = 15;
  const C = 2 * Math.PI * R;
  const fmt = (p) => (p < 1 && p > 0 ? "<1%" : Math.round(p) + "%");

  async function load() {
    try {
      const r = await fetch("/api/odds", { cache: "no-store" });
      if (!r.ok) return;
      const data = await r.json();
      window.__odds = data.odds || {};
      for (const [id, o] of Object.entries(window.__odds)) {
        if (!o || typeof o.prob !== "number") continue;
        const p = Math.max(0, Math.min(100, o.prob));
        for (const el of document.querySelectorAll(`[data-odds="${id}"]`)) {
          if (el.classList.contains("eodds")) {
            // Earnings chip: odds before the report, the result once the market settles.
            el.classList.toggle("is-low", p < 50);
            el.classList.toggle("is-resolved", !!o.closed);
            el.querySelector(".eodds-k").textContent = o.closed ? "" : "beat";
            el.querySelector(".eodds-n").textContent = o.closed ? (p >= 50 ? "Beat" : "Missed") : fmt(p);
          } else {
            el.querySelector(".ring-fill").setAttribute("stroke-dashoffset", (C * (1 - p / 100)).toFixed(2));
            el.querySelector(".ring-num").textContent = fmt(p);
          }
          el.classList.add("is-live");
        }
      }
      document.dispatchEvent(new CustomEvent("odds:update"));
    } catch (e) {}
  }

  // Loads once per page view, then whenever live.js signals a refresh
  // (the refresh button, or every minute in Live mode).
  if (document.querySelector("[data-odds]")) {
    load();
    document.addEventListener("mb:refresh", load);
  }
})();
