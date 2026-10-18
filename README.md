# FundShift

FundShift is a one-screen sector-exposure tool for beginner investors. You enter the ETFs you hold
and the dollars in each; it shows your look-through sector mix (built from each ETF's published
holdings). You choose the mix you want, with sliders or by telling the assistant in plain words, and
it suggests the moves that get you there: reduce or increase ETFs you hold, add new ones, add money
or take money out.

> You decide the exposure you want. The tool only does the math to get you there.

The original holdings-change analysis (price effect vs portfolio activity) is still served by the
API; see "Holdings-change analysis" below.

`SPEC.md` is the build spec. `CLAUDE.md` holds the working conventions.

## Quick start

Requires Python 3.11+ and Node 20+.

```
make setup    # .venv + requirements-dev.txt, npm install in frontend/
make test     # pytest: analytics, pipeline and API suites
make demo     # reset the local DB, ingest local test fixtures and data/raw, start the API on :8000
make web      # second terminal: frontend on http://localhost:3000
```

`make demo` needs no network. The frontend reads `NEXT_PUBLIC_API_URL` (default
`http://localhost:8000`).

### Walkthrough

1. `make demo`, `make web`, then open http://localhost:3000/app.
2. Click **Try an example portfolio** (IVV $6,000, IYW $3,000, ARKK $1,000 when those ETFs have
   holdings loaded), or search for your own ETFs and type the dollars in each.
3. The middle panel shows your sector mix. Drag a sector's slider to set the mix you want; the
   sectors you haven't touched adjust so the total stays 100%. Or tell the assistant, for example
   "less tech, more health care" or "no energy".
4. The right panel shows the suggested moves for each kind of plan, how close each gets (in pp)
   and how much money moves. Choose **Add** or **Take out** to plan with new money or a withdrawal,
   and **New ETFs** to limit how many new ETFs a plan may add. **Use these amounts** applies a plan
   to your ETFs so you can see the result.
5. Your portfolio saves to the database automatically; the URL (`/app?p=<id>`) reopens it, and only
   the browser that created it can edit it. Opening someone else's link and changing it saves a copy.

The iShares funds in the example are loaded locally with `scripts/ingest_ishares.py` (see
[ETF data sources](docs/etf-sources.md)); `make demo` alone loads only ARKK, plus the synthetic
DEMO, SPLT and FLOWTEST fixtures, which the app never suggests.

## Frontend

A dark, terminal-style Next.js app (modelled on the Kairos terminal) plus a marketing site (modelled
on kairos.trade) in the same project:

| Route | What it shows |
|---|---|
| `/` | Landing page for the exposure tool |
| `/methodology` | How exposure, distance and plans are computed, data sources and limitations |
| `/app` | The whole product on one screen: your ETFs, your sector mix vs your target, suggested moves, assistant |

The app lives in `frontend/components/planner` with its API calls in `frontend/lib/planner.ts`.
The product name lives in `frontend/lib/brand.ts`. Geist and Geist Mono are bundled in
`frontend/app/fonts` (SIL Open Font License), so builds need no network.

## How the planner works

All weights are fractions in code and the API; the frontend shows % for levels and pp for
differences.

- **An ETF's sector mix** comes from its latest stored snapshot: market value by sector over total
  positive market value. Non-equity rows count as "Cash & other". Issuer labels are mapped to 11
  standard sectors (`backend/analytics/rebalance.py`, `SECTOR_ALIASES`).
- **Your exposure** is the dollar-weighted blend of your ETFs' mixes. ETFs without holdings data are
  listed as `missing`, kept as they are, and left out of the mix and the moves.
- **Distance** between two mixes is half the sum of absolute differences (0 = identical, 1 = no
  overlap), shown in pp.
