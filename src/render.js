import { INSTRUMENTS, SECTORS, instrumentUrl, yahooQuoteUrl } from "./instruments.js";
// Renders the Market Brief page from content/brief.json.
// Everything from the content file is HTML-escaped; **bold** is the only markup allowed.

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Times in the brief are US Eastern wall-clock times written like "8:30a", "12:00p" or
// "Sun 6:30p" (also accepted: "4:20 pm", "4pm", "noon", with or without a trailing ET/EST/EDT).
// Each one is wrapped in <time class="lt" data-et="YYYY-MM-DDTHH:MM">, shown in Eastern time
// here, and converted to the viewer's own time zone by public/localtime.js.
const TIME_RE =
  /(?:\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+)?(?:\b(1[0-2]|0?[1-9]):([0-5]\d)(?:([ap])(?:\.?m\.?)?(?![A-Za-z])|\s?([AaPp])\.?[Mm]\b\.?)|\b(1[0-2]|0?[1-9])\s?([AaPp])\.?[Mm]\b\.?|\b([Nn]oon)\b)(?:\s?(?:ET|EST|EDT)\b)?/g;

function etAbbr(dateKey) {
  // EST or EDT for that date (noon Eastern, well clear of the 2am switch).
  try {
    const d = new Date(`${dateKey}T17:00:00Z`);
    const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "short" }).formatToParts(d);
    const n = p.find((x) => x.type === "timeZoneName")?.value;
    if (n) return n;
  } catch (e) {}
  return "ET";
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// The date within three days of dateKey that falls on weekday wd ("Sun 6:30p" on Monday's row is the day before).
// With week=true, dateKey is the edition's Monday: Mon-Fri are that week, Sat/Sun the weekend before it.
function nearestWeekday(dateKey, wd, week) {
  const base = new Date(`${dateKey}T12:00:00Z`);
  let diff = WEEKDAYS.indexOf(wd) - base.getUTCDay();
  if (week) diff = wd === "Sat" ? -2 : wd === "Sun" ? -1 : diff;
  else if (diff > 3) diff -= 7;
  else if (diff < -3) diff += 7;
  return new Date(base.getTime() + diff * 864e5).toISOString().slice(0, 10);
}

