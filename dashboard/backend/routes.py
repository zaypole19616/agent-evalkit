"""Aggregate router + app builder for the dashboard backend."""

from __future__ import annotations

from fastapi import FastAPI

from .auth_routes import router as auth_router
from .benchmarks import router as benchmarks_router
from .cases import router as cases_router
from .history import router as history_router
from .leaderboard import router as leaderboard_router
from .live import router as live_router
from .notes import router as notes_router
from .reports import router as reports_router
from .runs import router as runs_router

__all__ = [
    "build_app",
    "auth_router",
    "leaderboard_router",
    "runs_router",
    "cases_router",
    "live_router",
    "benchmarks_router",
    "notes_router",
    "reports_router",
    "history_router",
]


def build_app() -> FastAPI:
    app = FastAPI(title="agent-evalkit-dashboard")
    app.include_router(auth_router)
    app.include_router(leaderboard_router)
    app.include_router(runs_router)
    app.include_router(cases_router)
    app.include_router(live_router)
    app.include_router(benchmarks_router)
    app.include_router(notes_router)
    app.include_router(reports_router)
    app.include_router(history_router)
    return app
