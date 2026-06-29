"""GET /api/dashboard/live — chain-aware live progress.

Two layers of state live in the same pod:

1. ``logs/run-many-<ts>/``
       plan.json     model × task matrix written when the chain starts
       status.jsonl  one append-only line per completed cell
       <slug>__<task>.log  one file per started cell (done + currently running)

2. ``artifacts/benchmarks/<run_id>/<task>/<fixture_id>.json``
       per-fixture artifacts written by the cell that's currently running.
       We use this for the in-flight cell's done/total ratio (e.g. 17/27).

If there's an active chain we return its full matrix; each cell carries a
status (``done`` / ``running`` / ``pending`` / ``failed``) plus enough
detail to render a useful row in the UI.

If no chain is active (legacy single-run mode) we fall back to the
previous behavior: find the most-recently-touched run_id under
``artifacts/benchmarks/`` and surface its per-task progress.
"""

from __future__ import annotations

import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter

from . import paths

router = APIRouter(prefix="/api/dashboard")

# How long since the last artifact write a run can go and still count as
# "live" in the standalone (no run-many) fallback. The old 600s assumed a
# fixture finishes at least every 10 min; slow models break that — a single
# Claude Fable 5 / Opus 4.8 generation turn can run 15-20 min (the per-fixture
# timeout is 1200s), so between completions the newest artifact is older than
# 600s and the run wrongly looked idle (showed 0/N). Keep it above the max
# per-fixture timeout + buffer.
ACTIVE_WINDOW_S = 1800
CHAIN_ACTIVE_WINDOW_S = 24 * 3600  # chains can run overnight; widen the window


def _leaderboard_run_ids() -> set[str]:
    p = paths.leaderboard_path()
    if not p.exists():
        return set()
    lb = json.loads(p.read_text())
    return {row["run_id"] for row in lb.get("global", [])}


def _model_from_run_id(run_id: str) -> str:
    parts = run_id.split("-", 1)
    return parts[1] if len(parts) > 1 else "unknown"


def _fixture_count(task: str) -> int:
    p = paths.task_fixtures_path(task)
    if not p.exists():
        return 0
    return sum(1 for line in p.read_text().splitlines() if line.strip())


def _slug(s: str) -> str:
    # Mirror runners.benchmark.run_many._slug — keep them in sync.
    return re.sub(r"[^A-Za-z0-9.-]+", "-", s).strip("-") or "unnamed"


def _scan_artifacts_run(run_id: str) -> dict:
    """Per-task progress for a single in-flight run from ``artifacts/``."""
    run_dir = paths.artifacts_run_dir(run_id)
    tasks: list[dict] = []
    start_t = float("inf")
    if run_dir.exists():
        for task_dir in sorted(run_dir.iterdir()):
            if not task_dir.is_dir():
                continue
            artifacts = sorted(task_dir.glob("*.json"), key=lambda p: p.stat().st_mtime)
            if not artifacts:
                continue
            latest = artifacts[-1]
            start_t = min(start_t, min(a.stat().st_mtime for a in artifacts))
            tasks.append({
                "task": task_dir.name,
                "total": _fixture_count(task_dir.name),
                "done": len(artifacts),
                "latest_fixture_id": latest.stem,
                "latest_mtime": datetime.fromtimestamp(latest.stat().st_mtime, tz=timezone.utc).isoformat(),
            })
    return {
        "active_run_id": run_id,
        "model": _model_from_run_id(run_id),
        "started_at": datetime.fromtimestamp(start_t, tz=timezone.utc).isoformat() if start_t != float("inf") else None,
        "tasks": tasks,
    }


def _dir_mtime(d: Path) -> float:
    try:
        return max((p.stat().st_mtime for p in d.rglob("*") if p.is_file()), default=d.stat().st_mtime)
    except FileNotFoundError:
        return 0.0


