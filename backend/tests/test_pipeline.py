import csv
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app import db
from backend.app.models import Fund, Holding, ImportLog, Snapshot
from backend.pipeline import load
from backend.pipeline.run import run_pipeline

from .conftest import SAMPLE_DIR, ingest
from .golden import by_id, by_sector, close

DEMO_1 = SAMPLE_DIR / "demo_2026-10-01.csv"
DEMO_2 = SAMPLE_DIR / "demo_2026-10-02.csv"


def read_rows(path: Path) -> list[dict]:
    with open(path, newline="") as f:
        return list(csv.DictReader(f))


def write_rows(path: Path, rows: list[dict], columns: list[str] | None = None) -> Path:
    columns = columns or list(rows[0])
    with open(path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)
    return path


def snapshot_count(fund: str = "DEMO", as_of: date | None = None) -> int:
    with Session(db.get_engine()) as s:
        q = select(func.count(Snapshot.id)).join(Fund).where(Fund.ticker == fund)
        if as_of:
            q = q.where(Snapshot.as_of_date == as_of)
        return s.scalar(q)


def holding_count() -> int:
    with Session(db.get_engine()) as s:
        return s.scalar(select(func.count(Holding.id)))


def outcomes() -> list[str]:
    with Session(db.get_engine()) as s:
        return list(s.scalars(select(ImportLog.outcome).order_by(ImportLog.id)))


def stored_shares(sid: str, as_of: date) -> float:
    with Session(db.get_engine()) as s:
        return s.scalar(
            select(Holding.shares).join(Snapshot)
            .where(Snapshot.as_of_date == as_of, Holding.security_id == sid)
        )


def output(capsys) -> str:
    captured = capsys.readouterr()
    return captured.out + captured.err


# 1
def test_ingest_twice_is_a_noop(db_url, capsys):
    assert ingest(DEMO_1, "DEMO") == 0
    assert ingest(DEMO_1, "DEMO") == 0
    assert "already ingested" in output(capsys)
    assert snapshot_count(as_of=date(2026, 10, 1)) == 1
    assert holding_count() == 4
    assert outcomes() == ["inserted", "duplicate_noop"]


# 2
def test_hash_ignores_column_order_whitespace_and_number_format(db_url, tmp_path, capsys):
    rows = read_rows(DEMO_1)
    columns = list(reversed(list(rows[0])))
    messy = [{f"  {k} ": f"  {v}  " for k, v in r.items()} for r in rows]
    for r in messy:
        r["  market_value "] = f" {float(r['  market_value '].strip()):.2f} "
    path = write_rows(tmp_path / "demo_messy.csv", messy, [f"  {c} " for c in columns])

    assert ingest(DEMO_1, "DEMO") == 0
    assert ingest(path, "DEMO") == 0
    assert "already ingested" in output(capsys)
    assert outcomes() == ["inserted", "duplicate_noop"]


def changed_demo_1(tmp_path: Path) -> Path:
    rows = read_rows(DEMO_1)
    rows[1]["shares"] = "250"  # BBB
    return write_rows(tmp_path / "demo_2026-10-01_changed.csv", rows)


# 3
def test_changed_content_for_same_date_is_rejected(db_url, tmp_path, capsys):
    assert ingest(DEMO_1, "DEMO") == 0
    capsys.readouterr()
    assert ingest(changed_demo_1(tmp_path), "DEMO") == 2
    out = output(capsys)
    assert "--replace" in out
    with Session(db.get_engine()) as s:
        stored_hash = s.scalar(select(Snapshot.content_hash))
    assert stored_hash in out
    assert outcomes() == ["inserted", "conflict_rejected"]
    assert snapshot_count() == 1
    assert stored_shares("BBB", date(2026, 10, 1)) == 200


# 4
def test_replace_overwrites_the_snapshot(db_url, tmp_path):
    changed = changed_demo_1(tmp_path)
    assert ingest(DEMO_1, "DEMO") == 0
    assert ingest(changed, "DEMO") == 2
    assert ingest(changed, "DEMO", "--replace") == 0
    assert stored_shares("BBB", date(2026, 10, 1)) == 250
    assert snapshot_count() == 1
    assert holding_count() == 4
    assert outcomes() == ["inserted", "conflict_rejected", "replaced"]


def assert_rejected(path: Path, fund: str, capsys, *expected: str) -> None:
    assert ingest(path, fund) == 1
    out = output(capsys)
    for text in expected:
        assert text in out, out
    assert snapshot_count(fund) == 0
    assert holding_count() == 0