// ctx: { date: "YYYY-MM-DD" (the day the time belongs to; the edition's Monday for free text, with week: true),
//        zone: true to print the zone after each time }
export function timeify(html, ctx) {
  if (!ctx || !ctx.date) return html;
  return html.replace(TIME_RE, (all, wd, h1, m1, apA, apB, h2, apC, noon) => {
    let h, mi, ap;
    if (noon) [h, mi, ap] = [12, 0, "p"];
    else if (h1) [h, mi, ap] = [+h1, +m1, (apA || apB).toLowerCase()];
    else [h, mi, ap] = [+h2, 0, apC.toLowerCase()];
    const h24 = (h % 12) + (ap === "p" ? 12 : 0);
    const date = wd ? nearestWeekday(ctx.date, wd, ctx.week) : ctx.date;
    const et = `${date}T${String(h24).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
    const shown = `${wd ? wd + " " : ""}${h}:${String(mi).padStart(2, "0")}${ap}${ctx.zone ? " " + etAbbr(date) : ""}`;
    return `<time class="lt" data-et="${et}"${wd ? ' data-wd="1"' : ""}${ctx.zone ? ' data-z="1"' : ""}>${shown}</time>`;
  });
}

const md = (s, ctx) => timeify(esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>"), ctx);

const ODDS_NAMES = { kalshi: "Kalshi", polymarket: "Polymarket" };

// Earnings tickers. A ticker with a Kalshi/Polymarket "beat" market gets a small
// odds chip next to it; every market for the ticker also shows in its hover card.
function tickers(list, eodds = {}) {
  if (!list || !list.length) return '<span class="muted">—</span>';
  return list
    .map((t, i) => {
      const sep = i < list.length - 1 ? "," : "";
      const markets = eodds[t] || [];
      // moves.js colours the ticker green / red by its latest day move.
      const link = `<a class="tkr" href="/go/${encodeURIComponent(t)}" target="_blank" rel="noopener" data-sym="${esc(t)}"${markets.length ? " data-eodds" : ""}>${esc(t)}</a>`;
      const j = markets.findIndex((o) => o.kind === "beat");
      if (j < 0) return `<span class="tkr-e">${link}${sep}</span>`;
      const o = markets[j];
      const p = Number(o.prob);
      const chip = `<a class="eodds${p < 50 ? " is-low" : ""}" href="${esc(o.url)}" target="_blank" rel="noopener" data-odds="e-${esc(t)}-${j}" title="${esc(ODDS_NAMES[o.source] || o.source)}: ${esc(t)} ${esc(o.label)}"><span class="eodds-k">beat</span><span class="eodds-n">${fmtProb(o.prob)}</span></a>`;
      // Keep ticker, chip and comma together so a line never starts with the comma.
      return `<span class="tkr-e">${link}${chip}${sep}</span>`;
    })
    .join(" ");
}

const RING_R = 15;
const RING_C = 2 * Math.PI * RING_R;

function ring(prob) {
  const p = Math.max(0, Math.min(100, Number(prob) || 0));
  const off = RING_C * (1 - p / 100);
  return `<svg class="ring" viewBox="0 0 40 40" aria-hidden="true">
      <circle class="ring-track" cx="20" cy="20" r="${RING_R}"></circle>
      <circle class="ring-fill" cx="20" cy="20" r="${RING_R}" stroke-dasharray="${RING_C.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}" transform="rotate(-90 20 20)"></circle>
    </svg>`;
}

function fmtProb(p) {
  const v = Number(p);
  if (!isFinite(v)) return "—";
  return v < 1 && v > 0 ? "<1%" : `${Math.round(v)}%`;
}

function renderOdds(odds, storyIdx) {
  if (!odds || !odds.length) return "";
  const items = odds
    .map(
      (o, j) => `
      <a class="odds odds-${esc(o.source)}" href="${esc(o.url)}" target="_blank" rel="noopener" data-odds="${storyIdx}-${j}" title="${esc(ODDS_NAMES[o.source] || o.source)}: ${esc(o.label)}">
        <span class="ring-wrap">${ring(o.prob)}<span class="ring-num">${fmtProb(o.prob)}</span></span>
        <span class="odds-text"><span class="odds-src">${esc(ODDS_NAMES[o.source] || o.source)}</span><span class="odds-label">${esc(o.label)}</span></span>
      </a>`
    )
    .join("");
  return `<div class="odds-row">${items}</div>`;
}

function etDateKey(d = new Date()) {
  // YYYY-MM-DD in US Eastern time
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function fgColorPos(score) {
  const v = Math.max(0, Math.min(100, Number(score) || 0));
  return v.toFixed(1);
}

function renderDays(days, today, eodds) {
  return days
    .map((d) => {
      const dctx = { date: d.date };
      const status = d.date < today ? "done" : d.date === today ? "today" : "upcoming";
      const macro = (d.macro || [])
        .map(
          (m) => `
          <li class="macro-item">
            <span class="dot dot-${esc(m.level || "low")}" aria-hidden="true"></span>
            <span class="macro-time">${timeify(esc(m.time), dctx)}</span>
            <span class="macro-text">${md(m.text, dctx)}</span>
          </li>`
        )
        .join("");
      const result = d.result
        ? `<p class="day-result"><span class="result-label">Result</span> ${md(d.result, dctx)}</p>`
        : "";
      // Pre-market line (overnight news, futures, 8:30 data); dropped once the day's result is in.
      const pre =
        d.premarket && !d.result
          ? `<p class="day-result day-pre"><span class="result-label">Pre-market</span> ${md(d.premarket, dctx)}</p>`
          : "";
      const note = d.note ? `<p class="day-note">${md(d.note, dctx)}</p>` : "";
      const statusBadge =
        status === "today"
          ? '<span class="status status-today">Today</span>'
          : status === "done"
          ? '<span class="status status-done">Done</span>'
          : "";
      return `
      <div class="day-row tone-${esc(d.tone || "grey")} is-${status}" role="row">
        <div class="cell cell-day" role="cell">
          <div class="day-label">${esc(d.label)} ${statusBadge}</div>
          ${d.tag ? `<span class="day-tag">${esc(d.tag)}</span>` : ""}
        </div>
        <div class="cell cell-macro" role="cell">
          <span class="cell-head-mobile">Macro</span>
          <ul class="macro-list">${macro}</ul>
          ${pre}${result}
        </div>
        <div class="cell cell-bmo" role="cell">
          <span class="cell-head-mobile">Earnings before the open</span>
          ${tickers(d.bmo, eodds)}
        </div>
        <div class="cell cell-amc" role="cell">
          <span class="cell-head-mobile">Earnings after the close</span>
          ${tickers(d.amc, eodds)}
          ${note}
        </div>
      </div>`;
    })
    .join("");
}

// Fear & Greed and VIX are plain tiles (not links, Kenny 11/16). Regime and safe havens link
// only when brief.json gives them an https `url` (e.g. mood.regime.url).
const MOOD_LINKS = {};
const FEDWATCH_URL = "https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html";

function moodCard(url, inner, { id, title, cls } = {}) {
  const ok = /^https:\/\//.test(url || "");
  const attrs = `${id ? ` id="${id}"` : ""}${title && ok ? ` title="${esc(title)}"` : ""}`;
  const c = `mood-card${cls ? " " + cls : ""}`;
  return ok
    ? `<a class="${c} is-link" href="${esc(url)}" target="_blank" rel="noopener"${attrs}>${inner}</a>`
    : `<div class="${c}"${attrs}>${inner}</div>`;
}

function renderMood(m, wctx) {
  const fg = m.fearGreed;
  const link = (k) => (m[k] && m[k].url) || MOOD_LINKS[k];
  const host = (u) => {
    try {
      return new URL(u).hostname.replace(/^www\./, "");
    } catch (e) {
      return "";
    }
  };
  const t = (k) => (link(k) ? `Open ${host(link(k))} ↗` : "");
  const fw = m.fedwatch;
  const fedwatch = fw && fw.text
    ? `<div class="fed-fw"><a href="${FEDWATCH_URL}" target="_blank" rel="noopener">CME FedWatch</a> ${md(fw.text, wctx)}${fw.asOf ? ` <span class="muted">· ${timeify(esc(fw.asOf), wctx)}</span>` : ""}</div>`
    : `<div class="fed-fw"><a href="${FEDWATCH_URL}" target="_blank" rel="noopener">CME FedWatch ↗</a></div>`;

  const sectors = SECTORS.map(
    (x) => `<a class="sec${x.bench ? " is-bench" : ""}" href="${esc(yahooQuoteUrl(x.sym))}" target="_blank" rel="noopener" data-sec="${esc(x.sym)}" title="${esc(x.name)} (${esc(x.sym)})"><span class="sec-l">${esc(x.label)}</span><span class="sec-v">—</span></a>`
  ).join("");

  return `
  <div class="mood-grid">
    ${moodCard(null, `
      <div class="card-kicker">CNN Fear &amp; Greed Index</div>
      <div class="fg-row">
        <span class="fg-score" id="fg-score">${esc(Math.round(fg.score))}</span>
        <span class="fg-label" id="fg-label">${esc(fg.label)}</span>
      </div>
      <div class="fg-bar" aria-hidden="true"><span class="fg-marker" id="fg-marker" style="left:${fgColorPos(fg.score)}%"></span></div>
      <div class="card-sub" id="fg-sub">Week ago ${esc(Math.round(fg.weekAgo))}, month ${esc(Math.round(fg.monthAgo))}, year ${esc(Math.round(fg.yearAgo))}</div>
      <div class="card-asof" id="fg-asof">As of ${timeify(esc(fg.asOf), wctx)}</div>`, { id: "fg-card", cls: "wide" })}
    ${moodCard(link("regime"), `
      <div class="card-kicker">Risk regime</div>
      <span class="pill pill-${esc(m.regime.tone)}">${esc(m.regime.label)}</span>
      <div class="card-sub">${md(m.regime.text, wctx)}</div>`, { title: t("regime"), cls: "wide" })}
    ${moodCard(null, `
      <div class="card-kicker">VIX</div>
      <div class="big">${esc(m.vix.value)}</div>
      <div class="card-flag tone-text-${esc(m.vix.tone)}">${esc(m.vix.label)}</div>
      <div class="card-sub">${md(m.vix.text, wctx)}</div>`)}
    <div class="mood-card" id="curve-card">
      <div class="card-kicker">2s10s curve</div>
      <div class="big" id="curve-v">—</div>
      <div class="card-flag" id="curve-flag"></div>
      <div class="card-sub" id="curve-sub">10Y minus 2Y Treasury yield</div>
      <div class="card-asof" id="curve-asof"></div>
    </div>
    ${moodCard(link("havens"), `
      <div class="card-kicker">Safe havens</div>
      <div class="big">${esc(m.havens.value)}</div>
      <div class="card-sub">${md(m.havens.text, wctx)}</div>`, { title: t("havens"), cls: "wide" })}
    <div class="mood-card wide" id="fed-card">
      <div class="card-kicker">Fed odds <span class="fed-meet" id="fed-meet"></span></div>
      <div class="fed-rows" id="fed-rows"><div class="card-sub">Loading Kalshi odds…</div></div>
      <div class="card-sub fed-links"><a href="https://kalshi.com/markets/kxfeddecision" target="_blank" rel="noopener" id="fed-kalshi">Kalshi ↗</a></div>
      ${fedwatch}
    </div>
    <div class="mood-card wide" id="sec-card">
      <div class="card-kicker">Sectors <span class="muted" id="sec-basis">this week</span></div>
      <div class="sec-grid">${sectors}</div>
    </div>
  </div>`;
}


function renderLive() {
  const cells = INSTRUMENTS.filter((it) => !it.hidden).map(
    (it) => `
      <a class="tick" data-key="${it.key}" data-name="${esc(it.name)}" href="${esc(instrumentUrl(it))}" target="_blank" rel="noopener">
        <div class="tick-label">${esc(it.label)}</div>
        <div class="tick-value">—</div>
        <div class="tick-ext" hidden></div>
        <div class="tick-chg"><span class="d">&nbsp;</span><span class="w"></span></div>
      </a>`
  ).join("");
  return `
  <section class="live is-manual" id="live" aria-labelledby="live-h">
    <div class="section-head">
      <h2 id="live-h" class="section-title"><span class="live-dot" aria-hidden="true"></span>Live markets</h2>
      <div class="live-ctrl">
        <span class="section-meta" id="live-meta">Loading…</span>
        <div class="seg" role="radiogroup" aria-label="Refresh mode">
          <button type="button" class="seg-btn" role="radio" data-mode="manual" aria-checked="true">Manual</button>
          <button type="button" class="seg-btn" role="radio" data-mode="live" aria-checked="false">Live</button>
        </div>
        <button type="button" class="refresh-btn" id="refresh-btn" title="Refresh now" aria-label="Refresh now"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 8a5.5 5.5 0 1 1-1.61-3.89M13.5 2.5v3h-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div>
    </div>
    <div class="tape">${cells}</div>
  </section>`;
}

export function renderPage(brief, { now = new Date() } = {}) {
  const e = brief.edition;
  const today = etDateKey(now);
  // Free text outside the week table: times carry their zone ("4:20p EST").
  const wctx = { date: e.weekStart, zone: true, week: true };

  const stories = brief.stories
    .map(
      (s, i) => `
      <li class="story">
        <span class="story-num">${i + 1}</span>
        <div class="story-body">
          <p><strong>${timeify(esc(s.title), wctx)}</strong> ${md(s.body, wctx)}</p>
          ${renderOdds(s.odds, i)}
        </div>
      </li>`
    )
    .join("");




  const title = `Kenny’s Market Brief · ${e.range}`;
  const desc = `${brief.mainEvent.title}. ${brief.mainEvent.body}`.slice(0, 280);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta name="theme-color" content="#0a1520">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css?v=${esc(e.updated)}">
</head>
<body>
<main class="wrap">
  <header class="masthead">
    <h1>Kenny&rsquo;s Market Brief</h1>
    <div class="masthead-right">
      <div class="range">${esc(e.range)}</div>
    </div>
  </header>

  ${renderLive()}

  <section class="main-event sec-event">
    <div class="eyebrow">${esc(brief.mainEvent.kicker)}</div>
    <h2>${timeify(esc(brief.mainEvent.title), wctx)}</h2>
    <p>${md(brief.mainEvent.body, wctx)}</p>
  </section>

  <div class="layout">
    <div class="col-main">
      <section class="sec-week" aria-labelledby="week-h">
        <div class="section-head">
          <h2 id="week-h" class="section-title">The Week</h2>
          <span class="section-meta" data-tz-label="${esc(e.weekStart)}T17:00:00Z" data-tz-prefix="Times ">Times ${esc(etAbbr(e.weekStart))}</span>
        </div>
        <div class="week" role="table">
          <div class="week-head" role="row">
            <div role="columnheader">Day</div>
            <div role="columnheader">Macro</div>
            <div role="columnheader">Earnings before the open</div>
            <div role="columnheader">Earnings after the close</div>
          </div>
          ${renderDays(brief.days, today, brief.earningsOdds || {})}
        </div>
      </section>

    </div>

    <aside class="col-side">
      <section class="sec-mood" aria-labelledby="mood-h">
        <div class="section-head">
          <h2 id="mood-h" class="section-title">Market mood</h2>
          <span class="section-meta">${esc(brief.mood.asOf)}</span>
        </div>
        ${renderMood(brief.mood, wctx)}
      </section>

    </aside>
  </div>

  <section class="sec-stories" aria-labelledby="stories-h">
    <div class="section-head">
      <h2 id="stories-h" class="section-title">Stories to watch</h2>
    </div>
    <ol class="stories">${stories}</ol>
  </section>
</main>
<script type="application/json" id="eodds-data">${JSON.stringify(brief.earningsOdds || {}).replace(/</g, "\\u003c")}</script>
<script src="/localtime.js?v=${esc(e.updated)}"></script>
<script src="/live.js?v=${esc(e.updated)}" defer></script>
<script src="/tickers.js?v=${esc(e.updated)}" defer></script>
<script src="/mood.js?v=${esc(e.updated)}" defer></script>
<script src="/moves.js?v=${esc(e.updated)}" defer></script>
<script src="/odds.js?v=${esc(e.updated)}" defer></script>
</body>
</html>`;
}
