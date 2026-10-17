"""Write a validated snapshot in one transaction."""

from dataclasses import dataclass
from datetime import date

from sqlalchemy.orm import Session

from .adapters.base import Row


@dataclass
class LoadResult:
    outcome: str  # inserted | duplicate_noop | conflict_rejected | replaced
    content_hash: str
    existing_hash: str | None = None


def content_hash(fund: str, as_of_date: date, rows: list[Row]) -> str:
    raise NotImplementedError


def load_snapshot(session: Session, *, fund: str, rows: list[Row], source_file: str,
                  source_url: str, replace: bool) -> LoadResult:
    raise NotImplementedError


def _insert_holding(session: Session, snapshot_id: int, row: Row) -> None:
    raise NotImplementedError
