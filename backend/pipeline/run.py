"""Adapter -> validate -> normalize -> load, plus the command-line entry point."""

from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class PipelineResult:
    outcome: str
    exit_code: int
    message: str
    warnings: list[str] = field(default_factory=list)


def run_pipeline(fund: str, file: str | Path, adapter: str | None = None, replace: bool = False,
                 source_url: str | None = None) -> PipelineResult:
    raise NotImplementedError


def main(argv: list[str] | None = None) -> int:
    raise NotImplementedError
