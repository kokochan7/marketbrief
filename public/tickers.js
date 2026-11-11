// Hover cards for earnings tickers: price and day change from /api/quote, plus any
// Kalshi / Polymarket earnings markets for the ticker.
// Clicking a ticker opens Google Finance (via the Worker's /go/ redirect).
(function () {
  const TTL = 60000;
  const cache = new Map(); // sym -> { at, data | promise }
  let tip, current, hideTimer;

  function getTip() {
    if (tip) return tip;
    tip = document.createElement("div");
    tip.className = "tkr-tip";
    tip.setAttribute("role", "tooltip");
    tip.hidden = true;
    document.body.appendChild(tip);
    return tip;
  }

  function fetchQuote(sym) {
    const hit = cache.get(sym);
    if (hit && Date.now() - hit.at < TTL) return hit.p;
    const p = fetch(`/api/quote?s=${encodeURIComponent(sym)}`)
      .then((r) => r.json())
      .catch(() => ({ ticker: sym, error: "network" }));
    cache.set(sym, { at: Date.now(), p });
    return p;
  }

  const money = (v, cur) => {
    const n = v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return cur && cur !== "USD" ? `${n} ${cur}` : `$${n}`;
  };

  const etTime = (ms) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(ms)) + " ET";

  function esc(s) {
    return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  // Kalshi / Polymarket earnings markets for a ticker (page data, with live odds from odds.js).
  let EODDS = {};
  try {
    EODDS = JSON.parse(document.getElementById("eodds-data")?.textContent || "{}");
  } catch (e) {}
  const SRC = { kalshi: "Kalshi", polymarket: "Polymarket" };
  const fmtP = (p) => (p < 1 && p > 0 ? "<1%" : Math.round(p) + "%");

  function oddsBlock(sym) {
    const list = EODDS[sym];
    if (!list || !list.length) return "";
    const rows = list
      .map((o, j) => {
        const live = window.__odds && window.__odds[`e-${sym}-${j}`];
        const ok = live && typeof live.prob === "number";
        const p = ok ? live.prob : Number(o.prob);
        const val = ok && live.closed ? (p >= 50 ? "Yes" : "No") : isFinite(p) ? fmtP(p) : "—";
        return `<div class="tt-odd"><span class="tt-odd-p${p < 50 ? " is-low" : ""}">${val}</span><span>${esc(o.label)} <span class="tt-odd-src">${esc(SRC[o.source] || o.source)}</span></span></div>`;
      })
      .join("");
    return `<div class="tt-odds"><div class="tt-odds-h">Prediction markets</div>${rows}</div>`;
  }

  function content(sym, q) {
    return quoteContent(sym, q) + oddsBlock(sym);
  }

  function quoteContent(sym, q) {
    if (!q) return `<div class="tt-head"><b>${esc(sym)}</b></div><div class="tt-sub">Loading…</div>`;
    if (q.error || typeof q.price !== "number") {
      return `<div class="tt-head"><b>${esc(sym)}</b></div><div class="tt-sub">Quote unavailable. Click to open Google Finance.</div>`;
    }
    const c = q.chgPct;
    const has = typeof c === "number" && isFinite(c);
    const cls = !has ? "chg-flat" : c > 0 ? "chg-up" : c < 0 ? "chg-down" : "chg-flat";
    const sign = !has ? "" : c > 0 ? "+" : c < 0 ? "−" : "";
    return `
      <div class="tt-head"><b>${esc(sym)}</b>${q.name ? `<span>${esc(q.name)}</span>` : ""}</div>
      <div class="tt-price">${money(q.price, q.currency)} <span class="${cls}">${has ? sign + Math.abs(c).toFixed(2) + "%" : ""}</span></div>
      <div class="tt-sub">Regular session · as of ${etTime(q.time)}</div>
      <div class="tt-sub">Click for Google Finance ↗</div>`;
  }

  const pct = (v, suffix) => {
    if (typeof v !== "number" || !isFinite(v)) return "";
    const cls = v > 0 ? "chg-up" : v < 0 ? "chg-down" : "chg-flat";
    const sign = v > 0 ? "+" : v < 0 ? "−" : "";
    return `<span class="${cls}">${sign}${Math.abs(v).toFixed(2)}%${suffix ? " " + suffix : ""}</span>`;
  };
  const bp = (v, suffix) => {
    if (typeof v !== "number" || !isFinite(v)) return "";
    const cls = v > 0 ? "chg-up" : v < 0 ? "chg-down" : "chg-flat";
    const sign = v > 0 ? "+" : v < 0 ? "−" : "";
    return `<span class="${cls}">${sign}${Math.abs(v).toFixed(1)}bp${suffix ? " " + suffix : ""}</span>`;
  };

  function liveContent(el) {
    const key = el.dataset.key;
    const label = el.querySelector(".tick-label")?.textContent || key;
    const q = window.__live && window.__live.quotes && window.__live.quotes[key];
    const head = `<div class="tt-head"><b>${esc(label)}</b><span>${esc(el.dataset.name || "")}</span></div>`;
    if (!window.__live) return head + `<div class="tt-sub">Loading…</div>`;
    if (!q || q.error || typeof q.price !== "number") return head + `<div class="tt-sub">Live quote unavailable. Click to open Google Finance.</div>`;
    const value = el.querySelector(".tick-value")?.textContent || "";
    const isY = q.unit === "yield";
    const day = isY ? bp(q.chgBp, "day") : pct(q.chgPct, q.chgLabel || "day");
    const wk = isY ? bp(q.wkBp, "wk") : pct(q.wkPct, "wk");
    return `${head}
      <div class="tt-price">${esc(value)}</div>
      <div class="tt-chgs">${day}${wk ? " · " + wk : ""}</div>
      <div class="tt-sub">${esc(q.src || "")} · as of ${etTime(q.time)}</div>
      <div class="tt-sub">${el.dataset.gf === "0" ? "Click for Google ↗" : "Click for Google Finance ↗"}</div>`;
  }

  function place(el) {
    const t = getTip();
    const r = el.getBoundingClientRect();
    const tw = t.offsetWidth;
    const th = t.offsetHeight;
    let left = r.left + r.width / 2 - tw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
    // Live tiles: show the card below the tile; tickers: above, unless there's no room.
    let top = el.classList.contains("tick") ? r.bottom + 8 : r.top - th - 8;
    if (top < 8) top = r.bottom + 8;
    t.style.left = `${left + window.scrollX}px`;
    t.style.top = `${top + window.scrollY}px`;
  }

  function show(el) {
    clearTimeout(hideTimer);
    current = el;
    const t = getTip();
    if (el.classList.contains("tick")) {
      t.innerHTML = liveContent(el);
      t.hidden = false;
      place(el);
      return;
    }
    const sym = el.dataset.sym;
    t.innerHTML = content(sym, null);
    t.hidden = false;
    place(el);
    fetchQuote(sym).then((q) => {
      if (current !== el) return;
      t.innerHTML = content(sym, q);
      place(el);
    });
  }

  function hide() {
    hideTimer = setTimeout(() => {
      current = null;
      if (tip) tip.hidden = true;
    }, 80);
  }

  // Only use hover cards on devices that can hover; taps go straight to the link.
  if (!window.matchMedia || !window.matchMedia("(hover: hover)").matches) return;

  document.addEventListener("mouseover", (e) => {
    const a = e.target.closest && e.target.closest("a.tkr, a.tick");
    if (a && a !== current) show(a);
  });
  document.addEventListener("mouseout", (e) => {
    const a = e.target.closest && e.target.closest("a.tkr, a.tick");
    if (a && !a.contains(e.relatedTarget)) hide();
  });
  document.addEventListener("focusin", (e) => {
    if (e.target.matches && e.target.matches("a.tkr, a.tick")) show(e.target);
  });
  document.addEventListener("focusout", (e) => {
    if (e.target.matches && e.target.matches("a.tkr, a.tick")) hide();
  });
  window.addEventListener("scroll", () => current && place(current), { passive: true });
  document.addEventListener("live:update", () => {
    if (current && current.classList.contains("tick") && tip && !tip.hidden) {
      tip.innerHTML = liveContent(current);
      place(current);
    }
  });
})();
