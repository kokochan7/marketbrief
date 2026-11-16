// Turns a Yahoo Finance chart response into price, day change and week change.

// Local calendar date (YYYY-MM-DD) of a unix time, using the exchange's UTC offset.
export function localDate(unix, gmtoffset) {
  return new Date((unix + gmtoffset) * 1000).toISOString().slice(0, 10);
}

export function mondayOf(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z");
  const dow = d.getUTCDay(); // 0 Sun .. 6 Sat
  const back = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

// extraBars: optional [{ date, close }] daily closes from a second source, used
// where Yahoo's own history is missing (it returns a single bar for CSI 300).
export function summarize(res, unit, extraBars = []) {
  const m = res.meta;
  const price = m.regularMarketPrice;
  const t = m.regularMarketTime;
  const off = m.gmtoffset ?? 0;
  if (typeof price !== "number" || !t) throw new Error("no price");
  const ts = res.timestamp || [];
  const closes = res.indicators?.quote?.[0]?.close || [];
  const bars = ts
    .map((x, i) => ({ date: localDate(x, off), close: closes[i] }))
    .filter((b) => typeof b.close === "number");
  const have = new Set(bars.map((b) => b.date));
  const extra = extraBars.filter((b) => typeof b.close === "number" && !have.has(b.date));
  if (extra.length) bars.push(...extra);
  bars.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const today = localDate(t, off);
  const before = bars.filter((b) => b.date < today);
  const prev = before.length ? before[before.length - 1].close : m.chartPreviousClose;
  const monday = mondayOf(today);
  const weekBars = bars.filter((b) => {
    if (b.date >= monday) return false;
    const dow = new Date(b.date + "T00:00:00Z").getUTCDay();
    return dow >= 1 && dow <= 5;
  });
  const wkRef = weekBars.length ? weekBars[weekBars.length - 1] : null;
  const pct = (a, b) => (typeof a === "number" && typeof b === "number" && b !== 0 ? ((a - b) / b) * 100 : null);
  const out = {
    price,
    prevClose: prev ?? null,
    time: t * 1000,
    marketState: m.marketState || null,
    unit: unit || null,
    src: extra.length ? "Yahoo Finance, Eastmoney" : "Yahoo Finance",
  };
  if (unit === "yield") {
    out.chgBp = typeof prev === "number" ? (price - prev) * 100 : null;
    out.wkBp = wkRef ? (price - wkRef.close) * 100 : null;
  } else {
    out.chgPct = pct(price, prev);
    out.wkPct = wkRef ? pct(price, wkRef.close) : null;
  }
  out.wkRefDate = wkRef ? wkRef.date : null;
  return out;
}

// ---- Extended-hours prices from Yahoo's v7 quote API (fetched with overnightPrice=true) ----
const SESSION_FIELDS = {
  pre: ["preMarketPrice", "preMarketChange", "preMarketChangePercent", "preMarketTime"],
  post: ["postMarketPrice", "postMarketChange", "postMarketChangePercent", "postMarketTime"],
  overnight: ["overnightMarketPrice", "overnightMarketChange", "overnightMarketChangePercent", "overnightMarketTime"],
};

// The most recent extended-hours trade after the last regular-session close, the way
// Yahoo Finance shows it under the close: { session, price, chg, chgPct, time } or null.
export function extendedFrom(q, nowMs = Date.now()) {
  if (!q || !q.hasPrePostMarketData || !["EQUITY", "ETF"].includes(q.quoteType)) return null;
  const rt = q.regularMarketTime || 0;
  const close = q.regularMarketPrice;
  let best = null;
  for (const [session, [pk, ck, pck, tk]] of Object.entries(SESSION_FIELDS)) {
    const price = q[pk];
    const time = q[tk];
    if (typeof price !== "number" || !time || time <= rt) continue;
    if (best && time <= best.time) continue;
    let chg = typeof q[ck] === "number" ? q[ck] : null;
    let chgPct = typeof q[pck] === "number" ? q[pck] : null;
    if (typeof close === "number" && close) {
      chg = price - close;
      chgPct = (chg / close) * 100;
    }
    best = { session, price, chg, chgPct, time };
  }
  if (!best) return null;
  // Stale (more than 4 days old, e.g. a long weekend's leftovers): don't show.
  if (nowMs / 1000 - best.time > 4 * 86400) return null;
  return { ...best, time: best.time * 1000 };
}

