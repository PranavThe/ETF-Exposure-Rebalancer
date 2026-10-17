# ETF data sources and ingestion

FundShift separates a **searchable ETF catalog** from **holdings coverage**. A listed ETF may
have no holdings snapshot. Its portfolio row remains `missing` until a complete source file is
ingested. This makes a broad selection UI possible without claiming unsupported analysis.

## Sources in this branch

| Source | Use | Official reference |
|---|---|---|
| Nasdaq Trader symbol directories | Register U.S.-listed ETF tickers and names for search | [field definitions](https://www.nasdaqtrader.com/trader.aspx?id=symboldirdefs) |
| SEC N-PORT public data sets | Dated holdings, values, balances, fund and security identifiers | [quarterly ZIPs](https://www.sec.gov/data-research/sec-markets-data/form-n-port-data-sets), [data dictionary](https://www.sec.gov/files/nport_readme.pdf) |
| SEC series/class report | Connect ETF tickers to N-PORT series IDs | [yearly CSVs](https://www.sec.gov/data-research/sec-markets-data/investment-company-series-class-information) |
| iShares latest holdings CSV | Fresher holdings, values, weights, and issuer sectors for supported iShares funds | [example product page](https://www.ishares.com/us/products/239726/ishares-core-sp-500-etfUSdollars) |
| ARK issuer CSV | Existing ARKK adapter | [existing source URL](https://assets.ark-funds.com/fund-documents/funds-etf-csv/ARK_INNOVATION_ETF_ARKK_HOLDINGS.csv) |

The dated Nasdaq catalog CSV in `data/reference` is loaded by `scripts/seed_db.py` during an API
build. SEC and issuer holdings remain **offline data operations**. Set `DATABASE_URL` to the
intended database before running them.
Without it, they use the local SQLite database. Do not point them at Neon until the team is ready
to populate the shared database. The SEC source downloads are large and are ignored by Git.

### 1. Register ETF symbols

```bash
python scripts/sync_etf_catalog.py
```

This reads Nasdaq's `nasdaqlisted.txt` and `otherlisted.txt`, keeps rows marked `ETF=Y` and
`Test Issue=N`, and upserts tickers into `funds` plus `etf_catalog`. `GET /etfs/search?q=...`
returns up to 100 matching entries. Existing curated fund names and issuers are preserved. The
catalog may contain ETFs that N-PORT does not cover (for example, some commodity trusts).
The committed catalog snapshot has 5,787 symbols as of 2026-10-17; refresh it deliberately as
listings change. The existing Discover view requests only 24 funds with loaded snapshots, while
the portfolio picker searches the full catalog.

### 2. Ingest SEC history for selected ETFs

Download an official quarter and the SEC's series/class CSV. The SEC asks automated clients to
identify a real contact in the User-Agent and [limit request rates](https://www.sec.gov/about/webmaster-frequently-asked-questions).

```bash
export SEC_USER_AGENT='FundShift your-real-contact@example.com'
python scripts/download_sec_data.py --quarter 2026q3 --series-year 2026
python scripts/ingest_nport.py \
  --zip data/vendor/sec/2026q3_nport.zip \
  --series-classes data/vendor/sec/investment-company-series-class-2026.csv \
  --tickers VOO,VTI,QQQ,TLT
```

`--all-dates` ingests each publicly available report date in that ZIP; the default ingests the
latest report for each selected series. Run older quarters in date order to build history.
The importer streams the large holdings and identifier tables, stores only requested fund rows,
and chooses the latest filing or amendment for each series and report date. It rejects bad or
unsupported snapshots rather than silently dropping positions. SEC `CURRENCY_VALUE` is in USD;
`PERCENTAGE` is converted to a fraction. Cash explicitly reported outside the holdings schedule
is added as a separately labeled cash row.

If automated SEC downloads return HTTP 403, download the two files from the linked SEC pages in
a normal browser and place them at the paths above. The importer accepts those local files.
The SEC series/class report can lag new ETF listings; such tickers remain searchable with no SEC
mapping until another source is available.

To plan broader coverage from downloaded files, run `scripts/plan_nport_coverage.py` with the
same `--zip` and `--series-classes` inputs plus `--output data/vendor/sec/eligible_2026q3.txt`.
For these 2026 Q3 files, 4,200 catalog symbols have a unique series mapping and a public report;
41 have ambiguous mappings and are excluded. Split the eligible list into manageable batches
and pass each batch to `ingest_nport.py --tickers-file <path>`. The plan does not write to the
database. Verify `DATABASE_URL` before importing into Neon; the checked-out branch currently
does not include a Neon connection or Vercel project link.

### 3. Add fresher iShares snapshots

```bash
python scripts/ingest_ishares.py --ticker IVV \
  --url https://www.ishares.com/us/products/239726/ishares-core-s-p-500-etfUSdollars
```

Pass an official product page or `latest-holdings.csv` URL. The script saves the downloaded file
under ignored `data/vendor/ishares/` and records the source URL in the snapshot. It does not
replace a different snapshot on the same date unless `--replace-existing` is explicitly passed.
The iShares CSV does not contain CUSIPs, so its equity holdings use ticker-based IDs; SEC and ARK
usually have CUSIPs. Cross-source overlap should be matched only when a security identity can be
established confidently. Until then, unresolved IDs should remain separate.

## Source limits and selection

The portfolio API selects the newest stored date separately for each fund. It never merges rows
from two sources into one snapshot. N-PORT is broad and historical but delayed; issuer files can
be fresher but differ by issuer. N-PORT does not provide a standard equity sector field, so those
positions may show `Unknown` unless a maintained reference sector mapping resolves them.

Some products hold derivatives, debt, collateral, or other assets. N-PORT rows outside supported
long equity and cash are kept as `other` so their value remains visible. The current price/activity
comparison was designed for long equity positions; applying it across source changes or complex
instruments requires additional validation. A fund with an incomplete or incompatible report is
reported unavailable rather than treated as a complete holdings snapshot.

State Street publishes full holdings workbooks, but the inspected workbook provides weight and
share count without per-holding market value. It is deliberately not converted to artificial
market values for the existing decomposition pipeline. A weight-only ingestion path could be
added later with an explicit data-quality flag and analytics support.
