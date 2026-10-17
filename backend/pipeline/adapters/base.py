"""The adapter interface: one class per issuer file format.

An adapter declares which source column holds each normalized field, its date format and its weight
unit. `read()` turns a file into `Row`s with weights as fractions; empty cells become None.
"""

import csv
import math
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path


@dataclass
class Row:
    """One holding as read from a file, in fractions. Empty numeric cells are None."""

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
    date_format: str
    source_url: str = ""
    # Normalized field -> source column. Every listed column must be in the header.
    columns: dict[str, str]

    def column(self, field: str) -> str:
        return self.columns.get(field, field)

    def asset_class(self, cells: dict[str, str]) -> str:
        return cells.get(self.columns.get("asset_class", ""), "").lower()

    def is_data(self, cells: dict[str, str]) -> bool:
        """False for rows to skip, such as blank lines or a disclaimer footer."""
        return any(cells.values())

    def read(self, path: Path) -> list[Row]:
        file = Path(path).as_posix()
        try:
            f = open(path, newline="", encoding="utf-8-sig")
        except OSError as e:
            raise ValidationError(file, None, None, f"cannot read file ({e.strerror})")
        with f:
            reader = csv.reader(f)
            header = [h.strip() for h in next(reader, [])]
            missing = [c for c in self.columns.values() if c not in header]
            if missing:
                raise ValidationError(file, 1, ", ".join(missing), "missing required column")
            index = {c: header.index(c) for c in self.columns.values()}
            rows = []
            for record in reader:
                cells = {c: record[i].strip() if i < len(record) else "" for c, i in index.items()}
                if self.is_data(cells):
                    rows.append(self._row(file, reader.line_num, cells))
        return rows

    def _row(self, file: str, n: int, cells: dict[str, str]) -> Row:
        def text(field: str) -> str:
            return cells.get(self.columns[field], "") if field in self.columns else ""

        def number(field: str) -> float | None:
            return parse_number(file, n, self.column(field), text(field))

        raw_date = text("as_of_date")
        weight = number("reported_weight")
        if weight is not None and self.weight_unit == "percent":
            weight /= 100
        return Row(
            row_number=n,
            as_of_date=parse_date(file, n, self.column("as_of_date"), raw_date, self.date_format)
            if raw_date else None,
            fund=text("fund"),
            security_id=text("security_id"),
            ticker=text("ticker"),
            name=text("name"),
            asset_class=self.asset_class(cells),
            source_sector=text("source_sector") or None,
            shares=number("shares"),
            price=number("price"),
            market_value=number("market_value"),
            reported_weight=weight,
        )


def parse_number(file: str, row: int, field: str, text: str) -> float | None:
    """'1,234.5', '$1,234.50', '-$12', '(12)' and '9.76%' all parse; '' is None."""
    if not text:
        return None
    cleaned = text.replace(",", "").replace("$", "").replace("%", "").strip()
    negative = cleaned.startswith("(") and cleaned.endswith(")")
    try:
        value = float(cleaned.strip("()"))
    except ValueError:
        raise ValidationError(file, row, field, f"not a number: {text!r}")
    if not math.isfinite(value):
        raise ValidationError(file, row, field, f"not a finite number: {text!r}")
    return -value if negative else value


def parse_date(file: str, row: int, field: str, text: str, fmt: str) -> date:
    try:
        return datetime.strptime(text, fmt).date()
    except ValueError:
        expected = datetime(2026, 1, 31).strftime(fmt)
        raise ValidationError(file, row, field, f"unparseable date {text!r} (expected like {expected})")
