"""API response shapes. Weights, drifts and effects are fractions (0.07 = 7%)."""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class Health(BaseModel):
    status: str
    db: str
    fund_count: int
    snapshot_count: int


class FundOut(BaseModel):
    ticker: str
    name: str
    issuer: str
    snapshot_count: int
    latest_as_of_date: date | None


class SnapshotMeta(BaseModel):
    as_of_date: date
    source_url: str
    source_file: str
    content_hash: str
    row_count: int


class SnapshotOut(SnapshotMeta):
    ingested_at: datetime


class HoldingRow(BaseModel):
    security_id: str
    ticker: str
    name: str
    asset_class: str
    source_sector: str | None
    sector: str
    shares: float
    price: float | None
    market_value: float
    reported_weight: float | None


class HoldingsOut(BaseModel):
    fund: str
    snapshot: SnapshotOut
    holdings: list[HoldingRow]


class FromTo(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    from_: float = Field(alias="from")
    to: float


class FromCfTo(FromTo):
    cf: float


class Summary(BaseModel):
    holdings_from: int
    holdings_to: int
    added: int
    removed: int
    increased: int
    decreased: int
    top_n: int
    top_n_share: FromCfTo
    hhi: FromCfTo


class SectorChange(BaseModel):
    sector: str
    w_from: float
    w_cf: float
    w_to: float
    drift: float
    price_effect: float
    activity_effect: float
    activity_direct: float
    activity_dilution: float


class HoldingChange(BaseModel):
    security_id: str
    ticker: str
    name: str
    sector: str
    status: str
    traded: bool
    shares_from: float
    shares_to: float
    adj_share_change: float | None
    price_from: float | None
    price_to: float | None
    price_estimated: bool
    w_from: float
    w_cf: float
    w_to: float
    price_effect: float
    activity_effect: float
    flags: list[str]


class Event(BaseModel):
    id: str
    type: str
    subject: str
    magnitude: float
    description: str
    contributing_security_ids: list[str]


class Changes(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    fund: str
    config_version: str
    from_: SnapshotMeta = Field(alias="from")
    to: SnapshotMeta
    snapshot_intervals: int
    flow_factor: float
    cash_weight: FromTo
    summary: Summary
    sectors: list[SectorChange]
    holdings: list[HoldingChange]
    events: list[Event]
    caveats: list[str]
