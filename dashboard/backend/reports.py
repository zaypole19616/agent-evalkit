"""Curated eval-report batches (``eval-reports/<batch_id>/``).

These are hand-authored markdown campaigns (overview + per-model + bug backlog)
committed to the repo. Unlike per-run ``reports/``, they're baked into the image,
so no GCS hydration is involved. Each batch dir carries an ``index.json`` manifest
listing its reports + the (model, task) → run_id map used for evidence deep-links.
"""

from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException

from . import paths

router = APIRouter(prefix="/api/dashboard")


def _load_manifest(batch_id: str) -> dict | None:
    """Return a batch's index.json, or None if the batch / manifest is absent
    or unparseable."""
    idx = paths.eval_reports_dir() / batch_id / "index.json"
    if not idx.is_file():
        return None
    try:
        return json.loads(idx.read_text())
    except (json.JSONDecodeError, OSError):
        return None


@router.get("/reports")
def list_reports() -> list[dict]:
    """All batches with a valid index.json, newest first (by date then id)."""
    base = paths.eval_reports_dir()
    if not base.is_dir():
        return []
    out: list[dict] = []
    for child in base.iterdir():
        if not child.is_dir():
            continue
        m = _load_manifest(child.name)
        if not m:
            continue
        out.append(
            {
                "batch_id": m.get("batch_id", child.name),
                "title": m.get("title", child.name),
                "date": m.get("date", ""),
                "engine_version": m.get("engine_version", ""),
                "models": m.get("models", []),
                "report_count": len(m.get("reports", [])),
            }
        )
    out.sort(key=lambda r: (r.get("date", ""), r["batch_id"]), reverse=True)
    return out


@router.get("/reports/{batch_id}")
def get_report_manifest(batch_id: str) -> dict:
    m = _load_manifest(batch_id)
    if m is None:
        raise HTTPException(status_code=404, detail="batch not found")
    return m


@router.get("/reports/{batch_id}/{file}")
def get_report_markdown(batch_id: str, file: str) -> dict:
    m = _load_manifest(batch_id)
    if m is None:
        raise HTTPException(status_code=404, detail="batch not found")
    # Serve ONLY files registered in the manifest — never an arbitrary name.
    # This is the path-traversal guard: ``file`` is matched against the
    # allow-list, so "../../etc/passwd" or any unlisted path is rejected.
    allowed = {r.get("file") for r in m.get("reports", [])}
    if file not in allowed:
        raise HTTPException(status_code=404, detail="report not found")
    p = paths.eval_reports_dir() / batch_id / file
    if not p.is_file():
        raise HTTPException(status_code=404, detail="report file missing on disk")
    return {"markdown": p.read_text()}
