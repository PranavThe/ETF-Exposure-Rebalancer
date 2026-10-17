"""Counterfactual weights, flow factor, split detection and the price/activity split.

w0 = A's weights, w1 = B's weights, wcf = A's share counts at B's prices.
price_effect = wcf - w0 and activity_effect = w1 - wcf, so the two always sum to w1 - w0.
"""

from statistics import median
from typing import Mapping

from . import config
from .weights import Position, normalize


def flow_factor(a: dict[str, Position], b: dict[str, Position]) -> tuple[float, bool]:
    """Median s_B / s_A over common holdings. Returns (factor, fell_back_to_1)."""
    ratios = [b[sid].shares / a[sid].shares for sid in a if sid in b]
    if len(ratios) < config.MIN_FLOW_SECURITIES:
        return 1.0, True
    return median(ratios), False


def split_ratio(pos_a: Position, pos_b: Position, factor: float) -> float | None:
    """The flow-adjusted share ratio r when the change looks like a split, else None."""
    if pos_a.price <= 0 or pos_b.price <= 0:
        return None
    r = (pos_b.shares / pos_a.shares) / factor
    tol = config.SPLIT_RATIO_TOLERANCE + config.EPSILON
    if not any(abs(x / k - 1) <= tol for k in config.SPLIT_RATIOS for x in (r, 1 / r)):
        return None
    if abs((pos_b.price / pos_a.price) * r - 1) > config.SPLIT_PRICE_TOLERANCE + config.EPSILON:
        return None
    return r


def _status(adj_share_change: float) -> str:
    threshold = config.POSITION_SHARE_THRESHOLD - config.EPSILON
    if adj_share_change >= threshold:
        return "INCREASED"
    if adj_share_change <= -threshold:
        return "DECREASED"
    return "UNCHANGED"


def decompose(a: dict[str, Position], b: dict[str, Position], sectors: Mapping[str, str]) -> dict:
    """Per-holding weights, effects and statuses for snapshots A (earlier) and B (later).

    `sectors` maps every security_id in A or B to its resolved sector.
    Returns {"flow_factor", "flow_fallback", "splits": {security_id: r}, "holdings": [...]}.
    """
    factor, fell_back = flow_factor(a, b)
    ids = sorted(a.keys() | b.keys())

    splits: dict[str, float] = {}
    mv_cf: dict[str, float] = {}
    for sid in ids:
        pa, pb = a.get(sid), b.get(sid)
        if pa and pb:
            r = split_ratio(pa, pb, factor)
            if r is not None:
                splits[sid] = r
            mv_cf[sid] = pa.shares * (r if r is not None else 1.0) * pb.price
        elif pa:
            mv_cf[sid] = pa.shares * pa.price  # removed: no later price, use the earlier one
        else:
            mv_cf[sid] = 0.0  # added

    w0 = normalize({sid: a[sid].market_value if sid in a else 0.0 for sid in ids})
    w1 = normalize({sid: b[sid].market_value if sid in b else 0.0 for sid in ids})
    wcf = normalize(mv_cf)

    holdings = []
    for sid in ids:
        pa, pb = a.get(sid), b.get(sid)
        if pa and pb:
            adj = 0.0 if sid in splits else (pb.shares / pa.shares) / factor - 1
            status = "UNCHANGED" if sid in splits else _status(adj)
        else:
            adj = None
            status = "ADDED" if pb else "REMOVED"
        traded = status != "UNCHANGED"
        price_estimated = status == "REMOVED"
        activity = w1[sid] - wcf[sid]

        flags = []
        if sid in splits:
            flags.append("SUSPECTED_CORPORATE_ACTION")
        if price_estimated:
            flags.append("PRICE_ESTIMATED")
        if not traded and abs(activity) > config.EPSILON:
            flags.append("DILUTION")

        latest = pb or pa
        holdings.append({
            "security_id": sid,
            "ticker": latest.ticker,
            "name": latest.name,
            "sector": sectors[sid],
            "status": status,
            "traded": traded,
            "shares_from": pa.shares if pa else 0.0,
            "shares_to": pb.shares if pb else 0.0,
            "adj_share_change": adj,
            "price_from": pa.price if pa else None,
            "price_to": pb.price if pb else None,
            "price_estimated": price_estimated,
            "w_from": w0[sid],
            "w_cf": wcf[sid],
            "w_to": w1[sid],
            "price_effect": wcf[sid] - w0[sid],
            "activity_effect": activity,
            "flags": flags,
        })

    holdings.sort(key=lambda h: (-abs(h["w_to"] - h["w_from"]), h["security_id"]))
    return {"flow_factor": factor, "flow_fallback": fell_back, "splits": splits, "holdings": holdings}
