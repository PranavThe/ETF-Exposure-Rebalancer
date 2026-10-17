"""Extract selected ETF snapshots from the SEC's public N-PORT quarterly ZIP files.

Only explicitly requested tickers are materialized. A quarter ZIP is hundreds of MB, so the
tab-delimited members are streamed and only matching accessions are retained in memory.
"""

import csv
import io
from dataclasses import dataclass, replace
from datetime import date
from pathlib import Path
from zipfile import ZipFile

from .adapters.base import Row, ValidationError, parse_number
from .normalize import normalize
from .validate import validate

@dataclass(frozen=True)
class SeriesClass:
    ticker: str
    series_id: str
    cik: str
    series_name: str


@dataclass(frozen=True)
class Report:
    accession: str
    series_id: str
    as_of_date: date
    filing_date: date
    cash_not_reported: float
    net_assets: float | None


def _key(text: str) -> str:
    return "".join(character for character in text.upper() if character.isalnum())


def _field(row: dict[str, str], *aliases: str) -> str:
    normalized = {_key(k): (v or "").strip() for k, v in row.items() if k is not None}
    return next((normalized[_key(alias)] for alias in aliases if normalized.get(_key(alias))), "")


def _identifier(value: str) -> str:
    return "" if value.upper() in {"", "-", "N/A", "NA", "000000000"} else value


def _column(reader: csv.DictReader, name: str) -> str:
    match = next((column for column in reader.fieldnames or [] if _key(column) == _key(name)), None)
    if match is None:
        raise ValueError(f"N-PORT table is missing {name}")
    return match


def read_series_classes(path: Path, tickers: set[str]) -> dict[str, SeriesClass]:
    """Map exchange-listed tickers to SEC series IDs using the SEC series/class CSV."""
    with open(path, newline="", encoding="utf-8-sig") as source:
        reader = csv.DictReader(source)
        headers = {_key(h) for h in reader.fieldnames or []}
        if not ({"SERIESID", "SERIESIDENTIFIER"} & headers
                and {"CLASSTICKER", "CLASSTICKERSYMBOL", "TICKERSYMBOL"} & headers):
            raise ValueError("SEC series/class CSV must include Series ID and Class Ticker columns")
        found = {}
        for row in reader:
            ticker = _field(row, "Class Ticker", "Class Ticker Symbol", "Ticker Symbol").upper()
            if ticker not in tickers:
                continue
            series_id = _field(row, "Series ID", "Series Identifier")
            if not series_id:
                continue
            record = SeriesClass(
                ticker=ticker, series_id=series_id,
                cik=_field(row, "CIK Number", "CIK").lstrip("0") or "0",
                series_name=_field(row, "Series Name") or ticker,
            )
            if ticker in found and found[ticker].series_id != series_id:
                raise ValueError(f"{ticker} maps to multiple SEC series IDs")
            found[ticker] = record
        return found


def _table(archive: ZipFile, name: str):
    matches = [item for item in archive.namelist()
               if (Path(item).stem.upper() == name or Path(item).stem.upper().startswith(name + "_"))
               and Path(item).suffix.lower() in {".tsv", ".txt", ".csv"}]
    if len(matches) != 1:
        raise ValueError(f"N-PORT ZIP needs exactly one {name} table; found {matches}")
    stream = io.TextIOWrapper(archive.open(matches[0]), encoding="utf-8-sig", newline="")
    return stream, csv.DictReader(stream, delimiter="\t")


def _date(value: str, label: str) -> date:
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        parts = value.upper().split("-")
        months = {name: index for index, name in enumerate(
            ("JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"), 1)}
        if len(parts) == 3 and parts[1] in months:
            try:
                return date(int(parts[2]), months[parts[1]], int(parts[0]))
            except ValueError:
                pass
        raise ValueError(f"invalid {label} date {value!r}")


def select_reports(archive: ZipFile, series_ids: set[str], *, all_dates: bool) -> list[Report]:
    stream, reader = _table(archive, "SUBMISSION")
    with stream:
        submissions = {}
        for row in reader:
            accession = _field(row, "ACCESSION_NUMBER")
            report_date = _field(row, "REPORT_DATE")
            filing_date = _field(row, "FILING_DATE")
            if accession and report_date:
                submissions[accession] = (_date(report_date, "report"),
                                          _date(filing_date, "filing") if filing_date else date.min)

    stream, reader = _table(archive, "FUND_REPORTED_INFO")
    selected: dict[tuple[str, date], Report] = {}
    with stream:
        for row in reader:
            series_id = _field(row, "SERIES_ID")
            if series_id not in series_ids:
                continue
            accession = _field(row, "ACCESSION_NUMBER")
            if accession not in submissions:
                continue
            as_of, filed = submissions[accession]
            cash = parse_number("FUND_REPORTED_INFO", 0, "CASH_NOT_RPTD_IN_C_OR_D",
                                _field(row, "CASH_NOT_RPTD_IN_C_OR_D")) or 0.0
            net_assets = parse_number("FUND_REPORTED_INFO", 0, "NET_ASSETS",
                                      _field(row, "NET_ASSETS"))
            report = Report(accession, series_id, as_of, filed, cash, net_assets)
            key = (series_id, as_of)
            old = selected.get(key)
            if old is None or (report.filing_date, report.accession) > (old.filing_date, old.accession):
                selected[key] = report

    reports = list(selected.values())
    if not all_dates:
        latest = {}
        for report in reports:
            old = latest.get(report.series_id)
            if old is None or (report.as_of_date, report.filing_date) > (old.as_of_date, old.filing_date):
                latest[report.series_id] = report
        reports = list(latest.values())
    return sorted(reports, key=lambda r: (r.series_id, r.as_of_date))


