# Portfolio API contract

The API stores anonymous portfolios in the same `DATABASE_URL` used for holdings. Vercel's Neon
connection works without another service or dependency. The app creates the two new tables on
startup with SQLAlchemy `metadata.create_all`. No existing table is changed.

## Save and update

`POST /portfolios` accepts a name and an optional list of allocated funds:

```json
{
  "name": "My portfolio",
  "funds": [
    {"ticker": "DEMO", "weight": 0.6},
    {"ticker": "FLOWTEST", "weight": 0.4}
  ]
}
```

All weights are fractions. A nonempty list must sum to 1 within `1e-9`; each weight must be
positive, finite, and at most 1. Fund tickers are matched case insensitively against registered
funds. Duplicate or unknown tickers return 422. A portfolio may start with an empty fund list.
The API accepts at most 50 funds and a 100-character name.

The 201 response contains `id`, `name`, `funds` (each with ticker, name, issuer, weight),
`created_at`, `updated_at`, and `edit_key`. The edit key is returned only at creation. The frontend
should store each portfolio's ID and edit key in browser local storage. There is no global list
endpoint or sign-in. `GET /portfolios/{id}` is readable by anyone with its unguessable ID, making
an ID usable as a share link. Reading does not return the edit key.

`PUT /portfolios/{id}` replaces the name and entire allocation list. `DELETE /portfolios/{id}`
removes the portfolio. Both require the `X-Portfolio-Edit-Key` header. A missing or invalid key
returns 403. Store the edit key carefully: someone who has it can edit or delete the portfolio.
The database stores only its SHA-256 hash. Losing the key means the portfolio remains readable
but cannot be edited from that browser.

## Latest fund data

`GET /portfolios/{id}/latest` returns:

```json
{
  "portfolio": {"id": "...", "name": "My portfolio", "funds": [], "created_at": "...", "updated_at": "..."},
  "coverage_weight": 0.6,
  "funds": [
    {
      "ticker": "DEMO", "name": "Demo Active Fund", "issuer": "...", "weight": 0.6,
      "status": "available", "as_of_date": "2026-10-03",
      "snapshot": {"as_of_date": "2026-10-03", "source_url": "...", "source_file": "...", "content_hash": "...", "row_count": 4, "ingested_at": "..."},
      "holdings": [{"security_id": "AAA", "ticker": "AAA", "name": "...", "asset_class": "equity", "source_sector": null, "sector": "...", "shares": 100, "price": 10, "market_value": 1000, "reported_weight": null}]
    },
    {
      "ticker": "ARKK", "name": "ARK Innovation ETF", "issuer": "...", "weight": 0.4,
      "status": "missing", "as_of_date": null, "snapshot": null, "holdings": []
    }
  ]
}
```

The sample is illustrative; names, holdings, and dates depend on ingested data. For each fund,
the endpoint selects the latest issuer/SEC snapshot unless a TickerInside snapshot is strictly
newer or is the only source. On equal dates, it uses issuer/SEC data. `coverage_weight` is the sum of
allocated weights for funds that have selected holdings. Missing funds remain in the response and are
never silently redistributed. The frontend should display each fund's date and an incomplete
coverage warning when `coverage_weight < 1`. Different dates can appear in one portfolio.
Issuer/SEC rows use the same reference and issuer-label mapping as the fund holdings endpoint;
provider rows use ticker-sector references. The planner may classify additional issuer/SEC rows
using its company-name and matching-security fallbacks.

## Portfolio analysis

`GET /portfolios/{id}/analysis` aggregates the selected rows. For issuer/SEC holdings, it computes
a holding's within-fund weight as `market_value / sum(positive market_value for all holdings in that
fund)` (including cash and other asset classes). For a selected TickerInside snapshot, it uses the
provider's reported weights; those rows have no shares or market values. Its portfolio exposure
is `fund allocation weight * within-fund weight`. Group holdings by `security_id` for combined
exposure and overlap, and by resolved `sector` for sector exposure. Keep cash and other asset
classes visible. Report both
`coverage_weight` and the per-fund `as_of_date` with every aggregate; do not renormalize the
available funds to 100% when data is missing. Portfolio history and time comparisons need a
separate allocation history design and are outside this initial contract.
