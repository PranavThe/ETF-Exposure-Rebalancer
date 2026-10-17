"""The adapter interface: one class per issuer file format."""

from dataclasses import dataclass
from datetime import date
from pathlib import Path


@dataclass
class Row:
    """One holding as read from a file, in fractions. Empty source cells are None."""

    row_number: int  # line number in the source file; the header is line 1
    as_of_date: date | None
    fund: str
    security_id: str
    ticker: str
    name: str
    asset_class: str
    source_sector: str | None
    shares: float | None
    price: float | None
    market_value: float | None
    reported_weight: float | None


class ValidationError(Exception):
    def __init__(self, file: str, row: int | None, field: str | None, message: str):
        self.file, self.row, self.field, self.message = file, row, field, message
        super().__init__(str(self))

    def __str__(self) -> str:
        parts = [self.file]
        if self.row is not None:
            parts.append(f"row {self.row}")
        if self.field:
            parts.append(self.field)
        return ": ".join(parts + [self.message])


class Adapter:
    name: str
    weight_unit: str  # "percent" or "fraction"; read() always returns fractions
    source_url: str = ""

    def read(self, path: Path) -> list[Row]:
        raise NotImplementedError
