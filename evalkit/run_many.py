"""Multi-model chain runner — evaluates a model × task matrix and writes the
``logs/run-many-<ts>/`` files the dashboard's Live view reads:

    plan.json     the full model × task matrix, written upfront
    status.jsonl  one append-only line per completed (model, task) cell
    <slug>__<task>.log  one file per started cell (running-cell detection)
    summary.json  written when the chain finishes

Each model is evaluated with a single ``run_eval`` (all its tasks), then a
status line is appended per task cell. Cells flip pending → running → done
as the chain progresses.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

from .loader import discover_tasks, load_manifest
from .runner import run_eval


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _log_slug(s: str) -> str:
    # MUST match dashboard/backend/live.py:_slug so the Live view can invert
    # a ``<slug>__<task>.log`` filename back to the model name.
    return re.sub(r"[^A-Za-z0-9.-]+", "-", s).strip("-") or "unnamed"


async def run_many(
    *,
    root: Path,
    models: list[str],
    adapter_spec: str = "openai_chat",
    tasks_filter: list[str] | None = None,
    judge_enabled: bool = True,
) -> dict:
    benchmarks_dir = root / "benchmarks"
    manifest_paths = discover_tasks(benchmarks_dir, tasks_filter)
    tasks = [load_manifest(mp).name for mp in manifest_paths]
    if not tasks:
        raise SystemExit(f"no tasks found under {benchmarks_dir}")

    chain_ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    chain_dir = root / "logs" / f"run-many-{chain_ts}"
    chain_dir.mkdir(parents=True, exist_ok=True)
    status_path = chain_dir / "status.jsonl"

    plan = {
        "models": models,
        "tasks": tasks,
        "chain_started_at": _now_iso(),
        "order": "model-major",
        "timeout_per_cell_s": None,
    }
    (chain_dir / "plan.json").write_text(json.dumps(plan, ensure_ascii=False, indent=2))
    print(f"chain {chain_dir.name}: {len(models)} models × {len(tasks)} tasks")

    for model in models:
        # Mark this model's cells as started so the Live view can show one as
        # "running" while the model is being evaluated.
        for task in tasks:
            (chain_dir / f"{_log_slug(model)}__{task}.log").write_text(f"start {model} {task}\n")
        cell_started = _now_iso()
        result = await run_eval(
            root=root, model=model, adapter_spec=adapter_spec,
            tasks_filter=tasks_filter, judge_enabled=judge_enabled,
        )
        by_task = {t["task"]: t for t in result["tasks"]}
        with status_path.open("a") as f:
            for task in tasks:
                ts = by_task.get(task, {})
                f.write(json.dumps({
                    "model": model,
                    "task": task,
                    "score": ts.get("score"),
                    "badcases": ts.get("badcase_count"),
                    "elapsed_s": None,
                    "started_at": cell_started,
                    "exit_code": 0,
                    "timed_out": False,
                }, ensure_ascii=False) + "\n")
        print(f"  ✓ {model}: weighted {result['global']['weighted_score']}")

    (chain_dir / "summary.json").write_text(
        json.dumps({"finished": True, "models": models, "tasks": tasks}, ensure_ascii=False))
    print(f"chain done → logs/{chain_dir.name}")
    return {"chain_id": chain_dir.name, "models": models, "tasks": tasks}
