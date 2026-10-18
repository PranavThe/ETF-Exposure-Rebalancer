# Glean — current product specification

Glean is a sector-exposure planner with a marketing page at `/`, a methodology page at
`/methodology`, and a single planning workspace at `/app`. This specification describes the
maintained product, including its original holdings-comparison API. It is not a scaffold or a
milestone plan for an empty repository.

## 0. Working contract

- Keep the website, README, API guides, and this specification consistent when behavior changes.
- **The golden values in §10 remain the source of truth for holdings-change analysis.** Never
  edit an expected value to make a test pass; show the arithmetic if a value appears wrong.
- Preserve the fractional units in §4 and decomposition formulas in §7. Ask before changing
  those contracts, adding a service, database, queue or scheduler, or adding dependencies beyond §3.
- Pure calculations live in `backend/analytics`; database and network orchestration belong in
  routes and the pipeline. Tests must not depend on live network services.
- Follow `CLAUDE.md` and `frontend/AGENTS.md`; read the installed Next.js documentation before
  changing frontend code. Run the relevant checks in §11.
- Product-facing text uses **Glean**. Frontend components read `BRAND` from `frontend/lib/brand.ts`.
  Existing `fundshift.db` filenames, deployment addresses and saved links remain compatible.

## 1. What Glean does

Users enter the dollars they hold in each ETF, inspect their combined sector mix, and choose a
target with sliders or Scythe. Glean calculates possible allocations toward that target and
shows the proposed moves and remaining distance. It never chooses a target for the user or
connects to a brokerage.

The workspace contains ETF search, holdings and source dates, current and target sector mixes,
suggested moves, and Scythe. “Use these amounts” updates the in-app portfolio. It does not place
orders. Edits save automatically; opening a shared portfolio without its edit key and changing
it creates a separate copy.

The original holdings-comparison engine remains accessible through
`/funds/{ticker}/changes`. It separates changes between stored snapshots into price movement
and portfolio activity. It is an API feature, not a date-comparison screen in the planner.

## 2. Scope and non-goals

Supported product features include anonymous saved portfolios, ETF search, sector targets,
constrained allocation plans, optional Gemini support with a rule-based fallback, multiple
issuer/SEC import paths, and the existing two-project Vercel deployment.

Non-goals are accounts and payments, brokerage execution, personalized investment advice,
market predictions, real-time market prices, tax optimization, transaction-cost modeling, and
whole-share order sizing. Adding new infrastructure requires the working-contract review above.

## 3. Stack and commands

- **Backend:** Python 3.11+, FastAPI, Uvicorn, SQLAlchemy 2.x, psycopg 3, and the Google Gen AI SDK
  (`google-genai`) for Gemini.
  Exact dependency constraints are in `requirements.txt`; pytest and httpx are development
  dependencies in `requirements-dev.txt`.
- **Database:** SQLite by default (`sqlite:///./fundshift.db`), or Postgres through `DATABASE_URL`.
  Tables are created with SQLAlchemy `metadata.create_all`; there is no Alembic dependency.
- **Frontend:** Next.js App Router, React, TypeScript, Tailwind CSS and Recharts. Versions are
  declared in `frontend/package.json` and locked in its lockfile. Node.js must meet Next.js's minimum
  (20.9+) locally. The frontend reads `NEXT_PUBLIC_API_URL`, defaulting to `http://localhost:8000`.
- **Development commands:** `make setup`, `make api`, `make web`, `make test`, and
  `make ingest-raw`. The product itself is available at the hosted URL in the README.
- **Deployment:** one Vercel project serves FastAPI from the repository root through `index.py`;
  another builds `frontend/`. The API build seeds a persistent database. Configure allowed
  frontend origins and the frontend's API URL as described in the README.

## 4. Data, units and source selection

**Units.** Every weight, exposure, drift and effect is a **fraction** in code, DB and API
(`0.07` = 7%). Only the frontend converts to percentages or percentage points (pp). Compute
in float64, compare tests with `math.isclose(..., abs_tol=1e-9)`, and round for display.
Dollar holdings are entered in the planner; saved allocation weights sum to 1 when nonempty.

**Catalog versus coverage.** `data/reference` contains a dated Nasdaq ETF catalog used for
search. A searchable fund may have no holdings and remains visibly marked as missing. Committed
production data includes the catalog and ARKK issuer holdings. Synthetic DEMO, SPLT and FLOWTEST
files are isolated in `backend/tests/fixtures/` for regression tests, never deployment.
iShares and SEC N-PORT snapshots can be imported separately. The app attempts a
bounded TickerInside lookup when a newly added fund lacks stored provider holdings.

