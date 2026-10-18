"""Scythe, the assistant: turns what the user says into a target sector mix.

It never chooses a mix for the user. Gemini reads the message when GEMINI_API_KEY is set; without
a key a small rule-based reader handles plain requests ("less tech", "no energy", "30% health care").
Weights are fractions (0.25 = 25%) everywhere except the percentages Gemini writes, which are
converted on the way in.
"""

import json
import math
import re
from typing import Literal

from pydantic import BaseModel, Field

from backend.analytics.rebalance import CASH_OTHER, SECTORS, UNCLASSIFIED, canonical_sector, sector_order

from .llm import generate_json

TARGET_SECTORS = [s for s in SECTORS if s != UNCLASSIFIED]
REAL_SECTORS = [s for s in TARGET_SECTORS if s != CASH_OTHER]
Sector = Literal[
    "Technology", "Health Care", "Financials", "Consumer Discretionary", "Consumer Staples",
    "Communication Services", "Industrials", "Energy", "Utilities", "Materials", "Real Estate",
    "Cash & other",
]

SYSTEM_PROMPT = f"""You are Scythe. You help a beginner investor set the sector mix they want for their
ETF portfolio.

The user decides what they want. Your only job is to read what they want changed in their target
mix and fill in the fields below; the app does all the arithmetic. Never suggest what mix they
should want, never say whether a sector is a good or bad idea, and never predict markets. If they
ask for advice, say kindly that the choice is theirs, and offer to explain what a sector contains.
The plans always work with the money already in their ETFs; if they mention adding or taking out
money, tell them to change that ETF's dollar amount in their holdings list, and change nothing.

Each turn you get their current mix (from the ETFs they hold), their current target if they set
one, and their message. Fields:
- set: sectors given an exact percentage. "30% financials" -> Financials 30. "No energy" -> Energy 0.
  "Make it 50/50 tech and utilities" -> Technology 50, Utilities 50. "Split evenly between tech,
  health care and financials" -> 33.33 each. When the set sectors add up to 100, all others become 0.
- adjust: changes in percentage points. "Less tech" -> Technology -5. "A bit more health care" -> +3.
  "A lot more" -> +10. "Tech up 8 points" -> +8. "Move 10 points from tech to health care" ->
  Technology -10, Health Care +10.
- scale: multiples. "Cut tech in half" -> Technology 0.5. "Double utilities" -> Utilities 2.
- cap_percent: a ceiling for every sector, as in "no more than 20% in any sector" -> 20. Otherwise 0.
- equal: true only when they want every sector weighted equally.
- reset: true when they want the target to go back to their current mix.
The app spreads any difference over the sectors they didn't name, in proportion to their size.
A follow-up like "a bit more" refers to the sector discussed just before. If the message changes
nothing (a greeting, a question, advice, money), leave set, adjust and scale empty, cap_percent 0,
equal and reset false.

Sectors: {", ".join(TARGET_SECTORS)}. Map everyday words to these (tech -> Technology, banks ->
Financials, oil -> Energy, REITs -> Real Estate, retail -> Consumer Discretionary, telecom or media
-> Communication Services, food or household goods -> Consumer Staples, cash or bonds -> Cash & other).

reply: one or two short, plain sentences saying in words what you changed, for example "I lowered
Technology by 5 pp and raised Health Care by 5 pp." Don't state the resulting percentages: the app
adds them. Use "pp" for differences. Never use the words "buy", "sell", "bought", "sold" or "trade";
say "add", "increase" or "reduce"."""


class SectorPercent(BaseModel):
    sector: Sector
    percent: float


class SectorPoints(BaseModel):
    sector: Sector
    pp: float


class SectorFactor(BaseModel):
    sector: Sector
    factor: float = Field(ge=0)


class Intent(BaseModel):
    """What Gemini reads from a message: the changes, never the resulting numbers."""

    reply: str
    set: list[SectorPercent] = Field(default_factory=list)
    adjust: list[SectorPoints] = Field(default_factory=list)
    scale: list[SectorFactor] = Field(default_factory=list)
    cap_percent: float = 0.0
    equal: bool = False
    reset: bool = False


class AssistantResult(BaseModel):
    reply: str
    target: dict[str, float] | None  # fractions summing to 1; None when the message changes nothing
    source: Literal["gemini", "rules"]
    model: str | None = None  # the Gemini model that answered


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


