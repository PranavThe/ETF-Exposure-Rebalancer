from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_session
from ..models import Fund, ProviderHolding, ProviderHoldingsSnapshot, SecurityPrice, Snapshot
from backend.pipeline.tickerinside import ProviderError, ProviderNotCovered, fetch_fund, save_fund

router = APIRouter(prefix="/provider-data")


def _rows(session: Session, snapshot_id: int) -> dict[str, float]:
    return dict(session.execute(select(ProviderHolding.ticker, ProviderHolding.weight)
                                .where(ProviderHolding.snapshot_id == snapshot_id)).all())


@router.post("/funds/{ticker}/sync")
def sync_tickerinside_fund(ticker: str, session: Session = Depends(get_session)):
    """Fetch a fund's TickerInside holdings on first use and persist them in Neon."""
    ticker = ticker.strip().upper()
    fund = session.scalar(select(Fund).where(Fund.ticker == ticker))
    if fund is None:
        raise HTTPException(404, f"unknown fund {ticker}")

    existing = session.scalar(
        select(ProviderHoldingsSnapshot)
        .where(ProviderHoldingsSnapshot.provider == "tickerinside",
               ProviderHoldingsSnapshot.fund_ticker == ticker)
        .order_by(ProviderHoldingsSnapshot.as_of_date.desc(),
                  ProviderHoldingsSnapshot.fetched_at.desc())
        .limit(1)
    )
    if existing is not None:
        count = session.scalar(select(func.count(ProviderHolding.id)).where(
            ProviderHolding.snapshot_id == existing.id)) or 0
        return {"fund": ticker, "status": "already_available",
                "as_of_date": existing.as_of_date, "holdings_count": count}

    try:
        data = fetch_fund(ticker, timeout=8)
    except ProviderNotCovered:
        sec_snapshot = session.scalar(select(Snapshot.id).where(
            Snapshot.fund_id == fund.id).limit(1))
        return {"fund": ticker, "status": "not_covered",
                "fallback_available": sec_snapshot is not None}
    except ProviderError:
        sec_snapshot = session.scalar(select(Snapshot.id).where(
            Snapshot.fund_id == fund.id).limit(1))
        return {"fund": ticker, "status": "unavailable",
                "fallback_available": sec_snapshot is not None}

    snapshot, _ = save_fund(session, data)
    session.commit()
    count = session.scalar(select(func.count(ProviderHolding.id)).where(
        ProviderHolding.snapshot_id == snapshot.id)) or 0
    return {"fund": ticker, "status": "fetched", "as_of_date": snapshot.as_of_date,
            "holdings_count": count}


@router.get("/funds/{ticker}/holdings")
def latest_provider_holdings(ticker: str, session: Session = Depends(get_session)):
    """Weight-only TickerInside snapshot and changes from the previous source date."""
    ticker = ticker.upper()
    snapshots = list(session.scalars(select(ProviderHoldingsSnapshot).where(
        ProviderHoldingsSnapshot.provider == "tickerinside",
        ProviderHoldingsSnapshot.fund_ticker == ticker,
    ).order_by(ProviderHoldingsSnapshot.as_of_date.desc(),
               ProviderHoldingsSnapshot.fetched_at.desc()).limit(1)))
    if not snapshots:
        raise HTTPException(404, f"no TickerInside holdings stored for {ticker}")
    current = snapshots[0]
    previous = session.scalar(select(ProviderHoldingsSnapshot).where(
        ProviderHoldingsSnapshot.provider == "tickerinside",
        ProviderHoldingsSnapshot.fund_ticker == ticker,
        ProviderHoldingsSnapshot.as_of_date < current.as_of_date,
    ).order_by(ProviderHoldingsSnapshot.as_of_date.desc(),
               ProviderHoldingsSnapshot.fetched_at.desc()).limit(1))
    current_rows = _rows(session, current.id)
    previous_rows = _rows(session, previous.id) if previous else {}
    current_tickers, previous_tickers = set(current_rows), set(previous_rows)
    return {
        "fund": ticker,
        "provider": current.provider,
        "name": current.fund_name,
        "snapshot": {
            "as_of_date": current.as_of_date,
            "source_layer": current.source_layer,
            "source_url": current.source_url,
            "cite_as": current.cite_as,
            "fetched_at": current.fetched_at,
            "content_hash": current.content_hash,
        },
        "previous_as_of_date": previous.as_of_date if previous else None,
        "holdings": [{"ticker": symbol, "weight": weight}
                     for symbol, weight in sorted(current_rows.items(), key=lambda item: -item[1])],
        "entered": [{"ticker": symbol, "weight": current_rows[symbol]}
                    for symbol in sorted(current_tickers - previous_tickers)],
        "no_longer_reported": [{"ticker": symbol, "previous_weight": previous_rows[symbol]}
                                for symbol in sorted(previous_tickers - current_tickers)],
        "changed_weights": [{"ticker": symbol, "previous_weight": previous_rows[symbol],
                             "weight": current_rows[symbol],
                             "change": current_rows[symbol] - previous_rows[symbol]}
                            for symbol in sorted(current_tickers & previous_tickers)
                            if current_rows[symbol] != previous_rows[symbol]],
        "change_note": "Snapshot differences indicate reporting changes; they do not prove portfolio activity.",
    }


@router.get("/prices")
def daily_prices(symbols: str = Query(min_length=1), as_of: date | None = None,
                 start: date | None = None, end: date | None = None,
                 session: Session = Depends(get_session)):
    """Return stored Alpaca IEX daily bars. Prices are never fetched during a user request."""
    requested = sorted({item.strip().upper() for item in symbols.split(",") if item.strip()})
    if not requested or len(requested) > 500:
        raise HTTPException(422, "provide between 1 and 500 comma-separated symbols")
    if as_of and (start or end):
        raise HTTPException(422, "as_of cannot be combined with start or end")
    if start and end and start > end:
        raise HTTPException(422, "start must not be after end")

    filters = (
        SecurityPrice.provider == "alpaca",
        SecurityPrice.feed == "iex",
        SecurityPrice.adjustment == "all",
        SecurityPrice.ticker.in_(requested),
    )
    if as_of:
        query = select(SecurityPrice).where(*filters, SecurityPrice.as_of_date == as_of)
    elif start or end:
        query = select(SecurityPrice).where(*filters)
        if start:
            query = query.where(SecurityPrice.as_of_date >= start)
        if end:
            query = query.where(SecurityPrice.as_of_date <= end)
    else:
        latest = (select(SecurityPrice.ticker,
                         func.max(SecurityPrice.as_of_date).label("latest_date"))
                  .where(*filters).group_by(SecurityPrice.ticker).subquery())
        query = select(SecurityPrice).join(
            latest,
            (SecurityPrice.ticker == latest.c.ticker)
            & (SecurityPrice.as_of_date == latest.c.latest_date),
        ).where(*filters)
    rows = session.scalars(query.order_by(SecurityPrice.as_of_date.desc(), SecurityPrice.ticker))
    return {"provider": "alpaca", "feed": "iex", "adjustment": "all", "prices": [
        {"ticker": row.ticker, "as_of_date": row.as_of_date,
         "open": row.open, "high": row.high, "low": row.low, "close": row.close,
         "volume": row.volume, "fetched_at": row.fetched_at}
        for row in rows
    ]}
