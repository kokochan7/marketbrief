# Updating the brief

This is the checklist for refreshing `content/brief.json`, by hand or by a scheduled
Claude session. Accuracy comes first: if a number can't be confirmed, leave it out or
label it clearly rather than guess.

## Daily (weekdays, after the 4pm ET close)

1. For today's entry in `days`, add a `result` line: S&P 500, Nasdaq and Russell 2000 %
   change, plus actual vs expected for any high/medium macro release. Fix any earnings
   names that moved or didn't report.
2. Update `mood` (Fear & Greed snapshot and its `asOf`, VIX close, regime, breadth,
   safe havens) and `marketData` (closes and week-to-date change vs last Friday's close).
3. Refresh `stories` so they reflect what's still ahead, and update `mainEvent` once its
   event has passed.
4. Set `edition.updated` (UTC ISO time) and `edition.dataAsOf` (e.g. "Wed 11/11 close").

## Weekly (Saturday or Sunday)

Start a new edition for the coming Monday to Friday: new `edition` range, five `days`
with macro events (ET times, consensus where available) and notable before-open /
after-close earnings, a fresh `mainEvent`, six `stories`, and last week's closing
`mood` and `marketData`. Keep `levels` exactly as Kenny last set them unless he says
otherwise.

## Prediction-market meters

A story can carry an `odds` array of Kalshi / Polymarket meters. Only add one when a
market matches the story directly. Each entry needs `source` (`kalshi` or
`polymarket`), a short `label`, a snapshot `prob` (0-100), a `url` to the market page,
and the identifier the Worker uses for live updates: Kalshi market `ticker` (e.g.
`KXFEDDECISION-26DEC-H25`, from `api.elections.kalshi.com/trade-api/v2/events/<event>?with_nested_markets=true`)
or Polymarket market `slug` (from `gamma-api.polymarket.com/public-search?q=...`).
Drop meters whose market has resolved or no longer fits the story.

## Sourcing rules

- Prefer primary sources: BLS, BEA, Federal Reserve, US Treasury, company releases,
  exchange data. Use at least two sources for market closes.
- Every figure needs an as-of label; every source used goes in `sources`.
- Dates in labels are DD/MM (e.g. "Thu 12/11"). Times are ET.
- `**bold**` is the only markup. Validate the JSON (`node -e "JSON.parse(require('fs').readFileSync('content/brief.json'))"`)
  and run `npm test` before pushing to `main`.
