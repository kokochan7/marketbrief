// Updates the Kalshi / Polymarket meters on stories from /api/odds.
(function () {
  const R = 15;
  const C = 2 * Math.PI * R;
  const fmt = (p) => (p < 1 && p > 0 ? "<1%" : Math.round(p) + "%");

  async function load() {
    try {
      const r = await fetch("/api/odds", { cache: "no-store" });
      if (!r.ok) return;
      const data = await r.json();
      for (const [id, o] of Object.entries(data.odds || {})) {
        if (!o || typeof o.prob !== "number") continue;
        const el = document.querySelector(`[data-odds="${id}"]`);
        if (!el) continue;
        const p = Math.max(0, Math.min(100, o.prob));
        el.querySelector(".ring-fill").setAttribute("stroke-dashoffset", (C * (1 - p / 100)).toFixed(2));
        el.querySelector(".ring-num").textContent = fmt(p);
        el.classList.add("is-live");
      }
    } catch (e) {}
  }

  if (document.querySelector("[data-odds]")) {
    load();
    setInterval(() => !document.hidden && load(), 120000);
  }
})();
