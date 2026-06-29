"""Per-run per-task case list + single case detail.

Case status derivation:
- artifact JSON exists and matching diagnostic md exists ⇒ "bad"
- artifact JSON exists, no diagnostic md ⇒ "pass"
- no artifact JSON ⇒ not listed
"""

from __future__ import annotations

import json
import re

from fastapi import APIRouter, HTTPException

from . import paths
from .hydrate import ensure_run_local

router = APIRouter(prefix="/api/dashboard")

_JUDGE_SCORE_RE = re.compile(r"Judge score[^\d]*(\d+(?:\.\d+)?)")
_FAILURE_CLASS_RE = re.compile(r"\*\*Failure class:\*\*\s*`([^`]+)`")


def _parse_diagnostic(md: str) -> dict:
    score_m = _JUDGE_SCORE_RE.search(md)
    class_m = _FAILURE_CLASS_RE.search(md)
    return {
        "judge_score": float(score_m.group(1)) if score_m else None,
        "failure_class": class_m.group(1) if class_m else None,
    }


def _list_fixtures_for(task: str) -> dict[str, dict]:
    """Map fixture_id -> fixture dict from benchmarks/<task>/fixtures.jsonl."""
    p = paths.task_fixtures_path(task)
    if not p.exists():
        return {}
    out: dict[str, dict] = {}
    for line in p.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        d = json.loads(line)
        out[d["id"]] = d
    return out


@router.get("/runs/{run_id}/tasks/{task}/cases")
def list_cases(run_id: str, task: str) -> list[dict]:
    ensure_run_local(run_id)
    task_dir = paths.artifacts_run_dir(run_id) / task
    if not task_dir.exists():
        return []
    out = []
    for f in sorted(task_dir.glob("*.json")):
        fixture_id = f.stem
        art = json.loads(f.read_text())
        diag = paths.diagnostic_md(run_id, task, fixture_id)
        case: dict = {
            "fixture_id": fixture_id,
            "status": "bad" if diag.exists() else "pass",
            "elapsed_s": art.get("elapsed_s"),
            "tool_call_count": art.get("tool_call_count"),
            "response_chars": len(art.get("response_text") or ""),
        }
        if diag.exists():
            case.update(_parse_diagnostic(diag.read_text()))
        out.append(case)
    return out


@router.get("/runs/{run_id}/tasks/{task}/cases/{fixture_id}")
def case_detail(run_id: str, task: str, fixture_id: str) -> dict:
    ensure_run_local(run_id)
    art_path = paths.fixture_artifact(run_id, task, fixture_id)
    if not art_path.exists():
        raise HTTPException(status_code=404, detail="case artifact not found")
    art = json.loads(art_path.read_text())
    fixture = _list_fixtures_for(task).get(fixture_id, {})
    diag = paths.diagnostic_md(run_id, task, fixture_id)
    diag_md = diag.read_text() if diag.exists() else None
    parsed = _parse_diagnostic(diag_md) if diag_md else {}
    return {
        "fixture_id": fixture_id,
        "task": task,
        "run_id": run_id,
        "status": "bad" if diag.exists() else "pass",
        "prompt": fixture.get("prompt"),
        "expected_answer_intent": fixture.get("expected_answer_intent"),
        "attached_files": fixture.get("files", []),
        "response_text": art.get("response_text"),
        "tool_results": art.get("tool_results", []),
        "events": art.get("events", []),
        "generated_files": art.get("generated_files", []),
        "elapsed_s": art.get("elapsed_s"),
        "tool_call_count": art.get("tool_call_count"),
        "diagnostic_markdown": diag_md,
        **parsed,
    }
