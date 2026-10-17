"""Adapter -> validate -> normalize -> load, plus the command-line entry point."""

import argparse
import sys
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.db import get_engine, init_db
from backend.app.models import Fund, ImportLog

from .adapters import ADAPTERS, default_adapter_for
from .adapters.base import Row, ValidationError
from .load import load_snapshot
from .normalize import normalize
from .reference import sync_reference
from .validate import validate

EXIT_CODES = {"inserted": 0, "replaced": 0, "duplicate_noop": 0, "invalid_rejected": 1,
              "conflict_rejected": 2}


@dataclass
class PipelineResult:
    outcome: str
    exit_code: int
    message: str
    warnings: list[str] = field(default_factory=list)


def run_pipeline(fund: str, file: str | Path, adapter: str | None = None, replace: bool = False,
                 source_url: str | None = None) -> PipelineResult:
    fund = fund.strip().upper()
    path = Path(file)
    source_file = path.as_posix()
    reader = ADAPTERS[adapter or default_adapter_for(fund)]()

    init_db()
    engine = get_engine()
    with Session(engine) as session, session.begin():
        sync_reference(session)

    rows: list[Row] = []
    try:
        rows = reader.read(path, fund=fund)
        with Session(engine) as session:
            known_funds = set(session.scalars(select(Fund.ticker)))
        warnings = validate(rows, file=source_file, fund=fund,
                            known_funds=known_funds, columns=reader.columns)
    except ValidationError as e:
        _log_rejection(fund, rows, source_file, str(e))
        return PipelineResult("invalid_rejected", 1, f"rejected: {e}")

    rows = normalize(rows)
    with Session(engine) as session, session.begin():
        result = load_snapshot(session, fund=fund, rows=rows, source_file=source_file,
                               source_url=reader.source_url if source_url is None else source_url,
                               replace=replace)

    as_of = rows[0].as_of_date
    if result.outcome == "duplicate_noop":
        message = f"already ingested: {fund} {as_of} ({source_file}, hash {result.content_hash})"
    elif result.outcome == "conflict_rejected":
        message = (f"conflict: {fund} {as_of} is already stored with different content.\n"
                   f"  stored hash: {result.existing_hash}\n"
                   f"  file hash:   {result.content_hash}\n"
                   f"Re-run with --replace to overwrite the stored snapshot.")
    elif result.outcome == "replaced":
        message = (f"replaced {fund} {as_of}: {len(rows)} rows "
                   f"(hash {result.existing_hash} -> {result.content_hash})")
    else:
        message = f"inserted {fund} {as_of}: {len(rows)} rows (hash {result.content_hash})"
    return PipelineResult(result.outcome, EXIT_CODES[result.outcome], message, warnings)


def _log_rejection(fund: str, rows: list[Row], source_file: str, message: str) -> None:
    with Session(get_engine()) as session, session.begin():
        fund_id = session.scalar(select(Fund.id).where(Fund.ticker == fund))
        session.add(ImportLog(fund_id=fund_id, as_of_date=rows[0].as_of_date if rows else None,
                              source_file=source_file, outcome="invalid_rejected", message=message))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Ingest one holdings file.")
    parser.add_argument("--fund", required=True, help="fund ticker, e.g. ARKK")
    parser.add_argument("--file", required=True, help="path to the holdings file")
    parser.add_argument("--adapter", choices=sorted(ADAPTERS),
                        help="file format (default: ark for ARKK, sample otherwise)")
    parser.add_argument("--replace", action="store_true",
                        help="overwrite a stored snapshot for the same fund and date")
    parser.add_argument("--source-url", help="where the file came from (default: the adapter's URL)")
    args = parser.parse_args(argv)

    result = run_pipeline(args.fund, args.file, adapter=args.adapter, replace=args.replace,
                          source_url=args.source_url)
    for warning in result.warnings:
        print(f"warning: {args.file}: {warning}", file=sys.stderr)
    print(result.message, file=sys.stderr if result.exit_code else sys.stdout)
    return result.exit_code
