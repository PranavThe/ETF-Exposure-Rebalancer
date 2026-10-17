import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.pipeline.reference import sync_reference

from .db import get_engine, init_db
from .routes import funds, health

LOCAL_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"]


def cors_origins() -> list[str]:
    """The local frontend plus any comma-separated origins in CORS_ORIGINS (e.g. a Vercel URL)."""
    extra = [o.strip().rstrip("/") for o in os.environ.get("CORS_ORIGINS", "").split(",")]
    return LOCAL_ORIGINS + [o for o in extra if o]


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
    allow_methods=["GET"],
    allow_headers=["*"],
)
app.include_router(health.router)
app.include_router(funds.router)
