"""Benchmark catalogue + per-task fixtures + file downloads."""

from __future__ import annotations

import json
import mimetypes

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from . import paths

router = APIRouter(prefix="/api/dashboard")


@router.get("/benchmarks")
def list_benchmarks() -> list[dict]:
    root = paths.benchmarks_dir()
    if not root.exists():
        return []
    out = []
    for task_dir in sorted(p for p in root.iterdir() if p.is_dir()):
        fixtures = paths.task_fixtures_path(task_dir.name)
        if not fixtures.exists():
            continue
        rubric = paths.task_rubric_path(task_dir.name)
        rubric_text = rubric.read_text() if rubric.exists() else ""
        out.append({
            "task": task_dir.name,
            "fixture_count": sum(1 for ln in fixtures.read_text().splitlines() if ln.strip()),
            "has_files": paths.task_files_dir(task_dir.name).exists(),
            "rubric_excerpt": rubric_text[:500],
        })
    return out


@router.get("/benchmarks/{task}")
def benchmark_detail(task: str) -> dict:
    fixtures_path = paths.task_fixtures_path(task)
    if not fixtures_path.exists():
        raise HTTPException(status_code=404, detail="task not found")

    files_dir = paths.task_files_dir(task)

    def _file_meta(name: str) -> dict:
        p = files_dir / name
        return {
            "name": name,
            "size": p.stat().st_size if p.exists() else 0,
            "mime": mimetypes.guess_type(name)[0] or "application/octet-stream",
        }

    fixtures = []
    for line in fixtures_path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        d = json.loads(line)
        fixtures.append({
            "id": d["id"],
            "prompt": d.get("prompt", ""),
            "expected_answer_intent": d.get("expected_answer_intent"),
            "files": [_file_meta(n) for n in d.get("files", [])],
            "tags": d.get("tags", []),
        })

    rubric_path = paths.task_rubric_path(task)
    return {
        "task": task,
        "rubric_markdown": rubric_path.read_text() if rubric_path.exists() else "",
        "fixtures": fixtures,
    }


@router.get("/benchmarks/{task}/files/{filename}")
def get_file(task: str, filename: str) -> FileResponse:
    # Reject path traversal — only filenames inside benchmarks/<task>/files/.
    if "/" in filename or "\\" in filename or filename.startswith("."):
        raise HTTPException(status_code=404, detail="bad filename")
    p = paths.task_files_dir(task) / filename
    try:
        resolved = p.resolve()
        files_root = paths.task_files_dir(task).resolve()
        resolved.relative_to(files_root)
    except (FileNotFoundError, ValueError):
        raise HTTPException(status_code=404, detail="file not found")
    if not resolved.exists() or not resolved.is_file():
        raise HTTPException(status_code=404, detail="file not found")
    return FileResponse(resolved)
