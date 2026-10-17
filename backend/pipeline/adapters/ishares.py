"""iShares U.S. product-page `latest-holdings.csv` files.

These files have a fund/date preamble before the holdings header. The downloadable CSV has
tickers but no CUSIP column, so ticker-based security ids are used where available.
"""

import csv
from datetime import datetime
from pathlib import Path

from .base import Adapter, Row, ValidationError, parse_number

HEADER = {"Ticker", "Name", "Sector", "Asset Class", "Market Value", "Weight (%)", "Quantity", "Price"}


class IsharesAdapter(Adapter):
    name = "ishares"
    weight_unit = "percent"
    date_format = "%b %d, %Y"
    columns = {
        "as_of_date": "Fund Holdings as of", "fund": "--fund", "ticker": "Ticker",
        "name": "Name", "asset_class": "Asset Class", "source_sector": "Sector",
        "shares": "Quantity", "price": "Price", "market_value": "Market Value",
        "reported_weight": "Weight (%)",
    }

    def read(self, path: Path, fund: str | None = None) -> list[Row]:
        file = Path(path).as_posix()
        if not fund:
            raise ValidationError(file, None, "fund", "iShares files require --fund")
        try:
            source = open(path, newline="", encoding="utf-8-sig")
        except OSError as exc:
            raise ValidationError(file, None, None, f"cannot read file ({exc.strerror})")
        with source:
            reader = csv.reader(source)
            as_of = None
            header = None
            for record in reader:
                if record and record[0].strip() == "Fund Holdings as of" and len(record) > 1:
                    try:
                        as_of = datetime.strptime(record[1].strip(), self.date_format).date()
                    except ValueError:
                        raise ValidationError(file, reader.line_num, "Fund Holdings as of",
                                              f"unparseable date {record[1]!r}")
                if HEADER.issubset(record):
                    header = [cell.strip() for cell in record]
                    break
            if as_of is None or header is None:
                raise ValidationError(file, None, None, "missing holdings date or CSV header")
            rows = []
            for record in reader:
                if not record or not any(cell.strip() for cell in record):
                    continue
                cells = dict(zip(header, record))
                name = (cells.get("Name") or "").strip()
                if not name:
                    continue
                n = reader.line_num
                def number(column: str) -> float | None:
                    raw = (cells.get(column) or "").strip()
                    return parse_number(file, n, column, "" if raw == "-" else raw)

                ticker = (cells.get("Ticker") or "").strip().upper()
                if ticker == "-":
                    ticker = ""
                raw_class = (cells.get("Asset Class") or "").strip().lower()
                if raw_class == "equity":
                    asset_class = "equity"
                elif raw_class in {"cash", "money market", "cash collateral and margins"}:
                    asset_class = "cash"
                else:
                    asset_class = "other"
                shares = number("Quantity")
                market_value = number("Market Value")
                price = number("Price")
                weight = number("Weight (%)")
                if asset_class == "equity" and ticker:
                    security_id = f"TICKER:{ticker}"
                else:
                    security_id = f"ISHARES:{ticker}:{name.upper()}"[:100]
                rows.append(Row(
                    row_number=n, as_of_date=as_of, fund=fund, security_id=security_id,
                    ticker=ticker, name=name, asset_class=asset_class,
                    source_sector=(cells.get("Sector") or "").strip() or None,
                    shares=shares, price=price if asset_class == "equity" else None,
                    market_value=market_value,
                    reported_weight=weight / 100 if weight is not None else None,
                ))
            return rows
