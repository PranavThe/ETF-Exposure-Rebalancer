"""ARK Invest daily holdings CSV."""

from pathlib import Path

from .base import Adapter, Row


class ArkAdapter(Adapter):
    name = "ark"
    weight_unit = "percent"

    def read(self, path: Path) -> list[Row]:
        raise NotImplementedError
