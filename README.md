# FundShift

FundShift shows how an actively managed ETF's portfolio changed between two dates. It separates
changes caused by **price movement** from changes caused by **portfolio activity** (the manager
changing share counts).

> On the surface, X happened. Underneath, price moves did A and portfolio activity did B. Here are
> the positions that actually changed, and here is the source data that proves it.

`SPEC.md` is the build spec. `CLAUDE.md` holds the working conventions.

## Quick start

Requires Python 3.11+ and Node 20+.

```
make setup    # .venv + requirements.txt, npm install in frontend/
make test     # pytest: analytics, pipeline and API suites
make demo     # reset the DB, ingest data/sample and data/raw, start the API on :8000
make web      # second terminal: frontend on http://localhost:3000
```

`make demo` needs no network. The frontend reads `NEXT_PUBLIC_API_URL` (default
`http://localhost:8000`).

### Demo walkthrough

1. `make demo`, `make web`, then open http://localhost:3000. Pick **DEMO**, from 2026-10-01 to 2026-10-02.
2. Technology's net drift is 0.0 pp, but the sector table shows it hides +5.6 pp from price and
   −5.6 pp from dilution. Health Care is +5.0 pp, driven by an increased BBB position. CCC was
   removed and EEE was added.
3. Click an event. Its contributing holdings are highlighted in the table, and **Source data** shows
   both snapshots' files and content hashes, with links to the raw `/holdings` JSON.
4. Re-run `make ingest-sample`. It prints `already ingested`, and the event IDs are unchanged.
5. **SPLT**: FFF's share count doubled, but it is flagged as a suspected split, not an increased position.
6. **FLOW**: every share count rose 10%. There are no events, because that was fund flow.
7. **ARKK**: real issuer data (see below). It needs two snapshots before a comparison is possible.

## How the numbers work

Every weight, exposure, drift and effect is a **fraction** in code, the database and the API
(0.07 = 7%). Only the frontend converts to % (levels) or pp (differences).

For snapshots A (earlier) and B (later), equity rows only:

- `w0` = A's weights, `w1` = B's weights.
- `wcf` is the counterfactual: A's share counts at B's prices. A removed holding has no later
  price, so its earlier price is used (`price_estimated`). An added holding counts as 0.
- `price_effect = wcf − w0` and `activity_effect = w1 − wcf`. Together they always sum to `w1 − w0`.
- `flow_factor` is the median `s_B / s_A` over common holdings. It removes creations and
  redemptions, which scale every position together. `adj_share_change` is the share-count
  change after that adjustment.
- A share ratio near 2, 3, 4, 5, 10 or 20 (or the inverse) with an offsetting price move is a
  **suspected corporate action**. It is treated as a split, not as portfolio activity.
- An unchanged holding can still have a nonzero activity effect because other positions changed
  size. That is labelled **dilution**, never a position change.

Thresholds and `CONFIG_VERSION` live in `backend/analytics/config.py`. The top-N concentration
measure uses N = 10, except DEMO, which uses 2: it has only four holdings, so a top-10 share would
always be 100%.

Cash and other non-equity rows are excluded from the weights and reported as `cash_weight`.

## Ingesting data

```
python scripts/run_pipeline.py --fund DEMO --file data/sample/demo_2026-10-01.csv [--adapter sample|ark] [--replace]
```

Adapter → validate → normalize → load, in one transaction. The adapter defaults to `ark` for ARKK
and to `sample` otherwise.

| Outcome | Exit code | When |
|---|---|---|
| `inserted` | 0 | new fund/date |
| `duplicate_noop` | 0 | same content hash already stored; prints `already ingested` |
| `conflict_rejected` | 2 | different content for a stored date; prints both hashes. Re-run with `--replace` |
| `replaced` | 0 | `--replace` swapped the stored snapshot |
| `invalid_rejected` | 1 | validation failed; the message names the file, row and field |

The content hash is computed over the normalized rows, so whitespace, quoting, column order and
number formatting in the raw file do not change it. Every attempt is recorded in `import_log`.

