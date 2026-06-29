"""GET /api/dashboard/notes — map of run_id → note markdown.

Notes live at reports/<run_id>/note.md alongside summary.json. Missing files
are silently skipped. The dashboard surfaces these on the model history table
+ single-run page so reviewers can see what changed between runs.
"""

from __future__ import annotations

from fastapi import APIRouter

from . import paths

router = APIRouter(prefix="/api/dashboard")

_MAX_NOTE_LEN = 4096


@router.get("/notes")
def list_notes() -> dict[str, str]:
    root = paths.reports_dir()
    if not root.exists():
        return {}
    out: dict[str, str] = {}
    for run_dir in root.iterdir():
        if not run_dir.is_dir():
            continue
        p = run_dir / "note.md"
        if not p.exists():
            continue
        try:
            text = p.read_text()
        except (OSError, UnicodeDecodeError):
            continue
        text = text.strip()
        if not text:
            continue
        out[run_dir.name] = text[:_MAX_NOTE_LEN]
    return out


@router.get("/runs/{run_id}/note")
def get_note(run_id: str) -> dict:
    p = paths.report_dir(run_id) / "note.md"
    if not p.exists():
        return {"markdown": ""}
    try:
        text = p.read_text()
    except (OSError, UnicodeDecodeError):
        return {"markdown": ""}
    return {"markdown": text.strip()}
