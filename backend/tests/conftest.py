import csv
from pathlib import Path

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

REPO = Path(__file__).resolve().parents[2]
SAMPLE_DIR = REPO / "backend" / "tests" / "fixtures"
REFERENCE_DIR = REPO / "data" / "reference"


def read_sample(name: str) -> list[dict]:
    """A sample CSV as analytics input rows, read without the pipeline."""
    with open(SAMPLE_DIR / name, newline="") as f:
        return [
            {
                "security_id": r["security_id"],
                "ticker": r["ticker"],
                "name": r["name"],
                "asset_class": r["asset_class"],
                "shares": float(r["shares"]),
                "price": float(r["price"]),
                "market_value": float(r["market_value"]),
            }
            for r in csv.DictReader(f)
        ]


@pytest.fixture
def load_sample():
    return read_sample


@pytest.fixture
def sector_map() -> dict[str, str]:
    sectors = {}
    for path in (SAMPLE_DIR / "sectors.csv", REFERENCE_DIR / "sectors.csv"):
        with open(path, newline="") as f:
            sectors.update({r["security_id"]: r["sector"] for r in csv.DictReader(f)})
    return sectors


@pytest.fixture
def db_url(tmp_path, monkeypatch):
    """A fresh SQLite database for one test."""
    from backend.app import db

    url = f"sqlite:///{tmp_path / 'test.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    db.reset_engine()
    yield url
    db.reset_engine()


def ingest(path: Path, fund: str, *extra: str) -> int:
    """Run the pipeline CLI in-process and return its exit code."""
    if fund in {"DEMO", "SPLT", "FLOWTEST"}:
        from backend.app.db import get_engine, init_db
        from backend.app.models import Fund, SecuritySector

        init_db()
        with Session(get_engine()) as session, session.begin():
            with (SAMPLE_DIR / "funds.csv").open(newline="") as source:
                for row in csv.DictReader(source):
                    if not session.scalar(select(Fund.id).where(Fund.ticker == row["ticker"])):
                        session.add(Fund(**row))
            with (SAMPLE_DIR / "sectors.csv").open(newline="") as source:
                for row in csv.DictReader(source):
                    if not session.scalar(select(SecuritySector.security_id).where(
                        SecuritySector.security_id == row["security_id"]
                    )):
                        session.add(SecuritySector(**row))
    if fund != "ARKK" and "--adapter" not in extra:
        extra = (*extra, "--adapter", "sample")
    from backend.pipeline.run import main

    return main(["--fund", fund, "--file", str(path), *extra])


def ingest_all_samples() -> None:
    for path in sorted(SAMPLE_DIR.glob("*.csv")):
        if path.name in {"funds.csv", "sectors.csv"}:
            continue
        assert ingest(path, path.name.split("_")[0].upper(), "--adapter", "sample") == 0, path


@pytest.fixture
def client(db_url):
    from fastapi.testclient import TestClient

    from backend.app.main import app

    ingest_all_samples()
    with TestClient(app) as c:
        yield c
