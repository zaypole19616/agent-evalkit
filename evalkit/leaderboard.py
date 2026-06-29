"""Leaderboard storage + rendering.

JSON schema (read by the dashboard's static fallback + backend):

  {
    "version": 1,
    "updated_at": "<ISO-8601>",
    "tasks": { "<task>": [<entry>, ...] },
    "global": [<global_entry>, ...]
  }

Concurrent writes are guarded by filelock.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from filelock import FileLock

SCHEMA_VERSION = 1


def load_or_empty(path: Path) -> dict:
    if path.exists():
        return json.loads(path.read_text())
    return {"version": SCHEMA_VERSION, "updated_at": "", "tasks": {}, "global": []}


def save(path: Path, lb: dict) -> None:
    lock = FileLock(str(path) + ".lock", timeout=30)
    with lock:
        lb["updated_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(lb, ensure_ascii=False, indent=2))


def upsert_run(
    lb: dict,
    *,
    task: str,
    model: str,
    score: float,
    token_median: int,
    run_id: str,
    report_path: str,
    tested_at: str,
    stable: bool = False,
    cost_median_usd: float | None = None,
    n_scored: int | None = None,
    n_full: int | None = None,
) -> None:
    entry: dict = {
        "model": model,
        "score": score,
        "token_median": token_median,
        "tested_at": tested_at,
        "run_id": run_id,
        "report_path": report_path,
        "stable": stable,
    }
    if cost_median_usd is not None:
        entry["cost_median_usd"] = cost_median_usd
    if n_scored is not None:
        entry["n_scored"] = n_scored
    if n_full is not None:
        entry["n_full"] = n_full
    rows = lb["tasks"].setdefault(task, [])
    rows[:] = [r for r in rows if not (r["run_id"] == run_id and r["model"] == model)]
    rows.append(entry)
    rows.sort(key=lambda r: r["score"] if r["score"] is not None else float("-inf"), reverse=True)


def upsert_global(
    lb: dict, *, model: str, weighted_score: float, run_id: str, tested_at: str
) -> None:
    entry = {"model": model, "weighted_score": weighted_score, "tested_at": tested_at, "run_id": run_id}
    rows = lb.setdefault("global", [])
    rows[:] = [r for r in rows if not (r["run_id"] == run_id and r["model"] == model)]
    rows.append(entry)
    rows.sort(
        key=lambda r: r["weighted_score"] if r["weighted_score"] is not None else float("-inf"),
        reverse=True,
    )


def stable_baseline(lb: dict, task: str) -> dict | None:
    for r in lb["tasks"].get(task, []):
        if r.get("stable"):
            return r
    return None


def render_markdown(lb: dict) -> str:
    parts = ["# Leaderboard", "", f"_Updated: {lb.get('updated_at') or '—'}_", ""]
    if lb.get("global"):
        parts += ["## Global (weighted across tasks)", "", "| Rank | Model | Weighted | Tested | Run |", "|---:|---|---:|---|---|"]
        for i, r in enumerate(lb["global"], 1):
            ws = r.get("weighted_score")
            ws_s = f"{ws:.2f}" if isinstance(ws, (int, float)) else "—"
            parts.append(f"| {i} | {r['model']} | {ws_s} | {r['tested_at'][:10]} | `{r['run_id']}` |")
        parts.append("")
    for task, rows in sorted(lb["tasks"].items()):
        parts += [f"## {task}", "", "| Rank | Model | Score | Tokens | Cost/conv | Tested |", "|---:|---|---:|---:|---:|---|"]
        for i, r in enumerate(rows, 1):
            sc = r.get("score")
            sc_s = f"{sc:.2f}" if isinstance(sc, (int, float)) else "—"
            cost = r.get("cost_median_usd")
            cost_s = f"${cost:.4f}" if cost else "—"
            tok = r.get("token_median")
            parts.append(f"| {i} | {r['model']} | {sc_s} | {tok if tok is not None else '—'} | {cost_s} | {r['tested_at'][:10]} |")
        parts.append("")
    return "\n".join(parts)
