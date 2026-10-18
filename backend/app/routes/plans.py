"""The planner: a portfolio's real sector mix, and moves that bring it to the mix the user wants."""

from datetime import date

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.analytics.rebalance import (
    build_plans,
    distance,
    exposure,
    fund_sector_weights,
    normalize_target,
    sector_order,
)
from backend.analytics.sectors import resolve_sector

from ..db import get_session
from ..models import Fund, Holding, PortfolioPreference, Snapshot, utcnow
from ..plan_schemas import CoveredEtf, PlanIn, PlanResult, PreferencesIn, PreferencesOut
from .funds import sector_map
from .portfolios import portfolio_or_404, require_edit_key

router = APIRouter(tags=["planner"])

SAMPLE_ISSUER = "Synthetic"

# Sector mix per stored snapshot. Snapshots never change in place (a replace makes a new row), so
# (id, content hash) is a safe key for the life of the process.
_mix_cache: dict[tuple[int, str], dict[str, float]] = {}


def latest_universe(session: Session) -> dict[str, tuple[Fund, date, dict[str, float]]]:
    """ticker -> (fund, as_of_date, sector mix) for every fund's latest snapshot with holdings."""
    latest = (select(Snapshot.fund_id, func.max(Snapshot.as_of_date).label("as_of_date"))
              .group_by(Snapshot.fund_id).subquery())
    pairs = [(fund, snapshot) for fund, snapshot in session.execute(
        select(Fund, Snapshot).join(Snapshot, Snapshot.fund_id == Fund.id).join(
            latest, (latest.c.fund_id == Snapshot.fund_id) & (latest.c.as_of_date == Snapshot.as_of_date)))]
    missing = [s.id for _, s in pairs if (s.id, s.content_hash) not in _mix_cache]
    if missing:
        sectors = sector_map(session)
        rows: dict[int, list[dict]] = {}
        for h in session.execute(
            select(Holding.snapshot_id, Holding.security_id, Holding.asset_class,
                   Holding.source_sector, Holding.market_value)
            .where(Holding.snapshot_id.in_(missing))
        ):
            rows.setdefault(h.snapshot_id, []).append({
                "asset_class": h.asset_class, "market_value": h.market_value,
                "sector": resolve_sector(h.security_id, h.source_sector, sectors),
            })
        for fund, snapshot in pairs:
            if snapshot.id in rows or snapshot.id in missing:
                _mix_cache[(snapshot.id, snapshot.content_hash)] = fund_sector_weights(rows.get(snapshot.id, []))
    universe = {}
    for fund, snapshot in pairs:
        mix = _mix_cache[(snapshot.id, snapshot.content_hash)]
        if mix:
            universe[fund.ticker] = (fund, snapshot.as_of_date, mix)
    return universe


def sector_list(mix: dict[str, float]) -> list[dict]:
    return [{"sector": s, "weight": w} for s, w in sorted(mix.items(), key=lambda p: sector_order(p[0]))]


@router.get("/etfs/covered", response_model=list[CoveredEtf])
def covered_etfs(session: Session = Depends(get_session)):
    """ETFs with holdings data, so their sector mix is known and they can be planned with."""
    return [
        {"ticker": ticker, "name": fund.name, "issuer": fund.issuer, "as_of_date": as_of,
         "sample": fund.issuer == SAMPLE_ISSUER, "sectors": sector_list(mix)}
        for ticker, (fund, as_of, mix) in sorted(latest_universe(session).items())
    ]


@router.post("/plan", response_model=PlanResult)
def plan(body: PlanIn, session: Session = Depends(get_session)):
    """The portfolio's sector mix and, with a target, up to two plans that move it there."""
    amounts: dict[str, float] = {}
    for h in body.holdings:
        ticker = h.ticker.strip().upper()
        amounts[ticker] = amounts.get(ticker, 0.0) + h.amount
    universe = latest_universe(session)
    weights = {t: mix for t, (_, _, mix) in universe.items()}
    names = {f.ticker: f for f in session.scalars(select(Fund).where(Fund.ticker.in_(list(amounts))))}
    unknown = [t for t in amounts if t not in names]
    if unknown:
        raise HTTPException(422, f"unknown fund: {', '.join(unknown)}")

    covered_total = sum(a for t, a in amounts.items() if t in weights and a > 0)
    if body.cash_change < 0 and -body.cash_change > covered_total + 1e-9:
        raise HTTPException(422, "cannot take out more than the ETFs with data are worth")
    current = exposure(amounts, weights)
    target = None
    if body.target is not None:
        try:
            target = normalize_target(body.target)
        except ValueError as e:
            raise HTTPException(422, str(e))

    def fund_name(ticker: str) -> str:
        fund = universe[ticker][0] if ticker in universe else names.get(ticker)
        return fund.name if fund else ticker

    plans = []
    if target is not None:
        never = [t for t, (fund, _, _) in universe.items() if fund.issuer == SAMPLE_ISSUER]
        for p in build_plans(amounts, weights, target, body.cash_change, body.max_new_funds, never):
            plans.append({
                "kind": p.kind, "title": p.title, "summary": p.summary,
                "total_before": p.total_before, "total_after": p.total_after, "distance": p.distance,
                "exposure": sector_list(p.exposure), "new_funds": p.new_funds,
                "moves": [{"ticker": m.ticker, "name": fund_name(m.ticker), "action": m.action,
                           "amount": m.amount, "before": m.before, "after": m.after} for m in p.moves],
            })

    return {
        "total": sum(amounts.values()),
        "covered_total": covered_total,
        "funds": [
            {"ticker": t, "name": fund_name(t), "issuer": names[t].issuer, "amount": a,
             "status": "available" if t in universe else "missing",
             "as_of_date": universe[t][1] if t in universe else None,
             "sectors": sector_list(universe[t][2]) if t in universe else []}
            for t, a in amounts.items()
        ],
        "current": sector_list(current),
        "target": sector_list(target) if target is not None else None,
        "distance": distance(current, target) if target is not None and current else None,
        "plans": plans,
    }


@router.get("/portfolios/{portfolio_id}/preferences", response_model=PreferencesOut)
def get_preferences(portfolio_id: str, session: Session = Depends(get_session)):
    portfolio_or_404(session, portfolio_id)
    pref = session.get(PortfolioPreference, portfolio_id)
    return {"total_value": pref.total_value if pref else None, "target": pref.target if pref else None}


@router.put("/portfolios/{portfolio_id}/preferences", response_model=PreferencesOut)
def put_preferences(
    portfolio_id: str, body: PreferencesIn,
    edit_key: str | None = Header(default=None, alias="X-Portfolio-Edit-Key"),
    session: Session = Depends(get_session),
):
    portfolio = portfolio_or_404(session, portfolio_id)
    require_edit_key(portfolio, edit_key)
    pref = session.get(PortfolioPreference, portfolio_id)
    if pref is None:
        pref = PortfolioPreference(portfolio_id=portfolio_id)
        session.add(pref)
    pref.total_value, pref.target, pref.updated_at = body.total_value, body.target, utcnow()
    session.commit()
    return {"total_value": pref.total_value, "target": pref.target}
