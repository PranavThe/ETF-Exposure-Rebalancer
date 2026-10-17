import hashlib

import pytest

from backend.analytics import config
from backend.analytics.compare import compare_snapshots
from backend.analytics.concentration import hhi, top_n_share
from backend.analytics.events import fmt_pp

from .golden import (
    BANNED_WORDS,
    DEMO_HOLDINGS,
    assert_demo_golden,
    assert_same_numbers,
    by_id,
    by_sector,
    close,
)


def compare(load_sample, sector_map, fund, from_date, to_date, **kwargs):
    prefix = fund.lower()
    return compare_snapshots(
        load_sample(f"{prefix}_{from_date}.csv"),
        load_sample(f"{prefix}_{to_date}.csv"),
        fund=fund,
        from_date=from_date,
        to_date=to_date,
        sector_map=sector_map,
        **kwargs,
    )


@pytest.fixture
def demo(load_sample, sector_map):
    return compare(load_sample, sector_map, "DEMO", "2026-10-01", "2026-10-02", top_n=2)


# --- DEMO golden values (SPEC §10) ---

def test_demo_matches_golden_values(demo):
    assert_demo_golden(demo)


@pytest.mark.parametrize("sid", [row[0] for row in DEMO_HOLDINGS])
def test_demo_effects_sum_to_weight_change(demo, sid):
    h = by_id(demo["holdings"])[sid]
    assert close(h["price_effect"] + h["activity_effect"], h["w_to"] - h["w_from"])


def test_demo_sector_activity_splits_into_direct_and_dilution(demo):
    for sec in demo["sectors"]:
        assert close(sec["price_effect"] + sec["activity_effect"], sec["drift"])
        assert close(sec["activity_direct"] + sec["activity_dilution"], sec["activity_effect"])


def test_demo_untraded_activity_is_labelled_dilution(demo):
    holdings = by_id(demo["holdings"])
    for sid in ("AAA", "DDD"):
        assert not holdings[sid]["traded"]
        assert "DILUTION" in holdings[sid]["flags"]
    for sid in ("BBB", "CCC", "EEE"):
        assert "DILUTION" not in holdings[sid]["flags"]


def test_demo_holding_shares_and_prices(demo):
    holdings = by_id(demo["holdings"])
    bbb = holdings["BBB"]
    assert (bbb["shares_from"], bbb["shares_to"]) == (200, 300)
    assert (bbb["price_from"], bbb["price_to"]) == (5, 5)
    ccc = holdings["CCC"]
    assert (ccc["shares_from"], ccc["shares_to"]) == (50, 0)
    assert ccc["price_to"] is None and ccc["price_estimated"]
    eee = holdings["EEE"]
    assert (eee["shares_from"], eee["shares_to"]) == (0, 50)
    assert eee["price_from"] is None and not eee["price_estimated"]


def test_demo_event_contributors(demo):
    events = {(e["type"], e["subject"]): e for e in demo["events"]}
    assert events[("POSITION_INCREASED", "BBB")]["contributing_security_ids"] == ["BBB"]
    assert events[("POSITION_ADDED", "EEE")]["contributing_security_ids"] == ["EEE"]
    assert events[("POSITION_REMOVED", "CCC")]["contributing_security_ids"] == ["CCC"]
    assert events[("SECTOR_INCREASE", "Health Care")]["contributing_security_ids"] == ["BBB"]
    # Sorted by abs(w1 - w0): CCC moved 25 pp, EEE 20 pp.
    assert events[("SECTOR_DECREASE", "Financials")]["contributing_security_ids"] == ["CCC", "EEE"]
    top = events[("CONCENTRATION_INCREASE", "portfolio")]["contributing_security_ids"]
    assert sorted(top) == ["AAA", "BBB"]


def test_demo_event_ids_follow_spec_formula(demo):
    for e in demo["events"]:
        raw = f"DEMO|2026-10-01|2026-10-02|{e['type']}|{e['subject']}|{config.CONFIG_VERSION}"
        assert e["id"] == hashlib.sha256(raw.encode()).hexdigest()[:16]


def test_demo_event_ids_are_deterministic(load_sample, sector_map, demo):
    again = compare(load_sample, sector_map, "DEMO", "2026-10-01", "2026-10-02", top_n=2)
    assert [e["id"] for e in again["events"]] == [e["id"] for e in demo["events"]]


def test_demo_sector_description_uses_spec_template(demo):
    events = {(e["type"], e["subject"]): e for e in demo["events"]}
    assert events[("SECTOR_INCREASE", "Health Care")]["description"] == (
        "Health Care exposure +5.0 pp (price −2.8 pp, portfolio activity +7.8 pp)"
    )


def test_demo_text_follows_language_rules(demo):
    texts = [e["description"] for e in demo["events"]] + demo["caveats"]
    for text in texts:
        for word in BANNED_WORDS:
            assert word not in text.lower(), text
    for e in demo["events"]:
        assert "pp" in e["description"], e["description"]


def test_demo_netted_range_matches_single_interval(load_sample, sector_map, demo):
    netted = compare_snapshots(
        load_sample("demo_2026-10-01.csv"),
        load_sample("demo_2026-10-03.csv"),
        fund="DEMO",
        from_date="2026-10-01",
        to_date="2026-10-03",
        sector_map=sector_map,
        top_n=2,
        snapshot_intervals=2,
    )
    assert netted["snapshot_intervals"] == 2
    assert any("netted across 2 snapshot intervals" in c for c in netted["caveats"])
    assert_same_numbers(demo, netted)


# --- SPLT ---

