"""Download official SEC series/class CSV and a public N-PORT quarter for offline ingestion.

Set SEC_USER_AGENT to a project name and real contact email as required by SEC fair access.
Large downloaded files are saved under ignored data/vendor/sec/.
"""

import argparse
import os
import re
import shutil
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from zipfile import is_zipfile

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "data" / "vendor" / "sec"


def download(url: str, path: Path, user_agent: str) -> None:
    request = Request(url, headers={"User-Agent": user_agent})
    temporary = path.with_suffix(path.suffix + ".part")
    try:
        with urlopen(request, timeout=60) as source, open(temporary, "wb") as destination:
            shutil.copyfileobj(source, destination)
        temporary.replace(path)
    except (HTTPError, URLError, OSError):
        temporary.unlink(missing_ok=True)
        raise


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--quarter", required=True, help="YYYYq1 through YYYYq4")
    parser.add_argument("--series-year", type=int, default=2026,
                        help="year of the SEC series/class report (default 2026)")
    args = parser.parse_args(argv)
    if not re.fullmatch(r"20\d\dq[1-4]", args.quarter.lower()):
        parser.error("--quarter must look like 2026q3")
    user_agent = os.environ.get("SEC_USER_AGENT", "").strip()
    if not user_agent or "@" not in user_agent:
        parser.error("SEC_USER_AGENT must identify the project and a contact email")
    TARGET.mkdir(parents=True, exist_ok=True)
    quarter = args.quarter.lower()
    files = [
        (f"https://www.sec.gov/files/investment/data/other/"
         f"investment-company-series-class-information/"
         f"investment-company-series-class-{args.series_year}.csv",
         TARGET / f"investment-company-series-class-{args.series_year}.csv"),
        (f"https://www.sec.gov/files/dera/data/form-n-port-data-sets/{quarter}_nport.zip",
         TARGET / f"{quarter}_nport.zip"),
    ]
    for url, path in files:
        if path.exists():
            print(f"already downloaded: {path}")
            continue
        try:
            download(url, path, user_agent)
        except (HTTPError, URLError, OSError) as exc:
            print(f"download failed: {url}: {exc}", file=sys.stderr)
            return 1
        if path.suffix == ".zip" and not is_zipfile(path):
            path.unlink()
            print(f"download was not a ZIP: {url}", file=sys.stderr)
            return 1
        print(f"downloaded: {path} ({path.stat().st_size:,} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
