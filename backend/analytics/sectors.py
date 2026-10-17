"""Sector resolution and per-sector aggregation."""

from typing import Iterable, Mapping


def resolve_sector(security_id: str, source_sector: str | None, sector_map: Mapping[str, str]) -> str:
    """Reference mapping, then the issuer's sector, then Unknown."""
    raise NotImplementedError


def sector_breakdown(holdings: Iterable[Mapping]) -> list[dict]:
    """Sum weights and effects by sector, splitting activity into direct and dilution."""
    raise NotImplementedError
