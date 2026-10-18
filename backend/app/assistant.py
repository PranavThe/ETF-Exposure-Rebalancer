"""The assistant: turns what the user says into a target sector mix (and money in or out).

It never chooses a mix for the user. Claude reads the message when ANTHROPIC_API_KEY is set; without
a key a small rule-based reader handles plain requests ("less tech", "no energy", "30% health care").
Weights are fractions (0.25 = 25%) everywhere except the percentages Claude writes, which are
converted on the way in.
"""

import json
import math
import re
from typing import Literal

from pydantic import BaseModel, Field

from backend.analytics.rebalance import CASH_OTHER, SECTORS, UNCLASSIFIED, canonical_sector, sector_order

MODEL = "claude-opus-5-5"
TARGET_SECTORS = [s for s in SECTORS if s != UNCLASSIFIED]
Sector = Literal[
    "Technology", "Health Care", "Financials", "Consumer Discretionary", "Consumer Staples",
    "Communication Services", "Industrials", "Energy", "Utilities", "Materials", "Real Estate",
    "Cash & other",
]

SYSTEM_PROMPT = f"""You help a beginner investor set the sector mix they want for their ETF portfolio.

The user decides what they want. Your only job is to turn their words into a target mix and, when
they mention it, an amount of money they are adding or taking out. Never suggest what mix they
should want, never say whether a sector is a good or bad idea, and never predict markets. If they ask
for advice, say kindly that the choice is theirs, and offer to explain what a sector contains.

Each turn you get their current mix (from the ETFs they hold), their current target if they set one,
and their message. Start from the current target (or the current mix if there is none), change only
what they asked for, and spread any difference over the other sectors in proportion to their size,
so the total stays 100. "A bit" means about 3 percentage points, "more"/"less" about 5, "a lot"
about 10. "No X" or "none" means 0.

Sectors: {", ".join(TARGET_SECTORS)}. Map everyday words to these (tech -> Technology, banks ->
Financials, oil -> Energy, REITs -> Real Estate, retail -> Consumer Discretionary, telecom or media
-> Communication Services, food or household goods -> Consumer Staples, cash or bonds -> Cash & other).

Reply in one or two short, plain sentences that say what changed, using percentages for weights and
"pp" for differences. Never use the words "buy", "sell", "bought", "sold" or "trade"; say "add",
"increase" or "reduce". If the message doesn't change the mix (a question, a greeting), answer
briefly and set changed to false."""


class SectorPercent(BaseModel):
    sector: Sector
    percent: float


class Reading(BaseModel):
    """What Claude returns."""

    reply: str
    changed: bool = Field(description="True when this message changes the target mix")
    target: list[SectorPercent] = Field(description="The full target mix in percent; empty if unchanged")
    cash_change: float | None = Field(
        description="Dollars the user is adding (positive) or taking out (negative); null if not mentioned")


class AssistantResult(BaseModel):
    reply: str
    target: dict[str, float] | None  # fractions summing to 1; None when the message changes nothing
    cash_change: float | None
    source: Literal["claude", "rules"]


def tidy(mix: dict[str, float]) -> dict[str, float] | None:
    """Canonical sector names, non-negative, rescaled to sum to 1; None if nothing is left."""
    out: dict[str, float] = {}
    for sector, weight in mix.items():
        if math.isfinite(weight) and weight > 0:
            name = canonical_sector(sector)
            if name != UNCLASSIFIED:
                out[name] = out.get(name, 0.0) + weight
    total = math.fsum(out.values())
    if total <= 0:
        return None
    return {s: w / total for s, w in sorted(out.items(), key=lambda p: sector_order(p[0]))}


def _percent_list(mix: dict[str, float]) -> str:
    return ", ".join(f"{s} {w * 100:.1f}%" for s, w in sorted(mix.items(), key=lambda p: sector_order(p[0]))
                     if w > 0.0005) or "nothing yet"


