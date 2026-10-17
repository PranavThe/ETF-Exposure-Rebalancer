# FundShift

FundShift shows how an actively managed ETF's portfolio changed between two dates. It separates
changes caused by price movement from changes caused by portfolio activity (the manager changing
share counts).

Status: under construction. See `SPEC.md` for the build plan.

## Quick start

```
make setup
make test
make demo     # reset DB, ingest data/sample, start the API on :8000
make web      # in a second terminal, start the frontend on :3000
```
