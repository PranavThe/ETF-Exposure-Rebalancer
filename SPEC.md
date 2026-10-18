# FundShift — Build Spec for Claude Code (final)

> Usage: put this file in an empty repo as `SPEC.md` and tell Claude Code:
> "Read SPEC.md and follow it, starting at M0." Or paste the whole file as your first message.

---

## 0. How you (Claude Code) must work

- Build in the milestone order in §11. Do not start a milestone until the previous milestone's acceptance commands pass. After each milestone, run its acceptance commands, show the output, and commit with message `M<n>: <summary>`.
- **The golden values in §10 are the source of truth.** Never edit an expected value to make a test pass. If you believe a value in this spec is wrong, stop and show your arithmetic.
- Stop and ask before you:
  - change units or the decomposition math in §7
  - add a service, database, queue, or scheduler
  - add a dependency not listed in §3
- Analytics code is pure: no DB, no network, no file IO. Tests never touch the network.
- First action: create `CLAUDE.md` (under 60 lines) capturing the units (§4), language rules (§9), and make commands. Update it whenever a convention changes.
- Prefer boring code. The only extension point is the adapter interface in §6. No plugin systems, no generic "issuer framework".

## 1. What FundShift is

FundShift shows how an **actively managed ETF's** portfolio changed between two dates, and separates changes caused by **price movement** from changes caused by **portfolio activity** (the manager changing share counts).

Demo story: "On the surface, X happened. Underneath, price moves did A and portfolio activity did B. Here are the positions that actually changed, and here is the source data that proves it."

## 2. Non-goals (do not build)

- Auth or accounts, payments
- AI/LLM features, recommendations or advice
- Notifications, brokerage connections, real-time prices
- Schedulers, queues, workers
- More than one real issuer adapter
- Deployment (unless you reach M7)

## 3. Stack (decided)

- **Backend:** Python 3.11+, FastAPI, Uvicorn, SQLAlchemy 2.x, pandas, pytest, httpx (for TestClient).
- **Database:** SQLite file by default (`DATABASE_URL=sqlite:///./fundshift.db`). The code must also work on Postgres by changing only `DATABASE_URL`. Create tables with `metadata.create_all`. No Alembic.
- **Frontend:** Next.js (App Router, current stable via create-next-app) + TypeScript + Tailwind + Recharts. Reads `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`). Backend enables CORS for `http://localhost:3000`.
- **Makefile targets:**
  - `setup`
  - `test`
  - `ingest-sample`
  - `api`
  - `web`
  - `demo`: reset the DB, ingest all sample fixtures, start the API
- No Docker required.

## 4. Data and units

**Units.** Every weight, exposure, drift and effect is a **fraction** in code, DB and API (0.07 = 7%). Only the frontend converts to % or percentage points (pp). Compute in float64, compare in tests with `math.isclose(..., abs_tol=1e-9)`, and round only for display.

**Sources.**
1. `data/sample/`: the synthetic fixtures in §10. The app must run fully offline on these. They are the backbone of the tests and the guaranteed demo.
2. One real active ETF with daily holdings disclosure. Default is ARK Innovation ETF (ARKK); see M6.
   - Issuer files update on trading days only, and usually show only the current day.
   - Real history therefore has to be accumulated by fetching daily, or recovered from archives.

**Sectors.**
- Do not rely on issuer files for sectors. Sector comes from `data/reference/sectors.csv` (`security_id,sector`), which we maintain.
- The mapping is applied at analysis time to both snapshots, so editing it never shows up as portfolio drift.
- If an issuer file has a sector column, store it as `source_sector`.
- Precedence: reference mapping → `source_sector` → `"Unknown"`.
- `Unknown` is a real bucket shown in the UI. It is never dropped.

## 5. Schema

