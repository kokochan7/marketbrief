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

// ---- Options-implied earnings move ----
// Given Yahoo's options quote (with earningsTimestamp) and one expiry's chain, the
// at-the-money straddle (call + put mid) as a % of the price: the move options price in
// through that expiry, which includes the report. { pct, expiry, earnings } or null.
const etParts = (ms) => {
  const p = {};
  for (const x of new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms))) p[x.type] = x.value;
  return { date: `${p.year}-${p.month}-${p.day}`, hour: +p.hour % 24 };
};

export function impliedMove(quote, chain, nowMs = Date.now(), report) {
  if (!quote || !chain) return null;
  const pick = impliedMove.pickExpiry(quote, [chain.expirationDate], nowMs, report);
  if (!pick) return null;
  const price = quote.regularMarketPrice;
  if (typeof price !== "number" || price <= 0) return null;
  const mid = (o) => {
    if (!o) return null;
    if (o.bid > 0 && o.ask > 0 && o.ask >= o.bid) return (o.bid + o.ask) / 2;
    return o.lastPrice > 0 ? o.lastPrice : null;
  };
  const strikes = (chain.calls || []).map((c) => c.strike).filter((k) => (chain.puts || []).some((p) => p.strike === k));
  if (!strikes.length) return null;
  const k = strikes.reduce((a, b) => (Math.abs(b - price) < Math.abs(a - price) ? b : a));
  const c = mid(chain.calls.find((o) => o.strike === k));
  const p = mid(chain.puts.find((o) => o.strike === k));
  if (c === null || p === null) return null;
  // Strike too far from the price (thin chain): not a straddle worth showing.
  if (Math.abs(k - price) / price > 0.05) return null;
  return { pct: ((c + p) / price) * 100, expiry: chain.expirationDate * 1000, report: report ? `${report.date} ${report.amc ? "after close" : "before open"}` : null, strike: k };
}

// First expiry that includes the next earnings report (expiries are midnight UTC of the
// expiration day; options stop trading at 4pm ET, so an after-close report needs a later day).
// `report` ({ date: "YYYY-MM-DD", amc: true|false }, from the brief's week table) wins over
// Yahoo's earnings timestamp, which is sometimes a day off.
impliedMove.pickExpiry = (quote, expirations, nowMs = Date.now(), report) => {
  let e, afterClose;
  if (report && /^\d{4}-\d{2}-\d{2}$/.test(report.date)) {
    const eMs = Date.parse(`${report.date}T${report.amc ? "21:00" : "12:00"}:00Z`);
    if (eMs < nowMs - 12 * 3600e3 || eMs - nowMs > 14 * 864e5) return null;
    e = { date: report.date };
    afterClose = !!report.amc;
  } else {
    const et = quote && (quote.earningsTimestamp || quote.earningsTimestampStart);
    if (!et) return null;
    const eMs = et * 1000;
    if (eMs < nowMs - 6 * 3600e3 || eMs - nowMs > 14 * 864e5) return null;
    e = etParts(eMs);
    afterClose = e.hour >= 12;
  }
  for (const x of [...expirations].sort((a, b) => a - b)) {
    const d = new Date(x * 1000).toISOString().slice(0, 10);
    if (afterClose ? d > e.date : d >= e.date) return x;
  }
  return null;
};
