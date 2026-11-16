// Fills the "Live markets" tape and the Fear & Greed card from /api/live,
// and owns the Manual / Live refresh mode. Manual (default) loads once per
// page view and then only when the refresh button is pressed; Live refreshes
// everything every minute while the tab is visible. Other scripts listen for
// the "mb:refresh" event.
(function () {
  const REFRESH_MS = 60000;
  const MODE_KEY = "mb-refresh-mode";
  const $ = (s, el = document) => el.querySelector(s);

  const fmtNum = (v, d = 2) =>
    v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

  function fmtPrice(key, q) {
    if (q.unit === "yield") return fmtNum(q.price, 3) + "%";
    if (q.unit === "spread") return (q.price > 0 ? "+" : q.price < 0 ? "−" : "") + fmtNum(Math.abs(q.price), 1) + "bp";
    if (key === "btc") return "$" + fmtNum(q.price, 0);
    if (q.unit === "usd") return "$" + fmtNum(q.price, 2);
    // Index futures: whole points once they're in five figures (Nasdaq, Dow).
    if (key === "nq" || key === "ym") return fmtNum(q.price, 0);
    return fmtNum(q.price, 2);
  }

  function chg(v, isBp, suffix) {
    if (typeof v !== "number" || !isFinite(v)) return { text: "", cls: "flat" };
    const sign = v > 0 ? "+" : v < 0 ? "−" : "";
    const abs = Math.abs(v);
    const text = isBp ? `${sign}${abs.toFixed(1)}bp` : `${sign}${abs.toFixed(2)}%`;
    return { text: text + (suffix ? " " + suffix : ""), cls: v > 0 ? "up" : v < 0 ? "down" : "flat" };
  }

  // "Sun 6:19 PM PST": the viewer's own time zone (localtime.js), Eastern as a fallback.
  const etTime = (ms) =>
    window.MBTime ? window.MBTime.stamp(ms) : new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(ms)) + " ET";

  const SESSION_LABEL = { pre: "Pre-market", post: "After hours", overnight: "Overnight" };
  const MOON = '<svg class="x-i" viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 10.2A6 6 0 0 1 5.8 2.5a6 6 0 1 0 7.7 7.7z" fill="currentColor"/></svg>';
  const SUN = '<svg class="x-i" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3.2" fill="currentColor"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M3 13l1.4-1.4M11.6 4.4 13 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';

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
      const isBp = q.unit === "yield" || q.unit === "spread";
      const d = chg(isBp ? q.chgBp : q.chgPct, isBp, q.chgLabel || "");
      const w = chg(isBp ? q.wkBp : q.wkPct, isBp, "wk");
      const dEl = $(".tick-chg .d", el);
      const wEl = $(".tick-chg .w", el);
      dEl.textContent = d.text || " ";
      dEl.className = "d chg-" + d.cls;
      wEl.textContent = w.text;
      wEl.className = "w chg-" + w.cls;
      // Pre-market / after-hours / overnight price, in a smaller line under the main price.
      const xEl = $(".tick-ext", el);
      if (xEl) {
        const x = q.ext;
        if (x && typeof x.price === "number") {
          const c = chg(x.chgPct, false, "");
          // No "$" here, to fit narrow tiles: "Overnight 753.29 −0.14%".
          // Narrow tiles swap the label for Yahoo-style icons (sun = pre-market, moon = after hours / overnight).
          const label = SESSION_LABEL[x.session] || "Extended hours";
          xEl.innerHTML = `<span class="x-l"><span class="x-t">${label}</span>${x.session === "pre" ? SUN : MOON}</span><span>${fmtNum(x.price, 2)}</span><span class="chg-${c.cls}">${c.text}</span>`;
          xEl.title = `${SESSION_LABEL[x.session] || "Extended hours"} trading, as of ${etTime(x.time)}`;
          xEl.hidden = false;
        } else {
          xEl.hidden = true;
        }
      }
    }
    const meta = $("#live-meta");
    if (ok === 0) {
      meta.textContent = "Live quotes unavailable right now";
      $("#live").classList.add("is-down");
    } else {
      $("#live").classList.remove("is-down");
      meta.textContent = `As of ${etTime(newest)}` + (mode === "live" ? " · live" : "");
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

  let loading = false;
  async function load() {
    if (loading) return;
    loading = true;
    const btn = $("#refresh-btn");
    if (btn) btn.classList.add("is-spinning");
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
    } finally {
      loading = false;
      if (btn) setTimeout(() => btn.classList.remove("is-spinning"), 400);
    }
  }

  // Refresh everything on the page (live tape here, odds meters in odds.js).
  function refreshAll() {
    load();
    document.dispatchEvent(new CustomEvent("mb:refresh"));
  }

  let mode = "manual";
  try {
    if (localStorage.getItem(MODE_KEY) === "live") mode = "live";
  } catch (e) {}
  let timer = null;

  function setMode(m, save) {
    mode = m === "live" ? "live" : "manual";
    if (save) {
      try { localStorage.setItem(MODE_KEY, mode); } catch (e) {}
    }
    const live = $("#live");
    live.classList.toggle("is-manual", mode === "manual");
    live.classList.toggle("is-live-mode", mode === "live");
    for (const b of document.querySelectorAll(".seg-btn")) {
      b.setAttribute("aria-checked", String(b.dataset.mode === mode));
    }
    clearInterval(timer);
    timer = null;
    if (mode === "live") {
      timer = setInterval(() => {
        if (!document.hidden) refreshAll();
      }, REFRESH_MS);
    }
    const meta = $("#live-meta");
    if (meta && window.__live) meta.textContent = meta.textContent.replace(/ · live$/, "") + (mode === "live" ? " · live" : "");
  }

  for (const b of document.querySelectorAll(".seg-btn")) {
    b.addEventListener("click", () => {
      if (b.dataset.mode === mode) return;
      setMode(b.dataset.mode, true);
      if (mode === "live") refreshAll();
    });
  }
  const btn = $("#refresh-btn");
  if (btn) btn.addEventListener("click", refreshAll);
  // In Live mode, catch up straight away when the tab comes back into view.
  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (mode === "live" && Date.now() - hiddenAt > REFRESH_MS) refreshAll();
  });

  const initial = parseFloat($("#fg-score")?.textContent);
  if (!isNaN(initial)) setFgTone(initial);
  setMode(mode, false);
  load(); // one load per page view; odds.js does its own first load
})();
