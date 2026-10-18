# FundShift — notes for Claude Code

The product is a one-screen sector-exposure tool (`/app`): the user's ETFs, their look-through
sector mix vs the mix they want, and suggested moves. SPEC.md still governs the holdings pipeline
and the change analysis behind `/funds/{ticker}/changes`, and is the source of truth for them.
Never edit a golden value (SPEC §10) to make a test pass; if one looks wrong, stop and show the arithmetic.

## Commands
- `make setup`: create `.venv`, install `requirements-dev.txt`, `npm install` in `frontend/`
  (`requirements.txt` is runtime-only: Vercel installs it for the API)
- `make test`: run pytest (`backend/tests`)
- `make ingest-sample`: ingest every `data/sample/*.csv` (rerunning prints `already ingested`)
- `make ingest-raw`: ingest every real issuer file in `data/raw/` (`make demo` runs both)
- `make api`: run the FastAPI app on :8000. `make web`: run Next.js dev server on :3000
- `make demo`: reset DB, ingest samples and raw files, start the API
- Frontend: `frontend/` (Next.js 16; see `frontend/AGENTS.md`). Check with `npm run build` and `npm run lint`.
  Site pages in `app/(site)`; the app is one page, `app/(app)/app`, built from `components/planner`
  with its API calls, saving and sector helpers in `lib/planner.ts`. Product name: `lib/brand.ts`
  (`BRAND`), never hard-coded. `useSearchParams` needs `<Suspense>`. Theme tokens in
  `app/globals.css`; don't name a colour token after a Tailwind size (`base`, `sm`, ...).
- One file: `.venv/bin/python scripts/run_pipeline.py --fund DEMO --file data/sample/demo_2026-10-01.csv [--adapter sample|ark] [--replace]`
- DB: `DATABASE_URL` (default `sqlite:///./fundshift.db`; `postgres://` maps to psycopg 3). No Alembic.
- Deploy: two Vercel projects from this repo (API at `./` via `index.py` + `vercel.json`, whose build
  runs `scripts/seed_db.py` into Neon; frontend at `frontend/`). See README "Deploy on Vercel".

## Planner
- Pure planner: `backend/analytics/rebalance.py` (sector mixes, exposure, distance, the QP solver,
  plans). Its constants (`MIN_POSITION`, `MIN_GAIN`, `SHORTLIST_SIZE`) live there.
- Routes: `POST /plan`, `GET /etfs/covered`, `GET/PUT /portfolios/{id}/preferences` (`routes/plans.py`);
  `POST /chat` (`routes/chat.py`, `app/assistant.py`). Saved portfolios reuse the weights-based
  portfolio API; the dollar value and target live in `portfolio_preferences`.
- The assistant only turns the user's words into a target mix; it never chooses one. It uses
  `claude-opus-5-5` when `ANTHROPIC_API_KEY` is set, else the rule-based reader. Tests use a fake client.
- Funds with issuer "Synthetic" (DEMO, SPLT, FLOWTEST) can be held but are never suggested.

## Units (SPEC §4)
- Every weight, exposure, drift and effect is a FRACTION in code, DB and API (0.07 = 7%).
- Only the frontend converts to % or pp. Compute in float64 and round only for display.
- Tests compare with `math.isclose(..., abs_tol=1e-9)`.
- Each adapter declares its source weight unit and converts to a fraction (ARK uses percent).

## Code rules
- `backend/analytics` is pure: no DB, network or file IO. Tests never touch the network.
- The only pipeline extension point is the adapter interface in `backend/pipeline/adapters`.
- Ask before you change units or the decomposition math, add a service, DB, queue or scheduler,
  or add a dependency not listed in SPEC §3.
- Thresholds, `TOP_N` and `CONFIG_VERSION` live in `backend/analytics/config.py`.
  DEMO uses top-2 (`TOP_N_BY_FUND`), as SPEC §10 requires; other funds use 10.

## Language rules (UI copy and event descriptions, SPEC §9)
- Never say "bought", "sold", "buy", "sell", "trade", or what the manager "believes" or "thinks".
- Never tell the user which mix or ETF they should want; the user decides, the tool does the math.
- Planner moves are "add", "increase", "reduce" and "remove" (reduce to zero).
- In the change analysis say "increased position", "decreased position", "portfolio activity".
  An increased position always means a flow-adjusted share-count change.
- Weight differences are "pp", never "%". In the change analysis every drift shows its price/activity split.
- Template: `Health Care exposure +5.0 pp (price −2.8 pp, portfolio activity +7.8 pp)`
- These rules cover caveat strings too (they appear in the UI).
- Footer on every page: "Derived from issuer-published holdings snapshots. Not investment advice."

## ARKK source file (observed 2026-10-17, saved as data/raw/ARKK_2026-10-16.csv)
- URL: https://assets.ark-funds.com/fund-documents/funds-etf-csv/ARK_INNOVATION_ETF_ARKK_HOLDINGS.csv
  (the old ark-funds.com/wp-content/... URL returns 404; the fund page has a Cloudflare challenge)
- Header: `date,fund,company,ticker,cusip,shares,market value ($),weight (%)`
- Formats: date `10/16/2026` (MM/DD/YYYY), shares `"2,065,670"`,
  market value `"$748,681,434.80"`, weight `9.76%` (percent)
- No price, sector or asset-class columns. CRLF line endings.
- The last line is a single quoted disclaimer field; skip it.
- `cusip` is always filled. `ticker` is empty for private placements (cusip `PPOPENAIC`),
  the money-market fund (`X9USDGSFT`) and warrants (`BREADUMMY`).
- Tickers can carry an exchange suffix (`RKLB UQ`).
