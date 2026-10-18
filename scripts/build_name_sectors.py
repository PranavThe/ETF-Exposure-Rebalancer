"""Write data/reference/name_sectors.csv: normalized company name -> sector, from iShares files.

    python scripts/build_name_sectors.py [--vendor-dir data/vendor/ishares] [--output ...]

SEC N-PORT holdings carry a CUSIP and a company name but no sector. iShares holdings files carry a
GICS-style sector per equity row, so their names, normalized with
backend.analytics.names.normalize_company_name, give the planner a sector for most N-PORT rows.

Input files are iShares `latest-holdings.csv` downloads named <FUND>_<date>.csv (the cache in
data/vendor/ishares is gitignored; the output is committed). Files without equity rows (bond
funds) are skipped. A name whose rows disagree on the sector is left out and listed on stdout:
that only happens when different companies share a name (EQT Corp and EQT AB).
"""

import argparse
import csv
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.analytics.names import normalize_company_name  # noqa: E402
from backend.analytics.rebalance import CASH_OTHER, SECTORS, UNCLASSIFIED, canonical_sector  # noqa: E402
from backend.pipeline.adapters.base import ValidationError  # noqa: E402
from backend.pipeline.adapters.ishares import IsharesAdapter  # noqa: E402

VENDOR_DIR = ROOT / "data" / "vendor" / "ishares"
OUTPUT = ROOT / "data" / "reference" / "name_sectors.csv"
COLUMNS = ["normalized_name", "sector", "ticker", "name", "funds"]
REAL_SECTORS = set(SECTORS) - {CASH_OTHER, UNCLASSIFIED}


def build(paths: list[Path]) -> tuple[list[dict], list[str], list[str]]:
    """(output rows sorted by name, conflict descriptions, skipped-file messages)."""
    by_key: dict[str, list[tuple[float, str, str, str, str]]] = defaultdict(list)
    skipped = []
    for path in paths:
        fund = path.name.split("_")[0].upper()
        try:
            rows = IsharesAdapter().read(path, fund)
        except ValidationError as e:
            skipped.append(str(e))
            continue
        equity = [r for r in rows if r.asset_class == "equity"]
        if not equity:
            skipped.append(f"{path.name}: no equity rows")
            continue
        for r in equity:
            key = normalize_company_name(r.name)
            sector = canonical_sector(r.source_sector)
            if key and sector in REAL_SECTORS:
                by_key[key].append((r.market_value or 0.0, sector, r.ticker, r.name, fund))

    out, conflicts = [], []
    for key in sorted(by_key):
        entries = by_key[key]
        sectors = {e[1] for e in entries}
        if len(sectors) > 1:
            names = sorted({f"{e[3]} ({e[2] or '-'}, {e[4]}): {e[1]}" for e in entries})
            conflicts.append(f"{key!r}: " + "; ".join(names))
            continue
        _, sector, ticker, name, _ = max(entries, key=lambda e: e[0])
        funds = " ".join(sorted({e[4] for e in entries}))
        out.append({"normalized_name": key, "sector": sector, "ticker": ticker, "name": name,
                    "funds": funds})
    return out, conflicts, skipped


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--vendor-dir", type=Path, default=VENDOR_DIR)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args(argv)

    paths = sorted(args.vendor_dir.glob("*.csv"))
    if not paths:
        print(f"no iShares files in {args.vendor_dir}", file=sys.stderr)
        return 1
    rows, conflicts, skipped = build(paths)
    for message in skipped:
        print(f"skipped {message}")
    for message in conflicts:
        print(f"left out (sectors disagree) {message}")
    if not rows:
        print("no equity rows found", file=sys.stderr)
        return 1
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    print(f"wrote {len(rows)} names from {len(paths) - len(skipped)} files to {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
