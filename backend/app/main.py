import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.pipeline.reference import sync_reference

from .db import get_engine, init_db
from .routes import etfs, funds, health, portfolios, provider_data

LOCAL_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"]


def cors_origins() -> list[str]:
    """The local frontend plus any comma-separated origins in CORS_ORIGINS (e.g. a Vercel URL)."""
    extra = [o.strip().rstrip("/") for o in os.environ.get("CORS_ORIGINS", "").split(",")]
    return LOCAL_ORIGINS + [o for o in extra if o]


def cors_origin_regex() -> str | None:
    """An optional pattern for origins that change per deploy, such as Vercel preview URLs."""
    return os.environ.get("CORS_ORIGIN_REGEX", "").strip() or None


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    try:
        with Session(get_engine()) as session, session.begin():
            sync_reference(session)
    except IntegrityError:
        # Another instance starting at the same moment loaded the same reference data first.
        pass
    yield


app = FastAPI(title="FundShift", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_origin_regex=cors_origin_regex(),
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)
app.include_router(health.router)
app.include_router(funds.router)
app.include_router(portfolios.router)
app.include_router(etfs.router)
app.include_router(provider_data.router)
