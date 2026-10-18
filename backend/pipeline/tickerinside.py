"""Fetch and persist dated, weight-only ETF holdings from TickerInside."""

import hashlib
import json
import math
from datetime import date
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.models import ProviderHolding, ProviderHoldingsSnapshot

API_ROOT = "https://tickerinside.com/api/v1"


class ProviderError(RuntimeError):
    pass


class ProviderNotCovered(ProviderError):
    """The provider has no holdings file for this ETF."""


def fetch_fund(ticker: str, *, timeout: int = 30) -> dict:
    ticker = ticker.strip().upper()
    url = f"{API_ROOT}/fund/{ticker.lower()}.json"
    request = Request(url, headers={"User-Agent": "Glean/1.0"})
    try:
        with urlopen(request, timeout=timeout) as response:
            payload = json.load(response)
    except HTTPError as exc:
        if exc.code == 404:
            raise ProviderNotCovered(f"TickerInside has no holdings record for {ticker}") from exc
        raise ProviderError(f"TickerInside returned HTTP {exc.code} for {ticker}") from exc
    except (URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise ProviderError(f"Could not fetch TickerInside holdings for {ticker}: {exc}") from exc

    if not isinstance(payload, dict) or not isinstance(payload.get("holdings"), dict):
        raise ProviderError(f"TickerInside response for {ticker} has no holdings map")
    if str(payload.get("ticker", ticker)).upper() != ticker:
        raise ProviderError(f"TickerInside returned {payload.get('ticker')} for requested fund {ticker}")
    try:
        as_of = date.fromisoformat(payload["holdings_as_of"])
    except (KeyError, TypeError, ValueError) as exc:
        raise ProviderError(f"TickerInside response for {ticker} has invalid holdings_as_of") from exc

    holdings = {}
    for raw_symbol, raw_weight_pct in payload["holdings"].items():
        symbol = str(raw_symbol).strip().upper()
        if not symbol:
            continue
        try:
            weight = float(raw_weight_pct) / 100.0
        except (TypeError, ValueError) as exc:
            raise ProviderError(f"Invalid weight for {ticker}/{symbol}: {raw_weight_pct!r}") from exc
        if not math.isfinite(weight) or weight < 0:
            raise ProviderError(f"Invalid weight for {ticker}/{symbol}: {raw_weight_pct!r}")
        holdings[symbol] = weight
    if not holdings:
        raise ProviderError(f"TickerInside returned no usable holding tickers for {ticker}")

    source_layer = str(payload.get("source_layer") or "unknown")
    name = str(payload.get("name") or ticker)
    cite_as = str(payload.get("cite_as") or "")
    canonical = json.dumps({"name": name, "source_layer": source_layer,
                            "cite_as": cite_as, "holdings": sorted(holdings.items())},
                           separators=(",", ":"))
    return {
        "ticker": ticker,
        "name": name,
        "as_of_date": as_of,
        "source_layer": source_layer,
        "source_url": payload.get("api_url") or f"{API_ROOT}/fund/{ticker.lower()}.json",
        "cite_as": cite_as,
        "holdings": holdings,
        "content_hash": hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
    }


def save_fund(session: Session, data: dict) -> tuple[ProviderHoldingsSnapshot, bool]:
    existing = session.scalars(select(ProviderHoldingsSnapshot).where(
        ProviderHoldingsSnapshot.provider == "tickerinside",
        ProviderHoldingsSnapshot.fund_ticker == data["ticker"],
        ProviderHoldingsSnapshot.as_of_date == data["as_of_date"],
        ProviderHoldingsSnapshot.content_hash == data["content_hash"],
    )).one_or_none()
    if existing:
        return existing, False

    snapshot = ProviderHoldingsSnapshot(
        provider="tickerinside",
        fund_ticker=data["ticker"],
        fund_name=data["name"],
        as_of_date=data["as_of_date"],
        source_layer=data["source_layer"],
        source_url=data["source_url"],
        cite_as=data["cite_as"],
        content_hash=data["content_hash"],
    )
    session.add(snapshot)
    session.flush()
    session.add_all([
        ProviderHolding(snapshot_id=snapshot.id, ticker=ticker, weight=weight)
        for ticker, weight in data["holdings"].items()
    ])
    return snapshot, True