**Source selection.** The planner uses each fund's latest stored issuer/SEC snapshot unless a
TickerInside snapshot is the only source, or is strictly newer and its classified share is at
least the lesser of the issuer/SEC share and 80%. The portfolio API selects the strictly newer
snapshot without that planner-specific classification gate. Equal dates keep issuer/SEC data.
Never merge rows from different sources within a selected fund snapshot. Record the selected
source and holdings date. TickerInside snapshots carry weights without shares or market values;
issuer/SEC rows use positive market values for sector-mix weights.

**Sectors.** The planner resolves issuer/SEC equity rows from `security_sectors`, then the
issuer label, then `data/reference/name_sectors.csv`, then the sector assigned to the same
security ID in an eligible ETF. Unresolved equities are `Unclassified`. Non-equity positive
value rows are `Cash & other`. For TickerInside weights, resolve the ticker from stored
issuer/SEC equity holdings and the ticker-sector reference. The latter prefers U.S. listings
over foreign local codes with the same symbol; unknown symbols are unclassified.
The original `/funds/...` holdings and change-analysis API retains its narrower
`security_sectors` → issuer label → `Unknown` classification contract.

**Prices.** Stored Alpaca IEX daily bars may be displayed beside provider holdings. They do
not supply missing holding shares or market values and do not drive the sector mix. The
configured GitHub Actions sync refreshes them once after market close on weekdays; no price
fetch occurs during a planner request. Without configured credentials, no scheduled refresh
occurs, and stored prices can be older.

## 5. Persistence and identity

The SQLite or Postgres database has these principal tables:

- `funds` and `etf_catalog`: registered funds and searchable ETF symbols.
- `snapshots` and `holdings`: dated issuer/SEC snapshots and rows, including shares and
  market values. A fund/date has one normalized snapshot.
- `provider_holdings_snapshots` and `provider_holdings`: separate weight-only provider
  snapshots; corrections on the same date may have different content hashes.
- `security_prices`: dated Alpaca IEX OHLCV bars keyed by provider, feed, adjustment, ticker
  and date.
- `security_sectors` and the `data/reference` CSVs: maintained classification data.
- `import_log`: normalized import result and provenance.
- `portfolios`, `portfolio_funds`, `portfolio_preferences`: anonymous saved allocations,
  dollar total and target mix. Portfolio IDs are readable through the API; only a hashed edit
  key is stored. The raw key is returned only when the portfolio is created.

Issuer/SEC `snapshots` are unique by fund and holdings date. Their normalized row hash makes
identical re-imports `duplicate_noop`, conflicting same-date imports `conflict_rejected`, and
explicit replacements `replaced`. Imports commit atomically. No `change_events` table exists;
comparison events are computed on demand with stable IDs.

Use issuer CUSIP or ISIN when available. Equity without an ID uses `TICKER:<ticker>` with a
validation warning; non-equity rows without an ID receive a synthetic ID. Keep ticker, source
address, as-of date, hash and import time for traceability.

## 6. Ingestion and refresh

`scripts/seed_db.py` loads the committed catalog and issuer files during API deployment.
The adapter interface in `backend/pipeline/adapters` handles ARK and iShares issuer files;
the sample adapter parses test fixtures only. Validation rejects missing required fields,
mixed holdings dates, wrong funds, negative equity shares/value, duplicate security IDs,
and reported-weight totals outside 90%–110%. It warns outside 97%–103% or when a row's
reported weight differs from its market-value weight by more than 0.1 pp. Normalize strings,
uppercase tickers, convert weight units to fractions, and hash normalized rows before storing.
`scripts/ingest_nport.py`
imports selected SEC filings and the series/class mapping; it must not infer unsupported
shares or market values. See `docs/etf-sources.md` for source-specific commands.

TickerInside holdings can be fetched on first use or refreshed with
`scripts/sync_market_data.py`. The scheduled workflow refreshes saved-portfolio funds on
weekdays when database and Alpaca secrets are present. Prices use Alpaca's IEX feed with
`adjustment=all` and are stored independently. Provider failures leave existing issuer/SEC
coverage available. See `docs/provider-market-data.md` for operational details and limits.

## 7. Analytics (the core — read carefully)

