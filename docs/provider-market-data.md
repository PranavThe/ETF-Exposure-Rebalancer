# Provider holdings and prices

This is an additive ingest path for TickerInside holdings and Alpaca IEX daily bars. It does not
replace or overwrite the direct SEC N-PORT snapshots used by the existing decomposition pipeline.

## Run a refresh

Set `DATABASE_URL` to the intended database and provide Alpaca credentials only in the backend
environment:

```bash
export ALPACA_API_KEY_ID='...'
export ALPACA_API_SECRET_KEY='...'
python scripts/sync_market_data.py --funds VOO,QQQ,VTI
```

Before the first database write, `python scripts/sync_market_data.py --funds VOO,QQQ,VTI
--plan-only` fetches TickerInside coverage and reports the unique price-symbol count and date
window. It reads existing holdings for context, but does not create tables, save data, or call
Alpaca; Alpaca credentials are not needed for this preflight.

For saved portfolios, use `python scripts/sync_market_data.py --portfolio-funds`; it refreshes
the distinct funds currently selected in the database and prices their latest TickerInside and SEC
holdings universes. The GitHub Actions workflow in `.github/workflows/sync-market-data.yml` runs
this on weekdays after market close and can also be started manually. Before enabling it on the
default branch, add `DATABASE_URL`, `ALPACA_API_KEY_ID`, and `ALPACA_API_SECRET_KEY` as GitHub
Actions secrets. The sync writes only provider holdings and price tables, not SEC snapshots.

Optional price-bar dates are `--start YYYY-MM-DD` (inclusive, defaults to 14 calendar days before
today) and `--end YYYY-MM-DD` (inclusive, defaults to today). Run after the regular market close
to avoid storing a partial current-day bar. The lookback captures the most recent trading day when
a run occurs on weekends or holidays. The app makes a bounded TickerInside request when a newly
added fund has no TickerInside snapshot in the database. It does not fetch price bars during user
requests; Alpaca prices continue to come from the scheduled or manually started sync.

The command fetches the selected funds' current TickerInside files, stores each distinct source
snapshot in `provider_holdings_snapshots` and its ticker/weight rows in `provider_holdings`, then
fetches daily bars for those funds plus their unique U.S. stock holding symbols in batches of up to 100 using
Alpaca's `feed=iex` with `adjustment=all`. Prices are stored by symbol, date, provider, feed, and
adjustment in `security_prices`.
Repeated identical holdings snapshots are no-ops; a corrected file for the same source date is
retained as a separately hashed snapshot. Daily price bars are updated in place if fetched again.
TickerInside identifiers are stored in a text column because some funds report bonds and other
non-equity assets by description rather than by stock ticker. The sync skips those descriptions
when building the Alpaca stock-price request. On existing PostgreSQL databases, the sync widens
the legacy `provider_holdings.ticker` column from `VARCHAR(32)` to `TEXT` before saving holdings.

## Read endpoints

- `POST /provider-data/funds/{ticker}/sync` checks Neon first and fetches the TickerInside file
  only when the fund has no saved TickerInside snapshot. A provider miss or temporary error is
  returned as a status so the app can keep using any SEC or issuer snapshot. The planner calls this
  for newly added funds and recalculates after the request completes.
- `GET /provider-data/funds/{ticker}/holdings` returns the latest stored TickerInside weights,
  its source/as-of metadata and attribution line, plus entries, exits, and changed weights relative
  to the previous source date. An exit means the ticker is no longer reported, not proof of a sale.
- `GET /provider-data/prices?symbols=AAPL,MSFT&as_of=YYYY-MM-DD` returns stored Alpaca IEX bars
  for one date. Omit `as_of`, `start`, and `end` for the latest stored bar per requested symbol;
  use `start` and/or `end` for a date range (both bounds inclusive).

## Data limits and source separation

TickerInside holdings are weights, not shares or market values. They are stored separately from
`snapshots` and `holdings`; never populate missing share counts or market values with fabricated
zeros. Existing share-count based price/activity decomposition continues to use source files that
provide those fields, including direct SEC N-PORT imports. The API exposes TickerInside's source
layer and holdings date so the app can distinguish issuer-file data from SEC-derived data and show
its age.

Alpaca API credentials must remain server-side. The saved feed is explicitly `iex`; it represents
IEX prints, not the consolidated U.S. market tape. For production or bulk reuse, review provider
and underlying issuer data terms and include required attribution before enabling an automatic
scheduled refresh.
