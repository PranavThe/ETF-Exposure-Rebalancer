"""Company names to sectors, for holdings whose source gives no sector (e.g. SEC N-PORT rows).

Sources spell the same company differently: "Apple, Inc." (N-PORT), "APPLE INC" or "APPLE"
(issuer files), "Coca-Cola Co/The" (Bloomberg style), "ALPHABET INC-A" (Vanguard, cut to 16
characters). `normalize_company_name` reduces these to one key, and `NameSectors` looks a holding's
name up in a table of such keys built from issuer files that do carry sectors
(data/reference/name_sectors.csv, written by scripts/build_name_sectors.py).

Pure: no DB, network or file IO.
"""

import bisect
import re
from functools import lru_cache
from typing import Mapping

# Corporate forms, share-class words and listing words, dropped from the end of a name repeatedly.
# Words that tell companies apart ("holdings", "group", "trust", "bancorp") stay in the strict key.
SUFFIXES = frozenset({
    "inc", "incorporated", "corp", "corporation", "co", "cos", "company", "companies", "ltd",
    "limited", "plc", "sa", "nv", "ag", "se", "lp", "llc", "ab", "as", "asa", "oyj", "spa", "kgaa",
    "sab", "cv", "bhd", "tbk", "pcl", "reit", "ord", "adr", "ads", "shs", "sh", "reg", "npv", "pref",
    "units", "unit", "com", "common", "stock", "shares", "new", "class", "cl", "clas", "series",
    "ser", "the", "and",
})
# Endings dropped as a unit: "Shs Ben Int", "Non-Voting", "Public Limited".
SUFFIX_PHRASES = (("ben", "int"), ("ben", "in"), ("non", "voting"), ("non", "vtg"),
                  ("public", "limited"))

# Loose keys also ignore these words and expand short forms, so "UNITEDHEALTH GRP" meets
# "UnitedHealth Group Inc" and "AIR PRODS & CHEM" meets "AIR PRODUCTS AND CHEMICALS INC".
LOOSE_DROP = frozenset({"group", "grp", "holdings", "holding", "hldgs", "hldg", "the", "and", "of"})
ABBREVIATIONS = {
    "intl": "international", "svcs": "services", "svc": "service", "finl": "financial",
    "prods": "products", "chem": "chemical", "mtls": "materials", "exch": "exchange",
    "pete": "petroleum", "natl": "national", "labs": "laboratories", "sys": "systems",
    "mgmt": "management", "rlty": "realty", "bk": "bank", "ins": "insurance", "inds": "industries",
    "ind": "industries", "amer": "american", "props": "properties", "pptys": "properties",
    "ppty": "property", "prop": "property", "elec": "electric", "pharm": "pharmaceuticals",
    "tech": "technology", "techs": "technologies", "comm": "communications",
    "commun": "communities", "util": "utilities", "res": "resources", "invs": "investors",
    "tr": "trust", "tst": "trust",
}

# Prefix matches need at least this much text, so "general" never stands for "general motors".
MIN_PREFIX_TOKENS = 2
MIN_PREFIX_CHARS = 8

_APOSTROPHES = re.compile(r"['’`]")
_NON_ALNUM = re.compile(r"[^a-z0-9]+")
_TRUNCATED_ENDINGS = SUFFIXES | {"holdings", "group"}


def _join_initials(tokens: list[str]) -> list[str]:
    """"j m smucker" -> "jm smucker", "u s bancorp" -> "us bancorp" (not at the end of a name)."""
    out: list[str] = []
    i = 0
    while i < len(tokens):
        j = i
        while j < len(tokens) and len(tokens[j]) == 1 and tokens[j].isalpha():
            j += 1
        if j - i >= 2 and j < len(tokens):
            out.append("".join(tokens[i:j]))
            i = j
        else:
            out.extend(tokens[i:max(j, i + 1)])
            i = max(j, i + 1)
    return out


