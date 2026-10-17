"""SPEC §10 expected values. Never edit these to make a test pass."""

import math

ABS_TOL = 1e-9

# DEMO 2026-10-01 -> 2026-10-02, top_n = 2.
# security_id, status, adj_share_change, w0, wcf, w1, price_effect, activity_effect
DEMO_HOLDINGS = [
    ("AAA", "UNCHANGED", 0.0, 1 / 4, 1 / 3, 3 / 10, 1 / 12, -1 / 30),
    ("BBB", "INCREASED", 0.5, 1 / 4, 2 / 9, 3 / 10, -1 / 36, 7 / 90),
    ("CCC", "REMOVED", None, 1 / 4, 2 / 9, 0.0, -1 / 36, -2 / 9),
    ("DDD", "UNCHANGED", 0.0, 1 / 4, 2 / 9, 1 / 5, -1 / 36, -1 / 45),
    ("EEE", "ADDED", None, 0.0, 0.0, 1 / 5, 0.0, 1 / 5),
]

# sector, w0, wcf, w1, drift, price_effect, activity_effect, activity_direct, activity_dilution
DEMO_SECTORS = [
    ("Technology", 1 / 2, 5 / 9, 1 / 2, 0.0, 1 / 18, -1 / 18, 0.0, -1 / 18),
    ("Health Care", 1 / 4, 2 / 9, 3 / 10, 1 / 20, -1 / 36, 7 / 90, 7 / 90, 0.0),
    ("Financials", 1 / 4, 2 / 9, 1 / 5, -1 / 20, -1 / 36, -1 / 45, -1 / 45, 0.0),
]

DEMO_TOP_N = 2
DEMO_TOP_N_SHARE = {"from": 1 / 2, "cf": 5 / 9, "to": 3 / 5}
DEMO_HHI = {"from": 1 / 4, "cf": 21 / 81, "to": 13 / 50}

# (type, subject) -> magnitude
DEMO_EVENTS = {
    ("POSITION_ADDED", "EEE"): 1 / 5,
    ("POSITION_REMOVED", "CCC"): -2 / 9,
    ("POSITION_INCREASED", "BBB"): 7 / 90,
    ("SECTOR_INCREASE", "Health Care"): 1 / 20,
    ("SECTOR_DECREASE", "Financials"): -1 / 20,
    ("CONCENTRATION_INCREASE", "portfolio"): 1 / 10,
}

BANNED_WORDS = ("bought", "sold", "trade", "believe", "think")


def close(a: float, b: float) -> bool:
    return math.isclose(a, b, abs_tol=ABS_TOL)


def by_id(holdings: list[dict]) -> dict[str, dict]:
    return {h["security_id"]: h for h in holdings}


def by_sector(sectors: list[dict]) -> dict[str, dict]:
    return {s["sector"]: s for s in sectors}


def assert_demo_golden(result: dict) -> None:
    """Every numeric value SPEC §10 gives for DEMO 2026-10-01 -> 2026-10-02."""
    assert close(result["flow_factor"], 1.0)
    assert close(result["cash_weight"]["from"], 0.0)
    assert close(result["cash_weight"]["to"], 0.0)

    s = result["summary"]
    assert (s["holdings_from"], s["holdings_to"]) == (4, 4)
    assert (s["added"], s["removed"], s["increased"], s["decreased"]) == (1, 1, 1, 0)
    assert s["top_n"] == DEMO_TOP_N
    for key in ("from", "cf", "to"):
        assert close(s["top_n_share"][key], DEMO_TOP_N_SHARE[key]), key
        assert close(s["hhi"][key], DEMO_HHI[key]), key

    holdings = by_id(result["holdings"])
    assert set(holdings) == {row[0] for row in DEMO_HOLDINGS}
    for sid, status, adj, w0, wcf, w1, price, activity in DEMO_HOLDINGS:
        h = holdings[sid]
        assert h["status"] == status, sid
        assert h["traded"] == (status != "UNCHANGED"), sid
        if adj is None:
            assert h["adj_share_change"] is None, sid
        else:
            assert close(h["adj_share_change"], adj), sid
        assert close(h["w_from"], w0), sid
        assert close(h["w_cf"], wcf), sid
        assert close(h["w_to"], w1), sid
        assert close(h["price_effect"], price), sid
        assert close(h["activity_effect"], activity), sid
    assert {sid for sid, h in holdings.items() if h["price_estimated"]} == {"CCC"}

    sectors = by_sector(result["sectors"])
    assert set(sectors) == {row[0] for row in DEMO_SECTORS}
    for name, w0, wcf, w1, drift, price, activity, direct, dilution in DEMO_SECTORS:
        sec = sectors[name]
        assert close(sec["w_from"], w0), name
        assert close(sec["w_cf"], wcf), name
        assert close(sec["w_to"], w1), name
        assert close(sec["drift"], drift), name
        assert close(sec["price_effect"], price), name
        assert close(sec["activity_effect"], activity), name
        assert close(sec["activity_direct"], direct), name
        assert close(sec["activity_dilution"], dilution), name

    events = result["events"]
    assert len(events) == 6
    got = {(e["type"], e["subject"]): e["magnitude"] for e in events}
    assert set(got) == set(DEMO_EVENTS)
    for key, magnitude in DEMO_EVENTS.items():
        assert close(got[key], magnitude), key
    assert not {e["subject"] for e in events} & {"AAA", "DDD", "Technology"}

    assert len(result["caveats"]) == 1
    assert "CCC" in result["caveats"][0]
    assert "estimated" in result["caveats"][0].lower()


def assert_same_numbers(a: dict, b: dict) -> None:
    """Every numeric value in two comparisons matches (ids, text and caveats aside)."""
    assert close(a["flow_factor"], b["flow_factor"])
    _assert_same(a["cash_weight"], b["cash_weight"], "cash_weight")
    _assert_same(a["summary"], b["summary"], "summary")
    _assert_same(by_sector(a["sectors"]), by_sector(b["sectors"]), "sectors")
    _assert_same(by_id(a["holdings"]), by_id(b["holdings"]), "holdings")
    ea = {(e["type"], e["subject"]): e["magnitude"] for e in a["events"]}
    eb = {(e["type"], e["subject"]): e["magnitude"] for e in b["events"]}
    _assert_same(ea, eb, "events")


def _assert_same(x, y, path: str) -> None:
    if isinstance(x, dict):
        assert isinstance(y, dict) and set(x) == set(y), path
        for key in x:
            _assert_same(x[key], y[key], f"{path}.{key}")
    elif isinstance(x, (int, float)) and not isinstance(x, bool):
        assert isinstance(y, (int, float)) and close(x, y), path
    else:
        assert x == y, path
