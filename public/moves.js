// Colours the earnings tickers in the week table by their latest day move from /api/moves:
// green with ↗ when up, red with ↘ when down. Loads once per page view and on each refresh.
(function () {
  const links = document.querySelectorAll("a.tkr[data-sym]");
  if (!links.length) return;

  const fmt = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}%`;

  function paint(moves) {
    for (const a of links) {
      const m = moves[a.dataset.sym];
      const slot = a.nextElementSibling && a.nextElementSibling.classList.contains("tkr-mv") ? a.nextElementSibling : null;
      a.classList.remove("is-up", "is-down");
      if (slot) slot.className = "tkr-mv";
      if (!m || typeof m.chgPct !== "number") {
        if (slot) slot.textContent = "";
        continue;
      }
      // Rounds to 0.00% counts as flat: no colour, no arrow.
      const v = Math.round(m.chgPct * 100) / 100;
      const dir = v > 0 ? "up" : v < 0 ? "down" : "";
      if (dir) a.classList.add("is-" + dir);
      if (slot) {
        slot.textContent = dir === "up" ? "↗" : dir === "down" ? "↘" : "";
        if (dir) slot.classList.add("is-" + dir);
      }
      a.setAttribute("aria-label", `${a.dataset.sym}, ${fmt(m.chgPct)} on the day`);
    }
  }

  let loading = false;
  async function load() {
    if (loading) return;
    loading = true;
    try {
      const r = await fetch("/api/moves", { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      const data = await r.json();
      if (data && data.moves) paint(data.moves);
    } catch (e) {
      // Leave the tickers in their plain colour.
    } finally {
      loading = false;
    }
  }

  load();
  document.addEventListener("mb:refresh", load);
})();
