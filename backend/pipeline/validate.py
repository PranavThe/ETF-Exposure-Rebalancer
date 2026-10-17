"""Reject bad files with file, row and field; collect warnings for suspicious ones."""

from .adapters.base import Row


def validate(rows: list[Row], *, file: str, fund: str, known_funds: set[str]) -> list[str]:
    """Raise ValidationError on the first rejectable problem; return warnings."""
    raise NotImplementedError
