"""API response shapes. Weights, drifts and effects are fractions (0.07 = 7%)."""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class Health(BaseModel):
    status: str
    db: str
    fund_count: int
    snapshot_count: int
    commit: str = ""  # the deployed git commit, when the host reports one


class FundOut(BaseModel):
    ticker: str
    name: str
    issuer: str
    snapshot_count: int
    latest_as_of_date: date | None
    provider_holdings_as_of_date: date | None = None


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


class FromCfTo(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    from_: float = Field(alias="from")
    cf: float
    to: float


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


class SimulationRequest(BaseModel):
    """Target equity weights, keyed by security_id; values are fractions summing to 1."""

    target_weights: dict[str, float]


class SimulationSectorWeight(BaseModel):
    sector: str
    weight: float


class SimulationProfile(BaseModel):
    top_n: int
    top_n_share: float
    hhi: float
    largest_holding_weight: float
    largest_sector: str | None
    largest_sector_weight: float
    sectors: list[SimulationSectorWeight]


class SimulationChange(BaseModel):
    top_n_share: float
    hhi: float
    largest_holding_weight: float
    largest_sector_weight: float


class SimulationHolding(BaseModel):
    security_id: str
    ticker: str
    name: str
    sector: str
    weight_current: float
    weight_target: float
    weight_change: float


class SimulationSectorChange(BaseModel):
    sector: str
    weight_current: float
    weight_target: float
    weight_change: float


class SimulationOut(BaseModel):
    fund: str
    as_of_date: date
    risk_scope: str
    top_n: int
    current: SimulationProfile
    scenario: SimulationProfile
    change: SimulationChange
    holdings: list[SimulationHolding]
    sectors: list[SimulationSectorChange]
    caveats: list[str]
