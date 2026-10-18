PY := $(if $(wildcard .venv/bin/python),.venv/bin/python,python3)

.PHONY: setup test ingest-raw api web

setup:
	python3 -m venv .venv
	.venv/bin/pip install -r requirements-dev.txt
	if [ -f frontend/package.json ]; then cd frontend && npm install; fi

test:
	$(PY) -m pytest

# Issuer files saved by scripts/fetch_holdings.py: ARKK_2026-10-16.csv -> ARKK.
ingest-raw:
	@for f in data/raw/*.csv; do \
		[ -e "$$f" ] || continue; \
		fund=$$(basename $$f | cut -d_ -f1 | tr a-z A-Z); \
		$(PY) scripts/run_pipeline.py --fund $$fund --file $$f || exit 1; \
	done

api:
	$(PY) -m uvicorn backend.app.main:app --port 8000

web:
	cd frontend && npm run dev
