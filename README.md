# Market Brief

A weekly market brief website, served by the Cloudflare Worker `marketbrief`
(https://marketbrief.kennykao.workers.dev).

## How it works

- **The brief** (main event, day-by-day calendar, market mood, stories, market data,
  levels) lives in [`content/brief.json`](content/brief.json). The Worker renders the
  page from it on each request, so editing that file and pushing to `main` is all it
  takes to publish a new edition.
- **Live markets** (top strip) and the **Fear & Greed** card are fetched by the Worker at
  `/api/live` from Yahoo Finance (CoinGecko fallback for Bitcoin) and CNN, cached for 60
  seconds, and refreshed in the browser every minute. If a source is down, the tile shows
  `n/a` and the rest of the page is unaffected.
- Every figure in `brief.json` should come from a source listed in its `sources` array,
  with an as-of label (e.g. "Tue close · week to date").

## Editing `content/brief.json`

| Section | What to change |
| --- | --- |
| `edition` | Week range, `updated` timestamp (UTC ISO), `dataAsOf` label |
| `mainEvent` | Kicker, title, one-paragraph summary |
| `days` | One entry per weekday. `date` (YYYY-MM-DD) drives the Done/Today badges. `tone`: `red`, `orange`, `green`, `teal`, `grey`. Macro `level`: `high` (red dot), `medium` (orange), `low` (grey). Add `result` once the day is done. |
| `mood` | Fear & Greed snapshot (replaced live when CNN responds), risk regime, VIX, breadth, safe havens |
| `stories` | Numbered stories; `title` is bolded |
| `marketData` | Snapshot tiles plus a note that explains the basis |
| `levels` | Kenny's own levels to watch |
| `sources` | Links shown in the footer |

Text fields are escaped; `**bold**` is the only formatting supported.

## Develop and deploy

```bash
npm install
npm run dev      # local preview at http://localhost:8787
npm test         # checks the day/week change maths
npm run deploy   # manual deploy (needs Cloudflare login)
```

Deploys normally happen automatically: the `marketbrief` Worker is connected to this
repo with Cloudflare Workers Builds, so each push to `main` runs `npx wrangler deploy`.
