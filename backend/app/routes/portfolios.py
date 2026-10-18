"""Anonymous saved portfolios backed by the app's existing database."""

import hashlib
import hmac
import math
import secrets
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from backend.analytics.sectors import resolve_sector
from backend.analytics.portfolio import analyze_latest

from ..db import get_session
from ..models import (Fund, Holding, Portfolio, PortfolioFund, ProviderHolding,
                      ProviderHoldingsSnapshot, SecurityPrice, Snapshot, utcnow)
from ..portfolio_schemas import (PortfolioCreated, PortfolioIn, PortfolioLatest,
                                 PortfolioNameIn, PortfolioOut)
from .funds import sector_map, snapshot_meta

router = APIRouter(prefix="/portfolios", tags=["portfolios"])


def portfolio_or_404(session: Session, portfolio_id: str) -> Portfolio:
    portfolio = session.get(Portfolio, portfolio_id)
    if portfolio is None:
        raise HTTPException(404, "unknown portfolio")
    return portfolio


def allocations(session: Session, portfolio_id: str) -> list[tuple[PortfolioFund, Fund]]:
    return list(session.execute(
        select(PortfolioFund, Fund)
        .join(Fund, PortfolioFund.fund_id == Fund.id)
        .where(PortfolioFund.portfolio_id == portfolio_id)
        .order_by(Fund.ticker)
    ))


def portfolio_out(session: Session, portfolio: Portfolio) -> dict:
    return {
        "id": portfolio.id,
        "name": portfolio.name,
        "created_at": portfolio.created_at,
        "updated_at": portfolio.updated_at,
        "funds": [
            {"ticker": fund.ticker, "name": fund.name, "issuer": fund.issuer,
             "weight": allocation.weight}
            for allocation, fund in allocations(session, portfolio.id)
        ],
    }


def validated_funds(session: Session, body: PortfolioIn) -> list[tuple[Fund, float]]:
    if not body.name.strip():
        raise HTTPException(422, "portfolio name cannot be blank")
    tickers = [allocation.ticker.strip().upper() for allocation in body.funds]
    if any(not ticker for ticker in tickers) or len(set(tickers)) != len(tickers):
        raise HTTPException(422, "fund tickers must be nonblank and unique")
    if body.funds and not math.isclose(
        math.fsum(allocation.weight for allocation in body.funds), 1.0, rel_tol=0, abs_tol=1e-9
    ):
        raise HTTPException(422, "fund weights must sum to 1")
    funds = list(session.scalars(select(Fund).where(Fund.ticker.in_(tickers)))) if tickers else []
    by_ticker = {fund.ticker: fund for fund in funds}
    unknown = [ticker for ticker in tickers if ticker not in by_ticker]
    if unknown:
        raise HTTPException(422, f"unknown fund: {', '.join(unknown)}")
    return [(by_ticker[ticker], allocation.weight) for ticker, allocation in zip(tickers, body.funds)]


def require_edit_key(portfolio: Portfolio, edit_key: str | None) -> None:
    key_hash = hashlib.sha256((edit_key or "").encode()).hexdigest()
    if not hmac.compare_digest(key_hash, portfolio.edit_key_hash):
        raise HTTPException(403, "invalid portfolio edit key")


@router.post("", response_model=PortfolioCreated, status_code=201)
def create_portfolio(body: PortfolioIn, session: Session = Depends(get_session)):
    funds = validated_funds(session, body)
    edit_key = secrets.token_urlsafe(32)
    portfolio = Portfolio(
        id=str(uuid4()), name=body.name.strip(),
        edit_key_hash=hashlib.sha256(edit_key.encode()).hexdigest(),
    )
    session.add(portfolio)
    session.flush()
    session.add_all(PortfolioFund(portfolio_id=portfolio.id, fund_id=fund.id, weight=weight)
                    for fund, weight in funds)
    session.commit()
    return {**portfolio_out(session, portfolio), "edit_key": edit_key}


@router.get("/{portfolio_id}", response_model=PortfolioOut)
def get_portfolio(portfolio_id: str, session: Session = Depends(get_session)):
    return portfolio_out(session, portfolio_or_404(session, portfolio_id))


@router.put("/{portfolio_id}", response_model=PortfolioOut)
def replace_portfolio(
    portfolio_id: str, body: PortfolioIn,
    edit_key: str | None = Header(default=None, alias="X-Portfolio-Edit-Key"),
    session: Session = Depends(get_session),
):
    portfolio = portfolio_or_404(session, portfolio_id)
    require_edit_key(portfolio, edit_key)
    funds = validated_funds(session, body)
    session.execute(delete(PortfolioFund).where(PortfolioFund.portfolio_id == portfolio.id))
    session.add_all(PortfolioFund(portfolio_id=portfolio.id, fund_id=fund.id, weight=weight)
                    for fund, weight in funds)
    portfolio.name = body.name.strip()
    portfolio.updated_at = utcnow()
    session.commit()
    return portfolio_out(session, portfolio)