- **Plans** solve for the dollar split closest to your target (a small quadratic program over the
  allowed ETFs, solved exactly). Each kind restricts the moves: rearrange only what you own;
  rearrange and add new ETFs; invest new money without reducing anything; take money out only by
  reducing; or the same with rearranging. New ETFs are added one at a time, each only if it brings
  the plan at least 0.5 pp closer; positions under 1% of the portfolio are dropped; amounts are
  whole dollars. Plans that change nothing or repeat another plan are not shown.
- **The assistant** (`POST /chat`) asks Claude Haiku 5.5 (`claude-haiku-5-5`, JSON-schema output, effort `low`) to turn the
  message into a full target mix and, if mentioned, money added or taken out. It never picks a mix
  for the user. Without `ANTHROPIC_API_KEY`, or if the call fails, a small rule-based reader handles
  plain requests ("less tech", "no energy", "30% financials", "I'm adding $2,000"). Sliders always work.

## Holdings-change analysis

The API still serves the original analysis of how an active ETF changed between two snapshots
(`/funds/{ticker}/changes`); the app no longer shows it. Every weight, exposure, drift and effect is a **fraction** in code, the database and the API
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
and to `sample` only for the local fixture tickers. Other funds must name their adapter explicitly.

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
| `GET /funds` | funds with snapshot counts and latest `as_of_date`; `loaded_only`, `limit`, and `offset` are optional |
| `GET /funds/{ticker}/snapshots` | dates with `source_url, content_hash, row_count, ingested_at` |
| `GET /funds/{ticker}/holdings?date=YYYY-MM-DD` | the stored rows with resolved sectors (the "view underlying data" link) |
| `GET /funds/{ticker}/changes?from=&to=` | the full comparison; 404 for an unknown fund or date, 422 when `from ≥ to` |
| `GET /etfs/search?q=IVV&limit=20` | search registered ETF symbols; includes latest data date when loaded |
| `POST /portfolios` | create an anonymous saved portfolio; returns its edit key once |
| `GET /portfolios/{id}` | portfolio name and allocated funds |
| `PUT /portfolios/{id}` | replace name and fund weights; requires `X-Portfolio-Edit-Key` |
| `DELETE /portfolios/{id}` | delete a portfolio; requires `X-Portfolio-Edit-Key` |
| `GET /portfolios/{id}/latest` | each allocated fund's newest snapshot and holdings, with coverage weight |
| `GET /portfolios/{id}/analysis` | weighted top holdings, overlap, sectors, asset classes, coverage, and latest dates |
| `GET /etfs/covered` | ETFs with holdings data and their sector mix (`sample: true` marks test fixtures) |
| `POST /plan` | `{holdings: [{ticker, amount}], target?, cash_change?, max_new_funds?}` → your sector mix, distance to the target, and plans with moves |
| `POST /chat` | `{message, history?, current?, target?, total?}` → `{reply, target, cash_change, source}`; `source` is `claude` or `rules` |
| `GET /portfolios/{id}/preferences` | the saved dollar value and target mix |
| `PUT /portfolios/{id}/preferences` | save the dollar value and target mix; requires `X-Portfolio-Edit-Key` |

Portfolio requests use fractional weights that sum to 1 when funds are present. An empty portfolio
can be created first and allocated later. See [the portfolio API contract](docs/portfolio-api.md)
for request examples, missing-data behavior, and the analytics handoff.

The build seeds a dated snapshot of 5,787 U.S.-listed ETF symbols for search and portfolio
selection. This catalog is separate from holdings coverage. The data team can refresh the
catalog from Nasdaq and ingest SEC N-PORT or iShares holdings. See [ETF data sources](docs/etf-sources.md).
Listing a symbol does not claim its holdings are available.

Interactive docs are at http://localhost:8000/docs.