def normalize_company_name(name: str | None) -> str:
    """A key that different spellings of one company share.

    Lowercase; "&" becomes "and"; apostrophes go and other punctuation becomes a space; runs of
    initials join up; a leading "the" goes; corporate forms and share classes go from the end
    ("Alphabet, Inc., Class A" -> "alphabet", "Coca-Cola Co/The" -> "coca cola"). A lone trailing
    letter is a share class ("ALPHABET INC-A") unless it follows "and" ("AT&T" -> "at and t").
    """
    text = _APOSTROPHES.sub("", (name or "").lower().replace("&", " and "))
    tokens = _join_initials(_NON_ALNUM.sub(" ", text).split())
    if len(tokens) > 1 and tokens[0] == "the":
        tokens = tokens[1:]
    while len(tokens) > 1:
        phrase = next((p for p in SUFFIX_PHRASES
                       if len(tokens) > len(p) and tuple(tokens[-len(p):]) == p), None)
        if phrase:
            tokens = tokens[:-len(phrase)]
        elif tokens[-1] in SUFFIXES:
            tokens = tokens[:-1]
        elif len(tokens[-1]) == 1 and tokens[-1].isalpha() and tokens[-2] != "and":
            tokens = tokens[:-1]
        else:
            break
    return " ".join(tokens)


def _loose_token(token: str) -> str:
    token = ABBREVIATIONS.get(token, token)
    if len(token) > 4 and token.endswith("ies"):
        return token[:-3] + "y"
    if len(token) > 3 and token.endswith("s") and not token.endswith("ss"):
        return token[:-1]
    return token


def loose_key(key: str) -> str:
    """A normalized name without group/holdings words, short forms expanded, plurals made singular."""
    return " ".join(_loose_token(t) for t in key.split() if t not in LOOSE_DROP) or key


def _unanimous(groups: dict[str, set[str]]) -> dict[str, str]:
    return {k: next(iter(v)) for k, v in groups.items() if len(v) == 1}


class NameSectors:
    """Looks up a company's sector by name in a table of normalized names -> sector.

    Tries, in order, and stops at the first hit:
    1. the normalized name itself;
    2. its loose key, then the loose key without spaces ("exxon mobil" = "exxonmobil");
    3. the same after dropping a cut-off ending ("CARETRUST REI" -> "caretrust");
    4. the longest word prefix of the name that is a known name ("illinois tool works" ->
       "illinois tool");
    5. known names that start with the name, for names cut short ("EXTRA SPACE STOR").
    Steps 2-5 only answer when every candidate they find has the same sector.
    """

    def __init__(self, table: Mapping[str, str]):
        self.table = dict(table)
        loose: dict[str, set[str]] = {}
        compact: dict[str, set[str]] = {}
        for key, sector in self.table.items():
            lk = loose_key(key)
            loose.setdefault(lk, set()).add(sector)
            compact.setdefault(lk.replace(" ", ""), set()).add(sector)
        self.loose = _unanimous(loose)
        self.compact = _unanimous(compact)
        self._strict_sorted = sorted(self.table)
        self._loose_sorted = sorted(self.loose)
        self.lookup = lru_cache(maxsize=65536)(self._lookup)

    def __len__(self) -> int:
        return len(self.table)

    def _whole(self, key: str) -> str | None:
        if key in self.table:
            return self.table[key]
        lk = loose_key(key)
        return self.loose.get(lk) or self.compact.get(lk.replace(" ", ""))

    def _starting_with(self, keys: list[str], values: Mapping[str, str], query: str) -> str | None:
        if len(query.split()) < MIN_PREFIX_TOKENS or len(query) < MIN_PREFIX_CHARS:
            return None
        found = set()
        for i in range(bisect.bisect_left(keys, query), len(keys)):
            if not keys[i].startswith(query):
                break
            found.add(values[keys[i]])
            if len(found) > 1:
                return None
        return found.pop() if found else None

    def _lookup(self, name: str) -> str | None:
        key = normalize_company_name(name)
        if not key:
            return None
        hit = self._whole(key)
        if hit:
            return hit
        tokens = key.split()
        last = tokens[-1]
        if (len(tokens) > 1 and len(last) >= 2
                and any(w.startswith(last) and w != last for w in _TRUNCATED_ENDINGS)):
            hit = self._whole(normalize_company_name(" ".join(tokens[:-1])))
            if hit:
                return hit
        lk = loose_key(key)
        words = lk.split()
        for n in range(len(words) - 1, MIN_PREFIX_TOKENS - 1, -1):
            hit = self.loose.get(" ".join(words[:n]))
            if hit:
                return hit
        return (self._starting_with(self._strict_sorted, self.table, key)
                or self._starting_with(self._loose_sorted, self.loose, lk))
