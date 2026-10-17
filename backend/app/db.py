import os
from typing import Iterator

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session

from .models import Base

DEFAULT_DATABASE_URL = "sqlite:///./fundshift.db"

_engine: Engine | None = None


def database_url() -> str:
    """DATABASE_URL, with postgres:// URLs (as Neon and Vercel issue them) mapped to psycopg 3."""
    url = os.environ.get("DATABASE_URL") or DEFAULT_DATABASE_URL
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


def get_engine() -> Engine:
    """The process-wide engine, created on first use from DATABASE_URL."""
    global _engine
    if _engine is None:
        url = database_url()
        if url.startswith("sqlite"):
            _engine = create_engine(url, connect_args={"check_same_thread": False})
        else:
            # Serverless instances sit idle and poolers drop connections, so check before use.
            # prepare_threshold=None keeps psycopg from relying on server-side prepared statements,
            # which a transaction-mode pooler (Neon's pooled URL) may not keep.
            _engine = create_engine(url, pool_pre_ping=True, connect_args={"prepare_threshold": None})
    return _engine


def reset_engine() -> None:
    """Forget the cached engine so the next get_engine() rereads DATABASE_URL."""
    global _engine
    if _engine is not None:
        _engine.dispose()
    _engine = None


def init_db() -> None:
    Base.metadata.create_all(get_engine())


def reset_db() -> None:
    engine = get_engine()
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    """FastAPI dependency."""
    with Session(get_engine()) as session:
        yield session
