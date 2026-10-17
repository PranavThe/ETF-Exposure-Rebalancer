from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from backend.pipeline.reference import sync_reference

from .db import get_engine, init_db
from .routes import funds, health


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    with Session(get_engine()) as session, session.begin():
        sync_reference(session)
    yield


app = FastAPI(title="FundShift", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["GET"],
    allow_headers=["*"],
)
app.include_router(health.router)
app.include_router(funds.router)
