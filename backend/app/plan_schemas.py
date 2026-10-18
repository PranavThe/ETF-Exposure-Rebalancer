"""Planner API shapes. Weights are fractions (0.25 = 25%); amounts are dollars."""

import math
from datetime import date

from pydantic import BaseModel, ConfigDict, Field, field_validator


def _finite_non_negative(target: dict[str, float] | None) -> dict[str, float] | None:
    if target is not None and any(not math.isfinite(v) or v < 0 for v in target.values()):
        raise ValueError("target weights must be finite and non-negative")
    return target


class PlanHoldingIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ticker: str = Field(min_length=1, max_length=16)
    amount: float = Field(ge=0, allow_inf_nan=False)


class PlanIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    holdings: list[PlanHoldingIn] = Field(default_factory=list, max_length=50)
    target: dict[str, float] | None = None  # sector -> weight; rescaled to sum to 1
    cash_change: float = Field(default=0.0, allow_inf_nan=False)  # + add money, - take money out
    max_new_funds: int = Field(default=2, ge=0, le=5)

    _check_target = field_validator("target")(_finite_non_negative)


class SectorWeight(BaseModel):
    sector: str
    weight: float


class FundFee(BaseModel):
    expense_ratio: float  # a fraction a year: 0.0003 = 0.03%
    as_of: date | None  # date of the filing it comes from
    source_url: str


class PlanFund(BaseModel):
    ticker: str
    name: str
    issuer: str
    amount: float
    status: str  # available | missing (no holdings data)
    as_of_date: date | None
    source_provider: str | None = None
    source_layer: str | None = None
    fee: FundFee | None = None
    sectors: list[SectorWeight]


class MoveOut(BaseModel):
    ticker: str
    name: str
    action: str  # add | increase | reduce | remove
    amount: float
    before: float
    after: float


class PlanOut(BaseModel):
    kind: str
    title: str
    summary: str
    total_before: float
    total_after: float
    distance: float
    exposure: list[SectorWeight]
    moves: list[MoveOut]
    new_funds: list[str]
    fee_before: float  # dollars a year in fund fees, for the funds whose fee is known
    fee_after: float
    fee_known_after: float  # dollars after the plan whose fee is known


class PlanResult(BaseModel):
    total: float
    covered_total: float
    funds: list[PlanFund]
    current: list[SectorWeight]
    target: list[SectorWeight] | None
    distance: float | None
    yearly_fee: float  # dollars a year in fund fees now, for the funds whose fee is known
    fee_known: float  # dollars whose fee is known
    plans: list[PlanOut]


class CoveredEtf(BaseModel):
    ticker: str
    name: str
    issuer: str
    as_of_date: date
    source_provider: str
    source_layer: str | None = None
    sample: bool
    fee: FundFee | None = None
    sectors: list[SectorWeight]


class PreferencesIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    total_value: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    target: dict[str, float] | None = None

    _check_target = field_validator("target")(_finite_non_negative)


class PreferencesOut(BaseModel):
    total_value: float | None
    target: dict[str, float] | None
