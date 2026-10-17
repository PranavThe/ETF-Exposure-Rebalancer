"""Change events and their descriptions.

Descriptions follow the language rules in SPEC §9: weight changes in pp, each one shown with its
price/activity split, and no words that imply knowledge of the manager's transactions or intent.
"""

import hashlib
from typing import Mapping

from . import config

MINUS = "−"

POSITION_EVENT = {
    "ADDED": "POSITION_ADDED",
    "REMOVED": "POSITION_REMOVED",
    "INCREASED": "POSITION_INCREASED",
    "DECREASED": "POSITION_DECREASED",
}


def event_id(fund: str, from_date: str, to_date: str, type_: str, subject: str) -> str:
    raw = f"{fund}|{from_date}|{to_date}|{type_}|{subject}|{config.CONFIG_VERSION}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def fmt_pp(x: float) -> str:
    """Format a fraction as signed percentage points: 0.05 -> '+5.0 pp'."""
    v = round(x * 100, 1)
    if v == 0:
        return "0.0 pp"
    return f"{'+' if v > 0 else MINUS}{abs(v):.1f} pp"


def split_text(total: float, price: float, activity: float) -> str:
    return f"{fmt_pp(total)} (price {fmt_pp(price)}, portfolio activity {fmt_pp(activity)})"


def label(h: Mapping) -> str:
    return h["ticker"] or h["name"] or h["security_id"]


def _position_description(h: Mapping) -> str:
    weight = split_text(h["w_to"] - h["w_from"], h["price_effect"], h["activity_effect"])
    status = h["status"]
    if status == "ADDED":
        return f"New position in {label(h)}: weight {weight}"
    if status == "REMOVED":
        return f"Position in {label(h)} removed: weight {weight}"
    change = h["adj_share_change"] * 100
    sign = "+" if change >= 0 else MINUS
    verb = "Increased" if status == "INCREASED" else "Decreased"
    return (f"{verb} position in {label(h)}: flow-adjusted share count {sign}{abs(change):.1f}%, "
            f"weight {weight}")


def _split_description(h: Mapping, r: float) -> str:
    kind = f"{round(r)}-for-1 split" if r >= 1 else f"1-for-{round(1 / r)} reverse split"
    return (f"{label(h)} share count ×{r:.2f} with an offsetting price move: suspected {kind}, "
            f"not counted as portfolio activity")


def build_events(*, fund: str, from_date: str, to_date: str, holdings: list[dict],
                 sectors: list[dict], top_n: int, top_n_share: Mapping[str, float],
                 splits: Mapping[str, float]) -> list[dict]:
    """Events in display order: sectors, concentration, positions, corporate actions."""
    eps = config.EPSILON

    def event(type_: str, subject: str, magnitude: float, description: str, contributors: list[str]):
        return {
            "id": event_id(fund, from_date, to_date, type_, subject),
            "type": type_,
            "subject": subject,
            "magnitude": magnitude,
            "description": description,
            "contributing_security_ids": contributors,
        }

    def by_abs_magnitude(events: list[dict]) -> list[dict]:
        return sorted(events, key=lambda e: (-abs(e["magnitude"]), e["subject"]))

    sector_events = []
    for s in sectors:
        if abs(s["drift"]) >= config.SECTOR_DRIFT_THRESHOLD - eps:
            members = sorted((h for h in holdings if h["sector"] == s["sector"]),
                             key=lambda h: (-abs(h["w_to"] - h["w_from"]), h["security_id"]))
            sector_events.append(event(
                "SECTOR_INCREASE" if s["drift"] > 0 else "SECTOR_DECREASE",
                s["sector"],
                s["drift"],
                f"{s['sector']} exposure {split_text(s['drift'], s['price_effect'], s['activity_effect'])}",
                [h["security_id"] for h in members],
            ))

    concentration_events = []
    change = top_n_share["to"] - top_n_share["from"]
    if abs(change) >= config.CONCENTRATION_THRESHOLD - eps:
        top = sorted((h for h in holdings if h["w_to"] > 0),
                     key=lambda h: (-h["w_to"], h["security_id"]))[:top_n]
        price = top_n_share["cf"] - top_n_share["from"]
        activity = top_n_share["to"] - top_n_share["cf"]
        concentration_events.append(event(
            "CONCENTRATION_INCREASE" if change > 0 else "CONCENTRATION_DECREASE",
            "portfolio",
            change,
            f"Top-{top_n} concentration {split_text(change, price, activity)}",
            [h["security_id"] for h in top],
        ))

    position_events = []
    for h in holdings:
        status = h["status"]
        if status in ("INCREASED", "DECREASED") and (
            abs(h["activity_effect"]) < config.POSITION_ACTIVITY_THRESHOLD - eps
        ):
            continue
        if status in POSITION_EVENT:
            position_events.append(event(POSITION_EVENT[status], h["security_id"], h["activity_effect"],
                                         _position_description(h), [h["security_id"]]))

    split_events = []
    for h in holdings:
        if h["security_id"] in splits:
            r = splits[h["security_id"]]
            split_events.append(event("SUSPECTED_CORPORATE_ACTION", h["security_id"], r,
                                      _split_description(h, r), [h["security_id"]]))

    return (by_abs_magnitude(sector_events) + concentration_events
            + by_abs_magnitude(position_events) + sorted(split_events, key=lambda e: e["subject"]))
