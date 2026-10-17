"""Register U.S.-listed ETFs from Nasdaq Trader; this does not invent holdings.

    python scripts/sync_etf_catalog.py
"""

import sys
from pathlib import Path

from sqlalchemy.orm import Session

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.app.db import get_engine, init_db  # noqa: E402
from backend.pipeline.catalog import fetch_etf_directory, sync_etf_catalog  # noqa: E402
from backend.pipeline.reference import sync_reference  # noqa: E402


def main() -> int:
    etfs = fetch_etf_directory()
    init_db()
    with Session(get_engine()) as session, session.begin():
        sync_reference(session)
        inserted, updated = sync_etf_catalog(session, etfs)
    print(f"Nasdaq ETF catalog: {len(etfs)} symbols, {inserted} inserted, {updated} updated")
    return 0


if __name__ == "__main__":
    sys.exit(main())
