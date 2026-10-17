"""Sector resolution and per-sector aggregation."""

from typing import Iterable, Mapping

from . import config


def resolve_sector(security_id: str, source_sector: str | None, sector_map: Mapping[str, str]) -> str:
    """Reference mapping, then the issuer's sector, then Unknown."""
    return sector_map.get(security_id) or (source_sector or "").strip() or config.UNKNOWN_SECTOR


def sector_breakdown(holdings: Iterable[Mapping]) -> list[dict]:
    """Sum weights and effects by sector, splitting activity into direct and dilution.

    activity_direct sums activity_effect over traded holdings, activity_dilution over the rest.
    """
    sums: dict[str, dict[str, float]] = {}
    for h in holdings:
        s = sums.setdefault(h["sector"], dict.fromkeys(("w_from", "w_cf", "w_to", "direct", "dilution"), 0.0))
        s["w_from"] += h["w_from"]
        s["w_cf"] += h["w_cf"]
        s["w_to"] += h["w_to"]
        s["direct" if h["traded"] else "dilution"] += h["activity_effect"]

    sectors = [
        {
            "sector": name,
            "w_from": s["w_from"],
            "w_cf": s["w_cf"],
            "w_to": s["w_to"],
            "drift": s["w_to"] - s["w_from"],
            "price_effect": s["w_cf"] - s["w_from"],
            "activity_effect": s["w_to"] - s["w_cf"],
            "activity_direct": s["direct"],
            "activity_dilution": s["dilution"],
        }
        for name, s in sums.items()
    ]
    sectors.sort(key=lambda s: (-s["w_to"], -s["w_from"], s["sector"]))
    return sectors
