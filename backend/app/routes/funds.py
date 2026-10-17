from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.analytics import config
from backend.analytics.compare import compare_snapshots
from backend.analytics.sectors import resolve_sector

from ..db import get_session
from ..models import Fund, Holding, SecuritySector, Snapshot
from ..schemas import Changes, FundOut, HoldingsOut, SnapshotOut

router = APIRouter(prefix="/funds")


def fund_or_404(session: Session, ticker: str) -> Fund:
    fund = session.scalar(select(Fund).where(Fund.ticker == ticker.upper()))
    if fund is None:
        raise HTTPException(404, f"unknown fund {ticker}")
    return fund


def snapshot_or_404(session: Session, fund: Fund, as_of: date) -> Snapshot:
    snapshot = session.scalar(
        select(Snapshot).where(Snapshot.fund_id == fund.id, Snapshot.as_of_date == as_of))
    if snapshot is None:
        raise HTTPException(404, f"no {fund.ticker} snapshot for {as_of}")
    return snapshot


def snapshot_meta(s: Snapshot) -> dict:
    return {"as_of_date": s.as_of_date, "source_url": s.source_url, "source_file": s.source_file,
            "content_hash": s.content_hash, "row_count": s.row_count}


def holdings_of(session: Session, snapshot: Snapshot) -> list[Holding]:
    return list(session.scalars(
        select(Holding).where(Holding.snapshot_id == snapshot.id).order_by(Holding.market_value.desc())))


def sector_map(session: Session) -> dict[str, str]:
    return dict(session.execute(select(SecuritySector.security_id, SecuritySector.sector)).all())


def analytics_rows(holdings: list[Holding]) -> list[dict]:
    return [{"security_id": h.security_id, "ticker": h.ticker, "name": h.name,
             "asset_class": h.asset_class, "source_sector": h.source_sector, "shares": h.shares,
             "price": h.price, "market_value": h.market_value} for h in holdings]


@router.get("", response_model=list[FundOut])
def list_funds(
    loaded_only: bool = False,
    limit: int | None = Query(default=None, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
):
    stats = (select(Snapshot.fund_id, func.count(Snapshot.id).label("n"),
                    func.max(Snapshot.as_of_date).label("latest"))
             .group_by(Snapshot.fund_id).subquery())
    query = select(Fund, stats.c.n, stats.c.latest).outerjoin(stats, stats.c.fund_id == Fund.id)
    if loaded_only:
        query = query.where(stats.c.n > 0)
    query = query.order_by(Fund.ticker).offset(offset)
    if limit is not None:
        query = query.limit(limit)
    rows = session.execute(query)
    return [{"ticker": f.ticker, "name": f.name, "issuer": f.issuer, "snapshot_count": n or 0,
             "latest_as_of_date": latest} for f, n, latest in rows]


@router.get("/{ticker}", response_model=FundOut)
def get_fund(ticker: str, session: Session = Depends(get_session)):
    fund = fund_or_404(session, ticker)
    count, latest = session.execute(select(func.count(Snapshot.id), func.max(Snapshot.as_of_date))
                                    .where(Snapshot.fund_id == fund.id)).one()
    return {"ticker": fund.ticker, "name": fund.name, "issuer": fund.issuer,
            "snapshot_count": count, "latest_as_of_date": latest}


@router.get("/{ticker}/snapshots", response_model=list[SnapshotOut])
def list_snapshots(ticker: str, session: Session = Depends(get_session)):
    fund = fund_or_404(session, ticker)
    snapshots = session.scalars(
        select(Snapshot).where(Snapshot.fund_id == fund.id).order_by(Snapshot.as_of_date))
    return [{**snapshot_meta(s), "ingested_at": s.ingested_at} for s in snapshots]


@router.get("/{ticker}/holdings", response_model=HoldingsOut)
def get_holdings(ticker: str, as_of: date = Query(alias="date"), session: Session = Depends(get_session)):
    """The stored rows of one snapshot, with each row's resolved sector."""
    fund = fund_or_404(session, ticker)
    snapshot = snapshot_or_404(session, fund, as_of)
    sectors = sector_map(session)
    return {
        "fund": fund.ticker,
        "snapshot": {**snapshot_meta(snapshot), "ingested_at": snapshot.ingested_at},
        "holdings": [{
            "security_id": h.security_id, "ticker": h.ticker, "name": h.name,
            "asset_class": h.asset_class, "source_sector": h.source_sector,
            "sector": resolve_sector(h.security_id, h.source_sector, sectors),
            "shares": h.shares, "price": h.price, "market_value": h.market_value,
            "reported_weight": h.reported_weight,
        } for h in holdings_of(session, snapshot)],
    }


@router.get("/{ticker}/changes", response_model=Changes)
def get_changes(ticker: str, from_date: date = Query(alias="from"), to_date: date = Query(alias="to"),
                session: Session = Depends(get_session)):
    fund = fund_or_404(session, ticker)
    if from_date >= to_date:
        raise HTTPException(422, "from must be earlier than to")
    snap_from = snapshot_or_404(session, fund, from_date)
    snap_to = snapshot_or_404(session, fund, to_date)
    intervals = session.scalar(select(func.count(Snapshot.id)).where(
        Snapshot.fund_id == fund.id, Snapshot.as_of_date > from_date, Snapshot.as_of_date <= to_date))

    result = compare_snapshots(
        analytics_rows(holdings_of(session, snap_from)),
        analytics_rows(holdings_of(session, snap_to)),
        fund=fund.ticker,
        from_date=from_date.isoformat(),
        to_date=to_date.isoformat(),
        sector_map=sector_map(session),
        top_n=config.top_n_for(fund.ticker),
        snapshot_intervals=intervals,
    )
    return {"fund": fund.ticker, "from": snapshot_meta(snap_from), "to": snapshot_meta(snap_to), **result}
