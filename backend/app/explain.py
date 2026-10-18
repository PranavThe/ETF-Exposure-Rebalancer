"""Plain-language explanations of a plan and of an ETF, written by Gemini from facts we compute.

The facts (each move's sectors, the gaps to the target, fees, the biggest holdings) come from our
own numbers; Gemini only puts them into words for a beginner. Without a key, or when Gemini fails,
the same facts fill a fixed template. Neither version recommends anything.
"""

import hashlib
import json
from collections import OrderedDict
from typing import Literal

from pydantic import BaseModel

from .assistant import plain_words
from .llm import FAILURES, generate_json

RULES = """Write for someone new to investing. Use short, plain sentences and explain any finance word
you use. Only use the facts given; never invent numbers, holdings or reasons. Never recommend acting,
never say whether something is a good idea, never predict markets or returns, and never say what the
person should want: the person decides and the tool does the math. Write weights in % and differences
in "pp" (percentage points). Never use the words "buy", "sell", "bought", "sold" or "trade"; say
"add", "increase", "reduce" or "remove"."""

PLAN_PROMPT = f"""You explain a rebalancing plan made by a calculator. The person picked a target sector mix;
the plan moves money between ETFs to get the portfolio's look-through sector mix closer to it, using the
money already invested.

{RULES}

Numbers come ready to quote ("match", each move's "change", each gap's "status", "fees.yearly"); copy
them as written instead of computing or reformatting your own. summary: two sentences on what the plan
does overall and how much closer it gets. moves: one entry per move, saying in one sentence which
sectors that ETF mostly holds and how that moves the mix toward the target, using the gaps_now statuses. consider: two to four short points
the person may want to weigh before acting on any of it, from the facts: taxes when reducing a fund
held in a taxable account, the yearly fee change, sectors still away from the target, the dates of the
holdings data, and that the plan looks at sectors, not single companies."""

ETF_PROMPT = f"""You describe what is inside one ETF, from its holdings.

{RULES}

summary: two sentences on what the fund holds, in everyday words (for example "about 500 of the
largest U.S. companies"), using its sectors and biggest holdings. points: two or three short facts a
beginner would find useful: how concentrated it is ("top10"), its biggest sector, its yearly "fee" when
on file, and how dated the data is ("as_of"). Quote numbers as written in the facts."""

PLAN_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "moves": {"type": "array", "items": {"type": "object", "properties": {
            "ticker": {"type": "string"}, "why": {"type": "string"}}, "required": ["ticker", "why"]}},
        "consider": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["summary", "moves", "consider"],
}
ETF_SCHEMA = {
    "type": "object",
    "properties": {"summary": {"type": "string"}, "points": {"type": "array", "items": {"type": "string"}}},
    "required": ["summary", "points"],
}


class MoveWhy(BaseModel):
    ticker: str
    why: str


class PlanExplanation(BaseModel):
    summary: str
    moves: list[MoveWhy]
    consider: list[str]
    source: Literal["gemini", "rules"]
    model: str | None = None


class EtfExplanation(BaseModel):
    summary: str
    points: list[str]
    source: Literal["gemini", "rules"]
    model: str | None = None


# Explanations are deterministic enough to reuse: the same facts get the same answer, which also
# spares the free tier's few requests a minute.
_cache: OrderedDict[str, BaseModel] = OrderedDict()
CACHE_SIZE = 256


def _cached(kind: str, facts: dict, make):
    key = hashlib.sha256((kind + json.dumps(facts, sort_keys=True, default=str)).encode()).hexdigest()
    if key in _cache:
        _cache.move_to_end(key)
        return _cache[key]
    value = make()
    if value.source == "gemini":
        _cache[key] = value
        if len(_cache) > CACHE_SIZE:
            _cache.popitem(last=False)
    return value


def _pct(w: float) -> str:
    return f"{w * 100:.1f}%"


def _money(x: float) -> str:
    return f"${x:,.0f}" if abs(x) >= 10 else f"${x:,.2f}"


ACTION = {"add": "Add", "increase": "Increase", "reduce": "Reduce", "remove": "Remove"}