All functions live in `backend/analytics/`. They take plain Python data (lists of dicts or small dataclasses) and return plain data.

Inputs are two snapshots: A (earlier) and B (later), **equity rows only**. Cash and other rows are reported separately as `cash_weight = cash mv / total mv` and excluded from everything below.

### Three weight vectors

Each vector is normalized over its own equity total.

- `w0[i] = mv_A[i] / Σ mv_A`
- `w1[i] = mv_B[i] / Σ mv_B`
- `wcf[i]` is the **counterfactual**: hold A's share counts at B's prices.
  - In both snapshots: `mv_cf[i] = s_A[i] × p_B[i]`.
  - Only in A (removed): `p_B` is unknown, so use `p_A` and set `price_estimated = true`.
  - Only in B (added): `mv_cf[i] = 0`.
  - Suspected split (below): use `s_A[i] × r` instead of `s_A[i]`.
  - Then `wcf[i] = mv_cf[i] / Σ mv_cf`.

### Decomposition (exact, must sum)

- `price_effect[i] = wcf[i] − w0[i]`
- `activity_effect[i] = w1[i] − wcf[i]`
- `price_effect + activity_effect = w1 − w0`

### Flow factor

ETF creations and redemptions scale every position's share count together. That is not a manager decision.

- `flow_factor` = median of `s_B / s_A` over securities present in both snapshots with `s_A > 0`.
- If there are fewer than 3 such securities, use 1.0 and add a caveat.
- `adj_share_change[i] = (s_B[i] / s_A[i]) / flow_factor − 1`

### Suspected corporate actions

Let `r = (s_B / s_A) / flow_factor`. Flag a security as `SUSPECTED_CORPORATE_ACTION` when both hold:
- `r` or `1/r` is within 1% of one of {2, 3, 4, 5, 10, 20}
- `(p_B / p_A) × r` is within 10% of 1

For a flagged security:
- treat `r` as a split ratio in the counterfactual
- set `adj_share_change` to 0 and status to UNCHANGED
- never emit a position event

### Per-holding status

- `ADDED`, `REMOVED`
- `INCREASED`: `adj_share_change ≥ +position_share_threshold`
- `DECREASED`: `adj_share_change ≤ −position_share_threshold`
- `UNCHANGED` otherwise
- `traded = status ∈ {ADDED, REMOVED, INCREASED, DECREASED}`

An UNCHANGED holding can still have a nonzero `activity_effect`, because other positions changed size. That is **dilution**. Report it and label it as dilution, never as a trade.

### Sectors

For each sector (from the reference mapping), report:
- `w0`, `wcf`, `w1`
- `drift = w1 − w0`
- `price_effect`, `activity_effect`
- `activity_direct`: the sum of `activity_effect` over traded holdings
- `activity_dilution`: the sum over untraded holdings

### Concentration

- Top-N share (N from config, default 10) and `HHI = Σ w²`.
- Compute each on `w0`, `wcf` and `w1`, so concentration change also splits into price and activity parts.

### Events

Thresholds live in `backend/analytics/config.py`, which also defines a `CONFIG_VERSION` string that the API returns.

| Type | Rule (defaults) |
|---|---|
| POSITION_ADDED / POSITION_REMOVED | always |
| POSITION_INCREASED / POSITION_DECREASED | abs(adj_share_change) ≥ 5% **and** abs(activity_effect) ≥ 0.10pp |
| SECTOR_INCREASE / SECTOR_DECREASE | abs(drift) ≥ 1.0pp |
| CONCENTRATION_INCREASE / CONCENTRATION_DECREASE | abs(top-N share change) ≥ 1.0pp |
| SUSPECTED_CORPORATE_ACTION | rule above |

Each event has:
- `id`: first 16 hex characters of `sha256(fund|from|to|type|subject|CONFIG_VERSION)`
- `type`
- `subject`: a security_id, a sector name, or `"portfolio"`
- `magnitude` (a fraction):
  - position events: `activity_effect`
  - sector events: `drift`
  - concentration events: top-N share change
  - corporate action: the detected ratio `r`
- `description`, following §9
- `contributing_security_ids`:
  - position and corporate-action events: the security itself
  - sector events: holdings in that sector, sorted by abs(w1 − w0) descending
  - concentration events: the top-N holdings in `w1`

### Caveats

