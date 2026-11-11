// Hover cards for earnings tickers: price and day change from /api/quote.
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

  function content(sym, q) {
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

  function place(el) {
    const t = getTip();
    const r = el.getBoundingClientRect();
    const tw = t.offsetWidth;
    const th = t.offsetHeight;
    let left = r.left + r.width / 2 - tw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
    let top = r.top - th - 8;
    if (top < 8) top = r.bottom + 8;
    t.style.left = `${left + window.scrollX}px`;
    t.style.top = `${top + window.scrollY}px`;
  }

  function show(el) {
    clearTimeout(hideTimer);
    const sym = el.dataset.sym;
    current = el;
    const t = getTip();
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
    const a = e.target.closest && e.target.closest("a.tkr");
    if (a && a !== current) show(a);
  });
  document.addEventListener("mouseout", (e) => {
    const a = e.target.closest && e.target.closest("a.tkr");
    if (a && !a.contains(e.relatedTarget)) hide();
  });
  document.addEventListener("focusin", (e) => {
    if (e.target.matches && e.target.matches("a.tkr")) show(e.target);
  });
  document.addEventListener("focusout", (e) => {
    if (e.target.matches && e.target.matches("a.tkr")) hide();
  });
  window.addEventListener("scroll", () => current && place(current), { passive: true });
})();
