"""Equity positions and weight vectors."""

from dataclasses import dataclass
from typing import Iterable, Mapping


@dataclass(frozen=True)
class Position:
    security_id: str
    ticker: str
    name: str
    shares: float
    price: float | None
    market_value: float
    source_sector: str | None = None


def equity_positions(rows: Iterable[Mapping]) -> dict[str, Position]:
    """Equity rows keyed by security_id. Cash and other rows are dropped."""
    raise NotImplementedError


def cash_weight(rows: Iterable[Mapping]) -> float:
    """Cash market value over the total market value of all rows."""
    raise NotImplementedError


def normalize(values: Mapping[str, float]) -> dict[str, float]:
    """Divide each value by the total so the result sums to 1."""
    raise NotImplementedError
