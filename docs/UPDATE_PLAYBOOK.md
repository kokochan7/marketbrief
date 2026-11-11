# Updating the brief

This is the checklist for refreshing `content/brief.json`, by hand or by a scheduled
Claude session. Accuracy comes first: if a number can't be confirmed, leave it out or
label it clearly rather than guess.

## Daily (weekdays, after the 4pm ET close)

1. For today's entry in `days`, add a `result` line: S&P 500, Nasdaq and Russell 2000 %
   change, plus actual vs expected for any high/medium macro release. Fix any earnings
   names that moved or didn't report.
2. Update `mood` (Fear & Greed snapshot and its `asOf`, VIX close, regime, breadth,
   safe havens). Prices themselves come from the live strip, so there is no price table to edit.
3. Refresh `stories` so they reflect what's still ahead, and update `mainEvent` once its
   event has passed.
4. Set `edition.updated` (UTC ISO time) and `edition.dataAsOf` (e.g. "Thu 11/12 close").

## Weekly (Saturday or Sunday)

Start a new edition for the coming Monday to Friday: new `edition` range, five `days`
with macro events (ET times, consensus where available) and notable before-open /
after-close earnings, a fresh `mainEvent`, six `stories`, and last week's closing
`mood`.

## Prediction-market meters

A story can carry an `odds` array of Kalshi / Polymarket meters. Only add one when a
market matches the story directly. Each entry needs `source` (`kalshi` or
`polymarket`), a short `label`, a snapshot `prob` (0-100), a `url` to the market page,
and the identifier the Worker uses for live updates: Kalshi market `ticker` (e.g.
`KXFEDDECISION-26DEC-H25`, from `api.elections.kalshi.com/trade-api/v2/events/<event>?with_nested_markets=true`)
or Polymarket market `slug` (from `gamma-api.polymarket.com/public-search?q=...`).
Drop meters whose market has resolved or no longer fits the story.

## Earnings prediction markets

`earningsOdds` maps an earnings ticker (exactly as it appears in `days[].bmo` / `amc`)
to a list of Kalshi / Polymarket markets on that report. Search for every ticker in
the week, e.g. `gamma-api.polymarket.com/public-search?q=<Company> quarterly earnings`
(Polymarket "beat" slugs look like `amat-quarterly-earnings-nongaap-eps-11-12-2026-4pt13`)
and Kalshi earnings or earnings-call mention series. Only add markets for this
week's report (check the date in the slug / close time). Each entry has `source`,
`kind`, `label`, `prob`, `url` and the `slug` or `ticker`, as in the meters above.

- `kind: "beat"` (beats EPS estimate) shows as a small "beat 89%" chip beside the
  ticker; label it with the basis and estimate, e.g. "Beats non-GAAP EPS est. $4.13".
  After the market settles the chip shows "Beat" or "Missed" by itself.
- `kind: "mention"` (earnings-call word markets) only shows in the ticker's hover card.
  Pick at most three, favouring the highest-volume ones.
- Tickers with no market get no entry. Rebuild `earningsOdds` for each new week, and
  refresh it daily (new markets get listed during the week).

## Sourcing rules

- Prefer primary sources: BLS, BEA, Federal Reserve, US Treasury, company releases,
  exchange data. Use at least two sources for market closes.
- Every figure needs an as-of label; every source used goes in `sources`.
- Dates are Month/Day everywhere (e.g. "Thu 11/12", "Dec 9", "November 16 – 20, 2026"). Times are ET.
- `**bold**` is the only markup. Validate the JSON (`node -e "JSON.parse(require('fs').readFileSync('content/brief.json'))"`)
  and run `npm test` before pushing to `main`.