# 5
def test_missing_required_field_is_rejected_with_row_number(db_url, tmp_path, capsys):
    rows = read_rows(DEMO_1)
    rows[1]["shares"] = ""  # BBB, on line 3 of the file
    path = write_rows(tmp_path / "demo_missing.csv", rows)
    assert_rejected(path, "DEMO", capsys, "row 3", "shares")
    assert outcomes() == ["invalid_rejected"]


def test_missing_required_column_is_rejected(db_url, tmp_path, capsys):
    rows = read_rows(DEMO_1)
    columns = [c for c in rows[0] if c != "market_value"]
    path = write_rows(tmp_path / "demo_nocol.csv", [{c: r[c] for c in columns} for r in rows])
    assert_rejected(path, "DEMO", capsys, "market_value")


# 6
def test_negative_equity_shares_are_rejected(db_url, tmp_path, capsys):
    rows = read_rows(DEMO_1)
    rows[2]["shares"] = "-50"  # CCC, line 4
    path = write_rows(tmp_path / "demo_negative.csv", rows)
    assert_rejected(path, "DEMO", capsys, "row 4", "shares")


# 7
def test_duplicate_security_id_is_rejected(db_url, tmp_path, capsys):
    rows = read_rows(DEMO_1)
    rows[3]["security_id"] = "AAA"  # DDD row now repeats AAA, line 5
    path = write_rows(tmp_path / "demo_duplicate.csv", rows)
    assert_rejected(path, "DEMO", capsys, "row 5", "AAA")


# 8
def test_two_dates_in_one_file_are_rejected(db_url, tmp_path, capsys):
    rows = read_rows(DEMO_1)
    rows[3]["date"] = "2026-10-02"
    path = write_rows(tmp_path / "demo_two_dates.csv", rows)
    assert_rejected(path, "DEMO", capsys, "date")


def test_unparseable_date_is_rejected(db_url, tmp_path, capsys):
    rows = read_rows(DEMO_1)
    rows[0]["date"] = "2026-13-45"
    path = write_rows(tmp_path / "demo_bad_date.csv", rows)
    assert_rejected(path, "DEMO", capsys, "row 2", "date")


# 9
def test_unknown_fund_is_rejected(db_url, tmp_path, capsys):
    rows = read_rows(DEMO_1)
    for r in rows:
        r["fund"] = "NOPE"
    path = write_rows(tmp_path / "nope.csv", rows)
    assert_rejected(path, "NOPE", capsys, "NOPE")


def test_weights_far_from_100_percent_are_rejected(db_url, tmp_path, capsys):
    rows = read_rows(DEMO_1)
    for r in rows:
        r["weight"] = "0.2"  # sums to 80%
    path = write_rows(tmp_path / "demo_weights.csv", rows)
    assert_rejected(path, "DEMO", capsys, "weight")


def test_weights_slightly_off_are_accepted_with_a_warning(db_url, tmp_path, capsys):
    rows = read_rows(DEMO_1)
    rows[0]["weight"] = "0.29"  # sums to 104%, and AAA is 4 pp off its market value weight
    path = write_rows(tmp_path / "demo_weights.csv", rows)
    assert ingest(path, "DEMO") == 0
    out = output(capsys).lower()
    assert "warning" in out and "weight" in out
    assert snapshot_count() == 1


def changes(client: TestClient, fund: str, from_date: str, to_date: str) -> dict:
    resp = client.get(f"/funds/{fund}/changes", params={"from": from_date, "to": to_date})
    assert resp.status_code == 200, resp.text
    return resp.json()


# 10
def test_unmapped_holding_is_reported_as_unknown_sector(db_url, tmp_path):
    from backend.app.main import app

    for day in ("2026-11-02", "2026-11-03"):
        rows = [r for r in read_rows(DEMO_1) if r["security_id"] != "CCC"]
        rows.append({**rows[0], "security_id": "ZZZ", "ticker": "ZZZ", "name": "ZZZ Corp"})
        for r in rows:
            r["date"] = day
        assert ingest(write_rows(tmp_path / f"demo_{day}.csv", rows), "DEMO") == 0

    with TestClient(app) as client:
        r = changes(client, "DEMO", "2026-11-02", "2026-11-03")
    zzz = by_id(r["holdings"])["ZZZ"]
    assert zzz["sector"] == "Unknown"
    assert close(zzz["w_from"], 0.25) and close(zzz["w_to"], 0.25)
    unknown = by_sector(r["sectors"])["Unknown"]
    assert close(unknown["w_from"], 0.25) and close(unknown["w_to"], 0.25)
    assert any("Unknown" in c for c in r["caveats"])


