import brief from "../content/brief.json";
import { renderPage } from "./render.js";
import { summarize } from "./quotes.js";
import { INSTRUMENTS } from "./instruments.js";


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

// ---- Single-ticker quotes (hover cards) and Google Finance links ----

const TICKER_RE = /^[A-Z0-9][A-Z0-9.\-]{0,9}$/;

// Yahoo exchange codes -> Google Finance exchange names.
const GOOGLE_EXCHANGE = {
  NMS: "NASDAQ", NGM: "NASDAQ", NCM: "NASDAQ", NAS: "NASDAQ",
  NYQ: "NYSE", NYS: "NYSE",
  ASE: "NYSEAMERICAN", AMEX: "NYSEAMERICAN",
  PCX: "NYSEARCA",
  BTS: "BATS",
};

const yahooSymbol = (t) => t.replace(/\./g, "-"); // MOG.A -> MOG-A

function googleUrl(ticker, exchange) {
  const ex = GOOGLE_EXCHANGE[exchange];
  return ex
    ? `https://www.google.com/finance/quote/${encodeURIComponent(ticker)}:${ex}`
    : `https://www.google.com/finance?q=${encodeURIComponent(ticker)}`;
}

async function tickerQuote(ticker, ctx) {
  const cache = caches.default;
  const key = new Request(`https://quote.cache/${ticker}`);
  const hit = await cache.match(key);
  if (hit) return hit.json();
  const res = await yahoo(yahooSymbol(ticker));
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
    google: googleUrl(ticker, m.exchangeName),
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
    return json({ ticker: t, error: String(e?.message || e), google: googleUrl(t) }, 502, 10);
  }
}

async function goHandler(url, ctx) {
  const t = decodeURIComponent(url.pathname.slice(4)).toUpperCase();
  if (!TICKER_RE.test(t)) return new Response("Bad ticker", { status: 400 });
  let dest = googleUrl(t);
  try {
    dest = (await tickerQuote(t, ctx)).google;
  } catch {}
  return Response.redirect(dest, 302);
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
  const entries = await Promise.all(
    INSTRUMENTS.map(async ({ key, sym, unit, em }) => {
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
  return { generated: Date.now(), quotes: Object.fromEntries(entries), fearGreed: fg };
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
    if (url.pathname === "/api/quote") return quoteHandler(url, ctx);
    if (url.pathname === "/api/odds") return oddsHandler(request, ctx);
    if (url.pathname.startsWith("/go/")) return goHandler(url, ctx);
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
