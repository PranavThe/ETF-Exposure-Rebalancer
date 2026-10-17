"""Aggregate latest fund holdings using user assigned portfolio weights."""

from collections import defaultdict


def analyze_latest(latest: dict) -> dict:
    exposures: dict[str, dict] = {}
    sectors: dict[str, float] = defaultdict(float)
    asset_classes: dict[str, float] = defaultdict(float)
    dates = [fund["as_of_date"] for fund in latest["funds"] if fund["as_of_date"]]
    for fund in latest["funds"]:
        if fund["status"] != "available":
            continue
        holdings = fund["holdings"]
        total = sum(max(0.0, row["market_value"]) for row in holdings)
        if total <= 0:
            continue
        for row in holdings:
            if row["market_value"] <= 0:
                continue
            weight = fund["weight"] * row["market_value"] / total
            security_id = row["security_id"]
            item = exposures.setdefault(security_id, {
                "security_id": security_id,
                "ticker": row["ticker"],
                "name": row["name"],
                "asset_class": row["asset_class"],
                "sector": row["sector"],
                "weight": 0.0,
                "funds": [],
            })
            item["weight"] += weight
            item["funds"].append(fund["ticker"])
            sectors[row["sector"]] += weight
            asset_classes[row["asset_class"]] += weight
    ordered = sorted(exposures.values(), key=lambda row: (-row["weight"], row["security_id"]))
    return {
        "portfolio": latest["portfolio"],
        "coverage_weight": latest["coverage_weight"],
        "analyzed_weight": sum(asset_classes.values()),
        "newest_as_of_date": max(dates) if dates else None,
        "funds": [{key: fund[key] for key in
                   ("ticker", "name", "issuer", "weight", "status", "as_of_date")}
                  for fund in latest["funds"]],
        "top_exposures": ordered[:25],
        "overlap": [row for row in ordered if len(set(row["funds"])) >= 2][:25],
        "sectors": [{"name": name, "weight": weight} for name, weight in
                    sorted(sectors.items(), key=lambda pair: (-pair[1], pair[0]))],
        "asset_classes": [{"name": name, "weight": weight} for name, weight in
                          sorted(asset_classes.items(), key=lambda pair: (-pair[1], pair[0]))],
        "caveats": [
            "Each fund uses its latest available snapshot; dates may differ.",
            "Overlap matches exact stored security IDs; unmatched identifiers can understate overlap.",
            "Missing funds retain their portfolio weight and are excluded from exposure totals.",
        ],
    }
