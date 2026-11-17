# Kenny's Market Brief

A weekly market brief website, served by the Cloudflare Worker `marketbrief`
(https://marketbrief.kennykao.workers.dev).

## How it works

- **The brief** (main event, day-by-day calendar, market mood and stories) lives in [`content/brief.json`](content/brief.json). The Worker renders the
  page from it on each request, so editing that file and pushing to `main` is all it
  takes to publish a new edition.
- **Live markets** (top strip, defined in `src/instruments.js`: SPY, QQQ, US 10Y, WTI, gold,
  bitcoin, DXY, KOSPI, CSI 300; each tile opens Yahoo Finance, and SPY/QQQ show their
  pre-market, after-hours or overnight price) and the **Fear & Greed** card come from the
  Worker at `/api/live` (Yahoo Finance, CoinGecko fallback for bitcoin, CNN), cached for 60
  seconds. `/api/live` also carries S&P / Nasdaq / Dow futures (`es`, `nq`, `ym`) for the
  Sunday edition's futures read; they aren't shown on the page.
- **Market Mood extras** come from `/api/mood` (cached 5 minutes): the sector heatmap (S&P 500 benchmark plus 11
  sector SPDR ETFs, Yahoo), Kalshi odds for the next Fed meeting and the 2s10s curve (CNBC
  US10Y minus US2Y, with day and week change).
- **Earnings ticker colours** come from `/api/moves` (cached 1 minute): one Yahoo quote request
  for every ticker in `days`, coloured green / red by the latest day move.
  The high-yield spread, % of S&P 500 stocks above their 200-day average and the CME FedWatch
  line are filled into `brief.json` by the evening update (their sources block automated
  fetches from the Worker).
- **Ticker hover cards** come from `/api/quote`: price and the latest extended-hours trade.
- If a source is down, its tile shows `n/a` or a dash and the rest of the page is unaffected.
- Every figure in `brief.json` should come from a source listed in its `sources` array,
  with an as-of label (e.g. "Tue close · week to date").

## Editing `content/brief.json`

| Section | What to change |
| --- | --- |
| `edition` | Week range, `updated` timestamp (UTC ISO), `dataAsOf` label |
| `mainEvent` | Kicker, title, one-paragraph summary |
| `days` | One entry per weekday. `date` (YYYY-MM-DD) drives the Done/Today badges. Optional `premarket` line shows until `result` is added. `tone`: `red`, `orange`, `green`, `teal`, `grey`. Macro `level`: `high` (red dot), `medium` (orange), `low` (grey). Add `result` once the day is done. |
| `mood` | Fear & Greed snapshot (replaced live when CNN responds), risk regime, VIX, safe havens, and the evening-filled `fedwatch` (see docs/UPDATE_PLAYBOOK.md). Any tile can take an optional `url` (https) to link it or override the default |
| `stories` | Numbered stories; `title` is bolded. Optional `odds` adds Kalshi/Polymarket meters (see docs/UPDATE_PLAYBOOK.md) |
| `earningsOdds` | Optional Kalshi/Polymarket earnings markets by ticker: "beat" chips in the week table, all markets in hover cards (see docs/UPDATE_PLAYBOOK.md) |
| `sources` | Where each figure came from (kept in the file for checking; not shown on the page) |

Text fields are escaped; `**bold**` is the only formatting supported. Times are written in
US Eastern time as `8:30a` / `4:20p` and shown in each viewer's own time zone
(`public/localtime.js`); see "Times" in docs/UPDATE_PLAYBOOK.md.

## Develop and deploy

```bash
npm install
npm run dev      # local preview at http://localhost:8787
npm test         # checks the day/week change maths, time conversion and page render
npm run deploy   # manual deploy (needs Cloudflare login)
```

Deploys normally happen automatically: the `marketbrief` Worker is connected to this
repo with Cloudflare Workers Builds, so each push to `main` runs `npx wrangler deploy`.
