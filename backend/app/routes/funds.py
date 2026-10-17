from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.analytics import config
from backend.analytics.compare import compare_snapshots

from ..db import get_session
from ..models import Fund, Holding, SecuritySector, Snapshot
from ..schemas import Changes

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
