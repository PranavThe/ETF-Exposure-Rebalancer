"""The planner: a portfolio's real sector mix, and moves that bring it to the mix the user wants."""

from collections import Counter
from dataclasses import dataclass, field
from datetime import date
from functools import cache
from typing import Iterable

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from backend.analytics.names import NameSectors
from backend.analytics.rebalance import (
    SUGGESTABLE_ETFS,
    UNCLASSIFIED,
    build_plans,
    canonical_sector,
    distance,
    exposure,
    fund_sector_weights,
    normalize_target,
    sector_order,
    suggestable,
)
from backend.analytics.sectors import resolve_sector
from backend.pipeline.reference import normalize_symbol, read_name_sectors, read_ticker_sectors

from ..db import get_session
from ..models import (Fund, Holding, PortfolioPreference, ProviderHolding, ProviderHoldingsSnapshot,
                      Snapshot, utcnow)
from ..plan_schemas import CoveredEtf, PlanIn, PlanResult, PreferencesIn, PreferencesOut
from .funds import sector_map
from .portfolios import portfolio_or_404, require_edit_key

router = APIRouter(tags=["planner"])

SAMPLE_ISSUER = "Synthetic"


def suggestable_etfs() -> frozenset[str]:
    """The ETFs plans may propose adding (rebalance.SUGGESTABLE_ETFS); tests override this."""
    return SUGGESTABLE_ETFS


@cache
def name_sectors() -> NameSectors:
    """Company name -> sector, for holdings without one (data/reference/name_sectors.csv)."""
    return NameSectors(read_name_sectors())


@cache
def reference_ticker_sectors() -> dict[str, str]:
    """Stock ticker -> sector from the same reference file, for weight-only provider holdings."""
    return read_ticker_sectors()


# ticker -> (fund, as of date, sector mix, source provider, source layer). The provider is "sec" for
# N-PORT filings, "issuer" for issuer files and "tickerinside" for TickerInside weights.
Entry = tuple[Fund, date, dict[str, float], str, str | None]


@dataclass
class _Universe:
    """What the planner has worked out, kept for the life of the process.

    `key` names the allowlisted funds' latest snapshots it was built from. Snapshots never change in
    place (a replace makes a new row), so (id, content hash) identifies a mix; when any allowlisted
    snapshot changes, everything is rebuilt, since `by_security` is learned from those funds.
    """

    key: frozenset[tuple[int, str]]
    by_security: dict[str, str]  # security id -> sector seen for it in an allowlisted fund
    mixes: dict[tuple[int, str], dict[str, float]] = field(default_factory=dict)


_universe: _Universe | None = None

# One equity row: (security id, sector or UNCLASSIFIED, market value).
EquityRow = tuple[str, str, float]


def _latest_snapshots(session: Session, tickers: Iterable[str],
                      include_samples: bool = False) -> list[tuple[Fund, Snapshot]]:
    wanted = Fund.ticker.in_(sorted(set(tickers)))
    if include_samples:
        wanted = or_(wanted, Fund.issuer == SAMPLE_ISSUER)
    latest = (select(Snapshot.fund_id, func.max(Snapshot.as_of_date).label("as_of_date"))
              .join(Fund, Fund.id == Snapshot.fund_id).where(wanted)
              .group_by(Snapshot.fund_id).subquery())
    return [(fund, snapshot) for fund, snapshot in session.execute(
        select(Fund, Snapshot).join(Snapshot, Snapshot.fund_id == Fund.id).join(
            latest, (latest.c.fund_id == Snapshot.fund_id) & (latest.c.as_of_date == Snapshot.as_of_date)))]


def _load_rows(session: Session, snapshot_ids: list[int]) -> dict[int, tuple[list[EquityRow], float]]:
    """snapshot id -> (equity rows with their sectors, total positive value of all other rows).

    A row's sector: the security_sectors table, then the issuer's label (resolve_sector), then its
    company name in name_sectors.csv. Non-equity rows are summed in the database, since they all
    count as Cash & other.
    """
    if not snapshot_ids:
        return {}
    table, names = sector_map(session), name_sectors()
    out: dict[int, tuple[list[EquityRow], float]] = {i: ([], 0.0) for i in snapshot_ids}
    for h in session.execute(
        select(Holding.snapshot_id, Holding.security_id, Holding.name, Holding.source_sector,
               Holding.market_value)
        .where(Holding.snapshot_id.in_(snapshot_ids), Holding.asset_class == "equity",
               Holding.market_value > 0)
    ):
        sector = canonical_sector(resolve_sector(h.security_id, h.source_sector, table))
        if sector == UNCLASSIFIED:
            sector = names.lookup(h.name or "") or UNCLASSIFIED
        out[h.snapshot_id][0].append((h.security_id, sector, h.market_value))
    for snapshot_id, other in session.execute(
        select(Holding.snapshot_id, func.sum(Holding.market_value))
        .where(Holding.snapshot_id.in_(snapshot_ids), Holding.asset_class != "equity",
               Holding.market_value > 0)
        .group_by(Holding.snapshot_id)
    ):
        out[snapshot_id] = (out[snapshot_id][0], float(other or 0.0))
    return out