- **`funds`**: `id, ticker UNIQUE, name, issuer, created_at`. Seeded from `data/reference/funds.csv`.
- **`snapshots`**: `id, fund_id, as_of_date, source_url, source_file, content_hash, row_count, ingested_at`, with UNIQUE(fund_id, as_of_date).
- **`holdings`**: `id, snapshot_id, security_id, ticker, name, asset_class, source_sector NULL, shares, price, market_value, reported_weight NULL`, with UNIQUE(snapshot_id, security_id).
  - `asset_class` ∈ {`equity`, `cash`, `other`}.
  - `price = market_value / shares` when the file doesn't provide it and shares > 0.
- **`import_log`**: `id, fund_id, as_of_date, source_file, content_hash, outcome, message, created_at`.
  - `outcome` ∈ {`inserted`, `duplicate_noop`, `conflict_rejected`, `replaced`, `invalid_rejected`}.
- **`security_sectors`**: `security_id PRIMARY KEY, sector`. Reloaded from CSV on every ingest and on API startup.

There is **no `change_events` table.** Changes are computed on demand (§7, §8). Event IDs are deterministic, so the same comparison always yields the same events.

**Security IDs.**
- Use the issuer's CUSIP or ISIN when present.
- Non-equity rows without an ID get synthetic IDs such as `CASH:USD` or `OTHER:<normalized name>`.
- An equity row without an ID falls back to `TICKER:<ticker>` and produces a validation warning.

## 6. Pipeline

```
python scripts/run_pipeline.py --fund ARKK --file data/raw/ARKK_2026-10-16.csv [--adapter ark|sample] [--replace]
```

Each stage is its own module in `backend/pipeline/`.

**1. Adapter (ingest).** `adapters/sample.py` and `adapters/ark.py`.
- Each adapter maps one file format to normalized rows: `as_of_date, fund, security_id, ticker, name, asset_class, source_sector, shares, price, market_value, reported_weight`.
- Each adapter declares its source weight unit (percent or fraction) and converts to fraction.

**2. Validate.** Reject with a clear message (file, row number, field) on:
- missing required columns, or empty required fields
- more than one `as_of_date` in a file, or an unparseable date
- a fund ticker not present in `funds.csv`
- an equity row with negative shares or market_value. Supported scope is long-only equity; cash and other rows may be negative and are excluded from analytics.
- a duplicate `security_id` within one snapshot. Never aggregate silently.
- sum of reported weights outside 90%–110%

Warn but accept when:
- the sum of reported weights is outside 97%–103%
- |reported_weight − market-value-derived weight| > 0.1pp for any row

**3. Normalize.** Trim strings, uppercase tickers, compute price if missing, assign synthetic IDs.

**4. Load.** Runs in a single transaction.
- `content_hash` = sha256 of canonical JSON of the normalized rows, sorted by `security_id`, with numbers formatted to fixed precision. Whitespace, quoting or column-order differences in the raw file must not change the hash.
- No snapshot for this fund/date → insert; outcome `inserted`.
- Same hash already stored → write only an `import_log` row (`duplicate_noop`), exit 0, print `already ingested`.
- Different hash stored → write only an `import_log` row (`conflict_rejected`), exit 2, print both hashes and how to use `--replace`.
- `--replace` → delete the old snapshot and its holdings, insert the new one in the same transaction, log `replaced`.
- Any failure → full rollback. No partial snapshot may exist.

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

## 8. API

- `GET /health` → `{status, db, fund_count, snapshot_count}`
- `GET /funds` → funds with snapshot counts and latest `as_of_date`
- `GET /funds/{ticker}/snapshots` → dates with `source_url, content_hash, row_count, ingested_at`
- `GET /funds/{ticker}/holdings?date=YYYY-MM-DD` → normalized rows, resolved sector, and snapshot metadata. This is the "view underlying data" endpoint.
- `GET /funds/{ticker}/changes?from=&to=` → the full comparison. `from` is a Python keyword, so declare it with `Query(alias="from")`.

Response shape for `/changes` (the zeros show types only; the real values for DEMO are in §10):

