"""Reference data we maintain: data/reference/funds.csv, sectors.csv and name_sectors.csv."""

import csv
from datetime import date
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.models import Fund, SecuritySector

REFERENCE_DIR = Path(__file__).resolve().parents[2] / "data" / "reference"


def _read(name: str) -> list[dict[str, str]]:
    with open(REFERENCE_DIR / name, newline="", encoding="utf-8-sig") as f:
        return [{k.strip(): (v or "").strip() for k, v in r.items()} for r in csv.DictReader(f)]


def read_funds() -> list[dict]:
    rows = _read("funds.csv")
    return [{"ticker": r["ticker"].upper(), "name": r["name"], "issuer": r["issuer"]}
            for r in rows]


def read_sectors() -> dict[str, str]:
    sectors: dict[str, str] = {}
    rows = _read("sectors.csv")
    for r in rows:
        if r["security_id"] in sectors:
            raise ValueError(f"sectors.csv lists {r['security_id']} more than once")
        sectors[r["security_id"]] = r["sector"]
    return sectors


def read_name_sectors() -> dict[str, str]:
    """Normalized company name -> sector, from name_sectors.csv (scripts/build_name_sectors.py).

    Read-only reference for the planner; never loaded into the database. Empty if the file is missing.
    """
    if not (REFERENCE_DIR / "name_sectors.csv").exists():
        return {}
    return {r["normalized_name"]: r["sector"] for r in _read("name_sectors.csv")
            if r["normalized_name"] and r["sector"]}


def read_expense_ratios() -> dict[str, dict]:
    """ETF ticker -> {"expense_ratio": fraction a year, "as_of": date or None, "source_url": str},
    from expense_ratios.csv (scripts/fetch_expense_ratios.py). Empty if the file is missing."""
    if not (REFERENCE_DIR / "expense_ratios.csv").exists():
        return {}
    return {r["ticker"].upper(): {"expense_ratio": float(r["expense_ratio"]),
                                  "as_of": date.fromisoformat(r["as_of"]) if r["as_of"] else None,
                                  "source_url": r["source_url"]}
            for r in _read("expense_ratios.csv") if r["ticker"] and r["expense_ratio"]}


# iShares files of foreign stocks, whose tickers are local exchange codes: COR is Cencora in New
# York and Corticeira Amorim in Lisbon. Their tickers only fill gaps left by U.S. listings.
NON_US_SOURCES = frozenset({"EFA", "IEFA", "IEMG", "IXUS", "EWC"})


def read_ticker_sectors() -> dict[str, str]:
    """Stock ticker (letters and digits only, upper case) -> sector, from name_sectors.csv.

    A ticker listed by a U.S. fund takes that row's sector. A ticker seen only in foreign-stock
    files is used when all of those rows agree on the sector.
    """
    if not (REFERENCE_DIR / "name_sectors.csv").exists():
        return {}
    us: dict[str, str] = {}
    foreign: dict[str, set[str]] = {}
    for r in _read("name_sectors.csv"):
        if not (r.get("ticker") and r["sector"]):
            continue
        symbol = normalize_symbol(r["ticker"])
        if set(r.get("funds", "").split()) <= NON_US_SOURCES:
            foreign.setdefault(symbol, set()).add(r["sector"])
        else:
            us[symbol] = r["sector"]
    out = {symbol: next(iter(sectors)) for symbol, sectors in foreign.items() if len(sectors) == 1}
    out.update(us)
    return out


def normalize_symbol(ticker: str) -> str:
    """'BRK.B', 'BRK/B' and 'brkb' all become 'BRKB'."""
    return "".join(c for c in ticker.upper() if c.isalnum())


def sync_reference(session: Session) -> None:
    """Upsert maintained production fund and sector references."""
    existing = {f.ticker: f for f in session.scalars(select(Fund))}
    for f in read_funds():
        fund = existing.get(f["ticker"])
        if fund is None:
            session.add(Fund(**f))
        else:
            fund.name, fund.issuer = f["name"], f["issuer"]
    existing_sectors = {row.security_id: row for row in session.scalars(select(SecuritySector))}
    for security_id, sector in read_sectors().items():
        if security_id in existing_sectors:
            existing_sectors[security_id].sector = sector
        else:
            session.add(SecuritySector(security_id=security_id, sector=sector))


def read_company_tickers() -> tuple[dict[str, str], dict[str, str]]:
    """(normalized company name -> ticker, ticker -> company name) from name_sectors.csv, with the
    same rule as read_ticker_sectors: a U.S. listing wins over a foreign code with the same letters."""
    by_name: dict[str, str] = {}
    names: dict[str, str] = {}
    if not (REFERENCE_DIR / "name_sectors.csv").exists():
        return by_name, names
    rows = [r for r in _read("name_sectors.csv") if r.get("ticker")]
    for r in sorted(rows, key=lambda r: not set(r.get("funds", "").split()) <= NON_US_SOURCES):
        symbol = normalize_symbol(r["ticker"])
        by_name[r["normalized_name"]] = symbol
        names[symbol] = r["name"]
    return by_name, names
