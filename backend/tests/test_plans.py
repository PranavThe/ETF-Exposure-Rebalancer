"""Planner API: sector mix of a portfolio, plans toward a target, saved preferences."""

import hashlib
import math
from datetime import date

import pytest
from sqlalchemy.orm import Session

from backend.app.db import get_engine
from backend.app.main import app
from backend.app.models import (Fund, Holding, ProviderHolding, ProviderHoldingsSnapshot,
                                Snapshot)
from backend.app.routes.plans import suggestable_etfs


def close(a: float, b: float) -> bool:
    return math.isclose(a, b, abs_tol=1e-9)


@pytest.fixture(autouse=True)
def allow():
    """Plans may suggest only allowlisted ETFs. These tests use made-up funds, so they set the list."""
    def set_allowlist(*tickers: str) -> None:
        app.dependency_overrides[suggestable_etfs] = lambda: frozenset(tickers)

    set_allowlist("TECHX", "HLTHX")
    yield set_allowlist
    app.dependency_overrides.pop(suggestable_etfs, None)


def add_holdings(ticker: str, rows: list[tuple[str, str, str | None, float]],
                 issuer: str = "Test Issuer") -> None:
    """A fund with one snapshot of equity rows (security_id, name, source_sector, market_value)."""
    # The planner caches mixes by (snapshot id, content hash), so the hash must follow the content.
    digest = hashlib.sha256(repr((ticker, rows)).encode()).hexdigest()
    with Session(get_engine()) as session, session.begin():
        fund = Fund(ticker=ticker, name=f"{ticker} Fund", issuer=issuer)
        session.add(fund)
        session.flush()
        snapshot = Snapshot(fund_id=fund.id, as_of_date=date(2026, 10, 16), content_hash=digest,
                            row_count=len(rows))
        session.add(snapshot)
        session.flush()
        for security_id, name, sector, value in rows:
            # The security id doubles as the stock ticker, so provider weights can find the sector.
            session.add(Holding(snapshot_id=snapshot.id, security_id=security_id, ticker=security_id,
                                name=name,
                                asset_class="equity", source_sector=sector, shares=1, price=value,
                                market_value=value))


def add_fund(ticker: str, sectors: dict[str, float], issuer: str = "Test Issuer") -> None:
    """A fund whose equity holdings split by `sectors` (market values)."""
    add_holdings(ticker, [(f"{ticker}{i}", f"{ticker} {i}", sector, value)
                          for i, (sector, value) in enumerate(sectors.items())], issuer)


def mix(items: list[dict]) -> dict[str, float]:
    return {i["sector"]: i["weight"] for i in items}


def test_covered_lists_funds_with_holdings_and_flags_samples(client):
    add_fund("TECHX", {"Information Technology": 100})
    body = client.get("/etfs/covered").json()
    by_ticker = {e["ticker"]: e for e in body}
    assert {"DEMO", "SPLT", "FLOWTEST", "TECHX"} <= set(by_ticker)
    assert by_ticker["DEMO"]["sample"] is True
    assert by_ticker["TECHX"]["sample"] is False
    assert by_ticker["TECHX"]["sectors"] == [{"sector": "Technology", "weight": 1.0}]
    for etf in body:
        assert close(sum(s["weight"] for s in etf["sectors"]), 1)


def test_planner_uses_newer_tickerinside_weights_and_preserves_provenance(client, allow):
    allow("MIXED")
    add_fund("MIXED", {"Technology": 100})
    with Session(get_engine()) as session, session.begin():
        snapshot = ProviderHoldingsSnapshot(
            provider="tickerinside", fund_ticker="MIXED", fund_name="Mixed Fund",
            as_of_date=date(2026, 10, 17), source_layer="issuer", source_url="https://example.test",
            cite_as="TickerInside", content_hash="provider-mixed",
        )
        session.add(snapshot)
        session.flush()
        session.add_all([
            ProviderHolding(snapshot_id=snapshot.id, ticker="MIXED0", weight=0.75),
            ProviderHolding(snapshot_id=snapshot.id, ticker="UNSEEN", weight=0.25),
        ])

    covered = {row["ticker"]: row for row in client.get("/etfs/covered").json()}
    assert covered["MIXED"]["source_provider"] == "tickerinside"
    assert covered["MIXED"]["as_of_date"] == "2026-10-17"
    assert mix(covered["MIXED"]["sectors"]) == {"Technology": 0.75, "Unclassified": 0.25}

    response = client.post("/plan", json={"holdings": [{"ticker": "MIXED", "amount": 1000}]})
    fund_row = next(row for row in response.json()["funds"] if row["ticker"] == "MIXED")
    assert fund_row["source_provider"] == "tickerinside"
    assert fund_row["source_layer"] == "issuer"


