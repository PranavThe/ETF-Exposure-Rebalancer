import os
from typing import Iterator

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session

from .models import Base

DEFAULT_DATABASE_URL = "sqlite:///./fundshift.db"

_engine: Engine | None = None


def database_url() -> str:
    return os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL)


def get_engine() -> Engine:
    """The process-wide engine, created on first use from DATABASE_URL."""
    global _engine
    if _engine is None:
        url = database_url()
        connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
        _engine = create_engine(url, connect_args=connect_args)
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