Sectors come from `data/reference/sectors.csv`, applied at analysis time to both snapshots.
Precedence is the reference mapping, then the issuer's sector column if any, then `Unknown`.

## Real data: ARKK

```
python scripts/fetch_holdings.py --fund ARKK              # saves data/raw/ARKK_<as_of_date>.csv
python scripts/run_pipeline.py --fund ARKK --file data/raw/ARKK_<as_of_date>.csv
```

- The source is ARK's daily holdings CSV:
  https://assets.ark-funds.com/fund-documents/funds-etf-csv/ARK_INNOVATION_ETF_ARKK_HOLDINGS.csv.
  The older `ark-funds.com/wp-content/...` URL now returns 404.
- The file covers only the latest trading day, and the saved name uses the date inside the file.
- `data/raw/ARKK_2026-10-16.csv` is committed (fetched 2026-10-17), and `make demo` ingests it.
- **History:** on 2026-10-17 the Internet Archive had no reachable copies of either URL
  (`web.archive.org` refused connections, and the availability API reported no snapshots).
  To compare real ARKK snapshots, **run `fetch_holdings.py` on two different trading days, then
  ingest both.**
- The ARK file has no asset-class column. Money-market funds and cash are classed as `cash`,
  warrants and rights as `other`, and everything else as `equity`, including private placements
  such as OpenAI and Kalshi, which have pseudo-CUSIPs and no ticker.
- **The sector labels for ARKK holdings in `sectors.csv` are team-assigned categories, not an
  official classification** such as GICS.

## API

| Endpoint | Returns |
|---|---|
| `GET /health` | `{status, db, fund_count, snapshot_count}` |
| `GET /funds` | funds with snapshot counts and latest `as_of_date` |
| `GET /funds/{ticker}/snapshots` | dates with `source_url, content_hash, row_count, ingested_at` |
| `GET /funds/{ticker}/holdings?date=YYYY-MM-DD` | the stored rows with resolved sectors (the "view underlying data" link) |
| `GET /funds/{ticker}/changes?from=&to=` | the full comparison; 404 for an unknown fund or date, 422 when `from ≥ to` |

Interactive docs are at http://localhost:8000/docs.

CORS allows `http://localhost:3000`. Add deployed frontend origins with a comma-separated
`CORS_ORIGINS` environment variable, for example `CORS_ORIGINS=https://fundshift.vercel.app`.

## Database

SQLite by default (`DATABASE_URL=sqlite:///./fundshift.db`). For Postgres, set for example
`DATABASE_URL=postgresql+psycopg://user:pass@host/fundshift` and install the driver yourself
(`pip install "psycopg[binary]"`). The driver is not in `requirements.txt`. Tables are created with
`metadata.create_all`, without migrations. Checked against PostgreSQL 16 with psycopg 3: ingest,
duplicate/conflict/replace, rollback and the DEMO golden values all behave as on SQLite.

## Layout

```
backend/app/        FastAPI app, SQLAlchemy models, response schemas, routes
backend/pipeline/   adapters (sample, ark), validate, normalize, load, reference data
backend/analytics/  pure functions: weights, decompose, sectors, concentration, events, compare
backend/tests/      golden values from SPEC §10, pipeline and API tests
frontend/           Next.js + Tailwind + Recharts single page
data/sample/        synthetic fixtures (DEMO, SPLT, FLOW)
data/raw/           real issuer files
data/reference/     funds.csv, sectors.csv
scripts/            run_pipeline.py, fetch_holdings.py
```

## Known limitations

- Snapshot diffs can't see trades that reversed within the period.
- The median flow factor misreads periods where the manager changes most positions in the same direction.
- Removed holdings use the earlier price in the counterfactual.
- Split detection is a heuristic. Mergers, spin-offs and ticker reuse are not modeled.
- Sector labels are team-assigned, not an official classification.

Derived from issuer-published holdings snapshots. Not investment advice.