def test_plan_without_target_reports_current_mix(client):
    add_fund("TECHX", {"Information Technology": 100})
    add_fund("HLTHX", {"Health Care": 100})
    response = client.post("/plan", json={"holdings": [
        {"ticker": "techx", "amount": 6000}, {"ticker": "HLTHX", "amount": 3000},
        {"ticker": "TECHX", "amount": 1000},
    ]})
    assert response.status_code == 200
    body = response.json()
    assert close(body["total"], 10000) and close(body["covered_total"], 10000)
    assert [f["ticker"] for f in body["funds"]] == ["TECHX", "HLTHX"]
    assert mix(body["current"]) == {"Technology": 0.7, "Health Care": 0.3}
    assert body["target"] is None and body["distance"] is None and body["plans"] == []


def test_plan_moves_toward_target_and_never_suggests_samples(client):
    add_fund("TECHX", {"Information Technology": 100})
    add_fund("HLTHX", {"Health Care": 100})
    response = client.post("/plan", json={
        "holdings": [{"ticker": "TECHX", "amount": 10000}],
        "target": {"Technology": 50, "Health Care": 50},  # rescaled to fractions
    })
    assert response.status_code == 200
    body = response.json()
    assert mix(body["target"]) == {"Technology": 0.5, "Health Care": 0.5}
    assert close(body["distance"], 0.5)
    [plan] = body["plans"]  # holding only TECHX, rearranging inside it cannot help
    assert plan["kind"] == "rearrange_with_new"
    assert plan["new_funds"] == ["HLTHX"]
    assert [(m["ticker"], m["action"], m["amount"]) for m in plan["moves"]] == [
        ("TECHX", "reduce", 5000), ("HLTHX", "add", 5000)]
    assert plan["moves"][1]["name"] == "HLTHX Fund"
    assert close(plan["distance"], 0)
    sample = {"DEMO", "SPLT", "FLOWTEST"}
    assert all(m["ticker"] not in sample for p in body["plans"] for m in p["moves"])


def test_plan_with_added_money_only_adds(client):
    add_fund("TECHX", {"Information Technology": 100})
    add_fund("HLTHX", {"Health Care": 100})
    body = client.post("/plan", json={
        "holdings": [{"ticker": "TECHX", "amount": 6000}, {"ticker": "HLTHX", "amount": 4000}],
        "target": {"Technology": 0.5, "Health Care": 0.5}, "cash_change": 2000,
    }).json()
    add_money = next(p for p in body["plans"] if p["kind"] == "add_money")
    assert close(add_money["total_after"], 12000)
    assert [(m["ticker"], m["action"], m["amount"]) for m in add_money["moves"]] == [("HLTHX", "increase", 2000)]
    assert close(add_money["distance"], 0)


def test_plan_keeps_funds_without_holdings_out_of_the_math(client):
    add_fund("TECHX", {"Information Technology": 100})
    body = client.post("/plan", json={"holdings": [
        {"ticker": "TECHX", "amount": 1000}, {"ticker": "ARKK", "amount": 500}]}).json()
    status = {f["ticker"]: f["status"] for f in body["funds"]}
    assert status == {"TECHX": "available", "ARKK": "missing"}
    assert close(body["total"], 1500) and close(body["covered_total"], 1000)
    assert mix(body["current"]) == {"Technology": 1.0}


def test_plan_rejects_bad_input(client):
    add_fund("TECHX", {"Information Technology": 100})
    holdings = [{"ticker": "TECHX", "amount": 1000}]
    assert client.post("/plan", json={"holdings": [{"ticker": "NOPE", "amount": 1}]}).status_code == 422
    assert client.post("/plan", json={"holdings": holdings, "cash_change": -1500}).status_code == 422
    assert client.post("/plan", json={"holdings": holdings, "target": {"Technology": 0}}).status_code == 422
    assert client.post("/plan", json={"holdings": holdings, "target": {"Technology": -1}}).status_code == 422
    assert client.post("/plan", json={"holdings": [{"ticker": "TECHX", "amount": -5}]}).status_code == 422


def test_preferences_need_the_edit_key(client):
    created = client.post("/portfolios", json={"name": "Mine", "funds": [{"ticker": "DEMO", "weight": 1}]})
    portfolio_id, key = created.json()["id"], created.json()["edit_key"]
    path = f"/portfolios/{portfolio_id}/preferences"
    assert client.get(path).json() == {"total_value": None, "target": None}
    prefs = {"total_value": 2500.0, "target": {"Technology": 0.6, "Health Care": 0.4}}
    assert client.put(path, json=prefs).status_code == 403
    assert client.put(path, json=prefs, headers={"X-Portfolio-Edit-Key": "wrong"}).status_code == 403
    saved = client.put(path, json=prefs, headers={"X-Portfolio-Edit-Key": key})
    assert saved.status_code == 200 and saved.json() == prefs
    assert client.get(path).json() == prefs
    assert client.get("/portfolios/missing/preferences").status_code == 404


