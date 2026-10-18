"""Planner API: sector mix of a portfolio, plans toward a target, saved preferences."""

import math
from datetime import date

from sqlalchemy.orm import Session

from backend.app.db import get_engine
from backend.app.models import Fund, Holding, Snapshot


def close(a: float, b: float) -> bool:
    return math.isclose(a, b, abs_tol=1e-9)


def add_fund(ticker: str, sectors: dict[str, float], issuer: str = "Test Issuer") -> None:
    """A fund with one snapshot whose equity holdings split by `sectors` (market values)."""
    with Session(get_engine()) as session, session.begin():
        fund = Fund(ticker=ticker, name=f"{ticker} Fund", issuer=issuer)
        session.add(fund)
        session.flush()
        snapshot = Snapshot(fund_id=fund.id, as_of_date=date(2026, 10, 16), content_hash=ticker * 4,
                            row_count=len(sectors))
        session.add(snapshot)
        session.flush()
        for i, (sector, value) in enumerate(sectors.items()):
            session.add(Holding(snapshot_id=snapshot.id, security_id=f"{ticker}{i}", name=f"{ticker} {i}",
                                asset_class="equity", source_sector=sector, shares=1, price=value,
                                market_value=value))


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
