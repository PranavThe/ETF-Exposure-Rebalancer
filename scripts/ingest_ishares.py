"""Fetch and ingest an iShares fund's latest published holdings CSV.

    python scripts/ingest_ishares.py --ticker IVV \
      --url https://www.ishares.com/us/products/239726/ishares-core-s-p-500-etfUSdollars

The URL may be an official iShares product page or its latest-holdings.csv download link.
The source file is cached under ignored data/vendor/ishares/ for provenance and reruns.
"""

import argparse
import os
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.pipeline.adapters.ishares import IsharesAdapter  # noqa: E402
from backend.pipeline.adapters.base import ValidationError  # noqa: E402
from backend.pipeline.run import run_pipeline  # noqa: E402

TARGET = ROOT / "data" / "vendor" / "ishares"


class HoldingsLink(HTMLParser):
    def __init__(self):
        super().__init__()
        self.href: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag != "a":
            return
        href = dict(attrs).get("href") or ""
        if "latest-holdings.csv" in href:
            self.href = href


def official_url(url: str) -> bool:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    return parsed.scheme == "https" and (host == "ishares.com" or host.endswith(".ishares.com"))


def fetch(url: str) -> tuple[str, bytes]:
    if not official_url(url):
        raise ValueError("--url must be an HTTPS iShares URL")
    request = Request(url, headers={"User-Agent": "Glean/0.1"})
    with urlopen(request, timeout=30) as response:
        body = response.read()
        final_url = response.geturl()
    if not official_url(final_url):
        raise ValueError("iShares URL redirected outside ishares.com")
    if "latest-holdings.csv" in urlparse(final_url).path:
        return final_url, body
    links = HoldingsLink()
    links.feed(body.decode("utf-8", errors="replace"))
    if not links.href:
        raise ValueError("product page does not contain a latest-holdings.csv link")
    csv_url = urljoin(final_url, links.href)
    if not official_url(csv_url):
        raise ValueError("holdings CSV link is outside ishares.com")
    request = Request(csv_url, headers={"User-Agent": "Glean/0.1"})
    with urlopen(request, timeout=30) as response:
        csv_body = response.read()
        resolved_url = response.geturl()
    if not official_url(resolved_url):
        raise ValueError("holdings CSV redirected outside ishares.com")
    return resolved_url, csv_body


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ticker", required=True, help="registered ETF ticker")
    parser.add_argument("--url", required=True, help="official iShares product page or holdings CSV")
    parser.add_argument("--replace-existing", action="store_true",
                        help="explicitly replace a different snapshot already stored for the same date")
    args = parser.parse_args(argv)
    ticker = args.ticker.strip().upper()
    if not re.fullmatch(r"[A-Z0-9.\-]{1,16}", ticker):
        parser.error("--ticker must be a valid ETF symbol")
    try:
        source_url, content = fetch(args.url)
        TARGET.mkdir(parents=True, exist_ok=True)
        temporary = TARGET / f"{ticker}_latest.csv"
        temporary.write_bytes(content)
        rows = IsharesAdapter().read(temporary, fund=ticker)
        if not rows:
            raise ValueError("iShares CSV has no holdings")
        path = TARGET / f"{ticker}_{rows[0].as_of_date}.csv"
        temporary.replace(path)
        os.chdir(ROOT)
        result = run_pipeline(ticker, path.relative_to(ROOT), adapter="ishares", source_url=source_url,
                              replace=args.replace_existing)
    except (OSError, ValueError, ValidationError) as exc:
        print(f"iShares ingest failed: {exc}", file=sys.stderr)
        return 1
    print(result.message, file=sys.stderr if result.exit_code else sys.stdout)
    for warning in result.warnings:
        print(f"warning: {warning}", file=sys.stderr)
    return result.exit_code


if __name__ == "__main__":
    sys.exit(main())
