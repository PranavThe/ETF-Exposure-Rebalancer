"""Search the registered U.S. ETF catalog without returning thousands of rows at once."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..db import get_session
from ..models import EtfCatalogEntry, Fund, ProviderHoldingsSnapshot, Snapshot
from ..schemas import FundOut

router = APIRouter(prefix="/etfs", tags=["etfs"])


@router.get("/search", response_model=list[FundOut])
def search_etfs(
    q: str = Query(default="", max_length=100),
    limit: int = Query(default=20, ge=1, le=100),
    session: Session = Depends(get_session),
):
    latest = (
        select(Snapshot.fund_id, func.count(Snapshot.id).label("n"),
               func.max(Snapshot.as_of_date).label("as_of_date"))
        .group_by(Snapshot.fund_id).subquery()
    )
    provider_latest = (select(ProviderHoldingsSnapshot.fund_ticker,
                              func.max(ProviderHoldingsSnapshot.as_of_date).label("as_of_date"))
                       .where(ProviderHoldingsSnapshot.provider == "tickerinside")
                       .group_by(ProviderHoldingsSnapshot.fund_ticker).subquery())
    query = (select(Fund, latest.c.n, latest.c.as_of_date, provider_latest.c.as_of_date)
             .join(EtfCatalogEntry, EtfCatalogEntry.ticker == Fund.ticker)
             .outerjoin(latest, latest.c.fund_id == Fund.id)
             .outerjoin(provider_latest, provider_latest.c.fund_ticker == Fund.ticker))
    term = q.strip()
    if term:
        escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"
        query = query.where(or_(Fund.ticker.ilike(pattern, escape="\\"),
                                Fund.name.ilike(pattern, escape="\\")))
    query = query.order_by(Fund.ticker).limit(limit)
    return [
        {"ticker": fund.ticker, "name": fund.name, "issuer": fund.issuer,
         "snapshot_count": count or 0, "latest_as_of_date": as_of_date,
         "provider_holdings_as_of_date": provider_as_of_date}
        for fund, count, as_of_date, provider_as_of_date in session.execute(query)
    ]
