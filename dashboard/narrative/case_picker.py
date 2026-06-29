"""Select the N worst bad cases per task for narrative generation."""

from __future__ import annotations

import json
import re

from dashboard.backend import paths

_JUDGE_RE = re.compile(r"Judge score[^\d]*(\d+(?:\.\d+)?)")
_CLASS_RE = re.compile(r"\*\*Failure class:\*\*\s*`([^`]+)`")


def pick_worst(run_id: str, task: str, *, top: int = 3) -> list[dict]:
    """Return up to `top` worst bad cases (lowest judge score first), each
    decorated with response_text from the artifact JSON.

    Returns ``[]`` if no bad cases exist for the task.
    """
    diag_dir = paths.report_dir(run_id) / "diagnostics"
    if not diag_dir.exists():
        return []

    candidates: list[dict] = []
    for md_path in diag_dir.glob(f"{task}-*.md"):
        text = md_path.read_text()
        score_m = _JUDGE_RE.search(text)
        if not score_m:
            continue
        fixture_id = md_path.stem
        art_path = paths.fixture_artifact(run_id, task, fixture_id)
        response_text = None
        if art_path.exists():
            try:
                response_text = json.loads(art_path.read_text()).get("response_text")
            except json.JSONDecodeError:
                pass
        candidates.append({
            "fixture_id": fixture_id,
            "judge_score": float(score_m.group(1)),
            "failure_class": (_CLASS_RE.search(text) or [None, None])[1]
                if _CLASS_RE.search(text) else None,
            "response_text": response_text,
            "diagnostic_excerpt": text[:1500],
        })

    candidates.sort(key=lambda c: (c["judge_score"], c["fixture_id"]))
    return candidates[:top]