def ask_claude(client, message: str, history: list[dict], current: dict[str, float],
               target: dict[str, float] | None, total: float) -> AssistantResult:
    """One Messages API call with a JSON-schema output; raises anthropic errors to the caller."""
    state = (f"Current mix: {_percent_list(current)}.\n"
             f"Current target: {_percent_list(target) if target else 'not set'}.\n"
             f"Portfolio value: ${total:,.0f}.")
    messages = [{"role": m["role"], "content": m["content"]} for m in history[-10:]]
    messages.append({"role": "user", "content": [
        {"type": "text", "text": state},
        {"type": "text", "text": message},
    ]})
    response = client.beta.messages.create(
        model=MODEL,
        max_tokens=16000,
        system=SYSTEM_PROMPT,
        messages=messages,
        output_config={"effort": "low", "format": {"type": "json_schema", "schema": READING_SCHEMA}},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
    )
    if response.stop_reason == "refusal":
        return AssistantResult(reply="I can't help with that one, but the sliders still work.",
                               target=None, cash_change=None, source="claude")
    text = next((b.text for b in response.content if b.type == "text"), "")
    reading = Reading.model_validate(json.loads(text))
    mix = tidy({p.sector: p.percent for p in reading.target}) if reading.changed else None
    cash = reading.cash_change if reading.cash_change and math.isfinite(reading.cash_change) else None
    return AssistantResult(reply=reading.reply.strip(), target=mix, cash_change=cash, source="claude")


READING_SCHEMA = {
    "type": "object",
    "properties": {
        "reply": {"type": "string"},
        "changed": {"type": "boolean"},
        "target": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "sector": {"type": "string", "enum": TARGET_SECTORS},
                    "percent": {"type": "number"},
                },
                "required": ["sector", "percent"],
                "additionalProperties": False,
            },
        },
        "cash_change": {"type": ["number", "null"]},
    },
    "required": ["reply", "changed", "target", "cash_change"],
    "additionalProperties": False,
}


# ---- Rule-based reader, used when no API key is configured -------------------------------------

WORDS = {
    "Technology": ["information technology", "technology", "tech", "software", "semiconductors", "chips"],
    "Health Care": ["health care", "healthcare", "health", "pharma", "biotech", "medical"],
    "Financials": ["financials", "financial", "finance", "banks", "banking", "insurance"],
    "Consumer Discretionary": ["consumer discretionary", "discretionary", "retail", "cars", "autos"],
    "Consumer Staples": ["consumer staples", "staples", "food", "household"],
    "Communication Services": ["communication services", "communications", "communication", "telecom", "media"],
    "Industrials": ["industrials", "industrial", "aerospace", "defense", "defence"],
    "Energy": ["energy", "oil", "gas"],
    "Utilities": ["utilities", "utility"],
    "Materials": ["materials", "mining", "chemicals"],
    "Real Estate": ["real estate", "reits", "reit", "property"],
    CASH_OTHER: ["cash", "bonds"],
}
_SECTOR_RE = re.compile(r"\b(" + "|".join(
    re.escape(w) for w in sorted((w for ws in WORDS.values() for w in ws), key=len, reverse=True)) + r")\b")
_LOOKUP = {w: s for s, ws in WORDS.items() for w in ws}
_ZERO = re.compile(r"\b(no|none|zero|without|avoid|get rid of|out of|exclude|cut out)\b")
_MORE = re.compile(r"\b(more|increase|higher|boost|add|raise|overweight|up)\b")
_LESS = re.compile(r"\b(less|reduce|lower|cut|decrease|fewer|trim|underweight|down)\b")
_BIG = re.compile(r"\b(a lot|much|way|significantly|lots)\b")
_SMALL = re.compile(r"\b(a bit|a little|slightly|bit)\b")
_PERCENT = re.compile(r"(\d+(?:\.\d+)?)\s*(?:%|percent\b)")
_PP = re.compile(r"(\d+(?:\.\d+)?)\s*(?:pp|points?|percentage points?)\b")
_MONEY = re.compile(r"\$?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|thousand)?\b")
_ADD_MONEY = re.compile(r"\b(add|adding|invest|investing|put in|deposit|top up)\b")
_TAKE_MONEY = re.compile(r"\b(take out|taking out|withdraw|withdrawing|pull out|cash out|need)\b")