@router.patch("/{portfolio_id}", response_model=PortfolioOut)
def rename_portfolio(
    portfolio_id: str, body: PortfolioNameIn,
    edit_key: str | None = Header(default=None, alias="X-Portfolio-Edit-Key"),
    session: Session = Depends(get_session),
):
    """Rename a saved portfolio without resubmitting or replacing its allocations."""
    portfolio = portfolio_or_404(session, portfolio_id)
    require_edit_key(portfolio, edit_key)
    name = body.name.strip()
    if not name:
        raise HTTPException(422, "portfolio name cannot be blank")
    portfolio.name = name
    portfolio.updated_at = utcnow()
    session.commit()
    return portfolio_out(session, portfolio)


@router.delete("/{portfolio_id}", status_code=204)
def delete_portfolio(
    portfolio_id: str,
    edit_key: str | None = Header(default=None, alias="X-Portfolio-Edit-Key"),
    session: Session = Depends(get_session),
):
    portfolio = portfolio_or_404(session, portfolio_id)
    require_edit_key(portfolio, edit_key)
    session.execute(delete(PortfolioFund).where(PortfolioFund.portfolio_id == portfolio.id))
    session.delete(portfolio)
    session.commit()
    return Response(status_code=204)


@router.get("/{portfolio_id}/latest", response_model=PortfolioLatest)
def latest_portfolio_data(portfolio_id: str, session: Session = Depends(get_session)):
    portfolio = portfolio_or_404(session, portfolio_id)
    members = [(fund, allocation.weight) for allocation, fund in allocations(session, portfolio.id)]
    return latest_for_members(session, portfolio_out(session, portfolio), members)


