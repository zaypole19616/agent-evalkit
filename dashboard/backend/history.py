"""GET /api/dashboard/history — past benchmark campaigns ("chains").

The /live page renders the ACTIVE chain from the ephemeral ``logs/run-many-*/``
dir, which is wiped on every pod restart. For a DURABLE history we reconstruct
past campaigns from ``leaderboard.json`` (GCS-hydrated on startup):
``tasks[<task>] = [{model, score, run_id, tested_at, ...}]``.

We flatten those into per-(model, task) cells and cluster them by ``tested_at``:
a gap larger than ``CHAIN_GAP_S`` between consecutive cells starts a new
campaign. Per-cell runs carry no chain_id, so this clustering is heuristic — but
it matches how ``run-many`` fires cells back-to-back (the longest single cell in
the 6-model chain was ~3h, well under the 6h gap, while separate campaigns are
days apart). The newest group is "上一次跑的".

Note: the leaderboard keeps the latest run per (model, task), so this is a
history of the most-recent campaigns, not a full append-only log.
"""

from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter

from . import paths

router = APIRouter(prefix="/api/dashboard")

CHAIN_GAP_S = 6 * 3600  # > 6h between consecutive cells → a new campaign


def _epoch(ts: str) -> float:
    """Parse a leaderboard ``tested_at`` (e.g. ``2026-05-30T09:00:52Z``)."""
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()
    except (ValueError, AttributeError):
        return 0.0


def _flatten_cells(lb: dict) -> list[dict]:
    cells: list[dict] = []
    for task, rows in (lb.get("tasks") or {}).items():
        for r in rows or []:
            rid = r.get("run_id")
            ta = r.get("tested_at")
            if not rid or not ta:
                continue
            cells.append(
                {
                    "task": task,
                    "model": r.get("model", "unknown"),
                    "score": r.get("score"),
                    "run_id": rid,
                    "tested_at": ta,
                }
            )
    return cells


def _summarize_chain(cells: list[dict]) -> dict:
    times = sorted(c["tested_at"] for c in cells)
    scored = [c["score"] for c in cells if isinstance(c["score"], (int, float))]
    return {
        "started_at": times[0],
        "ended_at": times[-1],
        "models": sorted({c["model"] for c in cells}),
        "tasks": sorted({c["task"] for c in cells}),
        "cell_count": len(cells),
        "avg_score": round(sum(scored) / len(scored), 3) if scored else None,
        "cells": [
            {"model": c["model"], "task": c["task"], "score": c["score"], "run_id": c["run_id"]}
            for c in cells
        ],
    }


def group_into_chains(cells: list[dict], gap_s: int = CHAIN_GAP_S) -> list[dict]:
    """Cluster cells into campaigns by ``tested_at`` gap; newest chain first."""
    if not cells:
        return []
    ordered = sorted(cells, key=lambda c: c["tested_at"])
    groups: list[list[dict]] = [[ordered[0]]]
    for prev, cur in zip(ordered, ordered[1:]):
        if _epoch(cur["tested_at"]) - _epoch(prev["tested_at"]) > gap_s:
            groups.append([cur])
        else:
            groups[-1].append(cur)
    chains = [_summarize_chain(g) for g in groups]
    chains.sort(key=lambda c: c["ended_at"], reverse=True)
    return chains


@router.get("/history")
def get_history() -> list[dict]:
    p = paths.leaderboard_path()
    if not p.exists():
        return []
    try:
        lb = json.loads(p.read_text())
    except (json.JSONDecodeError, OSError):
        return []
    return group_into_chains(_flatten_cells(lb))
