"""The assistant: Claude's reading of a message (with a fake client) and the rule-based reader."""

import json
import math
from types import SimpleNamespace

import pytest

from backend.app.assistant import MODEL, READING_SCHEMA, ask_claude, rule_based, tidy

BASE = {"Technology": 0.5, "Health Care": 0.2, "Financials": 0.2, "Energy": 0.1}


def close(a: float, b: float) -> bool:
    return math.isclose(a, b, abs_tol=1e-9)


class FakeClient:
    """Stands in for anthropic.Anthropic: records the request, returns a canned response."""

    def __init__(self, payload: dict | None = None, stop_reason: str = "end_turn", error: Exception | None = None):
        self.calls: list[dict] = []
        self.payload, self.stop_reason, self.error = payload, stop_reason, error
        self.messages = SimpleNamespace(create=lambda **kw: self.create("messages", **kw))
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=lambda **kw: self.create("beta", **kw)))

    def create(self, endpoint: str, **kwargs):
        self.calls.append({"endpoint": endpoint, **kwargs})
        if self.error:
            raise self.error
        content = [SimpleNamespace(type="text", text=json.dumps(self.payload))] if self.payload else []
        return SimpleNamespace(stop_reason=self.stop_reason, content=content)


def test_tidy_maps_labels_and_rescales():
    assert tidy({"Information Technology": 30, "health care": 10, "Unknown": 5, "Energy": -1}) == {
        "Technology": 0.75, "Health Care": 0.25}
    assert tidy({"Energy": 0}) is None


def test_claude_reading_becomes_a_fraction_target():
    client = FakeClient({"reply": "Tech down to 40%, health care up to 30%.", "changed": True,
                         "target": [{"sector": "Technology", "percent": 40}, {"sector": "Health Care", "percent": 30},
                                    {"sector": "Financials", "percent": 20}, {"sector": "Energy", "percent": 10}]})
    result = ask_claude(client, "less tech more health care", [{"role": "user", "content": "hi"},
                        {"role": "assistant", "content": "Hello"}], BASE, None, 10000)
    assert result.source == "claude"
    assert result.target == pytest.approx({"Technology": 0.4, "Health Care": 0.3, "Financials": 0.2, "Energy": 0.1})
    [call] = client.calls
    assert call["model"] == MODEL == "claude-haiku-5-5"
    assert call["endpoint"] == "messages" and "fallbacks" not in call  # Haiku has no refusal fallback
    assert call["output_config"] == {"effort": "low", "format": {"type": "json_schema", "schema": READING_SCHEMA}}
    assert [m["role"] for m in call["messages"]] == ["user", "assistant", "user"]
    state = call["messages"][-1]["content"][0]["text"]
    assert "Technology 50.0%" in state and "not set" in state and "$10,000" in state


def test_larger_models_get_the_server_side_refusal_fallback():
    client = FakeClient({"reply": "Set.", "changed": False, "target": []})
    ask_claude(client, "hi", [], BASE, None, 0, model="claude-sonnet-5-5")
    [call] = client.calls
    assert call["endpoint"] == "beta" and call["model"] == "claude-sonnet-5-5"
    assert call["fallbacks"] == "default" and call["betas"] == ["server-side-fallback-2026-07-01"]


def test_claude_unchanged_reading_and_refusal_keep_the_target():
    client = FakeClient({"reply": "It's your call.", "changed": False, "target": []})
    assert ask_claude(client, "what should I own?", [], BASE, None, 0).target is None
    refused = ask_claude(FakeClient(stop_reason="refusal"), "x", [], BASE, None, 0)
    assert refused.target is None and "sliders" in refused.reply


def test_rules_shift_and_rescale():
    result = rule_based("less tech, more health care", BASE)
    assert result.source == "rules"
    t = result.target
    assert close(sum(t.values()), 1)
    # Tech -5 pp, health care +5 pp; the others keep their share of what is left.
    assert close(t["Technology"], 0.45) and close(t["Health Care"], 0.25)
    assert close(t["Financials"], 0.2) and close(t["Energy"], 0.1)
    assert "Technology 50% → 45%" in result.reply


def test_rules_zero_and_explicit_percent():
    t = rule_based("No energy and 30% financials", BASE).target
    assert "Energy" not in t
    assert close(t["Financials"], 0.3)
    assert close(t["Technology"], 0.7 * 0.5 / 0.7) and close(t["Health Care"], 0.7 * 0.2 / 0.7)
    assert close(sum(t.values()), 1)


def test_rules_sizes_and_new_sector():
    t = rule_based("a lot more real estate", BASE).target
    assert close(t["Real Estate"], 0.10) and close(sum(t.values()), 1)
    t = rule_based("a bit less tech", BASE).target
    assert close(t["Technology"], 0.47)
    t = rule_based("tech up 8pp", BASE).target
    assert close(t["Technology"], 0.58)


def test_rules_money_and_unknown_text():
    # Plans always use the money already in the ETFs, so money talk never changes anything.
    for message in ("I want to add $2,000", "I need to take out 1.5k"):
        result = rule_based(message, BASE)
        assert result.target is None and "dollar amount" in result.reply
    both = rule_based("invest $500 and more energy", BASE)
    assert close(both.target["Energy"], 0.15) and "money already in your ETFs" in both.reply
    nothing = rule_based("hello there", BASE)
    assert nothing.target is None and "sector" in nothing.reply

def test_chat_route_uses_rules_without_a_key(client, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    response = client.post("/chat", json={"message": "no energy", "current": BASE})
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "rules" and "Energy" not in body["target"]
    assert client.post("/chat", json={"message": ""}).status_code == 422
    assert client.post("/chat", json={"message": "x", "current": {"Energy": -1}}).status_code == 422


def test_chat_route_with_claude_and_fallback_on_error(client):
    import anthropic

    from backend.app.main import app
    from backend.app.routes.chat import get_client

    fake = FakeClient({"reply": "Set.", "changed": True,
                       "target": [{"sector": "Utilities", "percent": 100}]})
    app.dependency_overrides[get_client] = lambda: fake
    try:
        body = client.post("/chat", json={"message": "all utilities, adding $1000", "total": 5000}).json()
        assert body == {"reply": "Set.", "target": {"Utilities": 1.0}, "source": "claude"}

        broken = FakeClient(error=anthropic.APIConnectionError(request=None))
        app.dependency_overrides[get_client] = lambda: broken
        body = client.post("/chat", json={"message": "more tech", "current": BASE}).json()
        assert body["source"] == "rules" and body["reply"].startswith("The assistant is busy")
        assert math.isclose(body["target"]["Technology"], 0.55, abs_tol=1e-9)
    finally:
        app.dependency_overrides.pop(get_client, None)
