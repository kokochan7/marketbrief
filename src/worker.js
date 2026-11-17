import brief from "../content/brief.json";
import { renderPage } from "./render.js";
import { summarize, extendedFrom, mondayOf } from "./quotes.js";
import { INSTRUMENTS, SECTORS, yahooQuoteUrl } from "./instruments.js";


const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const LIVE_TTL = 60; // seconds

async function yahoo(sym, qs = "range=1mo&interval=1d") {
  const path = `/v8/finance/chart/${encodeURIComponent(sym)}?${qs}&includePrePost=false`;
  let lastErr;
  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    try {
      const r = await fetch(`https://${host}${path}`, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        cf: { cacheTtl: 30 },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const res = j?.chart?.result?.[0];
      if (!res?.meta) throw new Error("no result");
      return res;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

// ---- Extended-hours prices (pre-market, after hours, overnight) ----
// Yahoo's v7 quote API carries these; it needs a session cookie and "crumb".
let yAuth = null; // { cookie, crumb, at }

async function yahooAuth(force) {
  if (!force && yAuth && Date.now() - yAuth.at < 6 * 3600e3) return yAuth;
  const r1 = await fetch("https://fc.yahoo.com/", { headers: { "User-Agent": UA }, redirect: "manual" });
  const sc = r1.headers.get("set-cookie") || "";
  const cookie = sc
    .split(/,(?=\s*[\w-]+=)/)
    .map((c) => c.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
  if (!cookie) throw new Error("no cookie");
  const r2 = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", { headers: { "User-Agent": UA, Cookie: cookie } });
  const crumb = (await r2.text()).trim();
  if (!r2.ok || !crumb || crumb.length > 40 || /[<{\s]/.test(crumb)) throw new Error("no crumb");
  yAuth = { cookie, crumb, at: Date.now() };
  return yAuth;
}

// symbols -> { SYM: ext | null }. Never throws; extended-hours data is optional.
async function yahooExtended(symbols) {
  const list = await yahooQuoteList(symbols);
  return Object.fromEntries(list.map((q) => [q.symbol, extendedFrom(q)]));
}

// Yahoo v7 quote for many symbols in one request (cookie + crumb). Returns [] on failure.
async function yahooQuoteList(symbols) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { cookie, crumb } = await yahooAuth(attempt > 0);
      const r = await fetch(
        `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${symbols.map(encodeURIComponent).join(",")}&overnightPrice=true&crumb=${encodeURIComponent(crumb)}`,
        { headers: { "User-Agent": UA, Cookie: cookie, Accept: "application/json" } }
      );
      if (r.status === 401 || r.status === 403) continue;
      if (!r.ok) return [];
      return (await r.json())?.quoteResponse?.result || [];
    } catch (e) {
      if (attempt > 0) return [];
    }
  }
  return [];
}

// ---- Single-ticker quotes (hover cards) and Yahoo Finance links ----

const TICKER_RE = /^[A-Z0-9][A-Z0-9.\-]{0,9}$/;

const yahooSymbol = (t) => t.replace(/\./g, "-"); // MOG.A -> MOG-A

async function tickerQuote(ticker, ctx) {
  const cache = caches.default;
  const key = new Request(`https://quote.cache/${ticker}`);
  const hit = await cache.match(key);
  if (hit) return hit.json();
  const ysym = yahooSymbol(ticker);
  const [res, ext] = await Promise.all([yahoo(ysym), yahooExtended([ysym])]);
  const q = summarize(res);
  const m = res.meta;
  const data = {
    ticker,
    name: m.longName || m.shortName || null,
    currency: m.currency || "USD",
    exchange: m.exchangeName || null,
    price: q.price,
    prevClose: q.prevClose,
    chgPct: q.chgPct,
    time: q.time,
    ext: ext[ysym] || null,
    url: yahooQuoteUrl(ysym),
    src: "Yahoo Finance",
  };
  ctx.waitUntil(
    cache.put(key, new Response(JSON.stringify(data), { headers: { "Cache-Control": `public, max-age=${LIVE_TTL}` } }))
  );
  return data;
}

async function quoteHandler(url, ctx) {
  const t = (url.searchParams.get("s") || "").toUpperCase();
  if (!TICKER_RE.test(t)) return json({ error: "bad ticker" }, 400);
  try {
    return json(await tickerQuote(t, ctx), 200, LIVE_TTL);
  } catch (e) {
    return json({ ticker: t, error: String(e?.message || e), url: yahooQuoteUrl(yahooSymbol(t)) }, 502, 10);
  }
}

// /go/<TICKER>: the ticker's Yahoo Finance page.
async function goHandler(url) {
  const t = decodeURIComponent(url.pathname.slice(4)).toUpperCase();
  if (!TICKER_RE.test(t)) return new Response("Bad ticker", { status: 400 });
  return Response.redirect(yahooQuoteUrl(yahooSymbol(t)), 302);
}

function json(data, status = 200, maxAge = 60) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${maxAge}` },
  });
}

// ---- Prediction-market odds for stories (Kalshi + Polymarket) ----

const ODDS_TTL = 120;

const num = (v) => {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return typeof n === "number" && isFinite(n) ? n : null;
};

// Probability (0-100) the way Polymarket displays it: bid/ask midpoint when the
// spread is tight, otherwise the last trade.
function displayProb(bid, ask, last) {
  if (bid !== null && ask !== null && ask >= bid && ask - bid <= 0.1 && ask > 0) return ((bid + ask) / 2) * 100;
  if (last !== null) return last * 100;
  return null;
}

async function kalshiProb(ticker) {
  const r = await fetch(`https://api.elections.kalshi.com/trade-api/v2/markets/${encodeURIComponent(ticker)}`, {
    headers: { Accept: "application/json", "User-Agent": UA },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const m = (await r.json()).market;
  if (!m) throw new Error("no market");
  const cents = (v) => (num(v) === null ? null : num(v) / 100);
  const bid = num(m.yes_bid_dollars) ?? cents(m.yes_bid);
  const ask = num(m.yes_ask_dollars) ?? cents(m.yes_ask);
  const last = num(m.last_price_dollars) ?? cents(m.last_price);
  const closed = ["closed", "settled", "finalized", "determined"].includes(m.status);
  if (closed && (m.result === "yes" || m.result === "no")) return { prob: m.result === "yes" ? 100 : 0, closed };
  // Kalshi shows the last traded price as the "chance"; fall back to the midpoint.
  if (last !== null && last > 0) return { prob: last * 100, closed };
  return { prob: displayProb(bid, ask, null), closed };
}

async function polymarketProb(slug) {
  const r = await fetch(`https://gamma-api.polymarket.com/markets?slug=${encodeURIComponent(slug)}`, {
    headers: { Accept: "application/json", "User-Agent": UA },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const arr = await r.json();
  const m = Array.isArray(arr) ? arr[0] : null;
  if (!m) throw new Error("no market");
  let yes = null;
  try {
    const outcomes = JSON.parse(m.outcomes || "[]");
    const prices = JSON.parse(m.outcomePrices || "[]");
    const i = Math.max(0, outcomes.indexOf("Yes"));
    yes = num(prices[i]);
  } catch {}
  // Once a market has closed, its final outcome price is the result.
  if (m.closed && yes !== null) return { prob: yes * 100, closed: true };
  return { prob: displayProb(num(m.bestBid), num(m.bestAsk), num(m.lastTradePrice) ?? yes), closed: false };
}

async function oddsHandler(request, ctx) {
  const cache = caches.default;
  const key = new Request(new URL("/api/odds", request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;
  const jobs = [];
  const add = (id, o) => {
    const p =
      o.source === "kalshi" && o.ticker
        ? kalshiProb(o.ticker)
        : o.source === "polymarket" && o.slug
        ? polymarketProb(o.slug)
        : Promise.reject(new Error("unknown source"));
    jobs.push(
      p.then(
        (r) => [id, r.prob === null || r.prob === undefined ? { error: "no price" } : { prob: r.prob, closed: r.closed }],
        (e) => [id, { error: String(e?.message || e) }]
      )
    );
  };
  (brief.stories || []).forEach((s, i) => (s.odds || []).forEach((o, j) => add(`${i}-${j}`, o)));
  // Earnings-ticker markets: ids "e-<TICKER>-<n>".
  for (const [sym, list] of Object.entries(brief.earningsOdds || {})) (list || []).forEach((o, j) => add(`e-${sym}-${j}`, o));
  const data = { generated: Date.now(), odds: Object.fromEntries(await Promise.all(jobs)) };
  const ok = Object.values(data.odds).some((o) => !o.error);
  const resp = json(data, 200, ok ? ODDS_TTL : 10);
  ctx.waitUntil(cache.put(key, resp.clone()));
  return resp;
}

async function coingeckoBtc() {
  const r = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true",
    { headers: { Accept: "application/json", "User-Agent": UA } }
  );
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  const b = j.bitcoin;
  if (typeof b?.usd !== "number") throw new Error("no btc");
  return {
    price: b.usd,
    chgPct: b.usd_24h_change ?? null,
    chgLabel: "24h",
    wkPct: null,
    time: (b.last_updated_at || Date.now() / 1000) * 1000,
    unit: "usd",
    src: "CoinGecko",
  };
}

async function fearGreed() {
  const r = await fetch("https://production.dataviz.cnn.io/index/fearandgreed/graphdata", {
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
      Referer: "https://www.cnn.com/",
      Origin: "https://www.cnn.com",
    },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  const f = j.fear_and_greed;
  if (typeof f?.score !== "number") throw new Error("no score");
  return {
    score: f.score,
    rating: f.rating,
    time: f.timestamp,
    weekAgo: f.previous_1_week,
    monthAgo: f.previous_1_month,
    yearAgo: f.previous_1_year,
    src: "CNN",
  };
}

// Daily closes from Eastmoney (secid like "1.000300" = CSI 300 on Shanghai).
async function eastmoneyDaily(secid) {
  const r = await fetch(
    `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${encodeURIComponent(secid)}&fields1=f1,f2,f3&fields2=f51,f53&klt=101&fqt=0&end=20500101&lmt=15`,
    { headers: { "User-Agent": UA, Referer: "https://quote.eastmoney.com/" }, cf: { cacheTtl: 300 } }
  );
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  return (j?.data?.klines || [])
    .map((k) => {
      const [date, close] = String(k).split(",");
      return { date, close: Number(close) };
    })
    .filter((b) => /^\d{4}-\d{2}-\d{2}$/.test(b.date) && isFinite(b.close));
}

async function buildLive() {
  const yahooItems = INSTRUMENTS;
  const extP = yahooExtended(yahooItems.filter((i) => !i.hidden).map((i) => i.sym));
  const entries = await Promise.all(
    yahooItems.map(async ({ key, sym, unit, em }) => {
      try {
        const res = await yahoo(sym);
        // Yahoo serves only today's bar for some China indices; take daily history from Eastmoney.
        let extra = [];
        if (em && (res.timestamp || []).length < 5) {
          try {
            extra = await eastmoneyDaily(em);
          } catch {}
        }
        return [key, summarize(res, unit, extra)];
      } catch (e) {
        if (key === "btc") {
          try {
            return [key, await coingeckoBtc()];
          } catch {}
        }
        return [key, { error: String(e?.message || e) }];
      }
    })
  );
  let fg = null;
  try {
    fg = await fearGreed();
  } catch (e) {
    fg = { error: String(e?.message || e) };
  }
  // Pre-market / after-hours / overnight price for stocks and ETFs (SPY, QQQ).
  const ext = await extP;
  for (const [key, q] of entries) {
    const it = INSTRUMENTS.find((i) => i.key === key);
    if (q && !q.error && ext[it.sym]) q.ext = ext[it.sym];
  }
  return { generated: Date.now(), quotes: Object.fromEntries(entries), fearGreed: fg };
}

// ---- 2s10s curve for Market Mood: CNBC US2Y and US10Y (Yahoo has no 2-year yield index) ----
const pnum = (v) => {
  const n = parseFloat(String(v ?? "").replace(/[%,+]/g, ""));
  return isFinite(n) ? n : null;
};

async function cnbcYields(symbols) {
  const r = await fetch(
    `https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=${symbols.join("%7C")}&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json`,
    { headers: { "User-Agent": UA, Accept: "application/json" } }
  );
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const list = (await r.json())?.FormattedQuoteResult?.FormattedQuote || [];
  const out = {};
  for (const q of list) {
    const price = pnum(q.last);
    if (price === null) continue;
    const prev = pnum(q.previous_day_closing);
    const chg = pnum(q.change);
    const t = Date.parse(q.last_time || q.last_timedate || "");
    out[q.symbol] = { price, prev: prev ?? (chg !== null ? price - chg : null), time: isNaN(t) ? Date.now() : t };
  }
  return out;
}

// Daily closes from CNBC for the week change: [{ date, close }]. Optional; [] if unavailable.
async function cnbcDaily(symbol) {
  try {
    const now = new Date();
    const from = new Date(now.getTime() - 21 * 864e5);
    const f = (d) => d.toISOString().slice(0, 10).replace(/-/g, "") + "000000";
    const r = await fetch(`https://ts-api.cnbc.com/harmony/app/bars/${symbol}/1D/${f(from)}/${f(now)}/adjusted/EST5EDT.json`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      cf: { cacheTtl: 600 },
    });
    if (!r.ok) return [];
    const bars = (await r.json())?.barData?.priceBars || [];
    return bars
      .map((b) => ({ date: String(b.tradeTime || "").replace(/^(\d{4})(\d{2})(\d{2}).*/, "$1-$2-$3"), close: pnum(b.close) }))
      .filter((b) => /^\d{4}-\d{2}-\d{2}$/.test(b.date) && b.close !== null);
  } catch {
    return [];
  }
}

// Close of the last trading day before this week's Monday (US Eastern date of `time`).
function weekRef(bars, time) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(time));
  const monday = mondayOf(today);
  const before = bars.filter((b) => b.date < monday);
  return before.length ? before[before.length - 1] : null;
}

// 10Y minus 2Y in basis points, with day and week changes, live from CNBC.
async function cnbcCurve() {
  const [q, d2, d10] = await Promise.all([cnbcYields(["US2Y", "US10Y"]), cnbcDaily("US2Y"), cnbcDaily("US10Y")]);
  const y2 = q.US2Y;
  const y10 = q.US10Y;
  if (!y2 || !y10) throw new Error("no CNBC yields");
  const spread = (y10.price - y2.price) * 100;
  const prev = y2.prev !== null && y10.prev !== null ? (y10.prev - y2.prev) * 100 : null;
  const w2 = weekRef(d2, y2.time);
  const w10 = weekRef(d10, y10.time);
  const wk = w2 && w10 && w2.date === w10.date ? (w10.close - w2.close) * 100 : null;
  return {
    bp: spread,
    chgBp: prev !== null ? spread - prev : null,
    wkBp: wk !== null ? spread - wk : null,
    wkRefDate: wk !== null ? w2.date : null,
    y2: y2.price,
    y10: y10.price,
    time: Math.max(y2.time, y10.time),
    src: "CNBC",
  };
}

// Backup: the Treasury's daily par yield curve (end of day), newest row first.
async function treasuryCurve() {
  const year = new Date().getUTCFullYear();
  const r = await fetch(
    `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${year}&page&_format=csv`,
    { headers: { "User-Agent": UA, Accept: "text/csv" }, cf: { cacheTtl: 1800 } }
  );
  if (!r.ok) throw new Error(`Treasury HTTP ${r.status}`);
  const lines = (await r.text()).trim().split(/\r?\n/);
  const head = lines.shift().split(",").map((h) => h.replace(/"/g, "").trim());
  const i2 = head.indexOf("2 Yr");
  const i10 = head.indexOf("10 Yr");
  if (i2 < 0 || i10 < 0) throw new Error("Treasury columns missing");
  const rows = lines
    .map((l) => {
      const c = l.split(",");
      const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(c[0] || "");
      return m ? { date: `${m[3]}-${m[1]}-${m[2]}`, y2: pnum(c[i2]), y10: pnum(c[i10]) } : null;
    })
    .filter((x) => x && x.y2 !== null && x.y10 !== null)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  if (!rows.length) throw new Error("Treasury no rows");
  const [last, prev] = rows;
  const bp = (x) => (x.y10 - x.y2) * 100;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  const monday = mondayOf(today);
  const ref = last.date >= monday ? rows.find((x) => x.date < monday) : null;
  return {
    bp: bp(last),
    chgBp: prev ? bp(last) - bp(prev) : null,
    wkBp: ref ? bp(last) - bp(ref) : null,
    wkRefDate: ref ? ref.date : null,
    y2: last.y2,
    y10: last.y10,
    date: last.date,
    daily: true,
    src: "US Treasury",
  };
}

// CNBC first, then the Treasury's daily file, then the last good reading (kept two days).
const CURVE_LAST = "https://curve.cache/last";
async function buildCurve() {
  const cache = caches.default;
  let curve = null;
  for (const get of [cnbcCurve, treasuryCurve]) {
    try {
      curve = await get();
      break;
    } catch {}
  }
  if (curve) {
    await cache.put(CURVE_LAST, new Response(JSON.stringify(curve), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=172800" } }));
    return curve;
  }
  const hit = await cache.match(CURVE_LAST);
  if (hit) return { ...(await hit.json()), stale: true };
  throw new Error("no yields from CNBC or Treasury");
}

// ---- Market Mood extras (/api/mood): sector heatmap, Fed odds and the 2s10s curve ----

async function buildSectors() {
  const rows = await Promise.all(
    SECTORS.map(async (s) => {
      try {
        const q = summarize(await yahoo(s.sym));
        return [s.sym, { price: q.price, dayPct: q.chgPct, wkPct: q.wkPct, wkRefDate: q.wkRefDate, time: q.time }];
      } catch (e) {
        return [s.sym, { error: String(e?.message || e) }];
      }
    })
  );
  return Object.fromEntries(rows);
}

// Next FOMC meeting on Kalshi: the open KXFEDDECISION event that settles first.
async function kalshiFed() {
  const r = await fetch("https://api.elections.kalshi.com/trade-api/v2/events?series_ticker=KXFEDDECISION&status=open&with_nested_markets=true&limit=20", {
    headers: { Accept: "application/json", "User-Agent": UA },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const events = (await r.json()).events || [];
  const firstClose = (e) => Math.min(...(e.markets || []).map((m) => Date.parse(m.close_time) || Infinity));
  const ev = events.filter((e) => (e.markets || []).length).sort((a, b) => firstClose(a) - firstClose(b))[0];
  if (!ev) throw new Error("no open event");
  const cents = (v) => (num(v) === null ? null : num(v) / 100);
  const markets = ev.markets
    .map((m) => {
      const last = num(m.last_price_dollars) ?? cents(m.last_price);
      const bid = num(m.yes_bid_dollars) ?? cents(m.yes_bid);
      const ask = num(m.yes_ask_dollars) ?? cents(m.yes_ask);
      const p = last !== null && last > 0 ? last * 100 : displayProb(bid, ask, null);
      return { label: m.yes_sub_title || m.subtitle || m.ticker, prob: p, ticker: m.ticker };
    })
    .filter((m) => typeof m.prob === "number")
    .sort((a, b) => b.prob - a.prob);
  return {
    event: ev.event_ticker,
    title: ev.title || "",
    meeting: ev.sub_title || "",
    closes: firstClose(ev),
    markets,
    url: `https://kalshi.com/markets/kxfeddecision`,
    src: "Kalshi",
  };
}

const settle = (p) => p.then((v) => v, (e) => ({ error: String(e?.message || e) }));

async function moodHandler(request, ctx) {
  const cache = caches.default;
  const key = new Request(new URL("/api/mood", request.url).toString(), { method: "GET" });
  const hit = await cache.match(key);
  if (hit) return hit;
  const [sectors, fed, curve] = await Promise.all([settle(buildSectors()), settle(kalshiFed()), settle(buildCurve())]);
  const data = { generated: Date.now(), sectors, fed, curve };
  const ok = !sectors.error || !fed.error || !curve.error;
  // A missing piece is retried after 30 seconds instead of being cached for 5 minutes.
  const resp = json(data, 200, !ok ? 15 : sectors.error || fed.error || curve.error ? 30 : 300);
  ctx.waitUntil(cache.put(key, resp.clone()));
  return resp;
}

// Latest day move of every earnings ticker in this week's table, for the green/red colouring.
// One Yahoo v7 request for all of them; the symbol list comes from brief.json, not the query.
async function movesHandler(request, ctx) {
  const cache = caches.default;
  const key = new Request(new URL("/api/moves", request.url).toString(), { method: "GET" });
  const hit = await cache.match(key);
  if (hit) return hit;
  const tickers = [...new Set((brief.days || []).flatMap((d) => [...(d.bmo || []), ...(d.amc || [])]))].filter((t) => TICKER_RE.test(t));
  const bySym = Object.fromEntries(tickers.map((t) => [yahooSymbol(t), t]));
  const list = tickers.length ? await yahooQuoteList(Object.keys(bySym)) : [];
  const moves = {};
  for (const q of list) {
    const t = bySym[q.symbol];
    const p = num(q.regularMarketChangePercent);
    if (t && p !== null) moves[t] = { chgPct: p, price: num(q.regularMarketPrice), time: (num(q.regularMarketTime) || 0) * 1000 };
  }
  const ok = Object.keys(moves).length > 0;
  const resp = json({ generated: Date.now(), moves, ...(ok ? {} : { error: "no quotes" }) }, 200, ok ? 60 : 15);
  ctx.waitUntil(cache.put(key, resp.clone()));
  return resp;
}

async function liveHandler(request, ctx) {
  const cache = caches.default;
  const key = new Request(new URL("/api/live", request.url).toString(), { method: "GET" });
  const hit = await cache.match(key);
  if (hit) return hit;
  const data = await buildLive();
  const okCount = Object.values(data.quotes).filter((q) => !q.error).length;
  const resp = new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // Cache only good responses for the full TTL; retry failures sooner.
      "Cache-Control": `public, max-age=${okCount > 0 ? LIVE_TTL : 10}`,
      "Access-Control-Allow-Origin": "*",
    },
  });
  ctx.waitUntil(cache.put(key, resp.clone()));
  return resp;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/live") return liveHandler(request, ctx);
    if (url.pathname === "/api/mood") return moodHandler(request, ctx);
    if (url.pathname === "/api/moves") return movesHandler(request, ctx);
    if (url.pathname === "/api/quote") return quoteHandler(url, ctx);
    if (url.pathname === "/api/odds") return oddsHandler(request, ctx);
    if (url.pathname.startsWith("/go/")) return goHandler(url);
    if (url.pathname === "/api/brief") {
      return new Response(JSON.stringify(brief), {
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=60" },
      });
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(renderPage(brief), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=60",
        },
      });
    }
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404 });
  },
};
