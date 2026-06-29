"""Lazy GCS hydration for per-run dashboard data.

The pod's local ``reports/`` + ``artifacts/`` dirs are ephemeral (no PVC):
a deploy or restart wipes everything ``runners.benchmark`` wrote at runtime,
leaving only the image's baked-in snapshot. ``service/main.py`` restores
``leaderboard.json`` on startup, but the per-run reports/artifacts are far
too many to pull eagerly at boot — doing so would block readiness, and the
repo's CLAUDE.md requires the startup path stay cheap.

So restore a run's footprint from GCS on FIRST ACCESS instead: when a
dashboard request hits a run whose local dir is missing, pull that one run
and cache it to the pod for subsequent reads. Only runs that are actually
viewed are fetched, the boot stays instant, and the dashboard survives
restarts.
"""

from __future__ import annotations

import logging

from . import paths

logger = logging.getLogger(__name__)

# run_ids already attempted this pod lifetime. Guards against re-listing GCS
# on every request — for a run that is present, was just pulled, or failed.
_attempted: set[str] = set()


def ensure_run_local(run_id: str) -> None:
    """Restore ``run_id``'s reports + artifacts from GCS if absent locally.

    No-op when the run is already on disk (the runner wrote it this pod
    lifetime, or an earlier request hydrated it) or when GCS is unavailable.
    Never raises: a failed hydrate degrades to the caller's normal 404, never
    a 500.
    """
    if run_id in _attempted:
        return
    if paths.report_dir(run_id).exists() or paths.artifacts_run_dir(run_id).exists():
        _attempted.add(run_id)
        return
    try:
        from runners.benchmark.gcs import get_store

        store = get_store()
        if store is not None:
            n = store.download_run(
                run_id, paths.report_dir(run_id), paths.artifacts_run_dir(run_id)
            )
            logger.info(
                "dashboard hydrate: run %s restored %d files from GCS", run_id, n
            )
    except Exception as e:  # noqa: BLE001 — a read must not 500 on a GCS hiccup
        logger.warning("dashboard hydrate: run %s failed: %s", run_id, e)
    finally:
        _attempted.add(run_id)
