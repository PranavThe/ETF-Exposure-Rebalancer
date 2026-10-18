"""U.S.-listed ETF symbols from Nasdaq Trader's public symbol directories."""

import csv
import io
from urllib.request import Request, urlopen

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.models import EtfCatalogEntry, Fund, utcnow

NASDAQ_LISTED = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt"
OTHER_LISTED = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt"


def etfs_from_directory(text: str, *, other_listed: bool) -> dict[str, str]:
    """Return ticker -> name for real ETF rows, excluding the creation-time footer."""
    reader = csv.DictReader(io.StringIO(text), delimiter="|")
    symbol_column = "ACT Symbol" if other_listed else "Symbol"
    required = {symbol_column, "Security Name", "ETF", "Test Issue"}
    if not required.issubset(reader.fieldnames or []):
        raise ValueError(f"Nasdaq directory is missing {sorted(required - set(reader.fieldnames or []))}")
    etfs = {}
    for row in reader:
        ticker = (row.get(symbol_column) or "").strip().upper()
        if row.get("ETF") != "Y" or row.get("Test Issue") != "N":
            continue
        if not ticker or len(ticker) > 16:
            continue
        etfs[ticker] = (row.get("Security Name") or ticker).strip()[:200]
    return etfs


def fetch_etf_directory(timeout: int = 30) -> dict[str, str]:
    """Fetch Nasdaq-listed and other U.S.-exchange-listed ETFs; no API key required."""
    combined = {}
    for url, other_listed in ((NASDAQ_LISTED, False), (OTHER_LISTED, True)):
        request = Request(url, headers={"User-Agent": "FundShift/0.1"})
        with urlopen(request, timeout=timeout) as response:
            content = response.read().decode("utf-8-sig")
        combined.update(etfs_from_directory(content, other_listed=other_listed))
    if not combined:
        raise ValueError("Nasdaq symbol directories returned no ETFs")
    return combined


def sync_etf_catalog(session: Session, etfs: dict[str, str]) -> tuple[int, int]:
    """Register ETFs for search and portfolio selection without claiming holdings exist."""
    existing = {fund.ticker: fund for fund in session.scalars(select(Fund))}
    catalog = {entry.ticker: entry for entry in session.scalars(select(EtfCatalogEntry))}
    inserted = updated = 0
    seen_at = utcnow()
    for ticker, name in etfs.items():
        fund = existing.get(ticker)
        if fund is None:
            session.add(Fund(ticker=ticker, name=name, issuer=""))
            inserted += 1
        elif fund.issuer == "Synthetic":
            fund.name, fund.issuer = name, ""
            updated += 1
        elif not fund.issuer and fund.name != name:
            fund.name = name
            updated += 1
        if ticker not in catalog:
            session.add(EtfCatalogEntry(ticker=ticker, last_seen_at=seen_at))
        else:
            catalog[ticker].last_seen_at = seen_at
    return inserted, updated
