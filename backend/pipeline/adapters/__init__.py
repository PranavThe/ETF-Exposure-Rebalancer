from .ark import ArkAdapter
from .base import Adapter, Row, ValidationError
from .ishares import IsharesAdapter
from .sample import SampleAdapter

ADAPTERS: dict[str, type[Adapter]] = {"sample": SampleAdapter, "ark": ArkAdapter,
                                      "ishares": IsharesAdapter}


def default_adapter_for(fund: str) -> str:
    ticker = fund.upper()
    if ticker == "ARKK":
        return "ark"
    raise ValueError(f"No default holdings adapter for {ticker}; choose one explicitly")


__all__ = ["ADAPTERS", "Adapter", "ArkAdapter", "IsharesAdapter", "Row", "SampleAdapter", "ValidationError",
           "default_adapter_for"]
