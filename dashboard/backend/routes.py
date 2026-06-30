"""Aggregate router + app builder for the dashboard backend."""

from __future__ import annotations

from fastapi import Depends, FastAPI

from .auth import gate
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
    # auth_router stays open (it's how you sign in). Every DATA router is
    # gated: ``gate`` is a no-op when auth isn't configured (anonymous
    # read-only, the default) and requires a valid JWT once it is — so a
    # private deploy actually returns 401 on data endpoints without a token.
    data = [Depends(gate)]
    app.include_router(auth_router)
    app.include_router(leaderboard_router, dependencies=data)
    app.include_router(runs_router, dependencies=data)
    app.include_router(cases_router, dependencies=data)
    app.include_router(live_router, dependencies=data)
    app.include_router(benchmarks_router, dependencies=data)
    app.include_router(notes_router, dependencies=data)
    app.include_router(reports_router, dependencies=data)
    app.include_router(history_router, dependencies=data)
    return app
