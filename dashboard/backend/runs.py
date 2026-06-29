"""Runs catalogue + per-run summary + narrative endpoints."""

from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException

from . import paths
from .hydrate import ensure_run_local

router = APIRouter(prefix="/api/dashboard")


def _leaderboard_runs() -> dict[str, dict]:
    """Return the set of run_ids recorded in leaderboard.json keyed by run_id.

    Each value contains model + tested_at + weighted_score. Drops any run_id
    only present in tasks but not in the global ranking.
    """
    p = paths.leaderboard_path()
    if not p.exists():
        return {}
    lb = json.loads(p.read_text())
    return {
        row["run_id"]: {
            "run_id": row["run_id"],
            "model": row["model"],
            "tested_at": row["tested_at"],
            "weighted_score": row["weighted_score"],
        }
        for row in lb.get("global", [])
    }


@router.get("/runs")
def list_runs() -> list[dict]:
    runs = _leaderboard_runs()
    return sorted(runs.values(), key=lambda r: r["tested_at"], reverse=True)


@router.get("/runs/{run_id}/summary")
def get_summary(run_id: str) -> dict:
    ensure_run_local(run_id)
    p = paths.summary_path(run_id)
    if not p.exists():
        raise HTTPException(status_code=404, detail="summary not found")
    return json.loads(p.read_text())


@router.get("/runs/{run_id}/narrative")
def get_narrative(run_id: str) -> dict:
    ensure_run_local(run_id)
    p = paths.narrative_path(run_id)
    if not p.exists():
        raise HTTPException(status_code=404, detail="narrative not generated")
    return {"markdown": p.read_text()}
