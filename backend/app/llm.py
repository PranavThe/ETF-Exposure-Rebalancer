"""Gemini, through the google-genai SDK: the one place the API talks to a language model.

Scythe (assistant.py) and the plain-language explanations (explain.py) send a system instruction,
the conversation and a JSON schema, and get JSON text back. Without GEMINI_API_KEY there is no
client, and each caller falls back to its own rule-based answer.
"""

import json
import os

import httpx
import pydantic
from google import genai
from google.genai import errors, types

# A fast Flash model first: Scythe's reading needs a little arithmetic, not long reasoning. When a
# model is rate-limited, overloaded or retired, the next one is tried; on the free tier each model
# has its own requests-per-minute quota, so the chain also adds capacity.
DEFAULT_MODEL = "gemini-3.5-flash"
FALLBACK_MODELS = ("gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-3.7-flash")
RETRY_ON = {404, 429, 500, 502, 503, 504}
TIMEOUT_MS = 30_000

# What a failed or unusable call raises; callers catch these and use their fallback.
FAILURES = (errors.APIError, httpx.HTTPError, json.JSONDecodeError, pydantic.ValidationError, ValueError)


def models() -> list[str]:
    first = os.environ.get("GEMINI_MODEL", "").strip() or DEFAULT_MODEL
    return [first] + [m for m in FALLBACK_MODELS if m != first]


def get_client() -> genai.Client | None:
    """A Gemini client when GEMINI_API_KEY is set; otherwise None."""
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        return None
    return genai.Client(api_key=key, http_options=types.HttpOptions(timeout=TIMEOUT_MS))


def generate_json(client, system: str, turns: list[dict], schema: dict,
                  thinking: str = "low") -> tuple[dict, str]:
    """One answer as JSON matching `schema`, and the model that gave it.

    `turns` are {"role": "user" | "model", "text": ...}. Raises ValueError when Gemini returns no
    text (for example a blocked answer), and the SDK's errors when every model fails.
    """
    config = types.GenerateContentConfig(
        system_instruction=system,
        response_mime_type="application/json",
        response_json_schema=schema,
        thinking_config=types.ThinkingConfig(thinking_level=thinking),
    )
    contents = [{"role": t["role"], "parts": [{"text": t["text"]}]} for t in turns]
    failure: Exception = ValueError("no Gemini model configured")
    for name in models():
        try:
            response = client.models.generate_content(model=name, contents=contents, config=config)
        except errors.APIError as e:
            if e.code not in RETRY_ON:
                raise
            failure = e
            continue
        if not response.text:
            raise ValueError("Gemini returned no text")
        return json.loads(response.text), name
    raise failure