Return a list of caveat strings. Add one when:
- the range spans more than one stored snapshot interval: "Changes are netted across N snapshot intervals; trades that reversed within the period are invisible."
- any holding has `price_estimated`
- any suspected corporate action was flagged
- the flow factor fell back to 1.0
- any `Unknown` sector weight is greater than 0

## 8. API and planner contract

`GET /health` reports database status, fund count, issuer/SEC snapshot count, and the
optional deployed commit. Fund and catalog routes include `GET /funds`, `/funds/{ticker}`,
`/funds/{ticker}/snapshots`, `/funds/{ticker}/holdings`, `/etfs/search`, and
`/etfs/covered`, and `POST /funds/{ticker}/simulate`. A catalog search result may still have no holdings.

`POST /plan` accepts dollar-denominated `holdings`, an optional sector target (fractions),
`cash_change`, and `max_new_funds` (0–5, default 2). The browser sends `cash_change: 0`;
the API also supports contributions and withdrawals. The response includes fund coverage,
source/date, current mix, target, distance and up to two distinct plan types. Missing funds
remain visible, outside the normalized covered mix and proposed moves.

The planner's distance is `½ × Σ |current[s] − target[s]|` in fractional units. It optimizes
squared sector differences with a small preference for fewer moves, using the existing
covered dollars. A plan may rearrange held ETFs or rearrange and add allowlisted ETFs whose
mix is at least 80% classified. A held ETF outside the allowlist may be kept or reduced but
not increased; synthetic fixtures are never proposed as additions. Consider the top 12 new
candidates; add them one at a time only when each lowers distance by at least 0.5 pp. Prune
small positions below 1%, round amounts to dollars while conserving the portfolio total,
and omit unchanged, duplicate or non-improving plans. A valid rearrangement can improve by
less than 0.5 pp.

`POST /chat` translates user language into a target mix. With `GEMINI_API_KEY`, Gemini
(the models listed in `backend/app/llm.py`, tried in order) reads which sectors to set,
adjust, scale or cap; `apply_changes` in `backend/app/assistant.py` does the arithmetic, so
the model never produces the numbers. Without a key, or when every model fails, it uses the
rule-based reader. It receives the message, recent conversation, current
mix, target and portfolio total, but no ETF list supplied automatically. User messages may
include information they choose to type. Scythe changes only the target; it never
chooses one, recommends an ETF, or changes the money available to the planner. Sliders work
independently of Scythe.

`POST /portfolios` creates a saved portfolio and returns an edit key. `GET /portfolios/{id}`
reads it; `PUT` and `DELETE` require `X-Portfolio-Edit-Key`. Preferences are under
`/portfolios/{id}/preferences`. `/portfolios/{id}/latest` and `/analysis` expose selected
holdings, sources, coverage, sectors and overlap. `/portfolios/preview` and
`/portfolios/{id}/preview` calculate hypothetical analysis without saving. Anyone with the
portfolio ID can read it; a browser without the edit key saves edits as a copy.

`POST /provider-data/funds/{ticker}/sync` fetches TickerInside holdings only if no provider
snapshot is stored. `/provider-data/funds/{ticker}/holdings` returns the latest reported
weights and changes between provider dates. `/provider-data/prices` returns stored Alpaca
IEX bars. `/funds/{ticker}/changes?from=...&to=...` retains the original share-count-based
price/activity decomposition from §7, independent of provider weight-only rows.

## 9. Language rules (UI copy and event descriptions)

- Never say "bought", "sold", "trade", or anything about what the manager "believes" or "thinks".
- Say "increased position", "decreased position", "portfolio activity".
- "Increased position" always means a flow-adjusted share-count change between two snapshots.
- Weight differences are "pp" (percentage points), never "%".
- Any drift number is shown with its price/activity split next to it.
- Description template: `Health Care exposure +5.0 pp (price −2.8 pp, portfolio activity +7.8 pp)`.
- Footer on every page: "Based on dated ETF holdings. Not investment advice."

## 10. Golden fixtures and regression values

### Reference files

`backend/tests/fixtures/funds.csv` (plus ARKK in `data/reference/funds.csv`):

| ticker | name | issuer |
|---|---|---|
| DEMO | Demo Active Fund | Synthetic |
| SPLT | Split Test Fund | Synthetic |
| FLOWTEST | Flow Test Fund | Synthetic |
| ARKK | ARK Innovation ETF | ARK Invest |

`backend/tests/fixtures/sectors.csv`:

| security_id | sector |
|---|---|
| AAA, DDD | Technology |
| BBB | Health Care |
| CCC, EEE | Financials |
| FFF, GGG, HHH, JJJ, KKK, LLL | Technology |

