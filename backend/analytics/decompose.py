"""Counterfactual weights, flow factor, split detection and the price/activity split."""

from .weights import Position


def flow_factor(a: dict[str, Position], b: dict[str, Position]) -> tuple[float, bool]:
    """Median s_B / s_A over common holdings. Returns (factor, fell_back_to_1)."""
    raise NotImplementedError


def split_ratio(pos_a: Position, pos_b: Position, factor: float) -> float | None:
    """The ratio r when the share change looks like a split, else None."""
    raise NotImplementedError


def decompose(a: dict[str, Position], b: dict[str, Position]) -> dict:
    """Per-holding weights, effects and statuses for snapshots A (earlier) and B (later)."""
    raise NotImplementedError