def test_splt_flags_split_not_increase(load_sample, sector_map):
    r = compare(load_sample, sector_map, "SPLT", "2026-10-01", "2026-10-02")
    assert r["summary"]["top_n"] == config.TOP_N == 10
    assert close(r["flow_factor"], 1.0)
    fff = by_id(r["holdings"])["FFF"]
    assert "SUSPECTED_CORPORATE_ACTION" in fff["flags"]
    assert fff["status"] == "UNCHANGED"
    assert close(fff["adj_share_change"], 0.0)
    assert close(fff["activity_effect"], 0.0)
    for h in r["holdings"]:
        assert close(h["activity_effect"], 0.0), h["security_id"]
    assert len(r["events"]) == 1
    event = r["events"][0]
    assert (event["type"], event["subject"]) == ("SUSPECTED_CORPORATE_ACTION", "FFF")
    assert close(event["magnitude"], 2.0)
    assert event["contributing_security_ids"] == ["FFF"]


# --- FLOW ---

def test_flow_is_not_portfolio_activity(load_sample, sector_map):
    r = compare(load_sample, sector_map, "FLOW", "2026-10-01", "2026-10-02")
    assert close(r["flow_factor"], 1.1)
    for h in r["holdings"]:
        assert h["status"] == "UNCHANGED", h["security_id"]
        assert close(h["adj_share_change"], 0.0), h["security_id"]
        assert close(h["activity_effect"], 0.0), h["security_id"]
    assert r["events"] == []


# --- Rules from SPEC §7 beyond the fixtures ---

def row(sid, shares, price, asset_class="equity", source_sector=None):
    return {"security_id": sid, "ticker": sid, "name": f"{sid} Corp", "asset_class": asset_class,
            "shares": shares, "price": price, "market_value": shares * price,
            "source_sector": source_sector}


def test_cash_is_excluded_and_reported_separately(sector_map):
    a = [row("AAA", 100, 10), row("BBB", 100, 10), row("CASH:USD", 500, 1, "cash")]
    b = [row("AAA", 100, 10), row("BBB", 100, 10), row("CASH:USD", 0, 1, "cash")]
    r = compare_snapshots(a, b, fund="X", from_date="2026-01-01", to_date="2026-01-02",
                          sector_map=sector_map)
    assert close(r["cash_weight"]["from"], 0.2)
    assert close(r["cash_weight"]["to"], 0.0)
    assert {h["security_id"] for h in r["holdings"]} == {"AAA", "BBB"}
    assert close(by_id(r["holdings"])["AAA"]["w_from"], 0.5)


def test_flow_factor_falls_back_with_fewer_than_three_common_holdings(sector_map):
    a = [row("AAA", 100, 10), row("BBB", 100, 10)]
    b = [row("AAA", 200, 10), row("BBB", 200, 10)]
    r = compare_snapshots(a, b, fund="X", from_date="2026-01-01", to_date="2026-01-02",
                          sector_map=sector_map)
    assert r["flow_factor"] == 1.0
    assert any("flow factor" in c.lower() for c in r["caveats"])
    # Without a flow estimate the doubling reads as increased positions.
    assert {h["status"] for h in r["holdings"]} == {"INCREASED"}


def test_unmapped_security_goes_to_unknown_sector(sector_map):
    a = [row("AAA", 100, 10), row("ZZZ", 100, 10)]
    b = [row("AAA", 100, 10), row("ZZZ", 100, 10)]
    r = compare_snapshots(a, b, fund="X", from_date="2026-01-01", to_date="2026-01-02",
                          sector_map=sector_map)
    assert by_id(r["holdings"])["ZZZ"]["sector"] == "Unknown"
    unknown = by_sector(r["sectors"])["Unknown"]
    assert close(unknown["w_from"], 0.5) and close(unknown["w_to"], 0.5)
    assert any("Unknown" in c for c in r["caveats"])


def test_source_sector_is_used_when_reference_mapping_is_missing(sector_map):
    a = [row("AAA", 100, 10, source_sector="Energy"), row("ZZZ", 100, 10, source_sector="Energy")]
    r = compare_snapshots(a, a, fund="X", from_date="2026-01-01", to_date="2026-01-02",
                          sector_map=sector_map)
    holdings = by_id(r["holdings"])
    assert holdings["AAA"]["sector"] == "Technology"  # reference mapping wins
    assert holdings["ZZZ"]["sector"] == "Energy"


def test_reverse_split_is_detected(sector_map):
    a = [row("AAA", 1000, 1), row("BBB", 100, 10), row("DDD", 100, 10)]
    b = [row("AAA", 100, 10.2), row("BBB", 100, 10), row("DDD", 100, 10)]
    r = compare_snapshots(a, b, fund="X", from_date="2026-01-01", to_date="2026-01-02",
                          sector_map=sector_map)
    aaa = by_id(r["holdings"])["AAA"]
    assert "SUSPECTED_CORPORATE_ACTION" in aaa["flags"]
    assert aaa["status"] == "UNCHANGED"
    assert [e["type"] for e in r["events"]] == ["SUSPECTED_CORPORATE_ACTION"]
    assert close(r["events"][0]["magnitude"], 0.1)


def test_concentration_helpers():
    assert close(top_n_share([0.1, 0.5, 0.4], 2), 0.9)
    assert close(top_n_share([0.1, 0.5, 0.4], 10), 1.0)
    assert close(hhi([0.5, 0.5]), 0.5)


@pytest.mark.parametrize("value, text", [
    (0.05, "+5.0 pp"), (-1 / 36, "−2.8 pp"), (0.0, "0.0 pp"), (-1e-12, "0.0 pp"), (7 / 90, "+7.8 pp"),
])
def test_fmt_pp(value, text):
    assert fmt_pp(value) == text
