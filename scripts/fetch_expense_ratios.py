"""Write data/reference/expense_ratios.csv: each ETF's yearly fee, from TickerInside.

    python scripts/fetch_expense_ratios.py [--output data/reference/expense_ratios.csv] [TICKER ...]

TickerInside reports the net expense ratio from the fund's SEC filing, with the filing's date and
link, as a percent (0.03 means 0.03% a year). The file stores it as a fraction (0.0003), like every
other weight in the app. With no tickers, it covers the planner's allowlist plus widely held ETFs.
Funds TickerInside doesn't cover, or reports without a fee, are listed on stderr and left out.
"""

import argparse
import csv
import json
import sys
import time
from datetime import date
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.analytics.rebalance import SUGGESTABLE_ETFS  # noqa: E402
from backend.pipeline.tickerinside import API_ROOT  # noqa: E402

OUTPUT = ROOT / "data" / "reference" / "expense_ratios.csv"
COLUMNS = ["ticker", "expense_ratio", "as_of", "source", "source_url", "fetched"]
# Widely held ETFs beyond the allowlist, so a typical portfolio shows its fees too.
POPULAR = """SPLG SCHX SCHG SCHA SCHF SCHE SCHP SCHZ SCHR SCHH SCHM SCHV SCHK QQQM ONEQ VGK VPL VNQI VIG VYM VXF
MGK MGC MGV VV VBR VBK VOT VOE VONE VONG VTHR VT BNDX VTEB VGIT VGSH VGLT VCIT VCSH VMBS EDV IWF IWD IWB IWR IWS
IWP IWN IWO IWV IVW IVE IUSG IUSV IXUS EEM EWJ EWZ EWC INDA MCHI FXI EZU IJK IJJ IJS IJT USMV QUAL MTUM VLUE
DGRW NOBL SDY DVY HDV SPYD SPHD JEPI JEPQ DIA MDY SPYG SPYV SPTM SPDW SPEM SPAB SPTL XBI XOP XME XRT XHB KRE KBE
SMH SOXX IGV ARKK ARKG ARKW TLT IEF SHY BIL SHV LQD HYG JNK TIP MUB EMB GOVT IAU GLD SLV IBIT FBTC COWZ AVUV
AVDV DFAC DFAS RSPT""".split()


def fetch(ticker: str) -> dict | None:
    request = Request(f"{API_ROOT}/fund/{ticker.lower()}.json", headers={"User-Agent": "Glean/1.0"})
    try:
        with urlopen(request, timeout=30) as response:
            payload = json.load(response)
    except HTTPError as exc:
        if exc.code == 404:
            return None
        raise
    return payload if isinstance(payload, dict) else None


def row(ticker: str, payload: dict, today: str) -> dict | None:
    percent = payload.get("expense_ratio")
    if not isinstance(percent, (int, float)) or percent < 0 or percent > 5:
        return None
    return {
        "ticker": ticker,
        "expense_ratio": f"{percent / 100:.6f}".rstrip("0").rstrip("."),
        "as_of": payload.get("expense_ratio_as_of") or "",
        "source": payload.get("expense_ratio_source") or "",
        "source_url": payload.get("expense_ratio_filing_url") or payload.get("page_url") or "",
        "fetched": today,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("tickers", nargs="*", help="ETFs to fetch (default: allowlist and popular ETFs)")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args(argv)
    tickers = sorted({t.upper() for t in args.tickers} or SUGGESTABLE_ETFS | set(POPULAR))
    today = date.today().isoformat()
    rows, missing = [], []
    for ticker in tickers:
        try:
            payload = fetch(ticker)
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
            missing.append(f"{ticker} ({exc})")
            continue
        found = row(ticker, payload, today) if payload else None
        if found:
            rows.append(found)
        else:
            missing.append(ticker)
        time.sleep(0.2)  # be gentle with a free API
    with args.output.open("w", newline="", encoding="utf-8") as out:
        writer = csv.DictWriter(out, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    print(f"wrote {len(rows)} expense ratios to {args.output}")
    if missing:
        print("no fee for: " + ", ".join(missing), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
