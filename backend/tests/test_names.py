"""Company-name normalization and the name -> sector lookup used for holdings without a sector."""

import csv

import pytest

from backend.analytics.names import NameSectors, normalize_company_name
from backend.pipeline.reference import read_ticker_sectors

from .conftest import REFERENCE_DIR


@pytest.mark.parametrize("key, spellings", [
    # SEC N-PORT (iShares style), N-PORT (Bloomberg style), N-PORT (Vanguard), iShares files
    ("apple", ["Apple, Inc.", "Apple Inc", "APPLE INC", "APPLE"]),
    ("alphabet", ["Alphabet, Inc., Class A", "Alphabet Inc", "ALPHABET INC-A", "ALPHABET CLASS A"]),
    ("jpmorgan chase", ["JPMorgan Chase & Co.", "JPMorgan Chase & Co", "JPMORGAN CHASE",
                        "JPMORGAN CHASE & CO"]),
    ("berkshire hathaway", ["Berkshire Hathaway, Inc., Class B", "Berkshire Hathaway Inc",
                            "BERKSHIRE HATHAWAY INC CLASS B"]),
    ("coca cola", ["Coca-Cola Co. (The)", "Coca-Cola Co/The", "COCA-COLA"]),
    ("eli lilly", ["Eli Lilly & Co.", "ELI LILLY & CO", "ELI LILLY"]),
    ("johnson and johnson", ["Johnson & Johnson", "JOHNSON&JOHNSON", "JOHNSON & JOHNSON"]),
    ("meta platforms", ["Meta Platforms, Inc., Class A", "META PLATFORMS-A", "META PLATFORMS CLASS A"]),
    ("visa", ["Visa, Inc., Class A", "Visa Inc", "VISA INC-CLASS A", "VISA CLASS A"]),
    ("amazon", ["Amazon.com, Inc.", "AMAZON.COM INC"]),
    ("moodys", ["Moody's Corp.", "MOODYS CORP"]),
    ("jm smucker", ["J.M. Smucker Co. (The)", "J M SMUCKER"]),
    ("mccormick", ["McCormick & Co., Inc. (Non-Voting)", "MCCORMICK & CO NON-VOTING"]),
    ("vornado realty trust", ["VORNADO REALTY TRUST SH BEN INT", "Vornado Realty Trust",
                              "VORNADO REALTY TRUST REIT"]),
    ("wintrust financial", ["WINTRUST FINANCIAL CORP COM", "WINTRUST FINANCIAL CORP"]),
    ("crh", ["CRH plc", "CRH PUBLIC LIMITED PLC"]),
    ("orsted", ["ORSTED A/S", "Orsted AS"]),
    ("at and t", ["AT&T Inc.", "AT&T"]),  # a letter after "and" is part of the name
])
def test_spellings_of_one_company_share_a_key(key, spellings):
    assert {normalize_company_name(s) for s in spellings} == {key}


def test_different_companies_keep_different_keys():
    pairs = [
        ("General Motors Co", "General Mills, Inc."),
        ("Apple, Inc.", "Apple Hospitality REIT, Inc."),
        ("Northern Trust Corp", "Northern Oil & Gas, Inc."),
        ("Goldman Sachs Group Inc/The", "Goldman Sachs BDC, Inc."),
        ("First Solar, Inc.", "First Industrial Realty Trust, Inc."),
    ]
    for a, b in pairs:
        assert normalize_company_name(a) != normalize_company_name(b), (a, b)
    # "holdings", "group" and "trust" stay in the key; only the loose lookup ignores the first two.
    assert normalize_company_name("Goldman Sachs Group Inc/The") == "goldman sachs group"
    assert normalize_company_name("NORTHERN TRUST") == "northern trust"
    assert normalize_company_name("") == "" and normalize_company_name(None) == ""


TABLE = {
    "apple": "Technology",
    "apple hospitality": "Real Estate",
    "unitedhealth group": "Health Care",
    "air products and chemicals": "Materials",
    "exxonmobil holdings": "Energy",
    "caretrust": "Real Estate",
    "illinois tool": "Industrials",
    "extra space storage": "Real Estate",
    "general motors": "Consumer Discretionary",
    "american water works": "Utilities",
    "american waterways": "Industrials",
}


@pytest.mark.parametrize("name, sector", [
    ("Apple, Inc.", "Technology"),                     # exact key
    ("APPLE HOSPITALITY REIT INC", "Real Estate"),     # not merged with Apple
    ("UNITEDHEALTH GRP", "Health Care"),               # loose: group words and short forms
    ("AIR PRODS & CHEM", "Materials"),
    ("Exxon Mobil Corp.", "Energy"),                   # loose without spaces
    ("CARETRUST REI", "Real Estate"),                  # cut-off ending
    ("Illinois Tool Works, Inc.", "Industrials"),      # a known name is a word prefix
    ("EXTRA SPACE STOR", "Real Estate"),               # the name is cut short
    ("AMERICAN WATER", None),                          # cut short, but two sectors fit
    ("GENERAL", None),                                 # too short to stand for a longer name
    ("General Mills, Inc.", None),
    ("Some Company Nobody Lists", None),
    ("", None),
])
def test_name_lookup(name, sector):
    assert NameSectors(TABLE).lookup(name) == sector


def test_loose_keys_that_disagree_are_dropped():
    names = NameSectors({"acme holdings": "Industrials", "acme group": "Financials"})
    assert names.lookup("ACME HOLDINGS INC") == "Industrials"  # exact keys still answer
    assert names.lookup("ACME") is None  # loose key "acme" is ambiguous


def test_reference_file_covers_big_names():
    with open(REFERENCE_DIR / "name_sectors.csv", newline="", encoding="utf-8") as f:
        table = {r["normalized_name"]: r["sector"] for r in csv.DictReader(f)}
    names = NameSectors(table)
    assert names.lookup("Apple, Inc.") == "Technology"
    assert names.lookup("JPMorgan Chase & Co") == "Financials"
    assert names.lookup("Eli Lilly & Co.") == "Health Care"
    assert names.lookup("Exxon Mobil Corp") == "Energy"
    assert names.lookup("ALPHABET INC-A") == "Communication Services"
    assert "eqt" not in table  # EQT Corp (Energy) and EQT AB (Financials) share a name


def test_ticker_sectors_prefer_us_listings_over_foreign_local_codes():
    # COR is Cencora in New York and Corticeira Amorim in Lisbon; ELV and BDX collide the same way.
    tickers = read_ticker_sectors()
    assert tickers["COR"] == tickers["ELV"] == tickers["BDX"] == "Health Care"
    assert tickers["ALL"] == "Financials"
    # Foreign tickers still fill gaps when their rows agree.
    assert tickers["NESN"] == "Consumer Staples"
