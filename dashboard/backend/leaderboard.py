"""GET /api/dashboard/leaderboard — returns benchmarks/leaderboard.json verbatim."""

from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException

from . import paths

router = APIRouter(prefix="/api/dashboard")


@router.get("/leaderboard")
def get_leaderboard() -> dict:
    p = paths.leaderboard_path()
    if not p.exists():
        raise HTTPException(status_code=404, detail="leaderboard not found")
    return json.loads(p.read_text())