def _sectors_by_security(rows: Iterable[tuple[list[EquityRow], float]]) -> dict[str, str]:
    """Security id -> its most common known sector across these funds (ties: alphabetical)."""
    votes: dict[str, Counter] = {}
    for equity, _ in rows:
        for security_id, sector, _ in equity:
            if sector != UNCLASSIFIED:
                votes.setdefault(security_id, Counter())[sector] += 1
    return {sid: min(c.items(), key=lambda p: (-p[1], p[0]))[0] for sid, c in votes.items()}


def _mix(rows: tuple[list[EquityRow], float], by_security: dict[str, str]) -> dict[str, float]:
    """Sector mix; an unclassified holding takes the sector its security id has in another fund."""
    equity, other = rows
    return fund_sector_weights(
        [{"asset_class": "equity", "market_value": value,
          "sector": by_security.get(sid, UNCLASSIFIED) if sector == UNCLASSIFIED else sector}
         for sid, sector, value in equity]
        + [{"asset_class": "other", "market_value": other, "sector": None}])


def load_universe(session: Session, tickers: Iterable[str], allow: frozenset[str],
                  include_samples: bool = False) -> dict[str, Entry]:
    """ticker -> Entry for `tickers` and the allowlist `allow`.

    Only those funds' latest snapshots are read. The allowlisted funds are always loaded: they are
    the candidates for new ETFs, and the sectors their holdings resolve to also classify the same
    securities (by id) in any other fund, e.g. "ADV MICRO DEVICE" in a Vanguard filing.
    """
    global _universe
    pairs = _latest_snapshots(session, set(tickers) | allow, include_samples)
    allowed = [(f, s) for f, s in pairs if f.ticker in allow]
    key = frozenset((s.id, s.content_hash) for _, s in allowed)
    state = _universe
    if state is None or state.key != key:
        rows = _load_rows(session, [s.id for _, s in allowed])
        state = _Universe(key, _sectors_by_security(rows.values()))
        for _, s in allowed:
            state.mixes[(s.id, s.content_hash)] = _mix(rows[s.id], state.by_security)
        _universe = state
    missing = [s for _, s in pairs if (s.id, s.content_hash) not in state.mixes]
    if missing:
        rows = _load_rows(session, [s.id for s in missing])
        for s in missing:
            state.mixes[(s.id, s.content_hash)] = _mix(rows[s.id], state.by_security)
    universe: dict[str, Entry] = {
        f.ticker: (f, s.as_of_date, state.mixes[(s.id, s.content_hash)],
                   "sec" if "sec.gov" in (s.source_url or "").lower() else "issuer", None)
        for f, s in pairs if state.mixes[(s.id, s.content_hash)]}
    universe.update(_provider_entries(session, set(tickers) | allow, universe))
    return universe


# Sector mix per TickerInside snapshot (id, content hash); snapshots are never edited in place.
_provider_mixes: dict[tuple[int, str], dict[str, float]] = {}


def _ticker_sectors(session: Session, symbols: set[str]) -> dict[str, str]:
    """Provider symbol -> sector: the newest sector our issuer/SEC equity rows give that ticker, else
    the reference file's. Symbols neither knows stay Unclassified rather than getting a guessed sector.

    Only equity rows count: options on a stock (e.g. in an option-income ETF) can carry the stock's
    ticker, and must not turn that stock into Cash & other.
    """
    out: dict[str, str] = {}
    table = sector_map(session)
    for row in session.execute(
        select(Holding.ticker, Holding.security_id, Holding.source_sector)
        .join(Snapshot, Snapshot.id == Holding.snapshot_id)
        .where(Holding.ticker.in_(sorted(symbols)), Holding.asset_class == "equity")
        .order_by(Snapshot.as_of_date.desc(), Holding.id.desc())
    ):
        if row.ticker in out:
            continue
        sector = canonical_sector(resolve_sector(row.security_id, row.source_sector, table))
        if sector != UNCLASSIFIED:
            out[row.ticker] = sector
    reference = reference_ticker_sectors()
    for symbol in symbols:
        out.setdefault(symbol, reference.get(normalize_symbol(symbol), UNCLASSIFIED))
    return out


