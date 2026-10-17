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
make setup    # .venv + requirements-dev.txt, npm install in frontend/
make test     # pytest: analytics, pipeline and API suites
make demo     # reset the DB, ingest data/sample and data/raw, start the API on :8000
make web      # second terminal: frontend on http://localhost:3000
```

`make demo` needs no network. The frontend reads `NEXT_PUBLIC_API_URL` (default
`http://localhost:8000`).

### Demo walkthrough

1. `make demo`, `make web`, then open http://localhost:3000 (the landing page) and click **Launch app**,
   or go straight to http://localhost:3000/terminal. In the terminal sidebar pick **DEMO**, from
   2026-10-01 to 2026-10-02.
2. Technology's net drift is 0.0 pp, but the **Sectors** chart and tab show it hides +5.6 pp from
   price and −5.6 pp from dilution. Health Care is +5.0 pp, driven by an increased BBB position. CCC
   was removed and EEE was added.
3. Click an event. Its contributing holdings are highlighted in the **Holdings** tab, the
   **Inspector** explains it, and the **Source** tab shows both snapshots' files and content hashes,
   with links to the raw `/holdings` JSON.
4. Re-run `make ingest-sample`. It prints `already ingested`, and the event IDs are unchanged.
5. **SPLT**: FFF's share count doubled, but it is flagged as a suspected split, not an increased position.
6. **FLOW**: every share count rose 10%. There are no events, because that was fund flow.
7. **ARKK**: real issuer data (see below). It needs two snapshots before a comparison is possible;
   its holdings are on the **Fund** page.

## Frontend

A dark, terminal-style Next.js app (layout modelled on the Kairos terminal) plus a marketing site in
the same project:

| Route | What it shows |
|---|---|
| `/` | Landing page: what the product does, with the real DEMO numbers and a product screenshot |
| `/methodology` | Every formula, rule and threshold behind the numbers |
| `/discover` | All funds: featured comparison, latest events, largest weight changes, fund cards |
| `/terminal` | The analysis desk: sector chart, events, inspector, holdings, sources and caveats |
| `/fund` | One fund: snapshot calendar (pick two days to compare), sources, holdings at a date |
| `/movers` | Positions ranked by portfolio activity across funds |

Views keep their selection in the URL (`/terminal?fund=DEMO&from=2026-10-01&to=2026-10-02`), so
every view can be shared as a link. The product name lives in `frontend/lib/brand.ts`. Geist and
Geist Mono are bundled in `frontend/app/fonts` (SIL Open Font License), so builds need no network.

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
| `GET /etfs/search?q=IVV&limit=20` | search registered ETF symbols; includes latest data date when loaded |
| `POST /portfolios` | create an anonymous saved portfolio; returns its edit key once |
| `GET /portfolios/{id}` | portfolio name and allocated funds |
| `PUT /portfolios/{id}` | replace name and fund weights; requires `X-Portfolio-Edit-Key` |
| `DELETE /portfolios/{id}` | delete a portfolio; requires `X-Portfolio-Edit-Key` |
| `GET /portfolios/{id}/latest` | each allocated fund's newest snapshot and holdings, with coverage weight |

Portfolio requests use fractional weights that sum to 1 when funds are present. An empty portfolio
can be created first and allocated later. See [the portfolio API contract](docs/portfolio-api.md)
for request examples, missing-data behavior, and the analytics handoff.

To broaden ETF coverage, the data team can register U.S.-listed ETF symbols from Nasdaq and
ingest selected SEC N-PORT or iShares holdings. See [ETF data sources](docs/etf-sources.md).
Listing a symbol does not claim its holdings are available.

Interactive docs are at http://localhost:8000/docs.

CORS allows `http://localhost:3000`. Add deployed frontend origins with a comma-separated
`CORS_ORIGINS` environment variable, for example `CORS_ORIGINS=https://fundshift.vercel.app`.

## Deploy on Vercel

One GitHub repo, two Vercel projects: the API and the frontend. Both redeploy on every push to `main`.

**1. API project**
1. Vercel → Add New → Project → import this repo. Name it, for example, `fundshift-api`.
   Leave **Root Directory** as `./`. Vercel detects FastAPI from `requirements.txt` and serves
   `app` from `index.py`.
2. Deploy. The first build fails with `DATABASE_URL is not set`, which is expected.
3. In the project's **Storage** tab, create a **Neon** Postgres database and **Connect** it to this
   project. Select Production (and Preview if you want), and leave the environment variable prefix
   empty so the variable is called `DATABASE_URL`.
4. **Deployments → Redeploy.** The build command in `vercel.json` (`python scripts/seed_db.py`)
   loads `data/sample` and `data/raw` into Neon. The build log shows the `inserted ...` lines.
   Later deploys print `already ingested` and load only new files, so committing a new
   `data/raw/ARKK_<date>.csv` is enough to add a snapshot.
5. Check `https://<api-domain>/health`. It should report `"snapshot_count": 8`.

**2. Frontend project**
1. Import the same repo again as a second project, for example `fundshift`, with
   **Root Directory: `frontend`**.
2. Before deploying, add the environment variable `NEXT_PUBLIC_API_URL=https://<api-domain>`. It
   is baked in at build time, so changing it later needs a redeploy.
3. Deploy.

**3. Let the frontend call the API**
1. In the API project, add `CORS_ORIGINS=https://<frontend-domain>`. Separate several origins with
   commas. Portfolio write requests use an edit key, so configure the actual frontend origin.
2. Redeploy the API.

Make `main` the GitHub default branch so Vercel builds production from it.

## Database

SQLite by default (`DATABASE_URL=sqlite:///./fundshift.db`). For Postgres, set `DATABASE_URL`
to a `postgres://`, `postgresql://` or `postgresql+psycopg://` URL. The psycopg 3 driver is in
`requirements.txt`. Tables are created with `metadata.create_all`, without migrations. Checked against PostgreSQL 16 with psycopg 3: ingest,
duplicate/conflict/replace, rollback and the DEMO golden values all behave as on SQLite.

## Layout

```
backend/app/        FastAPI app, SQLAlchemy models, response schemas, routes
backend/pipeline/   adapters (sample, ark), validate, normalize, load, reference data
backend/analytics/  pure functions: weights, decompose, sectors, concentration, events, compare
backend/tests/      golden values from SPEC §10, pipeline and API tests
frontend/           Next.js + Tailwind + Recharts: marketing site and the terminal app (see Frontend)
data/sample/        synthetic fixtures (DEMO, SPLT, FLOW)
data/raw/           real issuer files
data/reference/     funds.csv, sectors.csv
scripts/            run_pipeline.py, fetch_holdings.py, seed_db.py (Vercel build step)
index.py, vercel.json  Vercel entrypoint and build config for the API
```

## Known limitations

- Snapshot diffs can't see trades that reversed within the period.
- The median flow factor misreads periods where the manager changes most positions in the same direction.
- Removed holdings use the earlier price in the counterfactual.
- Split detection is a heuristic. Mergers, spin-offs and ticker reuse are not modeled.
- Sector labels are team-assigned, not an official classification.

Derived from issuer-published holdings snapshots. Not investment advice.