def ask_gemini(client, message: str, history: list[dict], current: dict[str, float],
               target: dict[str, float] | None, total: float) -> AssistantResult:
    """Gemini reads the request; apply_changes does the arithmetic. Raises llm.FAILURES."""
    state = (f"Current mix: {_percent_list(current)}.\n"
             f"Current target: {_percent_list(target) if target else 'not set'}.\n"
             f"Portfolio value: ${total:,.0f}.")
    turns = [{"role": "model" if m["role"] == "assistant" else "user", "text": m["content"]}
             for m in history[-10:]]
    turns.append({"role": "user", "text": f"{state}\n\n{message}"})
    data, model = generate_json(client, SYSTEM_PROMPT, turns, INTENT_SCHEMA)
    intent = Intent.model_validate(data)
    reply = plain_words(intent.reply.strip())
    base = target or current
    if intent.reset:
        new = tidy(current)
        named = list(new or {})
    elif intent.equal:
        new = {s: 1 / len(REAL_SECTORS) for s in REAL_SECTORS}
        named = REAL_SECTORS
    else:
        fixed = {c.sector: c.percent / 100 for c in intent.set}
        shifts = {c.sector: c.pp / 100 for c in intent.adjust}
        scales = {c.sector: c.factor for c in intent.scale}
        cap = intent.cap_percent / 100 if intent.cap_percent > 0 else None
        new = apply_changes(base, fixed, shifts, scales, cap) if fixed or shifts or scales or cap else None
        named = list(dict.fromkeys([*fixed, *shifts, *scales]))
    if new is None or all(abs(new.get(s, 0.0) - base.get(s, 0.0)) < 1e-9 for s in set(new) | set(base)):
        return AssistantResult(reply=reply, target=None, source="gemini", model=model)
    summary = describe(base, new, named)
    return AssistantResult(reply=f"{reply} {summary}".strip(), target=new, source="gemini", model=model)


def _pct(w: float) -> str:
    return f"{w * 100:.1f}".removesuffix(".0") + "%"


def describe(base: dict[str, float], new: dict[str, float], named: list[str]) -> str:
    """'Technology 52.6% → 47.6%, Health Care 8.4% → 13.4%.' for the sectors the change was about."""
    moved = [s for s in named if abs(new.get(s, 0.0) - base.get(s, 0.0)) >= 0.0005]
    if not moved:  # e.g. a cap: list the biggest moves instead
        moved = sorted((s for s in set(new) | set(base) if abs(new.get(s, 0.0) - base.get(s, 0.0)) >= 0.0005),
                       key=lambda s: -abs(new.get(s, 0.0) - base.get(s, 0.0)))[:3]
    return ", ".join(f"{s} {_pct(base.get(s, 0.0))} → {_pct(new.get(s, 0.0))}" for s in moved[:6]) + "."


def apply_changes(base: dict[str, float], fixed: dict[str, float] | None = None,
                  shifts: dict[str, float] | None = None, scales: dict[str, float] | None = None,
                  cap: float | None = None) -> dict[str, float] | None:
    """The new target, from `base` (fractions): `fixed` sectors set outright, `shifts` moved by
    that many points and `scales` multiplied, each kept within 0-100%. The sectors not named keep
    their proportions of what is left; then no sector stays above `cap`. None if nothing is left."""
    mix = {s: base.get(s, 0.0) for s in TARGET_SECTORS}
    fixed = {s: min(max(w, 0.0), 1.0) for s, w in (fixed or {}).items()}
    for sector, factor in (scales or {}).items():
        fixed.setdefault(sector, min(mix[sector] * factor, 1.0))
    for sector, step in (shifts or {}).items():
        fixed.setdefault(sector, max(0.0, min(1.0, mix[sector] + step)))
    pinned = math.fsum(fixed.values())
    if pinned > 1 or pinned >= 0.995 and len(fixed) > 1:  # 33.33 x 3 means "all of it"
        fixed = {s: w / pinned for s, w in fixed.items()}
        pinned = 1.0
    rest = {s: w for s, w in mix.items() if s not in fixed}
    rest_total = math.fsum(rest.values())
    target = dict(fixed)
    for sector, weight in rest.items():
        target[sector] = (1 - pinned) * weight / rest_total if rest_total > 0 else 0.0
    if rest_total <= 0 and pinned < 1:
        target = {s: w / pinned for s, w in fixed.items()} if pinned > 0 else {}
    result = tidy(target)
    if result is not None and cap is not None and cap * len(REAL_SECTORS) >= 1:
        result = tidy(_capped(result, cap))
    return result


def _capped(mix: dict[str, float], cap: float) -> dict[str, float]:
    """No sector above `cap`: the excess goes to the sectors under it, in proportion to their size
    (evenly when they are all empty), repeated until nothing is over."""
    out = {s: mix.get(s, 0.0) for s in REAL_SECTORS + [CASH_OTHER]}
    for _ in range(len(out)):
        excess = math.fsum(w - cap for w in out.values() if w > cap)
        if excess <= 1e-12:
            break
        under = [s for s, w in out.items() if w < cap - 1e-12 and s in REAL_SECTORS]
        room = math.fsum(out[s] for s in under)
        for s in out:
            out[s] = min(out[s], cap)
        for s in under:
            out[s] += excess * (out[s] / room if room > 0 else 1 / len(under))
    return out