def _cash(text: str) -> float | None:
    if not (_ADD_MONEY.search(text) or _TAKE_MONEY.search(text)) or _SECTOR_RE.search(text):
        return None
    for m in _MONEY.finditer(text):
        if "$" not in m.group(0) and not m.group(2):
            continue  # bare numbers are probably percentages, not dollars
        amount = float(m.group(1).replace(",", "")) * (1000 if m.group(2) else 1)
        if amount > 0:
            return -amount if _TAKE_MONEY.search(text) else amount
    return None


def rule_based(message: str, base: dict[str, float]) -> AssistantResult:
    """Apply simple, explicit requests to `base` (fractions). Unrecognised text changes nothing."""
    text = message.lower().replace("’", "'")
    fixed: dict[str, float] = {}
    shifts: dict[str, float] = {}
    cash: float | None = None
    # Commas inside numbers ("$2,000") and decimal points ("2.5%") don't end a clause.
    for clause in re.split(r",(?!\d{3}\b)|[;!?\n]|\.(?!\d)|\band\b|\bbut\b|\bwhile\b", text):
        sectors = [_LOOKUP[m.group(1)] for m in _SECTOR_RE.finditer(clause)]
        if not sectors:
            cash = cash if cash is not None else _cash(clause)
            continue
        percent, pp = _PERCENT.search(clause), _PP.search(clause)
        for sector in sectors:
            if _ZERO.search(clause):
                fixed[sector] = 0.0
            elif (pp or percent) and (_MORE.search(clause) or _LESS.search(clause)):
                step = float((pp or percent).group(1)) / 100
                shifts[sector] = shifts.get(sector, 0.0) + (-step if _LESS.search(clause) else step)
            elif percent:
                fixed[sector] = min(float(percent.group(1)) / 100, 1.0)
            elif _MORE.search(clause) or _LESS.search(clause):
                step = 0.10 if _BIG.search(clause) else 0.03 if _SMALL.search(clause) else 0.05
                shifts[sector] = shifts.get(sector, 0.0) + (-step if _LESS.search(clause) else step)

    if not fixed and not shifts:
        if cash is not None:
            verb = "adding" if cash > 0 else "taking out"
            return AssistantResult(reply=f"Got it: {verb} ${abs(cash):,.0f}. Your target mix stays the same.",
                                   target=None, cash_change=cash, source="rules")
        return AssistantResult(
            reply=("I can change your target when you name a sector, like \"less tech, more health care\", "
                   "\"no energy\" or \"30% financials\". The sliders work too."),
            target=None, cash_change=None, source="rules")

    mix = {s: base.get(s, 0.0) for s in TARGET_SECTORS}
    for sector, step in shifts.items():
        fixed.setdefault(sector, max(0.0, min(1.0, mix[sector] + step)))
    pinned = math.fsum(fixed.values())
    if pinned > 1:
        fixed = {s: w / pinned for s, w in fixed.items()}
        pinned = 1.0
    rest = {s: w for s, w in mix.items() if s not in fixed}
    rest_total = math.fsum(rest.values())
    target = dict(fixed)
    for sector, weight in rest.items():
        target[sector] = (1 - pinned) * weight / rest_total if rest_total > 0 else 0.0
    if rest_total <= 0 and pinned < 1:
        target = {s: w / pinned for s, w in fixed.items()} if pinned > 0 else {}
    mix_after = tidy(target)
    if mix_after is None:
        return AssistantResult(reply="That would leave nothing in any sector, so I left your target as it was.",
                               target=None, cash_change=cash, source="rules")
    changes = [f"{s} {base.get(s, 0.0) * 100:.0f}% → {mix_after.get(s, 0.0) * 100:.0f}%" for s in fixed]
    reply = "Done: " + ", ".join(changes) + "."
    if rest_total > 0 and pinned < 1 and len(fixed) < len(TARGET_SECTORS):
        reply += " The other sectors were scaled so the total stays 100%."
    if cash is not None:
        reply += f" I also noted {'adding' if cash > 0 else 'taking out'} ${abs(cash):,.0f}."
    return AssistantResult(reply=reply, target=mix_after, cash_change=cash, source="rules")
