"""Ingest one issuer holdings file: python scripts/run_pipeline.py --fund ARKK --file data/raw/ARKK_2026-10-16.csv"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.pipeline.run import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main())
