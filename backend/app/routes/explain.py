"""Plain-language explanations: POST /explain/plan and POST /explain/etf.

Both gather the facts from the planner's own numbers, then let explain.py put them into words.
"""

import math

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from backend.analytics.rebalance import SECTORS, UNCLASSIFIED

from .. import llm
from ..db import get_session
from ..explain import EtfExplanation, PlanExplanation, explain_etf, explain_plan
from ..plan_schemas import PlanIn
from .companies import company_weights
from .plans import fund_fees, load_universe, plan, suggestable_etfs

router = APIRouter(tags=["planner"])
SOURCE = {"sec": "SEC filing", "issuer": "issuer file", "tickerinside": "TickerInside"}


class PlanExplainIn(PlanIn):
    kind: str = Field(min_length=1, max_length=40)  # which of the plans to explain


class EtfExplainIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ticker: str = Field(min_length=1, max_length=16)


# The facts carry display strings ("$4,672", "18.9 pp under your target") so the model never has to
# format or sign a number itself; the raw numbers stay alongside for the template.
def _pct(w: float) -> str:
    return f"{w * 100:.1f}%"


def _usd(x: float) -> str:
    return f"${x:,.0f}" if abs(x) >= 10 else f"${x:,.2f}"


def _top_sectors(mix: dict[str, float], n: int = 4) -> list[dict]:
    return [{"sector": s, "weight": round(w, 4), "share": _pct(w)} for s, w in sorted(mix.items(), key=lambda p: -p[1])
            if s != UNCLASSIFIED and w >= 0.005][:n]


def _gaps(mix: dict[str, float], target: dict[str, float]) -> list[dict]:
    """Target minus mix for each sector, in pp, biggest first: positive means under the target."""
    gaps = []
    for s in SECTORS:
        if s == UNCLASSIFIED:
            continue
        gap = round((target.get(s, 0.0) - mix.get(s, 0.0)) * 100, 1)
        if abs(gap) >= 0.5:
            gaps.append({"sector": s, "gap_pp": gap,
                         "status": f"{abs(gap):.1f} pp {'under' if gap > 0 else 'over'} your target"})
    return sorted(gaps, key=lambda g: -abs(g["gap_pp"]))[:6]


@router.post("/explain/plan", response_model=PlanExplanation)
def explain_plan_route(body: PlanExplainIn, session: Session = Depends(get_session),
                       allow: frozenset[str] = Depends(suggestable_etfs), fees: dict = Depends(fund_fees),
                       client=Depends(llm.get_client)):
    result = plan(PlanIn(**body.model_dump(exclude={"kind"})), session, allow, fees)
    chosen = next((p for p in result["plans"] if p["kind"] == body.kind), None)
    if chosen is None or result["target"] is None:
        raise HTTPException(404, "no such plan for these holdings and target")
    mix = lambda rows: {r["sector"]: r["weight"] for r in rows}
    current, target, after = mix(result["current"]), mix(result["target"]), mix(chosen["exposure"])
    universe = load_universe(session, [m["ticker"] for m in chosen["moves"]], allow)
    known_after = chosen["fee_known_after"] / chosen["total_after"] if chosen["total_after"] else 0.0
    facts = {
        "match_now": round(1 - result["distance"], 4),
        "match_after": round(1 - chosen["distance"], 4),
        "match": f"{_pct(1 - result['distance'])} now, {_pct(1 - chosen['distance'])} after the plan",
        "moved": round(math.fsum(m["amount"] for m in chosen["moves"] if m["action"] in ("reduce", "remove")), 2),
        "moves": [{"ticker": m["ticker"], "name": m["name"], "action": m["action"], "amount": round(m["amount"], 2),
                   "before": round(m["before"], 2), "after": round(m["after"], 2),
                   "change": f"{m['action']} by {_usd(m['amount'])} ({_usd(m['before'])} to {_usd(m['after'])})",
                   "top_sectors": _top_sectors(universe[m["ticker"]][2]) if m["ticker"] in universe else []}
                  for m in chosen["moves"]],
        "gaps_now": _gaps(current, target),
        "gaps_after": _gaps(after, target),
        "fees": {"before": round(chosen["fee_before"], 2), "after": round(chosen["fee_after"], 2),
                 "known_share": round(known_after, 3),
                 "yearly": f"about {_usd(chosen['fee_before'])} a year now, {_usd(chosen['fee_after'])} after"},
        "data_dates": ", ".join(f"{f['ticker']} {f['as_of_date']} ({SOURCE.get(f['source_provider'], 'holdings')})"
                                for f in result["funds"] if f["as_of_date"]),
    }
    return explain_plan(client, facts)


@router.post("/explain/etf", response_model=EtfExplanation)
def explain_etf_route(body: EtfExplainIn, session: Session = Depends(get_session),
                      allow: frozenset[str] = Depends(suggestable_etfs), fees: dict = Depends(fund_fees),
                      client=Depends(llm.get_client)):
    ticker = body.ticker.strip().upper()
    universe = load_universe(session, [ticker], allow)
    if ticker not in universe:
        raise HTTPException(404, f"no holdings data for {ticker}")
    entry = universe[ticker]
    holdings = sorted(company_weights(session, ticker, entry).values(), key=lambda h: -h[2])
    fee = fees.get(ticker)
    facts = {
        "ticker": ticker, "name": entry[0].name, "issuer": entry[0].issuer,
        "as_of": str(entry[1]), "source": SOURCE.get(entry[3], "holdings"),
        "positions": len(holdings),
        "top_sectors": _top_sectors(entry[2], 5),
        "unclassified_share": round(entry[2].get(UNCLASSIFIED, 0.0), 4),
        "top_holdings": [{"name": name, "weight": round(w, 4), "share": _pct(w)} for name, _, w in holdings[:10]],
        "top10_share": round(math.fsum(w for _, _, w in holdings[:10]), 4),
        "top10": f"the 10 biggest holdings are {_pct(math.fsum(w for _, _, w in holdings[:10]))} of the fund",
        "expense_ratio": fee["expense_ratio"] if fee else None,
        "fee": (f"{fee['expense_ratio'] * 100:.2f}% a year, about {_usd(fee['expense_ratio'] * 10000)} per $10,000"
                if fee else "not on file"),
    }
    return explain_etf(client, facts)
