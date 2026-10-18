"""Reference data we maintain: data/reference/funds.csv and sectors.csv."""

import csv
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.models import Fund, SecuritySector

REFERENCE_DIR = Path(__file__).resolve().parents[2] / "data" / "reference"


def _read(name: str) -> list[dict[str, str]]:
    with open(REFERENCE_DIR / name, newline="", encoding="utf-8-sig") as f:
        return [{k.strip(): (v or "").strip() for k, v in r.items()} for r in csv.DictReader(f)]


def read_funds(*, include_samples: bool = False) -> list[dict]:
    rows = _read("funds.csv")
    if include_samples:
        rows.extend(_read("../sample/funds.csv"))
    return [{"ticker": r["ticker"].upper(), "name": r["name"], "issuer": r["issuer"]}
            for r in rows]


def read_sectors(*, include_samples: bool = False) -> dict[str, str]:
    sectors: dict[str, str] = {}
    rows = _read("sectors.csv")
    if include_samples:
        rows.extend(_read("../sample/sectors.csv"))
    for r in rows:
        if r["security_id"] in sectors:
            raise ValueError(f"sectors.csv lists {r['security_id']} more than once")
        sectors[r["security_id"]] = r["sector"]
    return sectors


def sync_reference(session: Session, *, include_samples: bool = False) -> None:
    """Upsert production references and optionally local fixture references."""
    existing = {f.ticker: f for f in session.scalars(select(Fund))}
    for f in read_funds(include_samples=include_samples):
        fund = existing.get(f["ticker"])
        if fund is None:
            session.add(Fund(**f))
        else:
            fund.name, fund.issuer = f["name"], f["issuer"]
    existing_sectors = {row.security_id: row for row in session.scalars(select(SecuritySector))}
    for security_id, sector in read_sectors(include_samples=include_samples).items():
        if security_id in existing_sectors:
            existing_sectors[security_id].sector = sector
        else:
            session.add(SecuritySector(security_id=security_id, sector=sector))
