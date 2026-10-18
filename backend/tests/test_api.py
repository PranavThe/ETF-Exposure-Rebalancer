import re

from backend.analytics import config
from backend.app import db

from .conftest import SAMPLE_DIR, ingest, ingest_all_samples
from .golden import assert_demo_golden, assert_same_numbers, close

HASH = re.compile(r"^[0-9a-f]{64}$")


def get_changes(client, fund="DEMO", from_date="2026-10-01", to_date="2026-10-02"):
    return client.get(f"/funds/{fund}/changes", params={"from": from_date, "to": to_date})


def test_health(client):
    body = client.get("/health").json()
    assert body == {"status": "ok", "db": "ok", "fund_count": 4, "snapshot_count": 7, "commit": ""}


def test_funds(client):
    funds = {f["ticker"]: f for f in client.get("/funds").json()}
    assert set(funds) == {"DEMO", "SPLT", "FLOWTEST", "ARKK"}
    assert funds["DEMO"]["name"] == "Demo Active Fund"
    assert funds["DEMO"]["snapshot_count"] == 3
    assert funds["DEMO"]["latest_as_of_date"] == "2026-10-03"
    assert funds["ARKK"]["snapshot_count"] == 0
    assert funds["ARKK"]["latest_as_of_date"] is None


def test_snapshots(client):
    snaps = client.get("/funds/DEMO/snapshots").json()
    assert [s["as_of_date"] for s in snaps] == ["2026-10-01", "2026-10-02", "2026-10-03"]
    for s in snaps:
        assert HASH.match(s["content_hash"])
        assert s["row_count"] == 4
        assert s["source_file"].endswith(f"demo_{s['as_of_date']}.csv")
        assert {"source_url", "ingested_at"} <= set(s)


def test_holdings_shows_the_underlying_rows(client):
    body = client.get("/funds/DEMO/holdings", params={"date": "2026-10-01"}).json()
    assert body["fund"] == "DEMO"
    assert body["snapshot"]["as_of_date"] == "2026-10-01"
    assert HASH.match(body["snapshot"]["content_hash"])
    rows = {h["security_id"]: h for h in body["holdings"]}
    assert set(rows) == {"AAA", "BBB", "CCC", "DDD"}
    assert rows["BBB"]["sector"] == "Health Care"
    assert rows["BBB"]["shares"] == 200
    assert rows["BBB"]["market_value"] == 1000
    assert rows["BBB"]["reported_weight"] == 0.25


def test_changes_demo_matches_golden_values(client):
    resp = get_changes(client)
    assert resp.status_code == 200
    body = resp.json()
    assert body["fund"] == "DEMO"
    assert body["config_version"] == config.CONFIG_VERSION
    assert body["snapshot_intervals"] == 1
    for side, day in (("from", "2026-10-01"), ("to", "2026-10-02")):
        meta = body[side]
        assert meta["as_of_date"] == day
        assert HASH.match(meta["content_hash"])
        assert meta["row_count"] == 4
        assert meta["source_file"].endswith(f"demo_{day}.csv")
        assert "source_url" in meta
    assert_demo_golden(body)


def test_changes_demo_netted_across_two_intervals(client):
    single = get_changes(client).json()
    netted = get_changes(client, to_date="2026-10-03").json()
    assert netted["snapshot_intervals"] == 2
    assert any("netted across 2 snapshot intervals" in c for c in netted["caveats"])
    assert_same_numbers(single, netted)


def test_changes_splt_and_flow(client):
    splt = get_changes(client, "SPLT").json()
    assert [(e["type"], e["subject"]) for e in splt["events"]] == [
        ("SUSPECTED_CORPORATE_ACTION", "FFF")
    ]
    flow = get_changes(client, "FLOWTEST").json()
    assert close(flow["flow_factor"], 1.1)
    assert flow["events"] == []


def test_from_not_before_to_is_422(client):
    assert get_changes(client, to_date="2026-10-01").status_code == 422
    assert get_changes(client, from_date="2026-10-02", to_date="2026-10-01").status_code == 422


def test_unknown_fund_is_404(client):
    assert get_changes(client, fund="NOPE").status_code == 404
    assert client.get("/funds/NOPE/snapshots").status_code == 404
    assert client.get("/funds/NOPE/holdings", params={"date": "2026-10-01"}).status_code == 404


def test_date_without_snapshot_is_404(client):
    assert get_changes(client, from_date="2026-09-30").status_code == 404
    assert get_changes(client, to_date="2026-10-04").status_code == 404
    assert client.get("/funds/DEMO/holdings", params={"date": "2026-09-30"}).status_code == 404


def event_ids(client) -> list[str]:
    return sorted(e["id"] for e in get_changes(client).json()["events"])


def test_event_ids_are_stable_across_calls_and_reingest(client):
    first = event_ids(client)
    assert len(first) == 6
    assert event_ids(client) == first

    assert ingest(SAMPLE_DIR / "demo_2026-10-01.csv", "DEMO") == 0  # duplicate no-op
    assert event_ids(client) == first

    db.reset_db()
    ingest_all_samples()
    assert event_ids(client) == first


def test_cors_origins_come_from_the_environment(monkeypatch):
    from backend.app.main import LOCAL_ORIGINS, cors_origins

    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    assert cors_origins() == LOCAL_ORIGINS
    monkeypatch.setenv("CORS_ORIGINS", "https://fundshift.vercel.app/, https://example.org")
    assert cors_origins() == LOCAL_ORIGINS + ["https://fundshift.vercel.app", "https://example.org"]


def test_cors_origin_regex_comes_from_the_environment(monkeypatch):
    from backend.app.main import cors_origin_regex

    monkeypatch.delenv("CORS_ORIGIN_REGEX", raising=False)
    assert cors_origin_regex() is None
    monkeypatch.setenv("CORS_ORIGIN_REGEX", r" https://fundshift-[a-z0-9-]+\.vercel\.app ")
    assert cors_origin_regex() == r"https://fundshift-[a-z0-9-]+\.vercel\.app"


def test_local_frontend_origin_is_allowed(client):
    resp = client.get("/funds", headers={"Origin": "http://localhost:3000"})
    assert resp.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_postgres_urls_use_psycopg(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgres://u:p@host/db?sslmode=require")
    assert db.database_url() == "postgresql+psycopg://u:p@host/db?sslmode=require"
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@host/db")
    assert db.database_url() == "postgresql+psycopg://u:p@host/db"
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://u:p@host/db")
    assert db.database_url() == "postgresql+psycopg://u:p@host/db"
    monkeypatch.delenv("DATABASE_URL")
    assert db.database_url() == "sqlite:///./fundshift.db"
