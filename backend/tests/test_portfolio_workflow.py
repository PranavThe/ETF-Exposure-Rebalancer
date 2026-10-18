"""Portfolio writes, ETF search, and weighted latest exposure contract."""

import pytest
from sqlalchemy.orm import Session

from backend.analytics.portfolio import analyze_latest
from backend.app.db import get_engine
from backend.pipeline.catalog import sync_etf_catalog
from backend.pipeline.nport import read_series_classes


def test_loaded_funds_filter_and_limit(client):
    response = client.get("/funds", params={"loaded_only": "true", "limit": 2})
    assert response.status_code == 200
    assert [fund["ticker"] for fund in response.json()] == ["DEMO", "FLOWTEST"]
    assert client.get("/funds", params={"limit": 0}).status_code == 422
    assert client.get("/funds/DEMO").json()["snapshot_count"] == 3
    assert client.get("/funds/NOPE").status_code == 404


def test_portfolio_create_update_analysis_and_delete(client):
    created = client.post("/portfolios", json={"name": "Core", "funds": [
        {"ticker": "DEMO", "weight": 0.6}, {"ticker": "ARKK", "weight": 0.4}
    ]})
    assert created.status_code == 201
    body = created.json()
    portfolio_id, key = body["id"], body["edit_key"]
    assert key and key not in str(client.get(f"/portfolios/{portfolio_id}").json())

    analysis = client.get(f"/portfolios/{portfolio_id}/analysis")
    assert analysis.status_code == 200
    data = analysis.json()
    assert data["coverage_weight"] == pytest.approx(0.6)
    assert data["analyzed_weight"] == pytest.approx(0.6)
    assert {fund["ticker"]: fund["status"] for fund in data["funds"]} == {
        "ARKK": "missing", "DEMO": "available"
    }
    assert data["newest_as_of_date"] == "2026-10-03"
    assert sum(item["weight"] for item in data["top_exposures"]) == pytest.approx(0.6)

    path = f"/portfolios/{portfolio_id}"
    assert client.put(path, json={"name": "Edited", "funds": []}).status_code == 403
    assert client.put(path, headers={"X-Portfolio-Edit-Key": key}, json={"name": "Invalid", "funds": [
        {"ticker": "DEMO", "weight": 0.9}
    ]}).status_code == 422
    updated = client.put(path, headers={"X-Portfolio-Edit-Key": key}, json={"name": "Edited", "funds": [
        {"ticker": "DEMO", "weight": 1}
    ]})
    assert updated.status_code == 200
    assert updated.json()["name"] == "Edited"
    assert client.delete(path).status_code == 403
    assert client.delete(path, headers={"X-Portfolio-Edit-Key": key}).status_code == 204
    assert client.get(path).status_code == 404


def test_overlap_uses_exact_security_identity():
    latest = {"portfolio": {"id": "x"}, "coverage_weight": 1, "funds": [
        {"ticker": "AAA", "name": "A", "issuer": "", "weight": 0.5,
         "status": "available", "as_of_date": "2026-10-01", "holdings": [
             {"security_id": "CUSIP1", "ticker": "XYZ", "name": "X", "sector": "Tech", "asset_class": "equity", "market_value": 100}]},
        {"ticker": "BBB", "name": "B", "issuer": "", "weight": 0.5,
         "status": "available", "as_of_date": "2026-10-02", "holdings": [
             {"security_id": "CUSIP1", "ticker": "XYZ", "name": "X", "sector": "Tech", "asset_class": "equity", "market_value": 50}]},
    ]}
    result = analyze_latest(latest)
    assert result["overlap"][0]["weight"] == pytest.approx(1)
    assert result["overlap"][0]["funds"] == ["AAA", "BBB"]
    assert result["sectors"] == [{"name": "Tech", "weight": 1}]


def test_etf_catalog_search_distinguishes_missing_holdings(client):
    with Session(get_engine()) as session, session.begin():
        assert sync_etf_catalog(session, {"NEWX": "New Example ETF"}) == (1, 0)
    response = client.get("/etfs/search", params={"q": "example"})
    assert response.status_code == 200
    assert response.json() == [{"ticker": "NEWX", "name": "New Example ETF", "issuer": "",
                               "snapshot_count": 0, "latest_as_of_date": None}]
    assert client.get("/etfs/search", params={"limit": 101}).status_code == 422


def test_sec_series_mapping_rejects_ambiguous_ticker(tmp_path):
    mapping = tmp_path / "series.csv"
    mapping.write_text("Series ID,Class Ticker,CIK Number,Series Name\n"
                       "S0001,ABC,0000123,Fund A\nS0002,ABC,0000456,Fund B\n")
    with pytest.raises(ValueError, match="maps to multiple"):
        read_series_classes(mapping, {"ABC"})