# 11
def test_ticker_change_with_same_security_id_is_not_added_or_removed(db_url, tmp_path):
    from backend.app.main import app

    rows = read_rows(DEMO_2)
    rows[1]["ticker"] = "BBBX"  # BBB keeps its security_id
    assert ingest(DEMO_1, "DEMO") == 0
    assert ingest(write_rows(tmp_path / "demo_2026-10-02.csv", rows), "DEMO") == 0

    with TestClient(app) as client:
        r = changes(client, "DEMO", "2026-10-01", "2026-10-02")
    bbb = by_id(r["holdings"])["BBB"]
    assert bbb["status"] == "INCREASED"
    assert bbb["ticker"] == "BBBX"
    assert r["summary"]["added"] == 1 and r["summary"]["removed"] == 1  # EEE and CCC only


class ForcedFailure(Exception):
    pass


# 12
def test_failure_mid_load_leaves_nothing_behind(db_url, monkeypatch):
    original = load._insert_holding
    calls = []

    def flaky(session, snapshot_id, row):
        calls.append(row.security_id)
        if len(calls) == 3:
            raise ForcedFailure("forced failure mid-load")
        original(session, snapshot_id, row)
        session.flush()  # make sure earlier rows really reached the database

    monkeypatch.setattr(load, "_insert_holding", flaky)
    with pytest.raises(ForcedFailure):
        run_pipeline("DEMO", DEMO_1, adapter="sample")
    assert len(calls) == 3
    assert snapshot_count(as_of=date(2026, 10, 1)) == 0
    assert holding_count() == 0


# --- Real ARK file (data/raw, committed; no network) ---

ARKK_FILE = SAMPLE_DIR.parent / "raw" / "ARKK_2026-10-16.csv"


def test_ark_adapter_reads_the_issuer_format():
    from backend.pipeline.adapters.ark import ArkAdapter

    rows = ArkAdapter().read(ARKK_FILE)
    assert len(rows) == 46  # the disclaimer footer is skipped
    assert {r.as_of_date for r in rows} == {date(2026, 10, 16)}
    tsla = rows[0]
    assert (tsla.security_id, tsla.ticker, tsla.shares) == ("88160R101", "TSLA", 2065670)
    assert tsla.market_value == 748681434.80
    assert close(tsla.reported_weight, 0.0976)  # percent in the file, fraction here
    classes = {r.security_id: r.asset_class for r in rows}
    assert classes["X9USDGSFT"] == "cash"  # money-market fund
    assert classes["BREADUMMY"] == "other"  # warrants
    assert classes["PPOPENAIC"] == "equity"  # private placement without a ticker


def test_real_ark_file_ingests_and_reingest_is_a_noop(db_url, capsys):
    assert ingest(ARKK_FILE, "ARKK") == 0
    assert ingest(ARKK_FILE, "ARKK") == 0
    assert "already ingested" in output(capsys)
    assert snapshot_count("ARKK") == 1
    assert holding_count() == 46
    with Session(db.get_engine()) as s:
        snapshot = s.scalars(select(Snapshot)).one()
        assert snapshot.source_url.startswith("https://assets.ark-funds.com/")
        tsla = s.scalars(select(Holding).where(Holding.security_id == "88160R101")).one()
        assert close(tsla.price, 748681434.80 / 2065670)  # derived: the file has no price column


def load_seed_script():
    import importlib.util

    path = SAMPLE_DIR.parents[1] / "scripts" / "seed_db.py"
    spec = importlib.util.spec_from_file_location("seed_db", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_seed_script_loads_production_data_and_is_rerunnable(db_url, monkeypatch, capsys):
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.chdir(SAMPLE_DIR.parents[1])  # restored afterwards; the script chdirs to the repo root
    seed = load_seed_script()
    assert seed.main([]) == 0
    assert seed.main([]) == 0
    out = output(capsys)
    assert out.count("already ingested") == 1  # only the real ARKK file is seeded by default
    with Session(db.get_engine()) as s:
        assert s.scalar(select(func.count(Snapshot.id))) == 1


def test_seed_script_on_vercel_requires_a_database(monkeypatch, capsys):
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.delenv("DATABASE_URL", raising=False)
    assert load_seed_script().main([]) == 1
    assert "DATABASE_URL" in output(capsys)
