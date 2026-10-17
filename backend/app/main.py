from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy.orm import Session

from backend.pipeline.reference import sync_reference

from .db import get_engine, init_db
from .routes import funds


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    with Session(get_engine()) as session, session.begin():
        sync_reference(session)
    yield


app = FastAPI(title="FundShift", lifespan=lifespan)
app.include_router(funds.router)
