"""ARK Invest daily holdings CSV (columns observed 2026-10-17, see CLAUDE.md).

date,fund,company,ticker,cusip,shares,market value ($),weight (%)
10/16/2026,ARKK,TESLA INC,TSLA,88160R101,"2,065,670","$748,681,434.80",9.76%

The file has no asset-class column, so it is inferred from the company name: money-market funds
and cash are `cash`, warrants and rights are `other`, everything else (including private
placements with pseudo-CUSIPs like PPOPENAIC) is `equity`.
"""

import re

from .base import Adapter

CASH = re.compile(r"\bCASH\b|MONEY MARKET|\bTRSY OBLIG|\bTREAS(URY)? OBLIG|\bGOVT OBLIG|^US DOLLARS?$")
OTHER = re.compile(r"\bWTS?\b|\bWARRANTS?\b|\bRIGHTS?\b")


class ArkAdapter(Adapter):
    name = "ark"
    weight_unit = "percent"
    date_format = "%m/%d/%Y"
    source_url = "https://assets.ark-funds.com/fund-documents/funds-etf-csv/ARK_INNOVATION_ETF_ARKK_HOLDINGS.csv"
    columns = {
        "as_of_date": "date",
        "fund": "fund",
        "name": "company",
        "ticker": "ticker",
        "security_id": "cusip",
        "shares": "shares",
        "market_value": "market value ($)",
        "reported_weight": "weight (%)",
    }

    def asset_class(self, cells: dict[str, str]) -> str:
        name = cells["company"].upper()
        if CASH.search(name):
            return "cash"
        if OTHER.search(name):
            return "other"
        return "equity"

    def is_data(self, cells: dict[str, str]) -> bool:
        # The disclaimer footer is one quoted field, so only the first column is filled.
        return any(value for column, value in cells.items() if column != "date")
