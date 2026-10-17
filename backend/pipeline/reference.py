"""Reference data we maintain: data/reference/funds.csv and sectors.csv."""

import csv
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from backend.app.models import Fund, SecuritySector

REFERENCE_DIR = Path(__file__).resolve().parents[2] / "data" / "reference"


def _read(name: str) -> list[dict[str, str]]:
    with open(REFERENCE_DIR / name, newline="", encoding="utf-8-sig") as f:
        return [{k.strip(): (v or "").strip() for k, v in r.items()} for r in csv.DictReader(f)]


def read_funds() -> list[dict]:
    return [{"ticker": r["ticker"].upper(), "name": r["name"], "issuer": r["issuer"]}
            for r in _read("funds.csv")]


def read_sectors() -> dict[str, str]:
    sectors: dict[str, str] = {}
    for r in _read("sectors.csv"):
        if r["security_id"] in sectors:
            raise ValueError(f"sectors.csv lists {r['security_id']} more than once")
        sectors[r["security_id"]] = r["sector"]
    return sectors


def sync_reference(session: Session) -> None:
    """Upsert funds from funds.csv and reload security_sectors from sectors.csv."""
    existing = {f.ticker: f for f in session.scalars(select(Fund))}
    for f in read_funds():
        fund = existing.get(f["ticker"])
        if fund is None:
            session.add(Fund(**f))
        else:
            fund.name, fund.issuer = f["name"], f["issuer"]
    session.execute(delete(SecuritySector))
    session.add_all(SecuritySector(security_id=k, sector=v) for k, v in read_sectors().items())
