"""Change events and their descriptions."""


def event_id(fund: str, from_date: str, to_date: str, type_: str, subject: str) -> str:
    raise NotImplementedError


def fmt_pp(x: float) -> str:
    """Format a fraction as signed percentage points: 0.05 -> '+5.0 pp'."""
    raise NotImplementedError


def build_events(*, fund: str, from_date: str, to_date: str, holdings: list[dict],
                 sectors: list[dict], top_n: int, top_n_share: dict) -> list[dict]:
    raise NotImplementedError
