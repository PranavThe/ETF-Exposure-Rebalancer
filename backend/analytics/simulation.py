"""Portfolio weight scenarios and their concentration/sector risk profile."""

from math import isfinite
from typing import Iterable, Mapping

from . import config
from .concentration import hhi, top_n_share
from .sectors import resolve_sector
from .weights import equity_positions, normalize


def simulate_portfolio(rows: Iterable[Mapping], target_weights: Mapping[str, float], *,
                       sector_map: Mapping[str, str], top_n: int = config.TOP_N) -> dict:
    """Compare current equity weights with a fully specified target allocation.

    ``target_weights`` maps every current equity security_id to its target portfolio weight as a
    fraction (0.10 = 10%). The target weights must sum to 1; a zero weight removes a position.
    Scenario securities are limited to those in the supplied snapshot because no price or sector
    data is available for new securities.

    Risk measures are descriptive concentration and sector exposure measures, not volatility or
    a forecast of investment outcomes.
    """
    if top_n < 1:
        raise ValueError("top_n must be at least 1")

    positions = equity_positions(rows)
    if not positions:
        raise ValueError("snapshot has no positive-share equity positions to simulate")

    expected_ids = set(positions)
    supplied_ids = set(target_weights)
    if supplied_ids != expected_ids:
        missing = sorted(expected_ids - supplied_ids)
        extra = sorted(supplied_ids - expected_ids)
        details = []
        if missing:
            details.append(f"missing target weights for: {', '.join(missing)}")
        if extra:
            details.append(f"unknown securities: {', '.join(extra)}")
        raise ValueError("target_weights must cover exactly the snapshot's equity positions (" +
                         "; ".join(details) + ")")

    targets = {sid: float(target_weights[sid]) for sid in expected_ids}
    if any(not isfinite(weight) or weight < 0 for weight in targets.values()):
        raise ValueError("target weights must be finite, non-negative fractions")
    total_target = sum(targets.values())
    if not isfinite(total_target) or abs(total_target - 1.0) > config.EPSILON:
        raise ValueError("target weights must sum to 1.0")

    current_weights = normalize({sid: pos.market_value for sid, pos in positions.items()})
    sectors = {
        sid: resolve_sector(sid, pos.source_sector, sector_map)
        for sid, pos in positions.items()
    }

    def profile(weights: Mapping[str, float]) -> dict:
        by_sector: dict[str, float] = {}
        for sid, weight in weights.items():
            sector = sectors[sid]
            by_sector[sector] = by_sector.get(sector, 0.0) + weight
        sector_rows = [
            {"sector": sector, "weight": weight}
            for sector, weight in by_sector.items()
        ]
        sector_rows.sort(key=lambda item: (-item["weight"], item["sector"]))
        largest_sector = sector_rows[0] if sector_rows else {"sector": None, "weight": 0.0}
        return {
            "top_n": top_n,
            "top_n_share": top_n_share(weights.values(), top_n),
            "hhi": hhi(weights.values()),
            "largest_holding_weight": max(weights.values(), default=0.0),
            "largest_sector": largest_sector["sector"],
            "largest_sector_weight": largest_sector["weight"],
            "sectors": sector_rows,
        }

    current_profile = profile(current_weights)
    target_profile = profile(targets)
    current_sectors = {item["sector"]: item["weight"] for item in current_profile["sectors"]}
    target_sectors = {item["sector"]: item["weight"] for item in target_profile["sectors"]}
    sector_names = sorted(current_sectors.keys() | target_sectors.keys())

    holdings = []
    for sid in sorted(positions):
        pos = positions[sid]
        current = current_weights[sid]
        target = targets[sid]
        holdings.append({
            "security_id": sid,
            "ticker": pos.ticker,
            "name": pos.name,
            "sector": sectors[sid],
            "weight_current": current,
            "weight_target": target,
            "weight_change": target - current,
        })

    sector_changes = [
        {
            "sector": sector,
            "weight_current": current_sectors.get(sector, 0.0),
            "weight_target": target_sectors.get(sector, 0.0),
            "weight_change": target_sectors.get(sector, 0.0) - current_sectors.get(sector, 0.0),
        }
        for sector in sector_names
    ]

    return {
        "risk_scope": "concentration_and_sector_exposure",
        "top_n": top_n,
        "current": current_profile,
        "scenario": target_profile,
        "change": {
            "top_n_share": target_profile["top_n_share"] - current_profile["top_n_share"],
            "hhi": target_profile["hhi"] - current_profile["hhi"],
            "largest_holding_weight": (target_profile["largest_holding_weight"] -
                                        current_profile["largest_holding_weight"]),
            "largest_sector_weight": (target_profile["largest_sector_weight"] -
                                       current_profile["largest_sector_weight"]),
        },
        "holdings": holdings,
        "sectors": sector_changes,
        "caveats": [
            "Risk profile covers concentration and sector exposure only; it does not estimate "
            "volatility, correlations, or future returns.",
            "Scenario weights cover only equity positions in the selected snapshot. New securities "
            "and cash allocations are not included.",
        ],
    }
