"""Write a validated snapshot. The caller wraps load_snapshot in one transaction."""

import hashlib
import json
from dataclasses import dataclass
from datetime import date

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from backend.app.models import Fund, Holding, ImportLog, Snapshot

from .adapters.base import Row


@dataclass
class LoadResult:
    outcome: str  # inserted | duplicate_noop | conflict_rejected | replaced
    content_hash: str
    existing_hash: str | None = None


def _num(x: float | None) -> str | None:
    if x is None:
        return None
    text = f"{x:.6f}"
    return "0.000000" if text == "-0.000000" else text


def content_hash(fund: str, as_of_date: date, rows: list[Row]) -> str:
    """sha256 of canonical JSON of the normalized rows, sorted by security_id.

    Numbers are fixed-precision strings, so whitespace, quoting, column order or number formatting
    in the raw file does not change the hash.
    """
    payload = {
        "fund": fund,
        "as_of_date": as_of_date.isoformat(),
        "rows": [
            {
                "security_id": r.security_id,
                "ticker": r.ticker,
                "name": r.name,
                "asset_class": r.asset_class,
                "source_sector": r.source_sector,
                "shares": _num(r.shares),
                "price": _num(r.price),
                "market_value": _num(r.market_value),
                "reported_weight": _num(r.reported_weight),
            }
            for r in sorted(rows, key=lambda r: r.security_id)
        ],
    }
    blob = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(blob.encode()).hexdigest()


def load_snapshot(session: Session, *, fund: str, rows: list[Row], source_file: str,
                  source_url: str, replace: bool) -> LoadResult:
    fund_row = session.scalars(select(Fund).where(Fund.ticker == fund)).one()
    as_of = rows[0].as_of_date
    digest = content_hash(fund, as_of, rows)
    existing = session.scalars(
        select(Snapshot).where(Snapshot.fund_id == fund_row.id, Snapshot.as_of_date == as_of)
    ).one_or_none()

    def log(outcome: str, message: str) -> None:
        session.add(ImportLog(fund_id=fund_row.id, as_of_date=as_of, source_file=source_file,
                              content_hash=digest, outcome=outcome, message=message))

    if existing and existing.content_hash == digest:
        log("duplicate_noop", "already ingested")
        return LoadResult("duplicate_noop", digest, existing.content_hash)
    if existing and not replace:
        log("conflict_rejected", f"stored {existing.content_hash}, file {digest}")
        return LoadResult("conflict_rejected", digest, existing.content_hash)

    old_hash = None
    if existing:
        old_hash = existing.content_hash
        session.execute(delete(Holding).where(Holding.snapshot_id == existing.id))
        session.delete(existing)
        session.flush()

    snapshot = Snapshot(fund_id=fund_row.id, as_of_date=as_of, source_url=source_url,
                        source_file=source_file, content_hash=digest, row_count=len(rows))
    session.add(snapshot)
    session.flush()
    for r in rows:
        _insert_holding(session, snapshot.id, r)

    if old_hash:
        log("replaced", f"replaced {old_hash} with {digest}")
        return LoadResult("replaced", digest, old_hash)
    log("inserted", f"{len(rows)} rows")
    return LoadResult("inserted", digest)


def _insert_holding(session: Session, snapshot_id: int, row: Row) -> None:
    session.add(Holding(
        snapshot_id=snapshot_id,
        security_id=row.security_id,
        ticker=row.ticker,
        name=row.name,
        asset_class=row.asset_class,
        source_sector=row.source_sector,
        shares=row.shares,
        price=row.price,
        market_value=row.market_value,
        reported_weight=row.reported_weight,
    ))
