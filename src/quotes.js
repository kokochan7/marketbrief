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

export function summarize(res, unit) {
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
    src: "Yahoo Finance",
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

