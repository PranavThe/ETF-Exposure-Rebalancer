"""Portfolio API shapes. All weights are fractions, so 0.25 means 25%."""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from .schemas import HoldingRow, SnapshotOut


class PortfolioAllocationIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ticker: str = Field(min_length=1, max_length=16)
    weight: float = Field(gt=0, le=1, allow_inf_nan=False)


class PortfolioIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=100)
    funds: list[PortfolioAllocationIn] = Field(default_factory=list, max_length=50)


class PortfolioAllocationOut(BaseModel):
    ticker: str
    name: str
    issuer: str
    weight: float


class PortfolioOut(BaseModel):
    id: str
    name: str
    funds: list[PortfolioAllocationOut]
    created_at: datetime
    updated_at: datetime


class PortfolioCreated(PortfolioOut):
    edit_key: str


class LatestFund(PortfolioAllocationOut):
    status: str
    as_of_date: date | None
    snapshot: SnapshotOut | None
    holdings: list[HoldingRow]


class PortfolioLatest(BaseModel):
    portfolio: PortfolioOut
    coverage_weight: float
    funds: list[LatestFund]
