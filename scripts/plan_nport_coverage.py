"""Write eligible ETF tickers for a downloaded SEC quarter, without database writes.

    python scripts/plan_nport_coverage.py --zip data/vendor/sec/2026q3_nport.zip \
      --series-classes data/vendor/sec/investment-company-series-class-2026.csv \
      --output data/vendor/sec/eligible_2026q3.txt

Feed manageable slices of the output to ingest_nport.py --tickers-file. Ambiguous SEC mappings
and funds without a public report are omitted. This is a plan, not a holdings import.
"""

import argparse
import csv
import sys
from collections import defaultdict
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.pipeline.nport import _field, select_reports  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zip", type=Path, required=True)
    parser.add_argument("--series-classes", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)

    with (ROOT / "data/reference/etf_catalog_2026-10-17.csv").open(newline="") as source:
        catalog = {row["ticker"] for row in csv.DictReader(source)}
    mapped: dict[str, set[str]] = defaultdict(set)
    with args.series_classes.open(newline="", encoding="utf-8-sig") as source:
        for row in csv.DictReader(source):
            ticker = _field(row, "Class Ticker", "Class Ticker Symbol", "Ticker Symbol").upper()
            series_id = _field(row, "Series ID", "Series Identifier")
            if ticker in catalog and series_id:
                mapped[ticker].add(series_id)
    unique = {ticker: next(iter(ids)) for ticker, ids in mapped.items() if len(ids) == 1}
    ambiguous = {ticker for ticker, ids in mapped.items() if len(ids) > 1}
    with ZipFile(args.zip) as archive:
        reports = select_reports(archive, set(unique.values()), all_dates=False)
    available = {report.series_id for report in reports}
    eligible = sorted(ticker for ticker, series in unique.items() if series in available)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text("\n".join(eligible) + "\n", encoding="utf-8")
    print(f"Catalog: {len(catalog)}; uniquely mapped: {len(unique)}; "
          f"ambiguous: {len(ambiguous)}; public reports: {len(eligible)}; "
          f"eligible list: {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
