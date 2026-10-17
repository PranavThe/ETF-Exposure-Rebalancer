"""Trim strings, uppercase tickers, fill in prices and synthetic security ids."""

from dataclasses import replace

from .adapters.base import Row


def security_id_for(row: Row) -> str:
    """The issuer's id when present, else CASH:<ticker or USD>, OTHER:<name> or TICKER:<ticker>."""
    sid = row.security_id.strip()
    if sid:
        return sid
    ticker = row.ticker.strip().upper()
    if row.asset_class == "cash":
        return f"CASH:{ticker or 'USD'}"
    if row.asset_class == "other":
        return f"OTHER:{' '.join(row.name.upper().split())}"
    return f"TICKER:{ticker}"


def normalize(rows: list[Row]) -> list[Row]:
    out = []
    for r in rows:
        price = r.price
        if price is None and r.shares and r.shares > 0:
            price = r.market_value / r.shares
        out.append(replace(
            r,
            fund=r.fund.strip().upper(),
            security_id=security_id_for(r),
            ticker=r.ticker.strip().upper(),
            name=r.name.strip(),
            asset_class=r.asset_class.strip().lower(),
            source_sector=(r.source_sector or "").strip() or None,
            price=price,
        ))
    return out
