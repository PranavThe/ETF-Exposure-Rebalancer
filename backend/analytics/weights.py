"""Equity positions and weight vectors."""

from dataclasses import dataclass
from typing import Iterable, Mapping


@dataclass(frozen=True)
class Position:
    security_id: str
    ticker: str
    name: str
    shares: float
    price: float
    market_value: float
    source_sector: str | None = None


def equity_positions(rows: Iterable[Mapping]) -> dict[str, Position]:
    """Equity rows keyed by security_id. Cash, other and zero-share rows are dropped."""
    positions: dict[str, Position] = {}
    for r in rows:
        if r.get("asset_class", "equity") != "equity":
            continue
        shares = float(r["shares"])
        if shares <= 0:
            continue
        market_value = float(r["market_value"])
        price = r.get("price")
        sid = r["security_id"]
        if sid in positions:
            raise ValueError(f"duplicate security_id {sid}")
        positions[sid] = Position(
            security_id=sid,
            ticker=r.get("ticker") or "",
            name=r.get("name") or "",
            shares=shares,
            price=float(price) if price is not None else market_value / shares,
            market_value=market_value,
            source_sector=r.get("source_sector") or None,
        )
    return positions


def cash_weight(rows: Iterable[Mapping]) -> float:
    """Cash market value over the total market value of all rows."""
    total = cash = 0.0
    for r in rows:
        total += float(r["market_value"])
        if r.get("asset_class") == "cash":
            cash += float(r["market_value"])
    return cash / total if total else 0.0


def normalize(values: Mapping[str, float]) -> dict[str, float]:
    """Divide each value by the total so the result sums to 1."""
    total = sum(values.values())
    return {k: (v / total if total else 0.0) for k, v in values.items()}
