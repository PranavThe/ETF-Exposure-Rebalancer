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
            ProviderHolding(snapshot_id=snapshot.id, ticker="MIXED0", weight=0.85),
            ProviderHolding(snapshot_id=snapshot.id, ticker="UNSEEN", weight=0.15),
        ])

    covered = {row["ticker"]: row for row in client.get("/etfs/covered").json()}
    assert covered["MIXED"]["source_provider"] == "tickerinside"
    assert covered["MIXED"]["as_of_date"] == "2026-10-17"
    assert mix(covered["MIXED"]["sectors"]) == pytest.approx({"Technology": 0.85, "Unclassified": 0.15})

    response = client.post("/plan", json={"holdings": [{"ticker": "MIXED", "amount": 1000}]})
    fund_row = next(row for row in response.json()["funds"] if row["ticker"] == "MIXED")
    assert fund_row["source_provider"] == "tickerinside"
    assert fund_row["source_layer"] == "issuer"



def test_newer_tickerinside_weights_that_classify_little_keep_the_filing(client, allow):
    # A foreign fund: the filing resolves every holding; the newer provider file lists local
    # tickers with no known sector. The filing's mix stays.
    allow("FORGN")
    add_fund("FORGN", {"Financials": 60, "Technology": 40})
    with Session(get_engine()) as session, session.begin():
        snapshot = ProviderHoldingsSnapshot(
            provider="tickerinside", fund_ticker="FORGN", fund_name="Foreign Fund",
            as_of_date=date(2026, 10, 17), source_layer="issuer", source_url="https://example.test",
            cite_as="TickerInside", content_hash="provider-forgn",
        )
        session.add(snapshot)
        session.flush()
        session.add_all([
            ProviderHolding(snapshot_id=snapshot.id, ticker="NOSUCH9", weight=0.7),
            ProviderHolding(snapshot_id=snapshot.id, ticker="FORGN0", weight=0.3),
        ])

    covered = {row["ticker"]: row for row in client.get("/etfs/covered").json()}
    assert covered["FORGN"]["source_provider"] != "tickerinside"
    assert covered["FORGN"]["as_of_date"] == "2026-10-16"
    assert mix(covered["FORGN"]["sectors"]) == pytest.approx({"Financials": 0.6, "Technology": 0.4})

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
    # NaN and Infinity are refused with a readable 422, not a 500 from echoing them back as JSON.
    for raw in ('{"holdings": [{"ticker": "TECHX", "amount": NaN}]}', '{"holdings": [], "cash_change": Infinity}'):
        response = client.post("/plan", content=raw, headers={"content-type": "application/json"})
        assert response.status_code == 422 and response.json()["detail"][0]["type"] == "finite_number"


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


def test_held_funds_off_the_allowlist_count_but_never_get_more_money(client, allow):
    add_fund("TECHX", {"Information Technology": 100})
    add_fund("HLTHX", {"Health Care": 100})
    request = {
        "holdings": [{"ticker": "TECHX", "amount": 8000}, {"ticker": "HLTHX", "amount": 2000}],
        "target": {"Technology": 50, "Health Care": 50},
    }
    allow()  # nothing is on the list: both still count, but neither may receive more money
    body = client.post("/plan", json=request).json()
    assert mix(body["current"]) == {"Technology": 0.8, "Health Care": 0.2}
    assert body["plans"] == []

    allow("HLTHX")
    [plan] = client.post("/plan", json=request).json()["plans"]
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


def test_options_on_a_stock_do_not_make_it_cash(client, allow):
    allow("WTOPT")
    # An option-income fund's latest filing lists AAPL call options (non-equity) under AAPL's ticker.
    with Session(get_engine()) as session, session.begin():
        fund = Fund(ticker="OPTX", name="Option Income Fund", issuer="Test Issuer")
        session.add_all([fund, Fund(ticker="WTOPT", name="Weights Only", issuer="Test Issuer")])
        session.flush()
        filing = Snapshot(fund_id=fund.id, as_of_date=date(2026, 10, 16), content_hash="optx", row_count=1)
        session.add(filing)
        session.flush()
        session.add(Holding(snapshot_id=filing.id, security_id="AAPL-CALL", ticker="AAPL", name="AAPL call",
                            asset_class="derivative", shares=1, price=5, market_value=5))
        snapshot = ProviderHoldingsSnapshot(
            provider="tickerinside", fund_ticker="WTOPT", fund_name="Weights Only",
            as_of_date=date(2026, 10, 17), source_layer="issuer", source_url="https://example.test",
            cite_as="TickerInside", content_hash="provider-wtopt",
        )
        session.add(snapshot)
        session.flush()
        session.add(ProviderHolding(snapshot_id=snapshot.id, ticker="AAPL", weight=1.0))
    covered = {row["ticker"]: row for row in client.get("/etfs/covered").json()}
    assert mix(covered["WTOPT"]["sectors"]) == {"Technology": 1.0}


def test_plans_report_yearly_fees_before_and_after(client, allow):
    from backend.app.main import app
    from backend.app.routes.plans import fund_fees

    allow("TECHX", "HLTHX")
    add_fund("TECHX", {"Information Technology": 100})
    add_fund("HLTHX", {"Health Care": 100})
    fee = lambda ratio: {"expense_ratio": ratio, "as_of": "2026-04-28", "source_url": "https://www.sec.gov/x"}
    app.dependency_overrides[fund_fees] = lambda: {"TECHX": fee(0.004), "HLTHX": fee(0.001)}
    try:
        body = client.post("/plan", json={
            "holdings": [{"ticker": "TECHX", "amount": 10000}],
            "target": {"Technology": 0.5, "Health Care": 0.5}, "max_new_funds": 1}).json()
        assert close(body["yearly_fee"], 40) and close(body["fee_known"], 10000)
        assert body["funds"][0]["fee"]["expense_ratio"] == 0.004
        plan = next(p for p in body["plans"] if p["kind"] == "rearrange_with_new")
        # Half moves to the 0.1% fund: $20 + $5 a year instead of $40.
        assert close(plan["fee_before"], 40) and close(plan["fee_after"], 25)
        assert close(plan["fee_known_after"], 10000)
        covered = {e["ticker"]: e for e in client.get("/etfs/covered").json()}
        assert covered["HLTHX"]["fee"]["source_url"] == "https://www.sec.gov/x"
    finally:
        app.dependency_overrides.pop(fund_fees, None)


