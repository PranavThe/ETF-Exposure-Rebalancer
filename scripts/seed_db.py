"""Ingest production holdings and optionally local sample fixtures into DATABASE_URL.

Vercel runs this as the API project's build command (see vercel.json), so every deploy loads any
new file committed to data/raw. Synthetic fixtures are excluded by default; pass
--include-samples for a local demo only.
"""

import os
import csv
import sys
import argparse
from pathlib import Path

from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.pipeline.run import run_pipeline  # noqa: E402
from backend.app.db import get_engine, init_db  # noqa: E402
from backend.pipeline.catalog import sync_etf_catalog  # noqa: E402
from backend.app.models import (Fund, Holding, ImportLog, PortfolioFund, SecuritySector,
                                Snapshot)  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--include-samples", action="store_true",
                        help="also ingest synthetic fixtures (for local demos only)")
    args = parser.parse_args(argv)

    if os.environ.get("VERCEL") and not os.environ.get("DATABASE_URL"):
        print("DATABASE_URL is not set. Connect a Postgres database (Neon) to this Vercel project "
              "under Storage, then redeploy.", file=sys.stderr)
        return 1

    os.chdir(ROOT)  # stored source_file paths are relative to the repo root
    if not args.include_samples:
        purge_sample_data()
    jobs = []
    if args.include_samples:
        jobs.extend((p, "sample") for p in sorted((ROOT / "data" / "sample").glob("*.csv"))
                    if p.name not in {"funds.csv", "sectors.csv"})
    jobs.extend((p, None) for p in sorted((ROOT / "data" / "raw").glob("*.csv")))
    failed = 0
    for path, adapter in jobs:
        fund = path.name.split("_")[0].upper()
        result = run_pipeline(fund, path.relative_to(ROOT), adapter=adapter,
                              include_samples=args.include_samples)
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


def purge_sample_data() -> None:
    """Remove previously seeded local fixtures from production snapshots and reference data."""
    init_db()
    with Session(get_engine()) as session, session.begin():
        synthetic_fund_ids = select(Fund.id).where(Fund.issuer == "Synthetic")
        sample_snapshot_ids = select(Snapshot.id).where(or_(
            Snapshot.source_file.like("data/sample/%"),
            Snapshot.source_file.like("%/data/sample/%"),
            Snapshot.fund_id.in_(synthetic_fund_ids),
        ))
        session.execute(delete(ImportLog).where(or_(
            ImportLog.source_file.like("data/sample/%"),
            ImportLog.source_file.like("%/data/sample/%"),
            ImportLog.fund_id.in_(synthetic_fund_ids),
        )))
        session.execute(delete(Holding).where(Holding.snapshot_id.in_(sample_snapshot_ids)))
        removed_snapshots = session.execute(delete(Snapshot).where(or_(
            Snapshot.source_file.like("data/sample/%"),
            Snapshot.source_file.like("%/data/sample/%"),
            Snapshot.fund_id.in_(synthetic_fund_ids),
        )))
        with (ROOT / "data" / "sample" / "sectors.csv").open(
                newline="", encoding="utf-8") as source:
            sample_sector_ids = [row["security_id"] for row in csv.DictReader(source)]
        if sample_sector_ids:
            session.execute(delete(SecuritySector).where(
                SecuritySector.security_id.in_(sample_sector_ids)))

        portfolio_fund_ids = select(PortfolioFund.fund_id)
        snapshot_fund_ids = select(Snapshot.fund_id)
        import_log_fund_ids = select(ImportLog.fund_id).where(ImportLog.fund_id.is_not(None))
        removed_funds = session.execute(delete(Fund).where(
            Fund.issuer == "Synthetic", Fund.id.not_in(portfolio_fund_ids),
            Fund.id.not_in(snapshot_fund_ids), Fund.id.not_in(import_log_fund_ids)))
        print("Removed previously seeded local fixtures: "
              f"{removed_snapshots.rowcount or 0} snapshots and "
              f"{removed_funds.rowcount or 0} unreferenced synthetic funds")


if __name__ == "__main__":
    sys.exit(main())