### Test fixture file format

Test fixtures in `backend/tests/fixtures/` use columns `date,fund,security_id,ticker,name,asset_class,shares,price,market_value,weight`, with `weight` as a fraction. Use security_id as the ticker, and a name like `AAA Corp`.

### Fixture DEMO (no cash; tests set top_n = 2)

Inputs:

| security_id | 2026-10-01 | 2026-10-02 |
|---|---|---|
| AAA | 100 sh @ 10 | 100 sh @ 15 |
| BBB | 200 sh @ 5 | 300 sh @ 5 |
| CCC | 50 sh @ 20 | *(absent)* |
| DDD | 100 sh @ 10 | 100 sh @ 10 |
| EEE | *(absent)* | 50 sh @ 20 |

Also create `demo_2026-10-03.csv`: identical rows to 2026-10-02, with the date changed to 2026-10-03.

Expected results for 2026-10-01 → 2026-10-02. Exact fractions are given; compare with `abs_tol=1e-9`.

- `flow_factor = 1.0`
- holdings_from 4, holdings_to 4; added 1, removed 1, increased 1, decreased 0

Per holding:

| id | status | adj_share_change | w0 | wcf | w1 | price_effect | activity_effect |
|---|---|---|---|---|---|---|---|
| AAA | UNCHANGED | 0 | 1/4 | 1/3 | 3/10 | +1/12 | −1/30 |
| BBB | INCREASED | +0.5 | 1/4 | 2/9 | 3/10 | −1/36 | +7/90 |
| CCC | REMOVED (price_estimated) | — | 1/4 | 2/9 | 0 | −1/36 | −2/9 |
| DDD | UNCHANGED | 0 | 1/4 | 2/9 | 1/5 | −1/36 | −1/45 |
| EEE | ADDED | — | 0 | 0 | 1/5 | 0 | +1/5 |

Per sector:

| sector | w0 | wcf | w1 | drift | price | activity | direct | dilution |
|---|---|---|---|---|---|---|---|---|
| Technology | 1/2 | 5/9 | 1/2 | 0 | +1/18 | −1/18 | 0 | −1/18 |
| Health Care | 1/4 | 2/9 | 3/10 | +1/20 | −1/36 | +7/90 | +7/90 | 0 |
| Financials | 1/4 | 2/9 | 1/5 | −1/20 | −1/36 | −1/45 | −1/45 | 0 |

Concentration:

| | from | cf | to |
|---|---|---|---|
| top-2 share | 1/2 | 5/9 | 3/5 |
| HHI | 1/4 | 21/81 | 13/50 |

Events: exactly 6, in any order.

| type | subject | magnitude |
|---|---|---|
| POSITION_ADDED | EEE | +1/5 |
| POSITION_REMOVED | CCC | −2/9 |
| POSITION_INCREASED | BBB | +7/90 |
| SECTOR_INCREASE | Health Care | +1/20 |
| SECTOR_DECREASE | Financials | −1/20 |
| CONCENTRATION_INCREASE | portfolio | +1/10 |

No events for AAA, DDD or Technology.

Caveats: exactly one, the price_estimated caveat for CCC.

Expected results for 2026-10-01 → 2026-10-03:
- `snapshot_intervals = 2`
- the netting caveat is present
- every numeric value equals the 10-01 → 10-02 result

### Fixture SPLT

Inputs:

| security_id | 2026-10-01 | 2026-10-02 |
|---|---|---|
| FFF | 100 sh @ 50 | 200 sh @ 25.50 |
| GGG | 100 sh @ 50 | 100 sh @ 50 |
| HHH | 100 sh @ 50 | 100 sh @ 50 |

Expected (default top_n = 10):
- `flow_factor = 1.0`
- FFF: flagged SUSPECTED_CORPORATE_ACTION with r = 2, status UNCHANGED, adj_share_change 0, activity_effect 0
- every activity_effect is 0
- events: exactly one, SUSPECTED_CORPORATE_ACTION for FFF with magnitude 2

### Fixture FLOWTEST

Inputs:

| security_id | 2026-10-01 | 2026-10-02 |
|---|---|---|
| JJJ | 100 sh @ 10 | 110 sh @ 10 |
| KKK | 100 sh @ 10 | 110 sh @ 10 |
| LLL | 100 sh @ 10 | 110 sh @ 10 |

