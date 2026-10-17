"""Ingest selected ETF holdings from a downloaded SEC N-PORT quarter.

    python scripts/ingest_nport.py --zip data/vendor/sec/2026q3_nport.zip \
      --series-classes data/vendor/sec/investment-company-series-class-2026.csv \
      --tickers VOO,VTI,SPY
"""

import argparse
import sys
from pathlib import Path
from zipfile import ZipFile

from sqlalchemy import select
from sqlalchemy.orm import Session

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.app.db import get_engine, init_db  # noqa: E402
from backend.app.models import EtfCatalogEntry, Fund  # noqa: E402
from backend.pipeline.adapters.base import ValidationError  # noqa: E402
from backend.pipeline.load import load_snapshot  # noqa: E402
from backend.pipeline.nport import (extract_holdings, extract_identifiers, read_series_classes,
                                    select_reports, validated_report_rows)  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zip", type=Path, required=True, help="SEC quarterly N-PORT ZIP")
    parser.add_argument("--series-classes", type=Path, required=True, help="SEC series/class CSV")
    parser.add_argument("--tickers", required=True, help="comma-separated ETF tickers")
    parser.add_argument("--all-dates", action="store_true", help="all public dates in this quarter")
    args = parser.parse_args(argv)
    tickers = {ticker.strip().upper() for ticker in args.tickers.split(",") if ticker.strip()}
    if not tickers:
        parser.error("--tickers must include at least one symbol")

    init_db()
    with Session(get_engine()) as session:
        known_funds = set(session.scalars(select(Fund.ticker)))
        catalog = set(session.scalars(select(EtfCatalogEntry.ticker)))
    unsupported = sorted(tickers - catalog)
    for ticker in unsupported:
        print(f"unavailable: {ticker} is not in the ETF catalog", file=sys.stderr)
    tickers &= catalog
    if not tickers:
        return 1
    series_classes = read_series_classes(args.series_classes, tickers)
    unmapped = sorted(tickers - set(series_classes))
    for ticker in unmapped:
        print(f"unavailable: {ticker} has no SEC series/class mapping", file=sys.stderr)
    if not series_classes:
        return 1

    with ZipFile(args.zip) as archive:
        reports = select_reports(archive, {item.series_id for item in series_classes.values()},
                                 all_dates=args.all_dates)
        holdings = extract_holdings(archive, reports)
        identifiers = extract_identifiers(archive, holdings)

    by_series = {}
    for report in reports:
        by_series.setdefault(report.series_id, []).append(report)
    failed = len(unsupported) + len(unmapped)
    inserted = already = 0
    for ticker, identity in sorted(series_classes.items()):
        matched = by_series.get(identity.series_id, [])
        if not matched:
            print(f"unavailable: {ticker} has no public report in {args.zip.name}", file=sys.stderr)
            failed += 1
        for report in matched:
            try:
                rows, warnings = validated_report_rows(
                    report, ticker, holdings[report.accession], identifiers, known_funds)
            except (ValidationError, ValueError) as exc:
                print(f"rejected: {ticker} {report.as_of_date}: {exc}", file=sys.stderr)
                failed += 1
                continue
            accession_path = report.accession.replace("-", "")
            source_url = (f"https://www.sec.gov/Archives/edgar/data/{identity.cik}/"
                          f"{accession_path}/" if identity.cik != "0" else "")
            with Session(get_engine()) as session, session.begin():
                result = load_snapshot(
                    session, fund=ticker, rows=rows,
                    source_file=f"{args.zip.name}#{report.accession}",
                    source_url=source_url, replace=False,
                )
            if result.outcome == "inserted":
                inserted += 1
            elif result.outcome == "duplicate_noop":
                already += 1
            else:
                print(f"conflict: {ticker} {report.as_of_date} already has a different snapshot; "
                      "no source was replaced", file=sys.stderr)
                failed += 1
            for warning in warnings:
                print(f"warning: {ticker} {report.as_of_date}: {warning}", file=sys.stderr)
    print(f"N-PORT: {inserted} inserted, {already} already present, {failed} unavailable or rejected")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
