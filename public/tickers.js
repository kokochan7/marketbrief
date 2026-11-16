// Hover cards (and on touch devices, a tap sheet) for earnings tickers: price and day change from /api/quote, plus any
// Kalshi / Polymarket earnings markets for the ticker.
// Clicking a ticker, or anywhere on its card, opens Yahoo Finance (via the Worker's /go/ redirect).
(function () {
  const TTL = 60000;
  const CAN_HOVER = !!(window.matchMedia && window.matchMedia("(hover: hover)").matches);
  const cache = new Map(); // sym -> { at, data | promise }
  const GAP = 8; // px between the link and its card; the card's ::before bridges it
  const HIDE_MS = 250; // time to move the pointer from a ticker onto its card
  const SWITCH_MS = 140; // passing over another ticker on the way to the card doesn't steal it
  let tip, current, hideTimer, switchTimer, switchTo;

  function getTip() {
    if (tip) return tip;
    tip = document.createElement("div");
    tip.className = "tkr-tip";
    tip.setAttribute("role", "tooltip");
    tip.hidden = true;
    // Keep the card open while the pointer is on it, so its prediction-market links can be clicked.
    tip.addEventListener("mouseenter", () => {
      clearTimeout(hideTimer);
      cancelSwitch();
    });
    tip.addEventListener("mouseleave", (e) => {
      if (current && e.relatedTarget && current.contains(e.relatedTarget)) return;
      hide();
    });
    // Clicking anywhere on the card (other than its own links) opens the ticker on Yahoo Finance.
    tip.addEventListener("click", (e) => {
      if (!current || (e.target.closest && e.target.closest("a"))) return;
      window.open(current.href, "_blank", "noopener");
    });
    tip.addEventListener("focusout", (e) => {
      if (!tip.contains(e.relatedTarget) && e.relatedTarget !== current) hide();
    });
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

  // "Sun 6:19 PM PST": the viewer's own time zone (localtime.js), Eastern as a fallback.
  const etTime = (ms) =>
    window.MBTime ? window.MBTime.stamp(ms) : new Intl.DateTimeFormat("en-US", {
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
        const inner = `<span class="tt-odd-p${p < 50 ? " is-low" : ""}">${val}</span><span><span class="tt-odd-l">${esc(o.label)}</span> <span class="tt-odd-src">${esc(SRC[o.source] || o.source)} ↗</span></span>`;
        return /^https:\/\//.test(o.url || "")
          ? `<a class="tt-odd" href="${esc(o.url)}" target="_blank" rel="noopener">${inner}</a>`
          : `<div class="tt-odd">${inner}</div>`;
      })
      .join("");
    return `<div class="tt-odds"><div class="tt-odds-h">Prediction markets</div>${rows}</div>`;
  }

  // Card layout: name, price, extended-hours line, (prediction markets), then the grey
  // "at close / as of" times at the bottom.
  function content(sym, q) {
    const { main, foot } = quoteParts(sym, q);
    return main + oddsBlock(sym) + footer(foot);
  }

  const footer = (lines) => (lines.length ? `<div class="tt-foot">${lines.map((l) => `<div class="tt-sub">${l}</div>`).join("")}</div>` : "");

  function quoteParts(sym, q) {
    const head = `<div class="tt-head"><b>${esc(sym)}</b>${q && q.name ? `<span>${esc(q.name)}</span>` : ""}</div>`;
    if (!q) return { main: head, foot: ["Loading…"] };
    if (q.error || typeof q.price !== "number") return { main: head, foot: ["Quote unavailable right now"] };
    const c = q.chgPct;
    const has = typeof c === "number" && isFinite(c);
    const cls = !has ? "chg-flat" : c > 0 ? "chg-up" : c < 0 ? "chg-down" : "chg-flat";
    const sign = !has ? "" : c > 0 ? "+" : c < 0 ? "−" : "";
    const main = `${head}
      <div class="tt-price">${money(q.price, q.currency)} <span class="${cls}">${has ? sign + Math.abs(c).toFixed(2) + "%" : ""}</span></div>
      ${extLine(q.ext)}
      ${moveLine(q.move)}`;
    const foot = [`${q.ext ? "At close" : "Regular session · as of"} ${etTime(q.time)}`];
    if (extOk(q.ext)) foot.push(extFoot(q.ext));
    return { main, foot };
  }

  // Pre-market / after-hours / overnight trade: price and % right under the main price
  // (sun = pre-market, moon = after hours / overnight, as on Yahoo); its time goes in the footer.
  const SESSION_LABEL = { pre: "Pre-market", post: "After hours", overnight: "Overnight" };
  const MOON = '<svg class="tt-ext-i" viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 10.2A6 6 0 0 1 5.8 2.5a6 6 0 1 0 7.7 7.7z" fill="currentColor"/></svg>';
  const SUN = '<svg class="tt-ext-i" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3.2" fill="currentColor"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M3 13l1.4-1.4M11.6 4.4 13 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
  const extOk = (x) => x && typeof x.price === "number";
  function extLine(x) {
    if (!extOk(x)) return "";
    const label = SESSION_LABEL[x.session] || "Extended hours";
    return `<div class="tt-ext" title="${label}">${x.session === "pre" ? SUN : MOON}<span class="tt-ext-p">${money(x.price)}</span> ${pct(x.chgPct)}</div>`;
  }
  // Options-implied earnings move (at-the-money straddle through the first expiry after the report).
  function moveLine(m) {
    if (!m || typeof m.pct !== "number" || !isFinite(m.pct)) return "";
    const d = new Date(m.expiry);
    const exp = `${d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })} ${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
    return `<div class="tt-move" title="At-the-money straddle (call + put) for the ${exp} expiry, as a share of the price">Options imply <b>±${m.pct.toFixed(1)}%</b> by ${exp}</div>`;
  }
  const extFoot = (x) => `${SESSION_LABEL[x.session] || "Extended hours"} · ${etTime(x.time)}`;

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
    if (!window.__live) return head + footer(["Loading…"]);
    if (!q || q.error || typeof q.price !== "number") return head + footer(["Live quote unavailable right now"]);
    const value = el.querySelector(".tick-value")?.textContent || "";
    const isY = q.unit === "yield" || q.unit === "spread";
    const day = isY ? bp(q.chgBp, "day") : pct(q.chgPct, q.chgLabel || "day");
    const wk = isY ? bp(q.wkBp, "wk") : pct(q.wkPct, "wk");
    const foot = [`${esc(q.src || "")} · as of ${etTime(q.time)}`];
    if (extOk(q.ext)) foot.push(extFoot(q.ext));
    return `${head}
      <div class="tt-price">${esc(value)}</div>
      ${extLine(q.ext)}
      <div class="tt-chgs">${day}${wk ? " · " + wk : ""}</div>
      ${footer(foot)}`;
  }

  function place(el) {
    const t = getTip();
    const r = el.getBoundingClientRect();
    const tw = t.offsetWidth;
    const th = t.offsetHeight;
    let left = r.left + r.width / 2 - tw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
    // Live tiles: show the card below the tile; tickers: above, unless there's no room.
    let below = el.classList.contains("tick");
    let top = below ? r.bottom + GAP : r.top - th - GAP;
    if (top < 8) {
      top = r.bottom + GAP;
      below = true;
    }
    t.classList.toggle("is-below", below);
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

  function hide(now) {
    clearTimeout(hideTimer);
    const go = () => {
      cancelSwitch();
      current = null;
      if (tip) tip.hidden = true;
    };
    if (now) go();
    else hideTimer = setTimeout(go, HIDE_MS);
  }

  function cancelSwitch() {
    clearTimeout(switchTimer);
    switchTo = null;
  }

  // Touch devices: tapping an earnings ticker opens a bottom sheet with the same
  // details, plus a button to Yahoo Finance. Live tiles still link straight out.
  if (!CAN_HOVER) {
    let sheet, sheetSym;
    const closeSheet = () => {
      if (!sheet) return;
      sheet.classList.remove("is-open");
      sheetSym = null;
      setTimeout(() => sheet && !sheet.classList.contains("is-open") && (sheet.hidden = true), 200);
    };
    const getSheet = () => {
      if (sheet) return sheet;
      sheet = document.createElement("div");
      sheet.className = "tkr-sheet";
      sheet.hidden = true;
      sheet.innerHTML = `<div class="sheet-backdrop" data-close></div>
        <div class="sheet-panel" role="dialog" aria-modal="true" aria-label="Ticker details">
          <button type="button" class="sheet-close" data-close aria-label="Close">×</button>
          <div class="sheet-body"></div>
          <a class="sheet-go" target="_blank" rel="noopener">Open in Yahoo Finance ↗</a>
        </div>`;
      sheet.addEventListener("click", (e) => {
        if (e.target.closest("[data-close]")) closeSheet();
      });
      document.addEventListener("keydown", (e) => e.key === "Escape" && closeSheet());
      document.body.appendChild(sheet);
      return sheet;
    };
    const openSheet = (el) => {
      const s = getSheet();
      const sym = el.dataset.sym;
      sheetSym = sym;
      const body = s.querySelector(".sheet-body");
      body.innerHTML = content(sym, null);
      s.querySelector(".sheet-go").href = el.href;
      s.hidden = false;
      requestAnimationFrame(() => s.classList.add("is-open"));
      s.querySelector(".sheet-close").focus({ preventScroll: true });
      fetchQuote(sym).then((q) => {
        if (sheetSym === sym) body.innerHTML = content(sym, q);
      });
    };
    document.addEventListener("click", (e) => {
      const a = e.target.closest && e.target.closest("a.tkr");
      if (!a) return;
      e.preventDefault();
      openSheet(a);
    });
    document.addEventListener("odds:update", () => {
      if (sheetSym && sheet && !sheet.hidden) {
        const cached = cache.get(sheetSym);
        if (cached) cached.p.then((q) => sheetSym && (sheet.querySelector(".sheet-body").innerHTML = content(sheetSym, q)));
      }
    });
    return;
  }

  document.addEventListener("mouseover", (e) => {
    const a = e.target.closest && e.target.closest("a.tkr, a.tick");
    if (!a) return;
    clearTimeout(hideTimer);
    if (a === current) return cancelSwitch();
    if (a === switchTo) return;
    cancelSwitch();
    // A card is already open for another link: wait a beat, in case the pointer is only
    // crossing this one on its way to that card.
    if (current && tip && !tip.hidden) {
      switchTo = a;
      switchTimer = setTimeout(() => {
        switchTo = null;
        show(a);
      }, SWITCH_MS);
    } else show(a);
  });
  document.addEventListener("mouseout", (e) => {
    const a = e.target.closest && e.target.closest("a.tkr, a.tick");
    if (!a || a.contains(e.relatedTarget)) return;
    if (a === switchTo) cancelSwitch();
    if (tip && tip.contains(e.relatedTarget)) return;
    if (a === current || !switchTo) hide();
  });
  document.addEventListener("focusin", (e) => {
    if (e.target.matches && e.target.matches("a.tkr, a.tick")) show(e.target);
  });
  document.addEventListener("focusout", (e) => {
    if (e.target.matches && e.target.matches("a.tkr, a.tick") && !(tip && tip.contains(e.relatedTarget))) hide();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && current) hide(true);
  });
  window.addEventListener("scroll", () => current && place(current), { passive: true });
  document.addEventListener("live:update", () => {
    if (current && current.classList.contains("tick") && tip && !tip.hidden) {
      tip.innerHTML = liveContent(current);
      place(current);
    }
  });
})();
