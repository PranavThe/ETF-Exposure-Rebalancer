"""Portfolio writes, ETF search, and weighted latest exposure contract."""

import pytest
from datetime import date
from sqlalchemy.orm import Session

from backend.analytics.portfolio import analyze_latest
from backend.app.db import get_engine
from backend.app.models import (EtfCatalogEntry, ProviderHolding, ProviderHoldingsSnapshot,
                                SecurityPrice)
from backend.pipeline.catalog import sync_etf_catalog
from backend.pipeline.alpaca import save_daily_bars
from scripts import sync_market_data
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
                               "snapshot_count": 0, "latest_as_of_date": None,
                               "provider_holdings_as_of_date": None}]
    assert client.get("/etfs/search", params={"limit": 101}).status_code == 422


def test_tickerinside_and_alpaca_flow_reaches_portfolio_and_changes_api(client):
    with Session(get_engine()) as session, session.begin():
        session.add(EtfCatalogEntry(ticker="ARKK"))
        earlier = ProviderHoldingsSnapshot(
            provider="tickerinside", fund_ticker="ARKK", fund_name="ARK Innovation ETF",
            as_of_date=date(2026, 10, 2), source_layer="issuer", source_url="https://example.test/arkk",
            cite_as="TickerInside", content_hash="a" * 64,
        )
        latest = ProviderHoldingsSnapshot(
            provider="tickerinside", fund_ticker="ARKK", fund_name="ARK Innovation ETF",
            as_of_date=date(2026, 10, 5), source_layer="issuer", source_url="https://example.test/arkk",
            cite_as="TickerInside", content_hash="b" * 64,
        )
        session.add_all([earlier, latest])
        session.flush()
        session.add_all([
            ProviderHolding(snapshot_id=earlier.id, ticker="AAPL", weight=0.5),
            ProviderHolding(snapshot_id=earlier.id, ticker="NVDA", weight=0.5),
            ProviderHolding(snapshot_id=latest.id, ticker="NVDA", weight=0.6),
            ProviderHolding(snapshot_id=latest.id, ticker="TSLA", weight=0.4),
        ])
        bars = [
            {"ticker": "NVDA", "as_of_date": date(2026, 10, 16), "open": 140.0,
             "high": 145.0, "low": 139.0, "close": 144.0, "volume": 1000},
            {"ticker": "TSLA", "as_of_date": date(2026, 10, 16), "open": 300.0,
             "high": 310.0, "low": 299.0, "close": 308.0, "volume": 2000},
        ]
        assert save_daily_bars(session, bars) == 2
        correction = [{**bars[0], "close": 144.5}]
        assert save_daily_bars(session, correction) == 1

    search = client.get("/etfs/search", params={"q": "ARKK"})
    assert search.status_code == 200
    assert search.json()[0]["provider_holdings_as_of_date"] == "2026-10-05"

    preview = client.post("/portfolios/preview", json={
        "name": "Provider preview", "funds": [{"ticker": "ARKK", "weight": 1.0}]
    })
    assert preview.status_code == 200
    analysis = preview.json()
    assert analysis["coverage_weight"] == pytest.approx(1)
    assert analysis["funds"][0]["source_provider"] == "tickerinside"
    assert analysis["funds"][0]["source_layer"] == "issuer"
    assert analysis["funds"][0]["as_of_date"] == "2026-10-05"
    exposures = {item["ticker"]: item for item in analysis["top_exposures"]}
    assert exposures["NVDA"]["weight"] == pytest.approx(0.6)
    assert exposures["NVDA"]["latest_price"] == pytest.approx(144.5)
    assert exposures["NVDA"]["latest_price_as_of_date"] == "2026-10-16"
    assert exposures["TSLA"]["latest_price"] == pytest.approx(308)

    changes = client.get("/provider-data/funds/ARKK/holdings")
    assert changes.status_code == 200
    body = changes.json()
    assert body["previous_as_of_date"] == "2026-10-02"
    assert body["no_longer_reported"] == [{"ticker": "AAPL", "previous_weight": 0.5}]
    assert body["entered"] == [{"ticker": "TSLA", "weight": 0.4}]
    assert body["changed_weights"] == [{"ticker": "NVDA", "previous_weight": 0.5,
                                         "weight": 0.6, "change": pytest.approx(0.1)}]


def test_on_demand_tickerinside_sync_saves_once_and_reports_coverage(client, monkeypatch):
    from backend.app.routes import provider_data
    from backend.pipeline.tickerinside import ProviderNotCovered

    calls = []
    monkeypatch.setattr(provider_data, "fetch_fund", lambda ticker, timeout: calls.append(ticker) or {
        "ticker": ticker, "name": "Demo ETF", "as_of_date": date(2026, 10, 16),
        "source_layer": "issuer", "source_url": "https://example.test/demo",
        "cite_as": "TickerInside", "content_hash": "d" * 64,
        "holdings": {"AAA": 0.7, "BBB": 0.3},
    })

    fetched = client.post("/provider-data/funds/DEMO/sync")
    assert fetched.status_code == 200
    assert fetched.json() == {"fund": "DEMO", "status": "fetched",
                              "as_of_date": "2026-10-16", "holdings_count": 2}
    existing = client.post("/provider-data/funds/DEMO/sync")
    assert existing.status_code == 200
    assert existing.json()["status"] == "already_available"
    assert existing.json()["holdings_count"] == 2
    assert calls == ["DEMO"]

    def not_covered(ticker, timeout):
        raise ProviderNotCovered(f"no record for {ticker}")

    monkeypatch.setattr(provider_data, "fetch_fund", not_covered)
    missing = client.post("/provider-data/funds/FLOWTEST/sync")
    assert missing.status_code == 200
    assert missing.json() == {"fund": "FLOWTEST", "status": "not_covered",
                              "fallback_available": True}


def test_market_data_plan_only_does_not_save_provider_data(client, monkeypatch, capsys):
    from datetime import date

    monkeypatch.delenv("ALPACA_API_KEY_ID", raising=False)
    monkeypatch.delenv("ALPACA_API_SECRET_KEY", raising=False)
    monkeypatch.setattr(sync_market_data, "fetch_fund", lambda ticker: {
        "ticker": ticker, "name": "Demo", "as_of_date": date(2026, 10, 4),
        "source_layer": "issuer", "source_url": "https://example.test/demo",
        "cite_as": "TickerInside", "content_hash": "c" * 64,
        "holdings": {"ZZZ": 1.0},
    })

    assert sync_market_data.main(["--funds", "DEMO", "--plan-only"]) == 0
    output = capsys.readouterr().out
    assert "1 provider holdings rows" in output
    assert "unique price symbols; requested price window" in output
    assert "No holdings or prices were saved" in output
    with Session(get_engine()) as session:
        assert session.query(ProviderHoldingsSnapshot).count() == 0
        assert session.query(SecurityPrice).count() == 0


def test_sec_series_mapping_rejects_ambiguous_ticker(tmp_path):
    mapping = tmp_path / "series.csv"
    mapping.write_text("Series ID,Class Ticker,CIK Number,Series Name\n"
                       "S0001,ABC,0000123,Fund A\nS0002,ABC,0000456,Fund B\n")
    with pytest.raises(ValueError, match="maps to multiple"):
        read_series_classes(mapping, {"ABC"})