```json
{
  "fund": "DEMO",
  "config_version": "1",
  "from": {"as_of_date": "2026-10-01", "source_url": "", "source_file": "", "content_hash": "", "row_count": 0},
  "to":   {"as_of_date": "2026-10-02", "source_url": "", "source_file": "", "content_hash": "", "row_count": 0},
  "snapshot_intervals": 1,
  "flow_factor": 0,
  "cash_weight": {"from": 0, "to": 0},
  "summary": {
    "holdings_from": 0, "holdings_to": 0,
    "added": 0, "removed": 0, "increased": 0, "decreased": 0,
    "top_n": 10,
    "top_n_share": {"from": 0, "cf": 0, "to": 0},
    "hhi": {"from": 0, "cf": 0, "to": 0}
  },
  "sectors": [
    {"sector": "", "w_from": 0, "w_cf": 0, "w_to": 0, "drift": 0,
     "price_effect": 0, "activity_effect": 0, "activity_direct": 0, "activity_dilution": 0}
  ],
  "holdings": [
    {"security_id": "", "ticker": "", "name": "", "sector": "", "status": "", "traded": false,
     "shares_from": 0, "shares_to": 0, "adj_share_change": 0,
     "price_from": 0, "price_to": 0, "price_estimated": false,
     "w_from": 0, "w_cf": 0, "w_to": 0, "price_effect": 0, "activity_effect": 0, "flags": []}
  ],
  "events": [
    {"id": "", "type": "", "subject": "", "magnitude": 0, "description": "", "contributing_security_ids": []}
  ],
  "caveats": []
}
```

Notes:
- `snapshot_intervals` = number of stored snapshots for the fund with `from < as_of_date ≤ to`. Adjacent snapshots give 1.
- Errors: 404 for an unknown fund or a date with no snapshot; 422 when `from ≥ to`.

## 9. Language rules (UI copy and event descriptions)

- Never say "bought", "sold", "trade", or anything about what the manager "believes" or "thinks".
- Say "increased position", "decreased position", "portfolio activity".
- "Increased position" always means a flow-adjusted share-count change between two snapshots.
- Weight differences are "pp" (percentage points), never "%".
- Any drift number is shown with its price/activity split next to it.
- Description template: `Health Care exposure +5.0 pp (price −2.8 pp, portfolio activity +7.8 pp)`.
- Footer on every page: "Derived from issuer-published holdings snapshots. Not investment advice."

## 10. Golden fixtures (write the tests from these BEFORE implementing)

### Reference files

`data/reference/funds.csv`:

| ticker | name | issuer |
|---|---|---|
| DEMO | Demo Active Fund | Synthetic |
| SPLT | Split Test Fund | Synthetic |
| FLOWTEST | Flow Test Fund | Synthetic |
| ARKK | ARK Innovation ETF | ARK Invest |

`data/reference/sectors.csv`:

| security_id | sector |
|---|---|
| AAA, DDD | Technology |
| BBB | Health Care |
| CCC, EEE | Financials |
| FFF, GGG, HHH, JJJ, KKK, LLL | Technology |

### Sample file format

Sample files use columns `date,fund,security_id,ticker,name,asset_class,shares,price,market_value,weight`, with `weight` as a fraction. Use security_id as the ticker, and a name like `AAA Corp`.

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

## 11. Milestones

### M0 — Setup (≤ 30 min)

- Create the repo layout (§12), `CLAUDE.md`, `Makefile`, and README stub.
- Timeboxed reconnaissance, 20 minutes maximum:
  - Try to download one real ARKK holdings file into `data/raw/`.
  - Print its header and first 5 rows.
  - Record the actual columns in `CLAUDE.md`.
  - Do not assume any column names. If the download fails, note why and move on; never block on it.

Acceptance: `make test` exits 0.

### M1 — Fixtures and tests first

- Write every CSV and every test in §10.
- Analytics and pipeline functions exist but raise `NotImplementedError`.

Acceptance: `pytest` collects every test, and they fail with `NotImplementedError`, not with import or syntax errors.

### M2 — Analytics

Implement §7 as pure functions.

Acceptance: `pytest backend/tests/test_analytics.py` is green.

### M3 — Pipeline and DB

Implement §5 and §6.

Acceptance:
- `make ingest-sample` run twice; the second run prints `already ingested`.
- `pytest backend/tests/test_pipeline.py` is green.

