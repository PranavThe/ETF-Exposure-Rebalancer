from .ark import ArkAdapter
from .base import Adapter, Row, ValidationError
from .sample import SampleAdapter

ADAPTERS: dict[str, type[Adapter]] = {"sample": SampleAdapter, "ark": ArkAdapter}


def default_adapter_for(fund: str) -> str:
    return "ark" if fund.upper() == "ARKK" else "sample"


__all__ = ["ADAPTERS", "Adapter", "ArkAdapter", "Row", "SampleAdapter", "ValidationError",
           "default_adapter_for"]
