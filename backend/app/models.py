from datetime import date, datetime, timezone

from sqlalchemy import JSON, Date, DateTime, Double, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Fund(Base):
    __tablename__ = "funds"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticker: Mapped[str] = mapped_column(String(16), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    issuer: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class EtfCatalogEntry(Base):
    __tablename__ = "etf_catalog"

    ticker: Mapped[str] = mapped_column(String(16), primary_key=True)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Snapshot(Base):
    __tablename__ = "snapshots"
    __table_args__ = (UniqueConstraint("fund_id", "as_of_date"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    fund_id: Mapped[int] = mapped_column(ForeignKey("funds.id"))
    as_of_date: Mapped[date] = mapped_column(Date)
    source_url: Mapped[str] = mapped_column(String(500), default="")
    source_file: Mapped[str] = mapped_column(String(500), default="")
    content_hash: Mapped[str] = mapped_column(String(64))
    row_count: Mapped[int] = mapped_column(Integer)
    ingested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Holding(Base):
    __tablename__ = "holdings"
    __table_args__ = (UniqueConstraint("snapshot_id", "security_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    snapshot_id: Mapped[int] = mapped_column(ForeignKey("snapshots.id", ondelete="CASCADE"))
    security_id: Mapped[str] = mapped_column(String(100))
    ticker: Mapped[str] = mapped_column(String(32), default="")
    name: Mapped[str] = mapped_column(String(300))
    asset_class: Mapped[str] = mapped_column(String(16))
    source_sector: Mapped[str | None] = mapped_column(String(100), nullable=True)
    shares: Mapped[float] = mapped_column(Double)
    price: Mapped[float | None] = mapped_column(Double, nullable=True)
    market_value: Mapped[float] = mapped_column(Double)
    reported_weight: Mapped[float | None] = mapped_column(Double, nullable=True)


class ProviderHoldingsSnapshot(Base):
    """Weight-only snapshot from an external holdings provider (kept apart from N-PORT rows)."""
    __tablename__ = "provider_holdings_snapshots"
    __table_args__ = (UniqueConstraint("provider", "fund_ticker", "as_of_date", "content_hash"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    provider: Mapped[str] = mapped_column(String(32))
    fund_ticker: Mapped[str] = mapped_column(String(16), index=True)
    fund_name: Mapped[str] = mapped_column(String(200))
    as_of_date: Mapped[date] = mapped_column(Date)
    source_layer: Mapped[str] = mapped_column(String(32))
    source_url: Mapped[str] = mapped_column(String(500))
    cite_as: Mapped[str] = mapped_column(Text, default="")
    content_hash: Mapped[str] = mapped_column(String(64))
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ProviderHolding(Base):
    __tablename__ = "provider_holdings"
    __table_args__ = (UniqueConstraint("snapshot_id", "ticker"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    snapshot_id: Mapped[int] = mapped_column(
        ForeignKey("provider_holdings_snapshots.id", ondelete="CASCADE"), index=True
    )
    ticker: Mapped[str] = mapped_column(String(32))
    weight: Mapped[float] = mapped_column(Double)


class SecurityPrice(Base):
    """Daily OHLCV price bar, with source feed recorded for data provenance."""
    __tablename__ = "security_prices"
    __table_args__ = (UniqueConstraint("provider", "feed", "adjustment", "ticker", "as_of_date"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    provider: Mapped[str] = mapped_column(String(32))
    feed: Mapped[str] = mapped_column(String(16))
    adjustment: Mapped[str] = mapped_column(String(16), default="all")
    ticker: Mapped[str] = mapped_column(String(32), index=True)
    as_of_date: Mapped[date] = mapped_column(Date, index=True)
    open: Mapped[float] = mapped_column(Double)
    high: Mapped[float] = mapped_column(Double)
    low: Mapped[float] = mapped_column(Double)
    close: Mapped[float] = mapped_column(Double)
    volume: Mapped[float] = mapped_column(Double)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ImportLog(Base):
    __tablename__ = "import_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Null when the file named a fund we don't know or had no parseable date.
    fund_id: Mapped[int | None] = mapped_column(ForeignKey("funds.id"), nullable=True)
    as_of_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    source_file: Mapped[str] = mapped_column(String(500))
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    outcome: Mapped[str] = mapped_column(String(32))
    message: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class SecuritySector(Base):
    __tablename__ = "security_sectors"

    security_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    sector: Mapped[str] = mapped_column(String(100))


class Portfolio(Base):
    __tablename__ = "portfolios"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    edit_key_hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class PortfolioFund(Base):
    __tablename__ = "portfolio_funds"
    __table_args__ = (UniqueConstraint("portfolio_id", "fund_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    portfolio_id: Mapped[str] = mapped_column(ForeignKey("portfolios.id", ondelete="CASCADE"))
    fund_id: Mapped[int] = mapped_column(ForeignKey("funds.id"))
    weight: Mapped[float] = mapped_column(Double)


class PortfolioPreference(Base):
    """What the user told the planner: the portfolio's dollar value and the sector mix they want.

    A separate table so the existing portfolio tables stay unchanged (no migrations).
    """

    __tablename__ = "portfolio_preferences"

    portfolio_id: Mapped[str] = mapped_column(
        ForeignKey("portfolios.id", ondelete="CASCADE"), primary_key=True)
    total_value: Mapped[float | None] = mapped_column(Double, nullable=True)
    target: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # sector -> fraction
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
