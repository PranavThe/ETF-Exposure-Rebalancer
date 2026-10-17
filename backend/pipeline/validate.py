"""Reject bad files with file, row and field; collect warnings for suspicious ones."""

from typing import Mapping

from .adapters.base import Row, ValidationError
from .normalize import security_id_for

REQUIRED = ("as_of_date", "fund", "name", "asset_class", "shares", "market_value")
ASSET_CLASSES = ("equity", "cash", "other")

WEIGHT_SUM_REJECT = (0.90, 1.10)
WEIGHT_SUM_WARN = (0.97, 1.03)
WEIGHT_ROW_WARN = 0.001  # 0.1 pp between reported and market-value weight
EPSILON = 1e-9


def validate(rows: list[Row], *, file: str, fund: str, known_funds: set[str],
             columns: Mapping[str, str]) -> list[str]:
    """Raise ValidationError on the first rejectable problem; return warnings.

    `columns` maps normalized fields to the file's column names, for error messages.
    """
    def col(field: str) -> str:
        return columns.get(field, field)

    if fund not in known_funds:
        raise ValidationError(file, None, "fund", f"{fund} is not in data/reference/funds.csv")
    if not rows:
        raise ValidationError(file, None, None, "no holdings rows")

    warnings = []
    first = rows[0]
    for r in rows:
        for field in REQUIRED:
            if getattr(r, field) in (None, ""):
                raise ValidationError(file, r.row_number, col(field), "required field is empty")
        if r.as_of_date != first.as_of_date:
            raise ValidationError(file, r.row_number, col("as_of_date"),
                                  f"more than one as_of_date in file ({first.as_of_date} on row "
                                  f"{first.row_number}, {r.as_of_date} here)")
        if r.fund.upper() != fund:
            raise ValidationError(file, r.row_number, col("fund"), f"{r.fund} does not match --fund {fund}")
        if r.asset_class not in ASSET_CLASSES:
            raise ValidationError(file, r.row_number, col("asset_class"),
                                  f"{r.asset_class!r} is not one of {', '.join(ASSET_CLASSES)}")
        if r.asset_class == "equity":
            # Long-only equity is supported; cash and other rows may be negative.
            if r.shares < 0:
                raise ValidationError(file, r.row_number, col("shares"), "negative shares on an equity row")
            if r.market_value < 0:
                raise ValidationError(file, r.row_number, col("market_value"),
                                      "negative market value on an equity row")
            if not r.security_id:
                if not r.ticker:
                    raise ValidationError(file, r.row_number, col("security_id"),
                                          "equity row has neither a security_id nor a ticker")
                warnings.append(f"row {r.row_number}: no security_id; using {security_id_for(r)}")

    seen: dict[str, int] = {}
    for r in rows:
        sid = security_id_for(r)
        if sid in seen:
            raise ValidationError(file, r.row_number, col("security_id"),
                                  f"duplicate security_id {sid} (also on row {seen[sid]})")
        seen[sid] = r.row_number

    weighted = [r for r in rows if r.reported_weight is not None]
    if weighted:
        total = sum(r.reported_weight for r in weighted)
        low, high = WEIGHT_SUM_REJECT
        if not low - EPSILON <= total <= high + EPSILON:
            raise ValidationError(file, None, col("reported_weight"),
                                  f"reported weights sum to {total:.2%}, outside {low:.0%}-{high:.0%}")
        low, high = WEIGHT_SUM_WARN
        if not low - EPSILON <= total <= high + EPSILON:
            warnings.append(f"reported weights sum to {total:.2%}, outside {low:.0%}-{high:.0%}")

        mv_total = sum(r.market_value for r in rows)
        for r in weighted:
            mv_weight = r.market_value / mv_total if mv_total else 0.0
            if abs(r.reported_weight - mv_weight) > WEIGHT_ROW_WARN + EPSILON:
                warnings.append(f"row {r.row_number}: reported weight {r.reported_weight:.4%} differs "
                                f"from market-value weight {mv_weight:.4%} by more than 0.1 pp")
    return warnings
