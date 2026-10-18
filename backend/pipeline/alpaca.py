"""Download and upsert Alpaca daily stock bars for a symbol batch."""

import json
import os
import re
from datetime import date, datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from sqlalchemy import insert
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from backend.app.models import SecurityPrice

API_ROOT = "https://data.alpaca.markets/v2/stocks/bars"
ASSETS_API_ROOT = "https://paper-api.alpaca.markets/v2/assets"
MAX_SYMBOLS_PER_REQUEST = 100
FEED = "iex"
ADJUSTMENT = "all"
_STOCK_SYMBOL = re.compile(r"^[A-Z0-9][A-Z0-9.-]{0,5}$")


class AlpacaError(RuntimeError):
    pass


def priceable_stock_symbols(symbols: set[str]) -> set[str]:
    """Keep short U.S. equity symbols; ignore provider labels and fixed-income IDs."""
    normalized = {symbol.strip().upper() for symbol in symbols if symbol.strip()}
    return {symbol for symbol in normalized
            if _STOCK_SYMBOL.fullmatch(symbol) and any(char.isalpha() for char in symbol)}


def fetch_supported_stock_symbols(symbols: set[str]) -> set[str]:
    """Return candidate symbols present in Alpaca's active U.S. equity universe.

    Holdings providers can report international listings (for example ``1.HK``).
    Alpaca rejects an entire multi-symbol bars request if it contains one unsupported
    symbol, so validate candidates against Alpaca before batching price requests.
    """
    candidates = priceable_stock_symbols(symbols)
    if not candidates:
        return set()
    api_key = os.environ.get("ALPACA_API_KEY_ID")
    api_secret = os.environ.get("ALPACA_API_SECRET_KEY")
    if not api_key or not api_secret:
        raise AlpacaError("Set ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY in the backend environment")
    request = Request(
        f"{ASSETS_API_ROOT}?{urlencode({'status': 'active', 'asset_class': 'us_equity'})}",
        headers={
            "APCA-API-KEY-ID": api_key,
            "APCA-API-SECRET-KEY": api_secret,
            "Accept": "application/json",
        },
    )
    try:
        with urlopen(request, timeout=45) as response:
            payload = json.load(response)
    except HTTPError as exc:
        message = exc.read().decode("utf-8", "replace")[:400]
        raise AlpacaError(f"Alpaca asset lookup returned HTTP {exc.code}: {message}") from exc
    except (URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise AlpacaError(f"Could not fetch Alpaca asset list: {exc}") from exc
    if not isinstance(payload, list):
        raise AlpacaError("Alpaca asset lookup returned an unexpected response")
    supported = {asset.get("symbol", "").upper() for asset in payload
                 if isinstance(asset, dict) and asset.get("status") == "active"
                 and asset.get("class") == "us_equity"}
    return candidates & supported


def _get_bars(symbols: list[str], *, start: date, end: date, api_key: str,
              api_secret: str, timeout: int = 45) -> list[dict]:
    params = {
        "symbols": ",".join(symbols),
        "timeframe": "1Day",
        "start": start.isoformat(),
        "end": end.isoformat(),
        "feed": FEED,
        "adjustment": ADJUSTMENT,
        "limit": 10000,
    }
    bars = []
    page_token = None
    while True:
        query = dict(params)
        if page_token:
            query["page_token"] = page_token
        request = Request(
            f"{API_ROOT}?{urlencode(query)}",
            headers={
                "APCA-API-KEY-ID": api_key,
                "APCA-API-SECRET-KEY": api_secret,
                "Accept": "application/json",
            },
        )
        try:
            with urlopen(request, timeout=timeout) as response:
                payload = json.load(response)
        except HTTPError as exc:
            message = exc.read().decode("utf-8", "replace")[:400]
            raise AlpacaError(f"Alpaca returned HTTP {exc.code}: {message}") from exc
        except (URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise AlpacaError(f"Could not fetch Alpaca daily bars: {exc}") from exc

        data = payload.get("bars", {})
        for ticker, ticker_bars in data.items():
            for bar in ticker_bars:
                try:
                    bar_date = datetime.fromisoformat(bar["t"].replace("Z", "+00:00")).date()
                    bars.append({
                        "ticker": ticker.upper(),
                        "as_of_date": bar_date,
                        "open": float(bar["o"]),
                        "high": float(bar["h"]),
                        "low": float(bar["l"]),
                        "close": float(bar["c"]),
                        "volume": float(bar["v"]),
                    })
                except (KeyError, TypeError, ValueError) as exc:
                    raise AlpacaError(f"Invalid daily bar for {ticker}: {bar!r}") from exc
        page_token = payload.get("next_page_token")
        if not page_token:
            break
    return bars


def fetch_daily_bars(symbols: set[str], *, start: date, end: date) -> list[dict]:
    api_key = os.environ.get("ALPACA_API_KEY_ID")
    api_secret = os.environ.get("ALPACA_API_SECRET_KEY")
    if not api_key or not api_secret:
        raise AlpacaError("Set ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY in the backend environment")
    normalized = sorted(priceable_stock_symbols(symbols))
    bars = []
    for offset in range(0, len(normalized), MAX_SYMBOLS_PER_REQUEST):
        bars.extend(_get_bars(normalized[offset:offset + MAX_SYMBOLS_PER_REQUEST], start=start,
                              end=end, api_key=api_key, api_secret=api_secret))
    return bars


def save_daily_bars(session: Session, bars: list[dict]) -> int:
    if not bars:
        return 0
    fetched_at = datetime.now(timezone.utc)
    values = [{"provider": "alpaca", "feed": FEED, "adjustment": ADJUSTMENT,
               "ticker": bar["ticker"], "as_of_date": bar["as_of_date"],
               **{key: bar[key] for key in ("open", "high", "low", "close", "volume")},
               "fetched_at": fetched_at} for bar in bars]
    dialect = session.get_bind().dialect.name
    if dialect == "postgresql":
        statement = postgres_insert(SecurityPrice)
    elif dialect == "sqlite":
        statement = sqlite_insert(SecurityPrice)
    else:
        session.execute(insert(SecurityPrice), values)
        return len(values)
    statement = statement.on_conflict_do_update(
        index_elements=[SecurityPrice.provider, SecurityPrice.feed, SecurityPrice.adjustment,
                        SecurityPrice.ticker, SecurityPrice.as_of_date],
        set_={key: getattr(statement.excluded, key)
              for key in ("open", "high", "low", "close", "volume", "fetched_at")},
    )
    session.execute(statement, values)
    return len(values)
