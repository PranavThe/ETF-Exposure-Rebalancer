<p align="center">
  <img src="frontend/public/brand/glean-logo.png" alt="Glean" width="320" />
</p>

<h1 align="center">ETF exposure, made clear.</h1>

<p align="center">
  See what you really own. Choose the mix you want.<br />
  Work out the moves to get there.
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#api">API</a> ·
  <a href="#deploy-on-vercel">Deployment</a> ·
  <a href="#documentation">Documentation</a>
</p>

---

**Glean** is a portfolio planner that looks inside your ETFs. Enter the dollars you hold in
each fund, see your combined sector exposure, and compare ways to reach a target mix you set.
Your holdings, sector sliders, suggested moves, and Scythe, the assistant, share one workspace.

> You choose the exposure. Glean does the math.

| Understand your portfolio | Set your target | Compare the moves |
| --- | --- | --- |
| See sector exposure across your ETFs, with holdings dates and missing-data indicators. | Adjust sliders or describe a change, such as “less tech, more health care.” | Rearrange what you own or introduce new ETFs, using the money already in your portfolio. |

**Built with** Next.js · React · TypeScript · Tailwind CSS · FastAPI · SQLAlchemy

## Quick start

**Requirements:** Python 3.11+, Node.js 20.9+, npm, and Make.

```bash
git clone https://github.com/PranavThe/ETF-Exposure-Rebalancer.git
cd ETF-Exposure-Rebalancer
make setup
```

Start the API with the bundled demo data:

```bash
# Terminal 1 — recreate the local demo database and start the API
DATABASE_URL=sqlite:///./fundshift.db make demo
```

```bash
# Terminal 2 — from the repository root
make web
```

