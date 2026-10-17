"""Trim strings, uppercase tickers, fill in prices and synthetic security ids."""

from .adapters.base import Row


def security_id_for(row: Row) -> str:
    raise NotImplementedError


def normalize(rows: list[Row]) -> list[Row]:
    raise NotImplementedError
