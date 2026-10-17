"""Synthetic fixtures in data/sample/: weights are already fractions."""

from pathlib import Path

from .base import Adapter, Row


class SampleAdapter(Adapter):
    name = "sample"
    weight_unit = "fraction"

    def read(self, path: Path) -> list[Row]:
        raise NotImplementedError
