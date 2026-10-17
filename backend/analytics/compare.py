"""Full comparison of two snapshots: the body of GET /funds/{ticker}/changes."""

from datetime import date
from typing import Iterable, Mapping

from . import config


def compare_snapshots(rows_from: Iterable[Mapping], rows_to: Iterable[Mapping], *, fund: str,
                      from_date: date | str, to_date: date | str, sector_map: Mapping[str, str],
                      top_n: int = config.TOP_N, snapshot_intervals: int = 1) -> dict:
    raise NotImplementedError