Open **[the planner](http://localhost:3000/app)**, the
[landing page](http://localhost:3000), or the [interactive API docs](http://localhost:8000/docs).

> [!IMPORTANT]
> `make demo` deletes and recreates the database selected by `DATABASE_URL`, including saved
> portfolios. The command above explicitly selects the local `fundshift.db` file.
> Use `make api` to restart the API with existing data instead.

Setup downloads dependencies. After setup, the bundled demo works without external data services
or API keys; the assistant uses its built-in rule-based reader when no Anthropic key is set.

### Try the workflow

1. **Add your ETFs.** Search by ticker and enter a dollar amount, or select **Try an example portfolio**.
2. **Choose a sector mix.** Move the sliders, or ask Scythe for “no energy” or “30% financials.”
   Untouched sectors adjust so the target stays at 100%.
3. **Compare plans.** Below the sector mix, **Suggested moves** shows plans that rearrange
   your existing ETFs or add new ones. **New ETFs up to** limits how many funds a plan may introduce.
   Plans use the money already in your ETFs; edit a holding’s dollar amount to plan with more or less.
4. **Explore the result.** Each plan shows the proposed moves and distance to your target in
   percentage points (pp). **Use these amounts** updates the portfolio in the app.
5. **Come back later.** Changes save automatically. The `/app?p=<id>` URL reopens the portfolio;
   editing requires the key stored in the creating browser. Editing a shared link saves a copy.

> [!NOTE]
> Bundled holdings cover **ARKK** and the synthetic **DEMO**, **SPLT**, and **FLOWTEST** fixtures.
> The example always loads **IVV $6,000 / IYW $3,000 / ARKK $1,000**. When a fund is added, the
> app tries a bounded TickerInside lookup if it has no stored provider snapshot. IVV and IYW
> remain flagged if that lookup is unavailable and you have not imported issuer/SEC holdings.
> For a fresh demo, add ARKK to inspect exposure. Import eligible ETFs to explore additional
> plans; synthetic funds are never suggested.
> See [ETF data sources](docs/etf-sources.md) for ingestion instructions.

## How it works

| Step | What Glean computes |
| --- | --- |
| **Look inside each ETF** | Groups positive issuer/SEC holding market values by sector, or uses reported TickerInside weights when that stored snapshot is newer. |
| **Combine your exposure** | Blends available ETFs' sector mixes in proportion to your dollar amounts. Funds without data remain visible and are excluded from the planner's mix and moves. |
| **Apply your target** | Uses the sector mix you choose with sliders or Scythe. The assistant translates your request into numbers. |
| **Build plans** | Finds allocations using your existing portfolio total, either within your current ETFs or with a limited number of new funds. |
| **Show the difference** | Reports whole-dollar moves and the distance between the resulting mix and your target. |

All weights in the API and database are **fractions**: `0.07` means 7%. The interface shows levels
as percentages and differences as percentage points. Distance is half the sum of absolute sector
weight differences: 0 means identical mixes; 1 means no overlap.

<details>
<summary><strong>Planner rules and sector classification</strong></summary>

- **Classification:** issuer and SEC holdings use the maintained security-sector mapping, then
  the issuer's label, then the company-name reference, then a matching security's sector in an
  allowlisted ETF. Remaining gaps appear as **Unclassified**. Non-equity issuer/SEC rows appear
  as **Cash & other**. Provider weights use ticker-sector mappings from stored holdings and
  reference data (a U.S. listing wins over a foreign local code with the same letters); unknown
  symbols remain unclassified.
- **Source selection:** the planner uses the latest issuer/SEC snapshot unless stored
  TickerInside data is the only available source, or is strictly newer and classifies as much of
  the fund (or at least 80% of it). It reports the selected source and date for each fund.
- **Eligible additions:** new ETFs come from `SUGGESTABLE_ETFS` and must be at least 80%
  classified. Funds you already hold outside the allowlist can be kept or reduced, but never
  increased. Synthetic fixtures are never suggested.
- **Optimization:** a bounded least-squares problem balances closeness to the target with a
  small preference for smaller moves. New ETFs are considered one at a time and must improve
  distance by at least 0.5 pp each. Any rearrangement that improves the match can be shown,
  even by less than 0.5 pp. The planner prunes small positions using a 1% threshold, rounds
  amounts to whole dollars, and omits unchanged or duplicate plans.
- **Scythe, the assistant:** with `ANTHROPIC_API_KEY`, `/chat` uses the model configured in
  [`backend/app/assistant.py`](backend/app/assistant.py). Without a key, or when a supported API
  error occurs, a rule-based reader handles requests such as “less tech,” “no energy,” or
  “30% financials.” Scythe changes the target mix only; requests to add or withdraw money prompt
  you to edit your holdings. Sliders work independently of the assistant.

The planner's formulas, allowlist, and thresholds live in
[`backend/analytics/rebalance.py`](backend/analytics/rebalance.py). The local
[methodology page](http://localhost:3000/methodology) explains the calculations in the app.

</details>

## Data and coverage

**A searchable ticker does not guarantee holdings coverage.** The committed catalog contains
5,787 ETF symbols as of October 17, 2026; it is separate from the holdings in your database.

| Source | Role | Included in the local demo? |
| --- | --- | --- |
| Nasdaq symbol catalog | ETF search and selection | Yes — dated catalog snapshot |
| ARK issuer CSV | ARKK holdings with shares and market values | Yes — October 16, 2026 snapshot |
| Synthetic fixtures | Repeatable pipeline and analytics examples | Yes — DEMO, SPLT, FLOWTEST |
| iShares issuer CSVs | Holdings and issuer sector labels | No — import separately |
| SEC N-PORT | Historical reported holdings | No — download and import separately |
| TickerInside + Alpaca IEX | Provider holdings weights and stored daily price bars | No — provider lookup can run when a fund is added; a configured weekday sync refreshes holdings and prices |

Production seeding loads the catalog and files in `data/raw/`, excludes `data/sample/`, and removes
previously seeded synthetic snapshots. Provider weights and prices are stored separately from
the share-count snapshots used for holdings-change analysis.

<details>
<summary><strong>Ingest a holdings file</strong></summary>

From the repository root, after `make setup`:

```bash
# Import a bundled fixture
.venv/bin/python scripts/run_pipeline.py \
  --fund DEMO \
  --file data/sample/demo_2026-10-01.csv \
  --adapter sample

# Import the committed issuer snapshot
.venv/bin/python scripts/run_pipeline.py \
  --fund ARKK \
  --file data/raw/ARKK_2026-10-16.csv

# Fetch a new ARKK file; the script prints its dated output path
.venv/bin/python scripts/fetch_holdings.py --fund ARKK
```

Import the newly fetched path with `scripts/run_pipeline.py --fund ARKK --file <path>`.
Ingestion commands use `DATABASE_URL`, defaulting to the local SQLite database.
Available adapters are `sample`, `ark`, and `ishares`; ARKK and local fixtures have defaults,
while other funds require an explicit adapter.

| Outcome | Exit code | Meaning |
| --- | --- | --- |
| `inserted` | 0 | New fund/date stored |
| `duplicate_noop` | 0 | Identical normalized content already exists |
| `replaced` | 0 | `--replace` replaced a stored snapshot |
| `conflict_rejected` | 2 | Different content exists for this date; review before using `--replace` |
| `invalid_rejected` | 1 | Invalid input; the error identifies the problem |

Content hashes use normalized rows, so raw whitespace, column order, and number formatting do not
create new snapshots. Imports record outcomes in `import_log`.
ARK downloads contain the latest available holdings only; collect files on different trading days
to build history. See [ETF data sources](docs/etf-sources.md) for iShares and SEC workflows, and
[provider market data](docs/provider-market-data.md) for TickerInside and Alpaca setup.

</details>

## API

The full request and response schemas are available at **[localhost:8000/docs](http://localhost:8000/docs)**
when the API is running.

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Database status, fund count, issuer/SEC snapshot count, and deployed commit |
| `GET /etfs/search?q=IVV` | Search registered ETFs and inspect data availability |
| `GET /etfs/covered` | Allowlisted ETFs with data, plus marked local fixtures |
| `POST /plan` | Calculate sector exposure and plans for dollar-based holdings |
| `POST /chat` | Translate a message into a target mix with Scythe |
| `POST /portfolios` | Create an anonymous portfolio and receive its edit key |
| `GET /portfolios/{id}/analysis` | Aggregate holdings, overlap, sectors, and coverage |

For example, inspect ARKK's exposure after starting the demo:

```bash
curl --fail-with-body http://localhost:8000/plan \
  -H 'Content-Type: application/json' \
  -d '{"holdings":[{"ticker":"ARKK","amount":1000}]}'
```

Add `target` as a sector-to-fraction object to request plans. `cash_change` is positive for
contributions and negative for withdrawals; `max_new_funds` defaults to 2 and accepts 0–5.
The current app always sends `cash_change: 0`; contributions and withdrawals remain available
through the API.

<details>
<summary><strong>Portfolio, holdings, and provider endpoints</strong></summary>

| Endpoint | Purpose |
| --- | --- |
| `GET /funds` | List funds; optional `loaded_only`, `limit`, and `offset` |
| `GET /funds/{ticker}` | Fund metadata and data availability |
| `GET /funds/{ticker}/snapshots` | Stored issuer/SEC snapshot dates and provenance |
| `GET /funds/{ticker}/holdings?date=YYYY-MM-DD` | Stored snapshot rows with resolved sectors |
| `GET /funds/{ticker}/changes?from=YYYY-MM-DD&to=YYYY-MM-DD` | Price/activity decomposition between snapshots |
| `POST /funds/{ticker}/simulate?date=YYYY-MM-DD` | Simulate changes to a snapshot's holdings |
| `GET /portfolios/{id}` | Read a saved portfolio |
| `PUT /portfolios/{id}` | Replace its name and allocations; edit key required |
| `DELETE /portfolios/{id}` | Delete it; edit key required |
| `GET /portfolios/{id}/latest` | Latest selected holdings, sources, and coverage by fund |
| `POST /portfolios/preview` | Analyze hypothetical allocations without saving |
| `POST /portfolios/{id}/preview` | Preview changes to an existing portfolio without saving |
| `GET /portfolios/{id}/preferences` | Read the saved dollar value and target mix |
| `PUT /portfolios/{id}/preferences` | Save preferences; edit key required |
| `POST /provider-data/funds/{ticker}/sync` | Fetch TickerInside holdings on first use if none are stored |
| `GET /provider-data/funds/{ticker}/holdings` | Latest provider weights and changes from the prior source date |
| `GET /provider-data/prices?symbols=AAPL,MSFT` | Stored Alpaca IEX daily bars; optional `as_of`, `start`, or `end` |

Portfolio allocations use fractional weights that sum to 1 when nonempty; the planner uses dollar
amounts. Portfolio updates and deletes require `X-Portfolio-Edit-Key`. Anyone with a portfolio ID
can read it; the API returns the edit key only at creation. See the
[portfolio API contract](docs/portfolio-api.md) for examples.

</details>

<details>
<summary><strong>Holdings-change analysis: price effect vs. portfolio activity</strong></summary>

The original comparison engine remains available through `/funds/{ticker}/changes`; it is not part
of the current planner interface. For earlier snapshot A and later snapshot B, using equity rows:

- `w0` and `w1` are the observed weights at A and B.
- `wcf` values A's share counts at B's prices. Removed holdings use their earlier price and are
  flagged `price_estimated`; added holdings have zero counterfactual weight.
- `price_effect = wcf − w0` and `activity_effect = w1 − wcf`. Their sum equals `w1 − w0`.
- The median share-count ratio across common holdings estimates a `flow_factor` for creations
  and redemptions. Position changes use shares adjusted by this factor.
- Share ratios near common split multiples, with offsetting price moves, are treated as suspected
  corporate actions. An unchanged position affected by other positions' size changes is labeled
  **dilution**.

Cash and other non-equity rows are excluded from these equity weights and reported separately as
`cash_weight`. Thresholds and `CONFIG_VERSION` live in
[`backend/analytics/config.py`](backend/analytics/config.py). Concentration uses the top 10
holdings, except DEMO, which uses the top 2. Golden examples are defined in [SPEC.md](SPEC.md).

</details>

## Configuration

No environment variables are required for the default local setup.

| Variable | Where | Default / purpose |
| --- | --- | --- |
| `DATABASE_URL` | API and data scripts | `sqlite:///./fundshift.db`; also accepts `postgres://`, `postgresql://`, or `postgresql+psycopg://` URLs |
| `NEXT_PUBLIC_API_URL` | Frontend | `http://localhost:8000`; baked into the frontend build |
| `CORS_ORIGINS` | API | Comma-separated additional frontend origins; localhost and 127.0.0.1 on port 3000 are already allowed |
| `CORS_ORIGIN_REGEX` | API | Optional pattern for origins that vary across deployments |
| `ANTHROPIC_API_KEY` | API | Optional Claude support for Scythe; omitted by default |
| `ALPACA_API_KEY_ID`, `ALPACA_API_SECRET_KEY` | Provider sync | Optional credentials for importing Alpaca IEX prices |
| `SEC_USER_AGENT` | SEC download script | Contact identification for SEC downloads; see the data-source guide |

Set backend variables in the shell or deployment environment. For local frontend configuration,
Next.js reads `frontend/.env.local`; keep credentials out of `NEXT_PUBLIC_*` variables.
Database tables are created with SQLAlchemy `metadata.create_all`; the provider sync also includes
a targeted migration for its legacy ticker column.

## Deploy on Vercel

The repository contains configuration for **two projects**:

| Setting | API | Frontend |
| --- | --- | --- |
| Project root | Repository root (`./`) | `frontend/` |
| Entry / framework | FastAPI via `index.py` | Next.js |
| Build command | `python scripts/seed_db.py` | `npm run build` |
| Required environment | `DATABASE_URL` pointing to persistent Postgres, such as Neon | `NEXT_PUBLIC_API_URL=https://<api-domain>` |
| Cross-origin access | `CORS_ORIGINS=https://<frontend-domain>` | — |

Configure the database before the API build: the seed script rejects Vercel builds without
`DATABASE_URL`. Builds ingest committed issuer files and the ETF catalog; identical snapshots are
no-ops. On a clean database, the committed ARKK file produces one issuer snapshot.

For frontend previews, configure `CORS_ORIGIN_REGEX` on the API with a pattern restricted to your
project and team, and set `NEXT_PUBLIC_API_URL` in the frontend's Preview environment too.
Rebuild the frontend after changing its API URL. Verify the API at `/health` and the frontend at `/app`.

## Development

| Command | What it does |
| --- | --- |
| `make setup` | Create `.venv` and install Python and frontend dependencies |
| `make api` | Start FastAPI on port 8000 using existing data |
| `make web` | Start the Next.js development server on port 3000 |
| `make test` | Run the Python analytics, pipeline, and API suites |
| `make ingest-sample` | Import local synthetic fixtures |
| `make ingest-raw` | Import issuer CSVs from `data/raw/` using default adapters |
| `npm --prefix frontend run lint` | Run frontend ESLint checks |
| `npm --prefix frontend run build` | Build the frontend for production |

```text
backend/
  analytics/       Exposure, optimization, decomposition, and portfolio calculations
  app/             FastAPI routes, schemas, database models, and assistant
  pipeline/        Adapters, validation, normalization, and data loading
  tests/           Analytics, pipeline, and API tests
frontend/
  app/             Landing page (/), methodology (/methodology), and planner (/app)
  components/      Marketing site and planner interface
  lib/             API clients, portfolio helpers, and product branding
data/
  raw/             Committed issuer holdings
  reference/       ETF catalog and sector mappings
  sample/          Local synthetic fixtures
docs/              Data-source and API guides
scripts/           Data fetching, ingestion, seeding, and provider sync
```

The product name is defined in [`frontend/lib/brand.ts`](frontend/lib/brand.ts).
The default SQLite filename, `fundshift.db`, and existing deployment hostnames are retained
for compatibility with saved data and links; the product name is **Glean**.

## Documentation

| Guide | Read it for |
| --- | --- |
| [ETF data sources](docs/etf-sources.md) | Catalog refreshes, SEC imports, iShares ingestion, and source limits |
| [Provider market data](docs/provider-market-data.md) | TickerInside holdings, Alpaca IEX prices, and scheduled refreshes |
| [Portfolio API contract](docs/portfolio-api.md) | Saved portfolios, edit keys, and allocation examples |
| [Build specification](SPEC.md) | Holdings pipeline, decomposition rules, and golden test values |
| [Working conventions](CLAUDE.md) | Project commands, units, and contribution rules |
| [Frontend guidance](frontend/AGENTS.md) | Conventions for working on the Next.js app |

## Known limitations

- **Data can lag.** Coverage and dates vary by ETF and source; missing holdings stay excluded
  from the planner's calculations.
- **Plans are estimates.** They ignore taxes, fees, trading costs, and whole-share rounding.
  Available funds and plan constraints can prevent an exact match to your target.
- **Classification is incomplete.** Maintained sector mappings include team-assigned labels,
  not an official classification. Unresolved positions remain visible as unclassified.
- **Snapshot comparisons have limits.** They cannot reveal activity reversed between dates.
  The median flow estimate can misread broad position changes, removed holdings reuse earlier
  prices, and split detection is heuristic. Mergers, spin-offs, and ticker reuse are not modeled.

---

<p align="center">
  <sub>Based on dated ETF holdings. Not investment advice.</sub>
</p>
