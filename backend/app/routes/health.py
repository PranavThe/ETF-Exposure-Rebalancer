import os

from fastapi import APIRouter, Depends, Response
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from ..db import get_session
from ..models import Fund, Snapshot
from ..schemas import Health

router = APIRouter()

COMMIT = os.environ.get("VERCEL_GIT_COMMIT_SHA", "")[:7]


@router.get("/health", response_model=Health)
def health(response: Response, session: Session = Depends(get_session)):
    try:
        funds = session.scalar(select(func.count(Fund.id)))
        snapshots = session.scalar(select(func.count(Snapshot.id)))
    except SQLAlchemyError as e:
        response.status_code = 503
        return {"status": "error", "db": type(e).__name__, "fund_count": 0, "snapshot_count": 0, "commit": COMMIT}
    return {"status": "ok", "db": "ok", "fund_count": funds, "snapshot_count": snapshots, "commit": COMMIT}