def _find_latest_chain() -> Path | None:
    """Return the most recently touched run-many-<ts>/ directory within the
    window. Prefer chains without ``summary.json`` (still in flight); fall
    back to a recently-finished chain so the UI doesn't blank out the
    moment a chain wraps up.
    """
    root = paths.logs_dir()
    if not root.exists():
        return None
    cutoff = time.time() - CHAIN_ACTIVE_WINDOW_S
    inflight: list[tuple[float, Path]] = []
    finished: list[tuple[float, Path]] = []
    for d in root.iterdir():
        if not d.is_dir() or not d.name.startswith("run-many-"):
            continue
        mt = _dir_mtime(d)
        if mt < cutoff:
            continue
        (finished if (d / "summary.json").exists() else inflight).append((mt, d))
    pool = inflight or finished
    if not pool:
        return None
    pool.sort(reverse=True)
    return pool[0][1]


def _read_status_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    rows: list[dict] = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return rows


def _infer_running_cell(chain_dir: Path, completed_keys: set[tuple[str, str]]) -> tuple[str, str, float] | None:
    """The most recently touched ``<slug>__<task>.log`` whose (model, task)
    isn't in status.jsonl is, with very high confidence, the cell currently
    running. We invert the slug back to the model name via plan.json's
    model list.
    """
    plan_path = chain_dir / "plan.json"
    plan_models: list[str] = []
    if plan_path.exists():
        try:
            plan_models = json.loads(plan_path.read_text()).get("models", []) or []
        except json.JSONDecodeError:
            plan_models = []
    slug_to_model = {_slug(m): m for m in plan_models}

    candidates: list[tuple[float, str, str]] = []
    for log_path in chain_dir.glob("*__*.log"):
        stem = log_path.stem
        if "__" not in stem:
            continue
        slug, task = stem.split("__", 1)
        model = slug_to_model.get(slug, slug)
        if (model, task) in completed_keys:
            continue
        candidates.append((log_path.stat().st_mtime, model, task))
    if not candidates:
        return None
    candidates.sort(reverse=True)
    mt, model, task = candidates[0]
    return model, task, mt


def _running_run_id_for_model(model: str) -> str | None:
    """Find the artifacts/<run_id> dir whose run_id ends with -<model> and
    was touched recently — that's where the currently-running cell is
    writing fixtures. Used for the in-flight progress bar.
    """
    root = paths.artifacts_root()
    if not root.exists():
        return None
    # In the chain path the running cell is already pinned by status.jsonl +
    # plan.json (see _infer_running_cell) and the chain itself is gated as
    # in-flight by _find_latest_chain. So this per-run artifact-freshness check
    # is only a tie-breaker among the model's not-yet-finished run dirs — it
    # must NOT mistake a slow-but-live cell (Fable 5: 15-20 min/fixture) for a
    # dead one. Use the chain window; the leaderboard-exclusion + newest-mtime
    # sort below still pick the live run over any killed/stale leftover.
    cutoff = time.time() - CHAIN_ACTIVE_WINDOW_S
    finished = _leaderboard_run_ids()
    candidates: list[tuple[float, str]] = []
    for d in root.iterdir():
        if not d.is_dir() or d.name in finished:
            continue
        if not d.name.endswith(f"-{model}"):
            continue
        try:
            mt = max((f.stat().st_mtime for f in d.rglob("*.json")), default=0.0)
        except FileNotFoundError:
            continue
        if mt >= cutoff:
            candidates.append((mt, d.name))
    if not candidates:
        return None
    candidates.sort(reverse=True)
    return candidates[0][1]


def _running_cell_progress(model: str, task: str) -> dict:
    run_id = _running_run_id_for_model(model)
    total = _fixture_count(task)
    if not run_id:
        return {"run_id": None, "done": 0, "total": total, "latest_fixture_id": None}
    task_dir = paths.artifacts_run_dir(run_id) / task
    if not task_dir.exists():
        return {"run_id": run_id, "done": 0, "total": total, "latest_fixture_id": None}
    artifacts = sorted(task_dir.glob("*.json"), key=lambda p: p.stat().st_mtime)
    latest = artifacts[-1] if artifacts else None
    return {
        "run_id": run_id,
        "done": len(artifacts),
        "total": total,
        "latest_fixture_id": latest.stem if latest else None,
    }


