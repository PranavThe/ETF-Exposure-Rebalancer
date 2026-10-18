"""Synthetic regression fixtures in backend/tests/fixtures/: weights are fractions."""

from .base import Adapter


class SampleAdapter(Adapter):
    name = "sample"
    weight_unit = "fraction"
    date_format = "%Y-%m-%d"
    columns = {
        "as_of_date": "date",
        "fund": "fund",
        "security_id": "security_id",
        "ticker": "ticker",
        "name": "name",
        "asset_class": "asset_class",
        "shares": "shares",
        "price": "price",
        "market_value": "market_value",
        "reported_weight": "weight",
    }