def _provider_entries(session: Session, tickers: set[str], filed: dict[str, Entry]) -> dict[str, Entry]:
    """TickerInside weights for `tickers`, where they are newer than the issuer/SEC snapshot."""
    latest: dict[str, ProviderHoldingsSnapshot] = {}
    for snap in session.scalars(
        select(ProviderHoldingsSnapshot)
        .where(ProviderHoldingsSnapshot.provider == "tickerinside",
               ProviderHoldingsSnapshot.fund_ticker.in_(sorted(tickers)))
        .order_by(ProviderHoldingsSnapshot.fund_ticker, ProviderHoldingsSnapshot.as_of_date.desc(),
                  ProviderHoldingsSnapshot.fetched_at.desc())
    ):
        latest.setdefault(snap.fund_ticker, snap)
    newer = {t: snap for t, snap in latest.items() if t not in filed or snap.as_of_date > filed[t][1]}
    if not newer:
        return {}
    todo = [snap for snap in newer.values() if (snap.id, snap.content_hash) not in _provider_mixes]
    if todo:
        rows = list(session.execute(
            select(ProviderHolding.snapshot_id, ProviderHolding.ticker, ProviderHolding.weight)
            .where(ProviderHolding.snapshot_id.in_([snap.id for snap in todo]),
                   ProviderHolding.weight > 0)))
        sectors = _ticker_sectors(session, {r.ticker for r in rows})
        raw: dict[int, dict[str, float]] = {snap.id: {} for snap in todo}
        for r in rows:
            sector = sectors.get(r.ticker, UNCLASSIFIED)
            raw[r.snapshot_id][sector] = raw[r.snapshot_id].get(sector, 0.0) + r.weight
        for snap in todo:
            mix = raw[snap.id]
            total = sum(mix.values())
            _provider_mixes[(snap.id, snap.content_hash)] = {k: v / total for k, v in mix.items()} if total > 0 else {}
    funds = {f.ticker: f for f in session.scalars(select(Fund).where(Fund.ticker.in_(sorted(newer))))}
    return {t: (funds[t], snap.as_of_date, _provider_mixes[(snap.id, snap.content_hash)], "tickerinside",
                snap.source_layer)
            for t, snap in newer.items() if _provider_mixes.get((snap.id, snap.content_hash)) and t in funds}


def sector_list(mix: dict[str, float]) -> list[dict]:
    return [{"sector": s, "weight": w} for s, w in sorted(mix.items(), key=lambda p: sector_order(p[0]))]


@router.get("/etfs/covered", response_model=list[CoveredEtf])
def covered_etfs(session: Session = Depends(get_session),
                 allow: frozenset[str] = Depends(suggestable_etfs)):
    """The allowlisted ETFs (and local sample funds) with holdings data, and their sector mixes."""
    return [
        {"ticker": ticker, "name": fund.name, "issuer": fund.issuer, "as_of_date": as_of,
         "source_provider": provider, "source_layer": layer,
         "sample": fund.issuer == SAMPLE_ISSUER, "sectors": sector_list(mix)}
        for ticker, (fund, as_of, mix, provider, layer) in sorted(
            load_universe(session, (), allow, include_samples=True).items())
    ]


@router.post("/plan", response_model=PlanResult)
def plan(body: PlanIn, session: Session = Depends(get_session),
         allow: frozenset[str] = Depends(suggestable_etfs)):
    """The portfolio's sector mix and, with a target, up to two plans that move it there."""
    amounts: dict[str, float] = {}
    for h in body.holdings:
        ticker = h.ticker.strip().upper()
        amounts[ticker] = amounts.get(ticker, 0.0) + h.amount
    universe = load_universe(session, amounts, allow)
    weights = {t: entry[2] for t, entry in universe.items()}
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
        # Held ETFs of any kind count; new ones come only from the allowlist, never sample funds.
        samples = {t for t, entry in universe.items() if entry[0].issuer == SAMPLE_ISSUER}
        never = set(weights) - (suggestable(weights, allow) - samples)
        # Only plain, well-known ETFs get more money. Others you hold can be kept or reduced.
        no_increase = {t for t in amounts if t not in allow or t in samples}
        for p in build_plans(amounts, weights, target, body.cash_change, body.max_new_funds, never,
                             no_increase):
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
             "source_provider": universe[t][3] if t in universe else None,
             "source_layer": universe[t][4] if t in universe else None,
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
