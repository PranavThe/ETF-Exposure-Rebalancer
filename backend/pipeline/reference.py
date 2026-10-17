"""Reference data we maintain: data/reference/funds.csv and sectors.csv."""

from pathlib import Path

from sqlalchemy.orm import Session

REFERENCE_DIR = Path(__file__).resolve().parents[2] / "data" / "reference"


def read_funds() -> list[dict]:
    raise NotImplementedError


def read_sectors() -> dict[str, str]:
    raise NotImplementedError


def sync_reference(session: Session) -> None:
    """Upsert funds from funds.csv and reload security_sectors from sectors.csv."""
    raise NotImplementedError