### M4 — API

Implement §8.

Acceptance:
- `pytest backend/tests/test_api.py` is green.
- After `make demo`, `curl "localhost:8000/funds/DEMO/changes?from=2026-10-01&to=2026-10-02"` returns the §10 values.

### M5 — Frontend (single page)

Components:
- **FundSelector**
- **DateRangeSelector**: only offers dates that have snapshots.
- **SummaryCards**: added / removed / increased / decreased counts, plus top-N and HHI, each with its price/activity split.
- **SectorChart**: Recharts horizontal stacked bars per sector showing the price effect and activity effect, labeled with net drift.
- **HoldingsTable**: status, shares from→to, flow-adjusted change, weight from→to, price effect, activity effect, flags. Sorted by abs(weight change) by default.
- **EventList**: clicking an event highlights its contributing rows in HoldingsTable and scrolls to them.
- **SourceInfo**: both snapshots' dates, source URLs, content hashes, and a link to the `/holdings` JSON.
- **CaveatsBanner**
- Loading, error and empty states.

Use Tailwind defaults. No design-system work.

Acceptance:
- `npm run build` passes.
- With `make demo` and `npm run dev` running, selecting DEMO 10-01 → 10-02 shows 6 events, and clicking the BBB event highlights the BBB row.

### M6 — Real data (ARKK)

- Write `backend/pipeline/adapters/ark.py` against the actual columns observed in M0.
- Write `scripts/fetch_holdings.py --fund ARKK`. It downloads the current file and saves it as `data/raw/ARKK_<as_of_date>.csv`, using the date inside the file rather than today's date.
- Seed `sectors.csv` for ARKK's holdings. These are team-assigned categories; say so in the README.
- Check whether archived past copies of the source URL exist (for example, in the Internet Archive). If they do, ingest up to two.
- If no history is reachable, document in the README: "Run `fetch_holdings.py` on two different trading days, then ingest both."

Acceptance:
- One real file ingests, and re-ingesting it is a no-op.
- If 2 or more real snapshots exist, `/changes` works for ARKK and the UI shows it.

### M7 — Deploy (optional)

Only if everything above is done.

## 12. Repository layout

```
backend/
  app/          main.py, db.py, models.py, schemas.py, routes/
  pipeline/     adapters/{sample.py, ark.py}, validate.py, normalize.py, load.py
  analytics/    config.py, weights.py, decompose.py, sectors.py, concentration.py, events.py
  tests/        test_analytics.py, test_pipeline.py, test_api.py, conftest.py
frontend/
data/
  sample/       demo_2026-10-01.csv, demo_2026-10-02.csv, demo_2026-10-03.csv, splt_*.csv, flow_*.csv
  raw/
  reference/    funds.csv, sectors.csv
scripts/        run_pipeline.py, fetch_holdings.py
Makefile
CLAUDE.md
README.md
requirements.txt
```

## 13. Demo script (the definition of done)

1. `make demo` from a clean checkout, with no network.
2. Open DEMO, 10-01 → 10-02:
   - Technology's net drift is 0.0 pp, but it hides +5.6 pp from price and −5.6 pp from dilution.
   - Health Care is +5.0 pp, driven by an increased BBB position.
   - CCC was removed and EEE was added.
3. Click an event: its contributing holdings are highlighted, and the source snapshot data and content hashes are one click away.
4. Re-run the ingest: it prints `already ingested`, and the event IDs are identical.
5. Open SPLT: FFF's share count doubled, but it is flagged as a suspected split, not reported as an increased position.
6. Open FLOWTEST: every share count rose 10%, and there are no events, because that was fund flow.
7. If real ARKK snapshots exist, switch to ARKK.

## 14. Known limitations (copy into README)

- Snapshot diffs can't see trades that reversed within the period.
- The median flow factor misreads periods where the manager changes most positions in the same direction.
- Removed holdings use the earlier price in the counterfactual.
- Split detection is a heuristic. Mergers, spin-offs and ticker reuse are not modeled.
- Sector labels are team-assigned, not an official classification.