def latest_for_members(session: Session, portfolio_data: dict,
                       members: list[tuple[Fund, float]]) -> dict:
    """Build the latest-holdings analysis input for stored or hypothetical allocations."""
    fund_ids = [fund.id for fund, _ in members]
    fund_tickers = [fund.ticker for fund, _ in members]
    snapshots_by_fund = {}
    holdings_by_snapshot = {}
    if fund_ids:
        latest_dates = (
            select(Snapshot.fund_id, func.max(Snapshot.as_of_date).label("as_of_date"))
            .where(Snapshot.fund_id.in_(fund_ids))
            .group_by(Snapshot.fund_id)
            .subquery()
        )
        snapshots = list(session.scalars(
            select(Snapshot).join(
                latest_dates,
                (Snapshot.fund_id == latest_dates.c.fund_id)
                & (Snapshot.as_of_date == latest_dates.c.as_of_date),
            )
        ))
        snapshots_by_fund = {snapshot.fund_id: snapshot for snapshot in snapshots}
        if snapshots:
            for holding in session.scalars(
                select(Holding).where(Holding.snapshot_id.in_(s.id for s in snapshots))
                .order_by(Holding.snapshot_id, Holding.market_value.desc())
            ):
                holdings_by_snapshot.setdefault(holding.snapshot_id, []).append(holding)

    provider_by_fund = {}
    provider_holdings = {}
    if fund_tickers:
        provider_snapshots = session.scalars(
            select(ProviderHoldingsSnapshot)
            .where(ProviderHoldingsSnapshot.provider == "tickerinside",
                   ProviderHoldingsSnapshot.fund_ticker.in_(fund_tickers))
            .order_by(ProviderHoldingsSnapshot.fund_ticker,
                      ProviderHoldingsSnapshot.as_of_date.desc(),
                      ProviderHoldingsSnapshot.fetched_at.desc())
        )
        for provider_snapshot in provider_snapshots:
            provider_by_fund.setdefault(provider_snapshot.fund_ticker, provider_snapshot)
        if provider_by_fund:
            for holding in session.scalars(
                select(ProviderHolding)
                .where(ProviderHolding.snapshot_id.in_(s.id for s in provider_by_fund.values()))
                .order_by(ProviderHolding.snapshot_id, ProviderHolding.weight.desc())
            ):
                provider_holdings.setdefault(holding.snapshot_id, []).append(holding)

    sectors = sector_map(session)
    latest_funds = []
    coverage_weight = 0.0
    for fund, weight in members:
        snapshot = snapshots_by_fund.get(fund.id)
        provider_snapshot = provider_by_fund.get(fund.ticker)
        use_provider = (provider_snapshot is not None
                        and (snapshot is None or provider_snapshot.as_of_date > snapshot.as_of_date))
        if use_provider:
            provider_rows = provider_holdings.get(provider_snapshot.id, [])
            holdings = [
                {"security_id": f"TICKER:{row.ticker}", "ticker": row.ticker,
                 "name": row.ticker, "asset_class": "equity", "source_sector": None,
                 "sector": resolve_sector(f"TICKER:{row.ticker}", None, sectors),
                 "shares": None, "price": None, "market_value": None,
                 "reported_weight": row.weight}
                for row in provider_rows
            ]
            source_provider = "tickerinside"
            source_layer = provider_snapshot.source_layer
            as_of_date = provider_snapshot.as_of_date
            snapshot_data = {
                "as_of_date": provider_snapshot.as_of_date,
                "source_url": provider_snapshot.source_url,
                "source_file": f"tickerinside:{fund.ticker}:{provider_snapshot.source_layer}",
                "content_hash": provider_snapshot.content_hash,
                "row_count": len(provider_rows),
                "ingested_at": provider_snapshot.fetched_at,
            }
        else:
            holdings = holdings_by_snapshot.get(snapshot.id, []) if snapshot is not None else []
            source_provider = (
                "sec" if snapshot is not None and "sec.gov" in snapshot.source_url.lower()
                else "issuer" if snapshot is not None else None
            )
            source_layer = None
            as_of_date = snapshot.as_of_date if snapshot is not None else None
            snapshot_data = ({**snapshot_meta(snapshot), "ingested_at": snapshot.ingested_at}
                             if snapshot is not None else None)
            holdings = [
                {"security_id": h.security_id, "ticker": h.ticker, "name": h.name,
                 "asset_class": h.asset_class, "source_sector": h.source_sector,
                 "sector": resolve_sector(h.security_id, h.source_sector, sectors),
                 "shares": h.shares, "price": h.price, "market_value": h.market_value,
                 "reported_weight": h.reported_weight}
                for h in holdings
            ]
        if snapshot is not None or use_provider:
            coverage_weight += weight
        latest_funds.append({
            "ticker": fund.ticker, "name": fund.name, "issuer": fund.issuer,
            "weight": weight,
            "status": "available" if (snapshot is not None or use_provider) else "missing",
            "as_of_date": as_of_date,
            "source_provider": source_provider,
            "source_layer": source_layer,
            "snapshot": snapshot_data,
            "holdings": holdings,
        })

    symbols = {holding["ticker"] for fund in latest_funds for holding in fund["holdings"]
               if holding["ticker"]}
    prices_by_ticker = {}
    if symbols:
        latest_price_dates = (
            select(SecurityPrice.ticker, func.max(SecurityPrice.as_of_date).label("as_of_date"))
            .where(SecurityPrice.provider == "alpaca", SecurityPrice.feed == "iex",
                   SecurityPrice.adjustment == "all", SecurityPrice.ticker.in_(symbols))
            .group_by(SecurityPrice.ticker)
            .subquery()
        )
        for price in session.scalars(
            select(SecurityPrice).join(
                latest_price_dates,
                (SecurityPrice.ticker == latest_price_dates.c.ticker)
                & (SecurityPrice.as_of_date == latest_price_dates.c.as_of_date),
            ).where(SecurityPrice.provider == "alpaca", SecurityPrice.feed == "iex",
                    SecurityPrice.adjustment == "all")
        ):
            prices_by_ticker[price.ticker] = price
    for fund in latest_funds:
        for holding in fund["holdings"]:
            price = prices_by_ticker.get(holding["ticker"])
            holding["latest_price"] = price.close if price is not None else None
            holding["latest_price_as_of_date"] = price.as_of_date if price is not None else None

    return {"portfolio": portfolio_data,
            "coverage_weight": coverage_weight, "funds": latest_funds}


@router.get("/{portfolio_id}/analysis")
def portfolio_analysis(portfolio_id: str, session: Session = Depends(get_session)):
    return analyze_latest(latest_portfolio_data(portfolio_id, session))


@router.post("/preview")
def preview_new_portfolio(body: PortfolioIn, session: Session = Depends(get_session)):
    """Analyze a new hypothetical portfolio without persisting it."""
    members = validated_funds(session, body)
    preview_portfolio_data = {
        "id": "preview",
        "name": body.name.strip(),
        "created_at": None,
        "updated_at": None,
        "funds": [
            {"ticker": fund.ticker, "name": fund.name, "issuer": fund.issuer, "weight": weight}
            for fund, weight in members
        ],
    }
    return analyze_latest(latest_for_members(session, preview_portfolio_data, members))


@router.post("/{portfolio_id}/preview")
def preview_portfolio(portfolio_id: str, body: PortfolioIn,
                      session: Session = Depends(get_session)):
    """Analyze hypothetical allocations without saving them to the portfolio."""
    portfolio = portfolio_or_404(session, portfolio_id)
    members = validated_funds(session, body)
    preview_portfolio_data = {
        "id": portfolio.id,
        "name": body.name.strip(),
        "created_at": portfolio.created_at,
        "updated_at": portfolio.updated_at,
        "funds": [
            {"ticker": fund.ticker, "name": fund.name, "issuer": fund.issuer, "weight": weight}
            for fund, weight in members
        ],
    }
    return analyze_latest(latest_for_members(session, preview_portfolio_data, members))
