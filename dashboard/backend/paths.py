"""Single source of truth for filesystem paths the dashboard reads.

Data root layout (set EVALKIT_DASHBOARD_ROOT to point here)::

    /app/benchmarks/         (baked into the image)
    /app/reports/<run_id>/   (written by runners.benchmark at runtime)
    /app/artifacts/benchmarks/<run_id>/<task>/<fixture_id>.json
                             (written by runners.benchmark fixture_runner)

In tests / local dev, override via the ``EVALKIT_DASHBOARD_ROOT`` env var.
"""

from __future__ import annotations

import os
from pathlib import Path

_DEFAULT_ROOT = Path("/app")


def root() -> Path:
    return Path(os.environ.get("EVALKIT_DASHBOARD_ROOT", str(_DEFAULT_ROOT)))


def benchmarks_dir() -> Path:
    return root() / "benchmarks"


def leaderboard_path() -> Path:
    return benchmarks_dir() / "leaderboard.json"


def reports_dir() -> Path:
    return root() / "reports"


def report_dir(run_id: str) -> Path:
    return reports_dir() / run_id


def artifacts_root() -> Path:
    return root() / "artifacts" / "benchmarks"


def artifacts_run_dir(run_id: str) -> Path:
    return artifacts_root() / run_id


def fixture_artifact(run_id: str, task: str, fixture_id: str) -> Path:
    return artifacts_run_dir(run_id) / task / f"{fixture_id}.json"


def diagnostic_md(run_id: str, task: str, fixture_id: str) -> Path:
    return report_dir(run_id) / "diagnostics" / f"{fixture_id}.md"


def summary_path(run_id: str) -> Path:
    return report_dir(run_id) / "summary.json"


def narrative_path(run_id: str) -> Path:
    return report_dir(run_id) / "narrative.md"


def eval_reports_dir() -> Path:
    """Committed hand-authored eval reports (``eval-reports/<batch_id>/``),
    baked into the image — unlike ``reports/``, present without GCS hydration."""
    return root() / "eval-reports"


def task_fixtures_path(task: str) -> Path:
    return benchmarks_dir() / task / "fixtures.jsonl"


def task_rubric_path(task: str) -> Path:
    return benchmarks_dir() / task / "rubric.md"


def task_files_dir(task: str) -> Path:
    return benchmarks_dir() / task / "files"


# ``logs/run-many-<ts>/`` is where ``runners.benchmark.run_many`` writes
# plan.json (model × task matrix, written upfront), status.jsonl (one
# line per completed cell), and per-cell <slug>__<task>.log files. The
# dashboard's /live endpoint reads these to surface chain progress.
def logs_dir() -> Path:
    return root() / "logs"
