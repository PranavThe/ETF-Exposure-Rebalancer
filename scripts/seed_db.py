"""Ingest data/sample and data/raw into DATABASE_URL. Safe to re-run: stored files are no-ops.

    python scripts/seed_db.py

Vercel runs this as the API project's build command (see vercel.json), so every deploy loads any
new file committed to data/raw.
"""

import os
import csv
import sys
from pathlib import Path

from sqlalchemy.orm import Session

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.pipeline.run import run_pipeline  # noqa: E402
from backend.app.db import get_engine, init_db  # noqa: E402
from backend.pipeline.catalog import sync_etf_catalog  # noqa: E402


def main() -> int:
    if os.environ.get("VERCEL") and not os.environ.get("DATABASE_URL"):
        print("DATABASE_URL is not set. Connect a Postgres database (Neon) to this Vercel project "
              "under Storage, then redeploy.", file=sys.stderr)
        return 1

    os.chdir(ROOT)  # stored source_file paths are relative to the repo root
    jobs = [(p, "sample") for p in sorted((ROOT / "data" / "sample").glob("*.csv"))]
    jobs += [(p, None) for p in sorted((ROOT / "data" / "raw").glob("*.csv"))]
    failed = 0
    for path, adapter in jobs:
        fund = path.name.split("_")[0].upper()
        result = run_pipeline(fund, path.relative_to(ROOT), adapter=adapter)
        for warning in result.warnings:
            print(f"warning: {path.name}: {warning}")
        print(result.message)
        failed += result.exit_code != 0
    if not failed:
        catalog_path = ROOT / "data" / "reference" / "etf_catalog_2026-10-17.csv"
        with catalog_path.open(newline="", encoding="utf-8") as source:
            catalog = {row["ticker"]: row["name"] for row in csv.DictReader(source)}
        init_db()
        with Session(get_engine()) as session, session.begin():
            inserted, updated = sync_etf_catalog(session, catalog)
        print(f"ETF catalog: {len(catalog)} symbols, {inserted} inserted, {updated} updated")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