CORS allows `http://localhost:3000`. Add deployed frontend origins with a comma-separated
`CORS_ORIGINS` environment variable, for example `CORS_ORIGINS=https://fundshift.vercel.app`.
Origins that change per deploy, such as Vercel preview URLs, can be allowed with a
`CORS_ORIGIN_REGEX` pattern that must match the whole origin, for example
`CORS_ORIGIN_REGEX=https://fundshift-[a-z0-9-]+-<team>\.vercel\.app`.

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
   removes previously seeded local fixtures, then loads real issuer files from `data/raw` into Neon.
   Synthetic fixtures in `data/sample` are excluded from production builds. Existing synthetic fund
   rows referenced by a saved portfolio are retained without their fixture snapshots. The build log
   shows the `inserted ...` lines.
   Later deploys print `already ingested` and load only new files, so committing a new
   `data/raw/ARKK_<date>.csv` is enough to add a snapshot.
5. Check `https://<api-domain>/health`. With the single committed ARKK source file, it should report
   `"snapshot_count": 1` on a clean database.

**2. Frontend project**
1. Import the same repo again as a second project, for example `fundshift`, with
   **Root Directory: `frontend`**.
2. Before deploying, add the environment variable `NEXT_PUBLIC_API_URL=https://<api-domain>`. It
   is baked in at build time, so changing it later needs a redeploy.
3. Deploy.

**3. Let the frontend call the API**
1. In the API project, add `CORS_ORIGINS=https://<frontend-domain>`. Separate several origins with
   commas. Portfolio write requests use an edit key, so configure the actual frontend origin.
2. For preview deployments of the frontend, also add
   `CORS_ORIGIN_REGEX=https://<frontend-project>-[a-z0-9-]+-<team>\.vercel\.app`, and enable
   `NEXT_PUBLIC_API_URL` for the Preview environment in the frontend project.
3. Redeploy the API.

**4. Turn on the assistant (optional)**
In the API project add `ANTHROPIC_API_KEY` (from console.anthropic.com) and redeploy. Without it,
`/chat` uses the rule-based reader and the app labels its replies "simple reader".

Make `main` the GitHub default branch so Vercel builds production from it.

## Database

SQLite by default (`DATABASE_URL=sqlite:///./fundshift.db`). For Postgres, set `DATABASE_URL`
to a `postgres://`, `postgresql://` or `postgresql+psycopg://` URL. The psycopg 3 driver is in
`requirements.txt`. Tables are created with `metadata.create_all`, without migrations. Checked against PostgreSQL 16 with psycopg 3: ingest,
duplicate/conflict/replace, rollback and the DEMO golden values all behave as on SQLite.

## Layout

```
backend/app/        FastAPI app, SQLAlchemy models, response schemas, routes, assistant (Claude + rules)
backend/pipeline/   adapters (sample, ark), validate, normalize, load, reference data
backend/analytics/  pure functions: rebalance (the planner), weights, decompose, sectors, concentration, events, compare
backend/tests/      golden values from SPEC §10, pipeline and API tests
frontend/           Next.js + Tailwind: marketing site and the one-screen app (see Frontend)
data/sample/        local-only snapshots and fund/sector references for DEMO, SPLT, FLOWTEST; excluded from production builds
data/raw/           real issuer files
data/reference/     production fund reference and sector mappings
scripts/            run_pipeline.py, fetch_holdings.py, seed_db.py (Vercel build step)
index.py, vercel.json  Vercel entrypoint and build config for the API
```

## Known limitations

- Exposure uses each ETF's latest published holdings, which lag by a day or more.
- Plans ignore taxes, fees, trading costs and whole-share rounding.
- ETFs without holdings data can't be planned with; production currently loads only the committed
  issuer files in `data/raw`.
- Snapshot diffs can't see trades that reversed within the period.
- The median flow factor misreads periods where the manager changes most positions in the same direction.
- Removed holdings use the earlier price in the counterfactual.
- Split detection is a heuristic. Mergers, spin-offs and ticker reuse are not modeled.
- Sector labels are team-assigned, not an official classification.

Derived from issuer-published holdings snapshots. Not investment advice.