def test_companies_add_up_across_funds_and_overlaps(client, allow):
    allow("BIGA", "BIGB", "TICKC")
    add_holdings("BIGA", [("SA1", "APPLE INC", "Information Technology", 600),
                          ("SA2", "MICROSOFT CORP", "Information Technology", 400)])
    add_holdings("BIGB", [("SB1", "APPLE INC", "Information Technology", 500),
                          ("SB2", "EXXON MOBIL CORP", "Energy", 500)])
    with Session(get_engine()) as session, session.begin():
        session.add(Fund(ticker="TICKC", name="Weights Only", issuer="Test Issuer"))
        snapshot = ProviderHoldingsSnapshot(
            provider="tickerinside", fund_ticker="TICKC", fund_name="Weights Only",
            as_of_date=date(2026, 10, 17), source_layer="issuer", source_url="https://example.test",
            cite_as="TickerInside", content_hash="provider-tickc")
        session.add(snapshot)
        session.flush()
        session.add_all([ProviderHolding(snapshot_id=snapshot.id, ticker="AAPL", weight=0.8),
                         ProviderHolding(snapshot_id=snapshot.id, ticker="912828XX", weight=0.2)])

    body = client.post("/exposure/companies", json={"holdings": [
        {"ticker": "BIGA", "amount": 1000}, {"ticker": "BIGB", "amount": 1000}, {"ticker": "TICKC", "amount": 500}]}).json()
    apple = body["companies"][0]
    # $600 + $500 + $400 (80% of $500): the filing's "APPLE INC" and the provider's AAPL are one company.
    assert apple["ticker"] == "AAPL" and close(apple["amount"], 1500) and close(apple["share"], 0.6)
    assert [f["ticker"] for f in apple["funds"]] == ["BIGA", "BIGB", "TICKC"]
    assert {c["ticker"] for c in body["companies"]} == {"AAPL", "MSFT", "XOM"}  # the bond row is left out
    pair = {(o["a"], o["b"]): o["overlap"] for o in body["overlaps"]}
    assert close(pair[("BIGA", "BIGB")], 0.5) and close(pair[("BIGA", "TICKC")], 0.6)
    assert close(body["top10_share"], (1500 + 400 + 500) / 2500)


def test_explanations_from_rules_and_from_gemini(client, allow):
    import json as jsonlib
    from types import SimpleNamespace

    from google.genai import errors

    from backend.app import explain, llm
    from backend.app.main import app

    allow("TECHX", "HLTHX")
    add_fund("TECHX", {"Information Technology": 100})
    add_fund("HLTHX", {"Health Care": 100})
    request = {"holdings": [{"ticker": "TECHX", "amount": 10000}], "target": {"Technology": 0.5, "Health Care": 0.5},
               "max_new_funds": 1, "kind": "rearrange_with_new"}

    app.dependency_overrides[llm.get_client] = lambda: None
    try:
        body = client.post("/explain/plan", json=request).json()
        assert body["source"] == "rules" and "50.0% match" in body["summary"]
        assert {m["ticker"] for m in body["moves"]} == {"TECHX", "HLTHX"}
        assert any("tax" in c for c in body["consider"])
        etf = client.post("/explain/etf", json={"ticker": "techx"}).json()
        assert etf["source"] == "rules" and "Technology (100.0%)" in etf["summary"]
        assert client.post("/explain/plan", json={**request, "kind": "nope"}).status_code == 404
        assert client.post("/explain/etf", json={"ticker": "NOPE"}).status_code == 404
    finally:
        app.dependency_overrides.pop(llm.get_client, None)

    calls = []

    def answer(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(text=jsonlib.dumps({
            "summary": "You would sell half of TECHX.", "consider": ["Taxes may apply."],
            "moves": [{"ticker": "HLTHX", "why": "It holds health care."}, {"ticker": "MADEUP", "why": "x"}]}))

    explain._cache.clear()
    app.dependency_overrides[llm.get_client] = lambda: SimpleNamespace(models=SimpleNamespace(generate_content=answer))
    try:
        body = client.post("/explain/plan", json=request).json()
        assert body["source"] == "gemini" and body["summary"] == "You would reduce half of TECHX."
        assert [m["ticker"] for m in body["moves"]] == ["HLTHX"]  # moves Gemini made up are dropped
        facts = jsonlib.loads(calls[0]["contents"][0]["parts"][0]["text"])
        assert facts["match_now"] == 0.5 and facts["fees"]["known_share"] == 0
        client.post("/explain/plan", json=request)
        assert len(calls) == 1  # the same facts are answered from the cache

        def broken(**kwargs):
            raise errors.ServerError(503, {"error": {"code": 503, "message": "busy"}})
        explain._cache.clear()
        app.dependency_overrides[llm.get_client] = lambda: SimpleNamespace(models=SimpleNamespace(generate_content=broken))
        assert client.post("/explain/etf", json={"ticker": "HLTHX"}).json()["source"] == "rules"
    finally:
        app.dependency_overrides.pop(llm.get_client, None)
        explain._cache.clear()
