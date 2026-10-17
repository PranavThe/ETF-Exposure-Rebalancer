"""Top-N share and HHI."""

from typing import Iterable


def top_n_share(weights: Iterable[float], n: int) -> float:
    return sum(sorted(weights, reverse=True)[:n])


def hhi(weights: Iterable[float]) -> float:
    return sum(w * w for w in weights)