def _build_chain_payload(chain_dir: Path) -> dict:
    plan_path = chain_dir / "plan.json"
    status_path = chain_dir / "status.jsonl"
    summary_path = chain_dir / "summary.json"

    plan: dict | None = None
    if plan_path.exists():
        try:
            plan = json.loads(plan_path.read_text())
        except json.JSONDecodeError:
            plan = None

    completed = _read_status_jsonl(status_path)
    completed_keys = {(r.get("model", ""), r.get("task", "")) for r in completed}
    completed_lookup = {(r.get("model", ""), r.get("task", "")): r for r in completed}

    finished = summary_path.exists()
    running = None if finished else _infer_running_cell(chain_dir, completed_keys)

    if plan:
        models = list(plan.get("models", []))
        tasks = list(plan.get("tasks", []))
        chain_started_at = plan.get("chain_started_at")
        timeout_per_cell_s = plan.get("timeout_per_cell_s")
    else:
        # Degraded mode (chain started before plan.json existed): synthesize
        # the matrix from what we can see — done + running. Pending cells
        # are unknown.
        models = sorted({k[0] for k in completed_keys})
        tasks_set = {k[1] for k in completed_keys}
        if running:
            if running[0] not in models:
                models.append(running[0])
            tasks_set.add(running[1])
        tasks = sorted(tasks_set)
        chain_started_at = None
        timeout_per_cell_s = None

    cells: list[dict] = []
    for model in models:
        for task in tasks:
            key = (model, task)
            if key in completed_lookup:
                r = completed_lookup[key]
                failed = r.get("exit_code") not in (0, None) or r.get("timed_out")
                cells.append({
                    "model": model,
                    "task": task,
                    "status": "failed" if failed else "done",
                    "score": r.get("score"),
                    "badcases": r.get("badcases"),
                    "elapsed_s": r.get("elapsed_s"),
                    "started_at": r.get("started_at"),
                    "timed_out": bool(r.get("timed_out")),
                    "exit_code": r.get("exit_code"),
                })
                continue
            if running and key == (running[0], running[1]):
                progress = _running_cell_progress(model, task)
                cells.append({
                    "model": model,
                    "task": task,
                    "status": "running",
                    "score": None,
                    "started_at": datetime.fromtimestamp(running[2], tz=timezone.utc).isoformat(),
                    "progress": progress,
                })
                continue
            cells.append({"model": model, "task": task, "status": "pending", "score": None})

    return {
        "mode": "chain",
        "chain_id": chain_dir.name,
        "chain_started_at": chain_started_at,
        "models": models,
        "tasks": tasks,
        "order": (plan or {}).get("order", "model-major"),
        "total_cells": len(models) * len(tasks),
        "done_cells": sum(1 for c in cells if c["status"] == "done"),
        "failed_cells": sum(1 for c in cells if c["status"] == "failed"),
        "running_cells": sum(1 for c in cells if c["status"] == "running"),
        "pending_cells": sum(1 for c in cells if c["status"] == "pending"),
        "finished": finished,
        "timeout_per_cell_s": timeout_per_cell_s,
        "has_plan": plan is not None,
        "cells": cells,
    }


def _single_run_fallback() -> dict:
    """Legacy mode for runs not launched via run-many (single-cell ad-hoc)."""
    root = paths.artifacts_root()
    if not root.exists():
        return {"mode": "idle", "active_run_id": None, "model": None, "started_at": None, "tasks": []}
    cutoff = time.time() - ACTIVE_WINDOW_S
    finished = _leaderboard_run_ids()
    candidates: list[tuple[float, str]] = []
    for run_dir in root.iterdir():
        if not run_dir.is_dir() or run_dir.name in finished:
            continue
        try:
            mtime = max((f.stat().st_mtime for f in run_dir.rglob("*.json")), default=0.0)
        except FileNotFoundError:
            continue
        if mtime >= cutoff:
            candidates.append((mtime, run_dir.name))
    if not candidates:
        return {"mode": "idle", "active_run_id": None, "model": None, "started_at": None, "tasks": []}
    candidates.sort(reverse=True)
    payload = _scan_artifacts_run(candidates[0][1])
    payload["mode"] = "single"
    return payload


@router.get("/live")
def get_live() -> dict:
    chain_dir = _find_latest_chain()
    if chain_dir is not None:
        return _build_chain_payload(chain_dir)
    return _single_run_fallback()