def extract_holdings(archive: ZipFile, reports: list[Report]) -> dict[str, list[dict[str, str]]]:
    selected = {report.accession for report in reports}
    holdings = {accession: [] for accession in selected}
    stream, reader = _table(archive, "FUND_REPORTED_HOLDING")
    accession_column = _column(reader, "ACCESSION_NUMBER")
    with stream:
        for row in reader:
            accession = (row.get(accession_column) or "").strip()
            if accession in selected:
                holdings[accession].append(row)
    return holdings


def extract_identifiers(archive: ZipFile, holdings: dict[str, list[dict[str, str]]]) -> dict[str, dict]:
    ids = {_field(row, "HOLDING_ID") for rows in holdings.values() for row in rows}
    identifiers: dict[str, dict] = {}
    stream, reader = _table(archive, "IDENTIFIERS")
    holding_column = _column(reader, "HOLDING_ID")
    with stream:
        for row in reader:
            holding_id = (row.get(holding_column) or "").strip()
            if holding_id in ids:
                previous = identifiers.setdefault(holding_id, {"ticker": "", "isin": ""})
                previous["ticker"] = previous["ticker"] or _field(row, "IDENTIFIER_TICKER")
                previous["isin"] = previous["isin"] or _field(row, "IDENTIFIER_ISIN")
    return identifiers


def rows_for_report(report: Report, ticker: str, holdings: list[dict[str, str]],
                    identifiers: dict[str, dict]) -> list[Row]:
    rows = []
    for number, raw in enumerate(holdings, start=2):
        holding_id = _field(raw, "HOLDING_ID")
        identity = identifiers.get(holding_id, {})
        holding_ticker = (identity.get("ticker") or "").upper()
        cusip = _identifier(_field(raw, "ISSUER_CUSIP"))
        isin = _identifier(identity.get("isin") or "")
        security_id = cusip or isin or (f"TICKER:{holding_ticker}" if holding_ticker else f"NPORT:{holding_id}")
        name = _field(raw, "ISSUER_TITLE", "ISSUER_NAME")
        balance = parse_number("FUND_REPORTED_HOLDING", number, "BALANCE", _field(raw, "BALANCE"))
        market_value = parse_number("FUND_REPORTED_HOLDING", number, "CURRENCY_VALUE",
                                    _field(raw, "CURRENCY_VALUE"))
        percentage = parse_number("FUND_REPORTED_HOLDING", number, "PERCENTAGE",
                                  _field(raw, "PERCENTAGE"))
        asset_code = _field(raw, "ASSET_CAT").upper()
        unit = _field(raw, "UNIT").upper()
        payoff = _field(raw, "PAYOFF_PROFILE").lower()
        if (asset_code in {"EC", "EP"} and unit in {"NS", "SH"}
                and payoff != "short" and balance is not None and balance >= 0):
            asset_class = "equity"
        elif asset_code == "STIV":
            asset_class = "cash"
        else:
            asset_class = "other"
        rows.append(Row(
            row_number=number, as_of_date=report.as_of_date, fund=ticker,
            security_id=security_id[:100], ticker=holding_ticker[:32],
            name=name, asset_class=asset_class, source_sector=None,
            shares=balance if balance is not None else 0.0,
            price=None, market_value=market_value,
            reported_weight=percentage / 100 if percentage is not None else None,
        ))

    if report.cash_not_reported:
        rows.append(Row(
            row_number=len(rows) + 2, as_of_date=report.as_of_date, fund=ticker,
            security_id="CASH:USD:UNREPORTED", ticker="", name="Cash not reported in holdings",
            asset_class="cash", source_sector=None, shares=0.0, price=None,
            market_value=report.cash_not_reported,
            reported_weight=(report.cash_not_reported / report.net_assets
                             if report.net_assets and report.net_assets > 0 else None),
        ))

    if not rows:
        raise ValidationError("FUND_REPORTED_HOLDING", None, None,
                              f"no holdings for {ticker} {report.as_of_date}")
    combined = {}
    for row in rows:
        old = combined.get(row.security_id)
        if old is None:
            combined[row.security_id] = row
            continue
        if old.asset_class != row.asset_class:
            raise ValidationError("FUND_REPORTED_HOLDING", row.row_number, "ISSUER_CUSIP",
                                  f"security id {row.security_id} describes different holdings")
        if old.market_value is None or row.market_value is None:
            raise ValidationError("FUND_REPORTED_HOLDING", row.row_number, "CURRENCY_VALUE",
                                  "duplicate holding has a missing value")
        weight = (old.reported_weight + row.reported_weight
                  if old.reported_weight is not None and row.reported_weight is not None else None)
        combined[row.security_id] = replace(
            old, ticker=old.ticker or row.ticker, shares=old.shares + row.shares,
            market_value=old.market_value + row.market_value,
            reported_weight=weight,
        )
    return normalize(list(combined.values()))


def validated_report_rows(report: Report, ticker: str, holdings: list[dict[str, str]],
                          identifiers: dict[str, dict], known_funds: set[str]) -> tuple[list[Row], list[str]]:
    rows = rows_for_report(report, ticker, holdings, identifiers)
    warnings = validate(rows, file=f"N-PORT {report.accession}", fund=ticker,
                        known_funds=known_funds, columns={
                            "as_of_date": "REPORT_DATE", "shares": "BALANCE",
                            "market_value": "CURRENCY_VALUE", "reported_weight": "PERCENTAGE",
                            "security_id": "ISSUER_CUSIP", "asset_class": "ASSET_CAT",
                        })
    return rows, warnings
