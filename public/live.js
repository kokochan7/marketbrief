// Fills the "Live markets" tape and the Fear & Greed card from /api/live.
(function () {
  const REFRESH_MS = 60000;
  const $ = (s, el = document) => el.querySelector(s);

  const fmtNum = (v, d = 2) =>
    v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

  function fmtPrice(key, q) {
    if (key === "tnx") return fmtNum(q.price, 3) + "%";
    if (key === "btc") return "$" + fmtNum(q.price, 0);
    if (q.unit === "usd") return "$" + fmtNum(q.price, 2);
    return fmtNum(q.price, 2);
  }

  function chg(v, isBp, suffix) {
    if (typeof v !== "number" || !isFinite(v)) return { text: "", cls: "flat" };
    const sign = v > 0 ? "+" : v < 0 ? "−" : "";
    const abs = Math.abs(v);
    const text = isBp ? `${sign}${abs.toFixed(1)}bp` : `${sign}${abs.toFixed(2)}%`;
    return { text: text + (suffix ? " " + suffix : ""), cls: v > 0 ? "up" : v < 0 ? "down" : "flat" };
  }

  const etTime = (ms) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(ms)) + " ET";

  function fgLabel(r) {
    return String(r || "").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function render(data) {
    window.__live = data;
    document.dispatchEvent(new CustomEvent("live:update"));
    let ok = 0;
    let newest = 0;
    for (const el of document.querySelectorAll(".tick")) {
      const key = el.dataset.key;
      const q = data.quotes && data.quotes[key];
      if (!q || q.error || typeof q.price !== "number") {
        el.classList.add("is-missing");
        $(".tick-value", el).textContent = "n/a";
        continue;
      }
      ok++;
      newest = Math.max(newest, q.time || 0);
      el.classList.remove("is-missing");
      $(".tick-value", el).textContent = fmtPrice(key, q);
      const isBp = q.unit === "yield";
      const d = chg(isBp ? q.chgBp : q.chgPct, isBp, q.chgLabel || "");
      const w = chg(isBp ? q.wkBp : q.wkPct, isBp, "wk");
      const dEl = $(".tick-chg .d", el);
      const wEl = $(".tick-chg .w", el);
      dEl.textContent = d.text || " ";
      dEl.className = "d chg-" + d.cls;
      wEl.textContent = w.text;
      wEl.className = "w chg-" + w.cls;
    }
    const meta = $("#live-meta");
    if (ok === 0) {
      meta.textContent = "Live quotes unavailable right now";
      $("#live").classList.add("is-down");
    } else {
      $("#live").classList.remove("is-down");
      meta.textContent = `Latest quote ${etTime(newest)} · refreshes every minute`;
    }

    const fg = data.fearGreed;
    if (fg && typeof fg.score === "number") {
      $("#fg-score").textContent = Math.round(fg.score);
      $("#fg-label").textContent = fgLabel(fg.rating);
      $("#fg-marker").style.left = Math.max(0, Math.min(100, fg.score)) + "%";
      const parts = [];
      if (typeof fg.weekAgo === "number") parts.push(`Week ago ${Math.round(fg.weekAgo)}`);
      if (typeof fg.monthAgo === "number") parts.push(`month ${Math.round(fg.monthAgo)}`);
      if (typeof fg.yearAgo === "number") parts.push(`year ${Math.round(fg.yearAgo)}`);
      if (parts.length) $("#fg-sub").textContent = parts.join(", ");
      const t = Date.parse(fg.time);
      $("#fg-asof").textContent = "Live · CNN" + (isNaN(t) ? "" : ", as of " + etTime(t));
      setFgTone(fg.score);
    }
  }

  function setFgTone(score) {
    const el = $("#fg-card");
    const tone = score < 25 ? "xfear" : score < 45 ? "fear" : score <= 55 ? "neutral" : score <= 75 ? "greed" : "xgreed";
    el.dataset.tone = tone;
  }

  async function load() {
    try {
      const r = await fetch("/api/live", { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      render(await r.json());
    } catch (e) {
      const meta = $("#live-meta");
      if (meta && meta.textContent === "Loading…") {
        meta.textContent = "Live quotes unavailable right now";
        $("#live").classList.add("is-down");
      }
    }
  }

  const initial = parseFloat($("#fg-score")?.textContent);
  if (!isNaN(initial)) setFgTone(initial);
  load();
  setInterval(() => {
    if (!document.hidden) load();
  }, REFRESH_MS);
})();
