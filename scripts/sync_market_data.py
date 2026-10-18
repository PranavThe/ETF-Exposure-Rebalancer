"""Sync selected TickerInside ETF holdings and their Alpaca IEX daily prices.

    python scripts/sync_market_data.py --funds VOO,QQQ,VTI
    python scripts/sync_market_data.py --portfolio-funds

Credentials are read only from the backend environment. This command is intended for a controlled
daily job; it does not change the existing SEC/N-PORT import path.
"""

import argparse
import os
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sqlalchemy import func, inspect, select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from backend.app.db import (get_engine, init_db,
                            migrate_provider_holding_ticker)  # noqa: E402
from backend.app.models import (Fund, Holding, Portfolio, PortfolioFund, ProviderHolding,
                                ProviderHoldingsSnapshot, Snapshot)  # noqa: E402
from backend.pipeline.alpaca import (AlpacaError, fetch_daily_bars,
                                     priceable_stock_symbols,
                                     save_daily_bars)  # noqa: E402
from backend.pipeline.tickerinside import (ProviderError, ProviderNotCovered, fetch_fund,
                                           save_fund)  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--funds", help="comma-separated ETF tickers to refresh")
    source.add_argument("--portfolio-funds", action="store_true",
                        help="refresh distinct funds used by saved portfolios")
    parser.add_argument("--start", type=date.fromisoformat,
                        help="first price-bar date (default: 14 calendar days before today)")
    parser.add_argument("--end", type=date.fromisoformat,
                        help="inclusive price-bar end date (default: today)")
    parser.add_argument("--plan-only", action="store_true",
                        help="fetch TickerInside coverage and count symbols without saving or calling Alpaca")
    args = parser.parse_args(argv)
    today = date.today()
    start = args.start or today - timedelta(days=14)
    end = args.end or today
    if start > end:
        parser.error("--start must not be after --end")
    if (not args.plan_only and
            (not os.environ.get("ALPACA_API_KEY_ID") or not os.environ.get("ALPACA_API_SECRET_KEY"))):
        parser.error("Set ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY in the backend environment")

    if args.portfolio_funds:
        if not args.plan_only:
            init_db()
            migrate_provider_holding_ticker()
        with Session(get_engine()) as session:
            tickers = sorted(session.scalars(
                select(Fund.ticker).join(PortfolioFund, PortfolioFund.fund_id == Fund.id)
                .join(Portfolio, Portfolio.id == PortfolioFund.portfolio_id).distinct()
            ))
    else:
        tickers = sorted({item.strip().upper() for item in args.funds.split(",") if item.strip()})
    if not tickers:
        if args.portfolio_funds:
            print("No saved portfolio funds; nothing to sync")
            return 0
        parser.error("provide at least one fund ticker")

    if not args.plan_only:
        init_db()  # creates the additive provider tables; leaves existing SEC tables intact
        migrate_provider_holding_ticker()
    failures = 0
    fetched = {}
    for ticker in tickers:
        try:
            data = fetch_fund(ticker)
            fetched[ticker] = data
            if args.plan_only:
                state = "fetched for preflight"
            else:
                with Session(get_engine()) as session, session.begin():
                    _, inserted = save_fund(session, data)
                state = "stored" if inserted else "already current"
            print(f"TickerInside {ticker}: {state}, holdings date {data['as_of_date']}, "
                  f"{len(data['holdings'])} tickers, layer {data['source_layer']}")
        except ProviderError as exc:
            print(f"unavailable: {exc}", file=sys.stderr)
            if not isinstance(exc, ProviderNotCovered):
                failures += 1

    # Use the latest stored holdings as the price-universe fallback when a provider refresh fails.
    with Session(get_engine()) as session:
        latest = {}
        inspector = inspect(session.get_bind())
        if (inspector.has_table(ProviderHoldingsSnapshot.__tablename__)
                and inspector.has_table(ProviderHolding.__tablename__)):
            for snapshot in session.scalars(
                select(ProviderHoldingsSnapshot)
                .where(ProviderHoldingsSnapshot.provider == "tickerinside",
                       ProviderHoldingsSnapshot.fund_ticker.in_(tickers))
                .order_by(ProviderHoldingsSnapshot.fund_ticker,
                          ProviderHoldingsSnapshot.as_of_date.desc(),
                          ProviderHoldingsSnapshot.fetched_at.desc())
            ):
                latest.setdefault(snapshot.fund_ticker, snapshot)
        provider_holdings_by_fund = ({
            ticker: set(session.scalars(select(ProviderHolding.ticker).where(
                ProviderHolding.snapshot_id == snapshot.id
            )))
            for ticker, snapshot in latest.items()
        } if latest else {})
        provider_dates = {ticker: snapshot.as_of_date for ticker, snapshot in latest.items()}
        for ticker, data in fetched.items():
            if ticker not in provider_dates or data["as_of_date"] >= provider_dates[ticker]:
                provider_holdings_by_fund[ticker] = set(data["holdings"])
        symbols = set(tickers)
        symbols.update(symbol for holdings in provider_holdings_by_fund.values()
                       for symbol in holdings)
        if inspector.has_table(Snapshot.__tablename__) and inspector.has_table(Holding.__tablename__):
            latest_sec_dates = (select(Snapshot.fund_id,
                                       func.max(Snapshot.as_of_date).label("latest_date"))
                                .join(Fund, Fund.id == Snapshot.fund_id)
                                .where(Fund.ticker.in_(tickers))
                                .group_by(Snapshot.fund_id).subquery())
            symbols.update(session.scalars(
                select(Holding.ticker).join(Snapshot, Snapshot.id == Holding.snapshot_id)
                .join(latest_sec_dates,
                      (Snapshot.fund_id == latest_sec_dates.c.fund_id)
                      & (Snapshot.as_of_date == latest_sec_dates.c.latest_date))
                .where(Holding.ticker != "")
            ))
    if args.plan_only:
        provider_rows = sum(len(holdings) for holdings in provider_holdings_by_fund.values())
        print(f"Preflight: {len(tickers)} selected funds; TickerInside coverage for "
              f"{len(fetched)}; {provider_rows} provider holdings rows across latest snapshots; "
              f"{len(symbols)} unique price symbols; requested price window {start} through {end}.")
        print("No holdings or prices were saved, and no Alpaca request was made.")
        return 1 if failures else 0
    if not symbols:
        print("No stored TickerInside holdings available to price", file=sys.stderr)
        return 1

    price_symbols = priceable_stock_symbols(symbols)
    skipped_symbols = symbols - price_symbols
    if skipped_symbols:
        print(f"Skipping {len(skipped_symbols)} non-stock holding identifiers in Alpaca request")
    if not price_symbols:
        print("No priceable U.S. stock symbols available", file=sys.stderr)
        return 1

    try:
        bars = fetch_daily_bars(price_symbols, start=start, end=end)
    except AlpacaError as exc:
        print(f"Alpaca price refresh failed: {exc}", file=sys.stderr)
        return 1
    with Session(get_engine()) as session, session.begin():
        upserted = save_daily_bars(session, bars)
    returned_symbols = {bar["ticker"] for bar in bars}
    missing = sorted(price_symbols - returned_symbols)
    print(f"Alpaca IEX: received {len(bars)} daily bars for {len(returned_symbols)} of "
          f"{len(price_symbols)} requested symbols; upserted {upserted} bars")
    if missing:
        print("no IEX daily bar in requested window: " + ", ".join(missing[:40])
              + (" …" if len(missing) > 40 else ""), file=sys.stderr)
    return 1 if failures or not bars else 0


if __name__ == "__main__":
    sys.exit(main())
