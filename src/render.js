// Renders the Market Brief page from content/brief.json.
// Everything from the content file is HTML-escaped; **bold** is the only markup allowed.

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

const tickers = (list) =>
  list && list.length ? esc(list.join(", ")) : '<span class="muted">—</span>';

function etDateKey(d = new Date()) {
  // YYYY-MM-DD in US Eastern time
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function formatUpdated(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const s = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/New_York",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
  return `${s} ET`;
}

function fgColorPos(score) {
  const v = Math.max(0, Math.min(100, Number(score) || 0));
  return v.toFixed(1);
}

function renderDays(days, today) {
  return days
    .map((d) => {
      const status = d.date < today ? "done" : d.date === today ? "today" : "upcoming";
      const macro = (d.macro || [])
        .map(
          (m) => `
          <li class="macro-item">
            <span class="dot dot-${esc(m.level || "low")}" aria-hidden="true"></span>
            <span class="macro-time">${esc(m.time)}</span>
            <span class="macro-text">${md(m.text)}</span>
          </li>`
        )
        .join("");
      const result = d.result
        ? `<p class="day-result"><span class="result-label">Result</span> ${md(d.result)}</p>`
        : "";
      const note = d.note ? `<p class="day-note">${md(d.note)}</p>` : "";
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
          ${result}
        </div>
        <div class="cell cell-bmo" role="cell">
          <span class="cell-head-mobile">Before the open</span>
          ${tickers(d.bmo)}
        </div>
        <div class="cell cell-amc" role="cell">
          <span class="cell-head-mobile">After the close</span>
          ${tickers(d.amc)}
          ${note}
        </div>
      </div>`;
    })
    .join("");
}

function renderMood(m) {
  const fg = m.fearGreed;
  return `
  <div class="mood-grid">
    <div class="mood-card" id="fg-card">
      <div class="card-kicker">CNN Fear &amp; Greed Index</div>
      <div class="fg-row">
        <span class="fg-score" id="fg-score">${esc(Math.round(fg.score))}</span>
        <span class="fg-label" id="fg-label">${esc(fg.label)}</span>
      </div>
      <div class="fg-bar" aria-hidden="true"><span class="fg-marker" id="fg-marker" style="left:${fgColorPos(fg.score)}%"></span></div>
      <div class="card-sub" id="fg-sub">Week ago ${esc(Math.round(fg.weekAgo))}, month ${esc(Math.round(fg.monthAgo))}, year ${esc(Math.round(fg.yearAgo))}</div>
      <div class="card-asof" id="fg-asof">As of ${esc(fg.asOf)}</div>
    </div>
    <div class="mood-card">
      <div class="card-kicker">Risk regime</div>
      <span class="pill pill-${esc(m.regime.tone)}">${esc(m.regime.label)}</span>
      <div class="card-sub">${md(m.regime.text)}</div>
    </div>
    <div class="mood-card">
      <div class="card-kicker">VIX</div>
      <div class="big">${esc(m.vix.value)}</div>
      <div class="card-flag tone-text-${esc(m.vix.tone)}">${esc(m.vix.label)}</div>
      <div class="card-sub">${md(m.vix.text)}</div>
    </div>
    <div class="mood-card">
      <div class="card-kicker">Breadth</div>
      <div class="big">${esc(m.breadth.value)}</div>
      <div class="card-sub">${md(m.breadth.text)}</div>
    </div>
    <div class="mood-card">
      <div class="card-kicker">Safe havens</div>
      <div class="big">${esc(m.havens.value)}</div>
      <div class="card-sub">${md(m.havens.text)}</div>
    </div>
  </div>`;
}

const LIVE_SLOTS = [
  ["spx", "S&P 500"],
  ["ndx", "Nasdaq"],
  ["dji", "Dow"],
  ["rut", "Russell 2K"],
  ["vix", "VIX"],
  ["tnx", "US 10Y"],
  ["brent", "Brent"],
  ["wti", "WTI"],
  ["gold", "Gold"],
  ["silver", "Silver"],
  ["btc", "Bitcoin"],
  ["dxy", "Dollar (DXY)"],
];

function renderLive() {
  const cells = LIVE_SLOTS.map(
    ([k, label]) => `
      <div class="tick" data-key="${k}">
        <div class="tick-label">${label}</div>
        <div class="tick-value">—</div>
        <div class="tick-chg"><span class="d">&nbsp;</span><span class="w"></span></div>
      </div>`
  ).join("");
  return `
  <section class="live" id="live" aria-labelledby="live-h">
    <div class="section-head">
      <h2 id="live-h" class="section-title"><span class="live-dot" aria-hidden="true"></span>Live markets</h2>
      <span class="section-meta" id="live-meta">Loading…</span>
    </div>
    <div class="tape">${cells}</div>
    <p class="fineprint" id="live-note">Day change vs prior close · week change vs last Friday's close. Quotes may be delayed. Source: Yahoo Finance (CoinGecko fallback for Bitcoin).</p>
  </section>`;
}

export function renderPage(brief, { now = new Date() } = {}) {
  const e = brief.edition;
  const today = etDateKey(now);
  const inWeek = today >= e.weekStart && today <= e.weekEnd;
  const kicker = inWeek ? "This week" : today < e.weekStart ? "The week ahead" : e.kicker || "Last week";

  const stories = brief.stories
    .map(
      (s, i) => `
      <li class="story">
        <span class="story-num">${i + 1}</span>
        <p><strong>${esc(s.title)}</strong> ${md(s.body)}</p>
      </li>`
    )
    .join("");

  const md_ = brief.marketData;
  const dataCells = md_.items
    .map(
      (it) => `
      <div class="data-cell">
        <div class="card-kicker">${esc(it.label)}</div>
        <div class="data-value">${esc(it.value)}</div>
        <div class="data-chg chg-${esc(it.dir || "flat")}">${esc(it.change)}</div>
      </div>`
    )
    .join("");

  const levels = brief.levels.items
    .map(
      (l) => `
      <div class="level">
        <div class="level-top"><span class="level-sym">${esc(l.symbol)}</span><span class="level-val">${esc(l.level)}</span></div>
        <p>${md(l.text)}</p>
      </div>`
    )
    .join("");

  const sources = brief.sources
    .map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a></li>`)
    .join("");

  const title = `Market Brief · ${e.range}`;
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
    <h1>Market Brief</h1>
    <div class="masthead-right">
      <div class="range">${esc(e.range)}</div>
      <div class="kicker">${esc(kicker)}</div>
    </div>
  </header>
  <p class="updated">Brief updated ${esc(formatUpdated(e.updated))} · data as of ${esc(e.dataAsOf)}</p>

  ${renderLive()}

  <section class="main-event">
    <div class="eyebrow">${esc(brief.mainEvent.kicker)}</div>
    <h2>${esc(brief.mainEvent.title)}</h2>
    <p>${md(brief.mainEvent.body)}</p>
  </section>

  <section aria-labelledby="week-h">
    <div class="section-head">
      <h2 id="week-h" class="section-title">The week, day by day</h2>
      <span class="section-meta">Times ET</span>
    </div>
    <div class="week" role="table">
      <div class="week-head" role="row">
        <div role="columnheader">Day</div>
        <div role="columnheader">Macro</div>
        <div role="columnheader">Before the open</div>
        <div role="columnheader">After the close</div>
      </div>
      ${renderDays(brief.days, today)}
    </div>
  </section>

  <section aria-labelledby="mood-h">
    <div class="section-head">
      <h2 id="mood-h" class="section-title">Market mood</h2>
      <span class="section-meta">${esc(brief.mood.asOf)}</span>
    </div>
    ${renderMood(brief.mood)}
  </section>

  <div class="split">
    <section aria-labelledby="stories-h">
      <div class="section-head">
        <h2 id="stories-h" class="section-title">Stories to watch</h2>
      </div>
      <ol class="stories">${stories}</ol>
    </section>

    <aside class="side">
      <section aria-labelledby="data-h">
        <div class="section-head">
          <h2 id="data-h" class="section-title">${esc(md_.title)}</h2>
          <span class="section-meta">${esc(md_.asOf)}</span>
        </div>
        <div class="data-grid">${dataCells}</div>
        <p class="fineprint">${md(md_.note)}</p>
      </section>

      <section aria-labelledby="levels-h">
        <div class="section-head">
          <h2 id="levels-h" class="section-title">Levels to watch</h2>
          <span class="section-meta">${esc(brief.levels.note)}</span>
        </div>
        <div class="levels">${levels}</div>
      </section>
    </aside>
  </div>

  <footer class="footer">
    <details>
      <summary>Sources</summary>
      <ul class="sources">${sources}</ul>
    </details>
    <p class="fineprint">For information only, not investment advice. Figures are checked against the sources listed; live quotes can be delayed and may differ from official closes.</p>
  </footer>
</main>
<script src="/live.js?v=${esc(e.updated)}" defer></script>
</body>
</html>`;
}
