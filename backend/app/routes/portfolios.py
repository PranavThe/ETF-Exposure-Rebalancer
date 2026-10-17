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

from ..db import get_session
from ..models import Fund, Holding, Portfolio, PortfolioFund, Snapshot, utcnow
from ..portfolio_schemas import PortfolioCreated, PortfolioIn, PortfolioLatest, PortfolioOut
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
    members = allocations(session, portfolio.id)
    fund_ids = [fund.id for _, fund in members]
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
    sectors = sector_map(session)
    latest_funds = []
    coverage_weight = 0.0
    for allocation, fund in members:
        snapshot = snapshots_by_fund.get(fund.id)
        holdings = holdings_by_snapshot.get(snapshot.id, []) if snapshot is not None else []
        if snapshot is not None:
            coverage_weight += allocation.weight
        latest_funds.append({
            "ticker": fund.ticker, "name": fund.name, "issuer": fund.issuer,
            "weight": allocation.weight,
            "status": "available" if snapshot is not None else "missing",
            "as_of_date": snapshot.as_of_date if snapshot is not None else None,
            "snapshot": ({**snapshot_meta(snapshot), "ingested_at": snapshot.ingested_at}
                         if snapshot is not None else None),
            "holdings": [
                {"security_id": h.security_id, "ticker": h.ticker, "name": h.name,
                 "asset_class": h.asset_class, "source_sector": h.source_sector,
                 "sector": resolve_sector(h.security_id, h.source_sector, sectors),
                 "shares": h.shares, "price": h.price, "market_value": h.market_value,
                 "reported_weight": h.reported_weight}
                for h in holdings
            ],
        })
    return {"portfolio": portfolio_out(session, portfolio),
            "coverage_weight": coverage_weight, "funds": latest_funds}
