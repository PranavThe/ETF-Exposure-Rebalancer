"""Full comparison of two snapshots: the body of GET /funds/{ticker}/changes."""

from datetime import date
from typing import Iterable, Mapping

from . import config
from .concentration import hhi, top_n_share
from .decompose import decompose
from .events import build_events, label
from .sectors import resolve_sector, sector_breakdown
from .weights import cash_weight, equity_positions


def compare_snapshots(rows_from: Iterable[Mapping], rows_to: Iterable[Mapping], *, fund: str,
                      from_date: date | str, to_date: date | str, sector_map: Mapping[str, str],
                      top_n: int = config.TOP_N, snapshot_intervals: int = 1) -> dict:
    """Compare snapshot A (rows_from, earlier) with snapshot B (rows_to, later).

    Rows are dicts with security_id, ticker, name, asset_class, shares, price (optional),
    market_value and source_sector (optional). All weights and effects in the result are fractions.
    """
    rows_from, rows_to = list(rows_from), list(rows_to)
    a, b = equity_positions(rows_from), equity_positions(rows_to)

    sectors_by_id = {}
    for sid in a.keys() | b.keys():
        source_sector = (b[sid].source_sector if sid in b else None) or (
            a[sid].source_sector if sid in a else None)
        sectors_by_id[sid] = resolve_sector(sid, source_sector, sector_map)

    d = decompose(a, b, sectors_by_id)
    holdings = d["holdings"]
    sectors = sector_breakdown(holdings)

    def weights(key: str) -> list[float]:
        return [h[key] for h in holdings]

    top = {k: top_n_share(weights(f"w_{k}"), top_n) for k in ("from", "cf", "to")}
    statuses = [h["status"] for h in holdings]
    summary = {
        "holdings_from": len(a),
        "holdings_to": len(b),
        "added": statuses.count("ADDED"),
        "removed": statuses.count("REMOVED"),
        "increased": statuses.count("INCREASED"),
        "decreased": statuses.count("DECREASED"),
        "top_n": top_n,
        "top_n_share": top,
        "hhi": {k: hhi(weights(f"w_{k}")) for k in ("from", "cf", "to")},
    }

    events = build_events(fund=fund, from_date=str(from_date), to_date=str(to_date),
                          holdings=holdings, sectors=sectors, top_n=top_n, top_n_share=top,
                          splits=d["splits"])

    return {
        "config_version": config.CONFIG_VERSION,
        "snapshot_intervals": snapshot_intervals,
        "flow_factor": d["flow_factor"],
        "cash_weight": {"from": cash_weight(rows_from), "to": cash_weight(rows_to)},
        "summary": summary,
        "sectors": sectors,
        "holdings": holdings,
        "events": events,
        "caveats": _caveats(holdings, sectors, d, snapshot_intervals),
    }


def _names(holdings: list[Mapping], limit: int = 5) -> str:
    names = [label(h) for h in holdings]
    more = f" and {len(names) - limit} more" if len(names) > limit else ""
    return ", ".join(names[:limit]) + more


def _caveats(holdings: list[dict], sectors: list[dict], d: dict, snapshot_intervals: int) -> list[str]:
    caveats = []
    if snapshot_intervals > 1:
        caveats.append(f"Changes are netted across {snapshot_intervals} snapshot intervals; "
                       "position changes that reversed within the period are invisible.")

    estimated = [h for h in holdings if h["price_estimated"]]
    if estimated:
        caveats.append(f"Price estimated for {_names(estimated)}: no later price exists for a removed "
                       "holding, so the counterfactual uses the earlier price.")

    splits = [h for h in holdings if h["security_id"] in d["splits"]]
    if splits:
        caveats.append(f"Suspected corporate action for {_names(splits)}: the share count change was "
                       "treated as a split, not as portfolio activity. Check the issuer's records.")

    if d["flow_fallback"]:
        caveats.append(f"Fewer than {config.MIN_FLOW_SECURITIES} holdings appear in both snapshots, so "
                       "the flow factor fell back to 1.0; fund flows may show up as portfolio activity.")

    unknown = next((s for s in sectors if s["sector"] == config.UNKNOWN_SECTOR), None)
    if unknown and max(unknown["w_from"], unknown["w_cf"], unknown["w_to"]) > 0:
        members = [h for h in holdings if h["sector"] == config.UNKNOWN_SECTOR]
        caveats.append(f"No sector mapping for {_names(members)}; shown in the Unknown sector.")
    return caveats
