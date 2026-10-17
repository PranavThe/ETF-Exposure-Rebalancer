"""Download the issuer's current holdings file into data/raw/<FUND>_<as_of_date>.csv.

    python scripts/fetch_holdings.py --fund ARKK

The date in the file name comes from the file itself, not from today's date. Issuer files only
show the latest trading day, so run this on different trading days to build up history.
"""

import argparse
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.pipeline.adapters import ADAPTERS, default_adapter_for  # noqa: E402
from backend.pipeline.adapters.base import ValidationError  # noqa: E402

RAW_DIR = Path(__file__).resolve().parents[1] / "data" / "raw"
# The issuer's site rejects the default Python user agent.
USER_AGENT = "Mozilla/5.0 (compatible; FundShift holdings fetcher)"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--fund", required=True)
    parser.add_argument("--out-dir", type=Path, default=RAW_DIR)
    args = parser.parse_args(argv)

    fund = args.fund.upper()
    adapter = ADAPTERS[default_adapter_for(fund)]()
    if not adapter.source_url:
        print(f"no download URL for {fund}", file=sys.stderr)
        return 1

    request = urllib.request.Request(adapter.source_url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            content = response.read()
    except urllib.error.URLError as e:
        print(f"download failed: {adapter.source_url}: {e}", file=sys.stderr)
        return 1

    args.out_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=args.out_dir, suffix=".csv.part", delete=False) as tmp:
        tmp.write(content)
    tmp_path = Path(tmp.name)
    try:
        rows = adapter.read(tmp_path)
        dates = {r.as_of_date for r in rows}
        if len(dates) != 1 or None in dates:
            raise ValidationError(adapter.source_url, None, "date", f"expected one as_of_date, found {dates}")
    except ValidationError as e:
        tmp_path.unlink()
        print(f"downloaded file is not a valid {adapter.name} holdings file: {e}", file=sys.stderr)
        return 1

    target = args.out_dir / f"{fund}_{dates.pop().isoformat()}.csv"
    if target.exists():
        same = target.read_bytes() == content
        tmp_path.unlink()
        if same:
            print(f"already saved: {target}")
            return 0
        print(f"{target} exists with different content; not overwriting. Move it aside to re-fetch.",
              file=sys.stderr)
        return 2

    tmp_path.rename(target)
    print(f"saved {target} ({len(rows)} rows)")
    print(f"ingest with: python scripts/run_pipeline.py --fund {fund} --file {target}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
