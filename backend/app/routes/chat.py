"""POST /chat: the assistant that turns the user's words into a target sector mix."""

import logging
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, field_validator

from .. import llm
from ..assistant import AssistantResult, ask_gemini, rule_based, tidy
from ..plan_schemas import _finite_non_negative

router = APIRouter(tags=["planner"])
log = logging.getLogger(__name__)


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class ChatIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str = Field(min_length=1, max_length=1000)
    history: list[ChatTurn] = Field(default_factory=list, max_length=20)
    current: dict[str, float] = Field(default_factory=dict)  # the portfolio's sector mix, fractions
    target: dict[str, float] | None = None  # the target so far, fractions
    total: float = Field(default=0.0, ge=0, allow_inf_nan=False)

    _check_current = field_validator("current")(_finite_non_negative)
    _check_target = field_validator("target")(_finite_non_negative)


@router.post("/chat", response_model=AssistantResult)
def chat(body: ChatIn, client=Depends(llm.get_client)):
    current = tidy(body.current) or {}
    target = tidy(body.target) if body.target else None
    if client is not None:
        try:
            return ask_gemini(client, body.message, [t.model_dump() for t in body.history],
                              current, target, body.total)
        except llm.FAILURES as e:
            log.warning("assistant fell back to rules: %s", e)
            result = rule_based(body.message, target or current)
            result.reply = "The assistant is busy, so I used the simple reader. " + result.reply
            return result
    return rule_based(body.message, target or current)
