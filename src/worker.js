import brief from "../content/brief.json";
import { renderPage } from "./render.js";
import { summarize } from "./quotes.js";

// Live quote symbols (Yahoo Finance chart API).
const SYMBOLS = {
  spx: { sym: "^GSPC" },
  ndx: { sym: "^IXIC" },
  dji: { sym: "^DJI" },
  rut: { sym: "^RUT" },
  vix: { sym: "^VIX" },
  tnx: { sym: "^TNX", unit: "yield" },
  brent: { sym: "BZ=F", unit: "usd" },
  wti: { sym: "CL=F", unit: "usd" },
  gold: { sym: "GC=F", unit: "usd" },
  silver: { sym: "SI=F", unit: "usd" },
  btc: { sym: "BTC-USD", unit: "usd" },
  dxy: { sym: "DX-Y.NYB" },
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const LIVE_TTL = 60; // seconds

async function yahoo(sym) {
  const path = `/v8/finance/chart/${encodeURIComponent(sym)}?range=1mo&interval=1d&includePrePost=false`;
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

async function buildLive() {
  const entries = await Promise.all(
    Object.entries(SYMBOLS).map(async ([key, { sym, unit }]) => {
      try {
        return [key, summarize(await yahoo(sym), unit)];
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