def plan_rules(facts: dict) -> PlanExplanation:
    """The template explanation, from the same facts Gemini gets."""
    moves = []
    for m in facts["moves"]:
        sectors = " and ".join(f"{s['sector']} ({_pct(s['weight'])})" for s in m["top_sectors"][:2]) or "no sector data"
        gaps = [g for g in facts["gaps_now"] if g["sector"] in {s["sector"] for s in m["top_sectors"][:2]}]
        direction = ("adds to" if m["action"] in ("add", "increase") else "takes from")
        gap = "; ".join(f"{g['sector']} is {abs(g['gap_pp']):.1f} pp {'under' if g['gap_pp'] > 0 else 'over'} your target"
                        for g in gaps)
        moves.append(MoveWhy(ticker=m["ticker"], why=f"{m['ticker']} mostly holds {sectors}, so this {direction} "
                                                       f"those sectors{'. ' + gap if gap else ''}."))
    consider = []
    if any(m["action"] in ("reduce", "remove") for m in facts["moves"]):
        consider.append("Reducing a fund in a taxable account can mean paying tax on any gain. The plan doesn't "
                        "include taxes or transaction costs.")
    fee = facts.get("fees")
    if fee and fee["known_share"] > 0:
        consider.append(f"Yearly fund fees go from about {_money(fee['before'])} to {_money(fee['after'])}"
                        + ("" if fee["known_share"] >= 0.999 else " (for the funds whose fee we have)") + ".")
    left = [g for g in facts["gaps_after"] if abs(g["gap_pp"]) >= 1]
    if left:
        consider.append("Still away from your target: " + ", ".join(
            f"{g['sector']} {g['gap_pp']:+.1f} pp" for g in left[:3]) + ".")
    consider.append(f"Holdings data dates: {facts['data_dates']}. Funds change what they hold over time.")
    summary = (f"This plan moves {_money(facts['moved'])} between your ETFs, from a {_pct(facts['match_now'])} "
               f"match with your target to {_pct(facts['match_after'])}. It uses only the money already invested.")
    return PlanExplanation(summary=summary, moves=moves, consider=consider, source="rules")


def explain_plan(client, facts: dict) -> PlanExplanation:
    """Gemini's explanation of a plan, or the template. Never raises for a Gemini failure."""
    def make():
        if client is None:
            return plan_rules(facts)
        try:
            data, model = generate_json(client, PLAN_PROMPT, [{"role": "user", "text": json.dumps(facts, default=str)}],
                                        PLAN_SCHEMA)
            known = {m["ticker"] for m in facts["moves"]}
            out = PlanExplanation(
                summary=plain_words(data["summary"].strip()),
                moves=[MoveWhy(ticker=m["ticker"], why=plain_words(m["why"].strip()))
                       for m in data["moves"] if m.get("ticker") in known],
                consider=[plain_words(c.strip()) for c in data["consider"]][:4],
                source="gemini", model=model)
            return out if out.summary else plan_rules(facts)
        except (*FAILURES, KeyError, TypeError, AttributeError):
            return plan_rules(facts)
    return _cached("plan", facts, make)


def etf_rules(facts: dict) -> EtfExplanation:
    top = facts["top_sectors"][:2]
    sectors = " and ".join(f"{s['sector']} ({_pct(s['weight'])})" for s in top) or "sectors we can't label yet"
    names = ", ".join(h["name"] for h in facts["top_holdings"][:3])
    summary = (f"{facts['name']} holds {facts['positions']:,} positions, mostly in {sectors}."
               + (f" Its biggest holdings are {names}." if names else ""))
    points = [f"The 10 biggest holdings make up {_pct(facts['top10_share'])} of the fund."]
    if facts.get("expense_ratio") is not None:
        points.append(f"Its yearly fee is {facts['expense_ratio'] * 100:.2f}%, about "
                      f"{_money(facts['expense_ratio'] * 10000)} a year per $10,000.")
    points.append(f"Holdings as of {facts['as_of']}; the fund may hold different things today.")
    return EtfExplanation(summary=summary, points=points, source="rules")


def explain_etf(client, facts: dict) -> EtfExplanation:
    def make():
        if client is None:
            return etf_rules(facts)
        try:
            data, model = generate_json(client, ETF_PROMPT, [{"role": "user", "text": json.dumps(facts, default=str)}],
                                        ETF_SCHEMA)
            out = EtfExplanation(summary=plain_words(data["summary"].strip()),
                                 points=[plain_words(p.strip()) for p in data["points"]][:3],
                                 source="gemini", model=model)
            return out if out.summary else etf_rules(facts)
        except (*FAILURES, KeyError, TypeError, AttributeError):
            return etf_rules(facts)
    return _cached("etf", facts, make)