# The UI never says buy, sell or trade, or what anyone believes or thinks (SPEC §9). The prompt asks
# for this, but a reply that refuses a request sometimes echoes the user's words, so swap them here.
PLAIN_WORDS = [
    (r"exchange-traded funds", "ETFs"), (r"exchange-traded fund", "ETF"), (r"exchange-traded", "listed"),
    (r"buy(?:ing)? (?:or|and) sell(?:ing)?", "pick"), (r"trade-offs", "compromises"), (r"trade-off", "compromise"),
    (r"bought", "added"), (r"buying", "adding"), (r"buys", "adds"), (r"buy", "add"),
    (r"sold", "reduced"), (r"selling", "reducing"), (r"sells", "reduces"), (r"sell", "reduce"),
    (r"trading", "investment"), (r"traded", "moved"), (r"trades", "moves"), (r"trade", "move"),
    (r"believes", "says"), (r"thinks", "says"),
]


def plain_words(text: str) -> str:
    for word, plain in PLAIN_WORDS:
        text = re.sub(rf"\b{word}\b", lambda m: plain.capitalize() if m.group(0)[0].isupper() else plain,
                      text, flags=re.IGNORECASE)
    return text

INTENT_SCHEMA = {
    "type": "object",
    "properties": {
        "reply": {"type": "string"},
        "set": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"sector": {"type": "string", "enum": TARGET_SECTORS}, "percent": {"type": "number"}},
                "required": ["sector", "percent"],
            },
        },
        "adjust": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"sector": {"type": "string", "enum": TARGET_SECTORS}, "pp": {"type": "number"}},
                "required": ["sector", "pp"],
            },
        },
        "scale": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"sector": {"type": "string", "enum": TARGET_SECTORS}, "factor": {"type": "number"}},
                "required": ["sector", "factor"],
            },
        },
        "cap_percent": {"type": "number"},
        "equal": {"type": "boolean"},
        "reset": {"type": "boolean"},
    },
    "required": ["reply", "set", "adjust", "scale", "cap_percent", "equal", "reset"],
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
# Money talk: a dollar amount, or "1.5k", next to adding or taking out.
_MONEY = re.compile(r"\$\s*\d|\b\d[\d,.]*\s*(k|thousand|grand)\b")
_MONEY_VERB = re.compile(r"\b(add|adding|invest|investing|put in|deposit|top up|take out|taking out|withdraw|"
                         r"withdrawing|pull out|cash out|need)\b")
MONEY_REPLY = ("Plans always use the money already in your ETFs. If you've added or taken out money, change "
               "that ETF's dollar amount in your holdings, and I'll keep your target as it is.")


def rule_based(message: str, base: dict[str, float]) -> AssistantResult:
    """Apply simple, explicit requests to `base` (fractions). Unrecognised text changes nothing."""
    text = message.lower().replace("’", "'")
    fixed: dict[str, float] = {}
    shifts: dict[str, float] = {}
    money = False
    # Commas inside numbers ("$2,000") and decimal points ("2.5%") don't end a clause.
    for clause in re.split(r",(?!\d{3}\b)|[;!?\n]|\.(?!\d)|\band\b|\bbut\b|\bwhile\b", text):
        sectors = [_LOOKUP[m.group(1)] for m in _SECTOR_RE.finditer(clause)]
        if not sectors:
            money = money or bool(_MONEY.search(clause) and _MONEY_VERB.search(clause))
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
        if money:
            return AssistantResult(reply=MONEY_REPLY, target=None, source="rules")
        return AssistantResult(
            reply=("I can change your target when you name a sector, like \"less tech, more health care\", "
                   "\"no energy\" or \"30% financials\". The sliders work too."),
            target=None, source="rules")

    mix_after = apply_changes(base, fixed, shifts)
    if mix_after is None:
        return AssistantResult(reply="That would leave nothing in any sector, so I left your target as it was.",
                               target=None, source="rules")
    reply = "Done: " + describe(base, mix_after, list(dict.fromkeys([*fixed, *shifts])))
    if len(fixed) + len(shifts) < len(TARGET_SECTORS) and mix_after.keys() - fixed.keys() - shifts.keys():
        reply += " The other sectors were scaled so the total stays 100%."
    if money:
        reply += " Plans use the money already in your ETFs; change an amount in your holdings to add or take out money."
    return AssistantResult(reply=reply, target=mix_after, source="rules")