def test_covered_lists_only_allowlisted_funds(client, allow):
    add_fund("TECHX", {"Information Technology": 100})
    add_fund("LEVX", {"Information Technology": 100})  # has holdings but is not on the allowlist
    allow("TECHX", "NODATA")
    tickers = {e["ticker"] for e in client.get("/etfs/covered").json()}
    assert tickers == {"TECHX", "DEMO", "SPLT", "FLOWTEST"}  # local sample funds stay listed


def test_holdings_without_a_sector_are_classified_by_company_name(client):
    # N-PORT rows: a CUSIP and a company name, no sector (data/reference/name_sectors.csv).
    add_holdings("NPORTX", [
        ("037833100", "Apple, Inc.", None, 600),
        ("46625H100", "JPMorgan Chase & Co.", None, 300),
        ("000000000", "Not A Listed Company Of Any Kind", None, 100),
        ("ISSUERX1", "Apple, Inc.", "Health Care", 100),  # the issuer's own label still comes first
    ])
    body = client.post("/plan", json={"holdings": [{"ticker": "NPORTX", "amount": 1100}]}).json()
    assert mix(body["funds"][0]["sectors"]) == pytest.approx(
        {"Technology": 6 / 11, "Financials": 3 / 11, "Health Care": 1 / 11, "Unclassified": 1 / 11},
        abs=1e-9)


def test_a_security_takes_its_sector_from_an_allowlisted_fund(client, allow):
    # Vanguard filings shorten names ("ADV MICRO DEVICE"); the same CUSIP in an allowlisted fund
    # with a full name gives the sector.
    add_holdings("BROADX", [("007903107", "Advanced Micro Devices, Inc.", None, 100)])
    add_holdings("VANGX", [("007903107", "ZZ UNMATCHED SHORT NAME", None, 50),
                           ("999999999", "ZZ ANOTHER UNMATCHED NAME", None, 50)])
    allow("BROADX")
    body = client.post("/plan", json={"holdings": [{"ticker": "VANGX", "amount": 1000}]}).json()
    assert mix(body["funds"][0]["sectors"]) == {"Technology": 0.5, "Unclassified": 0.5}


def test_only_allowlisted_well_classified_funds_are_suggested(client, allow):
    add_fund("TECHX", {"Information Technology": 100})
    add_fund("HLTHX", {"Health Care": 100})  # matches the target exactly, but not allowlisted
    add_fund("HLTH2X", {"Health Care": 60, "Unknown": 40})  # allowlisted, but 40% unclassified
    add_fund("BLENDX", {"Health Care": 80, "Information Technology": 20})  # allowlisted
    allow("TECHX", "HLTH2X", "BLENDX")
    body = client.post("/plan", json={
        "holdings": [{"ticker": "TECHX", "amount": 10000}],
        "target": {"Technology": 50, "Health Care": 50},
    }).json()
    suggested = {t for p in body["plans"] for t in p["new_funds"]}
    assert suggested == {"BLENDX"}
    assert all(m["ticker"] in {"TECHX", "BLENDX"} for p in body["plans"] for m in p["moves"])


def test_held_funds_off_the_allowlist_still_count(client, allow):
    add_fund("TECHX", {"Information Technology": 100})
    add_fund("HLTHX", {"Health Care": 100})
    allow()  # nothing may be suggested
    body = client.post("/plan", json={
        "holdings": [{"ticker": "TECHX", "amount": 8000}, {"ticker": "HLTHX", "amount": 2000}],
        "target": {"Technology": 50, "Health Care": 50},
    }).json()
    assert mix(body["current"]) == {"Technology": 0.8, "Health Care": 0.2}
    [plan] = body["plans"]
    assert plan["kind"] == "rearrange" and plan["new_funds"] == []
    assert [(m["ticker"], m["action"], m["amount"]) for m in plan["moves"]] == [
        ("TECHX", "reduce", 3000), ("HLTHX", "increase", 3000)]


def test_provider_tickers_take_their_sector_from_the_reference_file(client, allow):
    allow("WTONLY")
    with Session(get_engine()) as session, session.begin():
        session.add(Fund(ticker="WTONLY", name="Weights Only Fund", issuer="Test Issuer"))
        snapshot = ProviderHoldingsSnapshot(
            provider="tickerinside", fund_ticker="WTONLY", fund_name="Weights Only Fund",
            as_of_date=date(2026, 10, 17), source_layer="issuer", source_url="https://example.test",
            cite_as="TickerInside", content_hash="provider-wtonly",
        )
        session.add(snapshot)
        session.flush()
        session.add_all([
            ProviderHolding(snapshot_id=snapshot.id, ticker="AAPL", weight=0.5),
            ProviderHolding(snapshot_id=snapshot.id, ticker="XOM", weight=0.3),
            ProviderHolding(snapshot_id=snapshot.id, ticker="BRK.B", weight=0.2),
        ])
    covered = {row["ticker"]: row for row in client.get("/etfs/covered").json()}
    assert mix(covered["WTONLY"]["sectors"]) == pytest.approx(
        {"Technology": 0.5, "Energy": 0.3, "Financials": 0.2})