Expected:
- `flow_factor = 1.1`
- every adj_share_change is 0, every activity_effect is 0, every status is UNCHANGED
- events: none

### Pipeline tests (build modified files in `tmp_path`)

1. Ingesting DEMO 10-01 twice gives one snapshot with 4 holdings; the second run logs `duplicate_noop` and exits 0.
2. The same rows with columns reordered and extra whitespace → `duplicate_noop` (the hash is canonical).
3. One share count changed, same date → exit 2, `conflict_rejected`, original snapshot unchanged.
4. Re-running test 3 with `--replace` → new values stored, `replaced` logged.
5. A missing required field → rejected with the row number; no snapshot created.
6. Negative equity shares → rejected.
7. A duplicate security_id → rejected.
8. Two dates in one file → rejected.
9. An unknown fund → rejected.
10. A holding missing from `sectors.csv` → sector `Unknown` in `/changes`, weight preserved, Unknown caveat present.
11. A ticker change with the same security_id across snapshots → not ADDED/REMOVED.
12. A forced failure mid-load (monkeypatch an insert to raise) → no snapshot or holdings rows for that date.

### API tests

- `/changes` for DEMO matches every value above.
- 422 when `from ≥ to`.
- 404 for an unknown fund, and for a date with no snapshot.
- Event IDs are identical across two calls, and across a re-ingest.

## 11. Verification

Run checks from the repository root after setup:

```bash
make test
npm --prefix frontend run lint
npm --prefix frontend run build
```

Behavioral changes require regression tests at the relevant boundary: pure planner tests for
allocation rules, route tests for source selection and missing data, and API tests for saving,
edit-key protection, and share-copy behavior. Keep the §10 fixtures and decomposition checks.
Verify the built pages and the complete planner flow in a browser when changing the interface.

## 12. Repository layout

```text
backend/
  analytics/    Sector mixes, allocation plans, holdings decomposition and portfolio aggregation
  app/          FastAPI routes, request/response schemas, SQLAlchemy models, Scythe
  pipeline/     Adapters, validation, normalization, source fetching and ingestion
  tests/        Analytics, pipeline, planner, assistant and API regression suites and fixtures
frontend/
  app/          Landing (/), methodology (/methodology), planner (/app)
  components/   Marketing and planner components
  lib/          API clients, saving, sector helpers and branding
data/
  raw/          Committed issuer files
  reference/    ETF catalog, fund metadata and maintained classification references
docs/           Source-ingestion and API contracts
scripts/        Fetching, ingestion, catalog refresh and seeding
```

## 13. Product acceptance flow

1. Open the hosted site linked from the README.
2. Open `/` and `/methodology`; the product name, workflow, formulas and limitations agree with
   the planner and this specification.
3. Open `/app`, add ARKK and enter a dollar amount. Inspect its sector mix and source date.
   The example portfolio's coverage depends on the stored data available for its funds.
4. Set a target with sliders and a supported plain-language request. The total is 100%; Scythe
   reports the changes, and the planner honors its fund constraints and available coverage.
5. Preview a plan with “Use these amounts.” Reopen the saved URL in the owning browser; the
   amounts and target persist. In a browser without the edit key, edits create a separate copy.
6. Run `make test` to verify the change-analysis API against §10's isolated fixtures, including
   DEMO's price/activity split, SPLT's suspected corporate action, and FLOWTEST's flow adjustment.
7. The pipeline tests verify that re-ingesting identical data gives `duplicate_noop` and that
   change-event IDs stay stable.

## 14. Limitations

- Holdings and classifications can be incomplete or dated. A searchable ETF is not necessarily
  covered. Missing funds remain visible and are excluded from planner calculations.
- The planner normalizes the covered portion of the portfolio; the portfolio-analysis API keeps
  missing allocations in its coverage denominator. These are different explicitly labeled views.
- Available ETFs and plan constraints may prevent an exact target match. Plans omit taxes,
  fees, transaction costs, bid-ask spreads and whole-share constraints.
- Sector labels are maintained or issuer-provided classifications, not one official taxonomy.
- Snapshot comparisons cannot reveal activity reversed between dates. The median flow factor
  can misread broad position changes; removed holdings reuse earlier prices; split detection is
  heuristic. Mergers, spin-offs and ticker reuse are not modeled.
- Portfolio links permit reading by anyone who has the ID. Only possession of the edit key
  permits changes to that portfolio; losing the key cannot be reversed through an account.
