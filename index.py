"""Vercel entrypoint: Vercel serves the FastAPI `app` found in a root-level index.py."""

from backend.app.main import app  # noqa: F401
