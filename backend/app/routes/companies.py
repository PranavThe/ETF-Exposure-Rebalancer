"""POST /exposure/companies: the companies behind a portfolio's ETFs, each counted once.

Two ETFs can hold the same company (Apple sits in both an S&P 500 fund and a tech fund), so a
portfolio can lean on a few companies more than its list of ETFs suggests. This adds up each
company's dollars across the funds, from the same snapshot the planner uses for each fund, and says
how much each pair of funds overlaps. Only stocks count: cash, bonds and options are left out.
"""

import math
from functools import cache

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.analytics.names import NameSectors, normalize_company_name
from backend.pipeline.reference import normalize_symbol, read_company_tickers, read_ticker_sectors

from ..db import get_session
from ..models import Holding, ProviderHolding, ProviderHoldingsSnapshot
from ..plan_schemas import PlanHoldingIn
from .plans import _latest_snapshots, load_universe, suggestable_etfs

router = APIRouter(tags=["planner"])
TOP = 12


class CompaniesIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    holdings: list[PlanHoldingIn] = Field(default_factory=list, max_length=50)


class FundPart(BaseModel):
    ticker: str
    amount: float  # dollars of this company held through this fund


class CompanyOut(BaseModel):
    name: str
    ticker: str | None
    amount: float  # dollars across all the funds
    share: float  # of the dollars in funds with holdings data
    funds: list[FundPart]


class OverlapOut(BaseModel):
    a: str
    b: str
    overlap: float  # share of holdings the two funds have in common: sum of min(weight in a, weight in b)


class CompaniesOut(BaseModel):
    covered_total: float
    companies: list[CompanyOut]
    top10_share: float
    overlaps: list[OverlapOut]


@cache
def _company_names() -> tuple[NameSectors, dict[str, str]]:
    """Company name -> ticker (fuzzy, as for sectors), and ticker -> display name."""
    by_name, display = read_company_tickers()
    return NameSectors(by_name), display


def _pretty(name: str) -> str:
    """'APPLE INC' -> 'Apple Inc'; names already in mixed case stay as they are."""
    return name.title() if name.isupper() else name


# (source, snapshot id, content hash) -> company key -> (display name, ticker, weight in the fund)
_weights: dict[tuple[str, int, str], dict[str, tuple[str, str | None, float]]] = {}


def _filed_weights(session: Session, snapshot) -> dict[str, tuple[str, str | None, float]]:
    key = ("filed", snapshot.id, snapshot.content_hash)
    if key not in _weights:
        names, display = _company_names()
        rows = session.execute(select(Holding.name, Holding.ticker, Holding.asset_class, Holding.market_value)
                               .where(Holding.snapshot_id == snapshot.id, Holding.market_value > 0)).all()
        total = math.fsum(r.market_value for r in rows)
        out: dict[str, tuple[str, str | None, float]] = {}
        for r in rows:
            if r.asset_class != "equity" or total <= 0:
                continue
            symbol = names.lookup(r.name or "") or (normalize_symbol(r.ticker) if r.ticker else None)
            company = symbol or "name:" + normalize_company_name(r.name)
            label = display.get(symbol, r.name) if symbol else r.name
            _, _, weight = out.get(company, ("", None, 0.0))
            out[company] = (_pretty(label), symbol, weight + r.market_value / total)
        _weights[key] = out
    return _weights[key]


def _provider_weights(session: Session, snap: ProviderHoldingsSnapshot) -> dict[str, tuple[str, str | None, float]]:
    key = ("tickerinside", snap.id, snap.content_hash)
    if key not in _weights:
        _, display = _company_names()
        stocks = read_ticker_sectors()
        out: dict[str, tuple[str, str | None, float]] = {}
        for r in session.execute(select(ProviderHolding.ticker, ProviderHolding.weight)
                                 .where(ProviderHolding.snapshot_id == snap.id, ProviderHolding.weight > 0)):
            symbol = normalize_symbol(r.ticker)
            if stocks.get(symbol, "Cash & other") == "Cash & other":
                continue  # not a stock we know: cash, a bond, an option
            _, _, weight = out.get(symbol, ("", None, 0.0))
            out[symbol] = (_pretty(display.get(symbol, r.ticker)), symbol, weight + r.weight)
        _weights[key] = out
    return _weights[key]


def company_weights(session: Session, ticker: str, entry, filed_snapshot=None) -> dict[str, tuple[str, str | None, float]]:
    """company key -> (name, ticker, weight in the fund) from the snapshot the planner uses for it.
    `entry` is the fund's load_universe entry; `filed_snapshot` its latest filing, if known."""
    if entry[3] == "tickerinside":
        snap = session.scalars(select(ProviderHoldingsSnapshot)
                               .where(ProviderHoldingsSnapshot.provider == "tickerinside",
                                      ProviderHoldingsSnapshot.fund_ticker == ticker,
                                      ProviderHoldingsSnapshot.as_of_date == entry[1])
                               .order_by(ProviderHoldingsSnapshot.fetched_at.desc())).first()
        return _provider_weights(session, snap) if snap else {}
    if filed_snapshot is None:
        found = dict((f.ticker, s) for f, s in _latest_snapshots(session, [ticker]))
        filed_snapshot = found.get(ticker)
    return _filed_weights(session, filed_snapshot) if filed_snapshot else {}


@router.post("/exposure/companies", response_model=CompaniesOut)
def companies(body: CompaniesIn, session: Session = Depends(get_session),
              allow: frozenset[str] = Depends(suggestable_etfs)):
    amounts: dict[str, float] = {}
    for h in body.holdings:
        ticker = h.ticker.strip().upper()
        amounts[ticker] = amounts.get(ticker, 0.0) + h.amount
    universe = load_universe(session, amounts, allow)
    held = {t: a for t, a in amounts.items() if a > 0 and t in universe}
    filed = {f.ticker: s for f, s in _latest_snapshots(session, held)}
    per_fund = {t: company_weights(session, t, universe[t], filed.get(t)) for t in held}

    total = math.fsum(held.values())
    merged: dict[str, dict] = {}
    for fund, weights in per_fund.items():
        for company, (name, symbol, weight) in weights.items():
            entry = merged.setdefault(company, {"name": name, "ticker": symbol, "amount": 0.0, "funds": []})
            entry["amount"] += held[fund] * weight
            entry["funds"].append({"ticker": fund, "amount": held[fund] * weight})
    ranked = sorted(merged.values(), key=lambda c: -c["amount"])
    for c in ranked:
        c["share"] = c["amount"] / total if total > 0 else 0.0
        c["funds"].sort(key=lambda f: -f["amount"])
    funds = sorted(per_fund)
    overlaps = []
    for i, a in enumerate(funds):
        for b in funds[i + 1:]:
            common = math.fsum(min(w, per_fund[b][k][2]) for k, (_, _, w) in per_fund[a].items() if k in per_fund[b])
            if common >= 0.01:
                overlaps.append({"a": a, "b": b, "overlap": common})
    return {
        "covered_total": total,
        "companies": ranked[:TOP],
        "top10_share": math.fsum(c["share"] for c in ranked[:10]),
        "overlaps": sorted(overlaps, key=lambda o: -o["overlap"]),
    }
