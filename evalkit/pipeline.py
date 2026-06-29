"""Per-task orchestrator. Runs each fixture through the adapter under a
concurrency semaphore, with per-fixture timeout + transient-error retry,
and writes a per-fixture artifact JSON. Resumes by skipping fixtures that
already have an artifact.
"""

from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass, field
from pathlib import Path

from .adapter import Adapter
from .models import BenchmarkFixture, BenchmarkManifest


def fixture_artifact_path(artifact_root: Path, task: str, fixture_id: str) -> Path:
    return artifact_root / task / f"{fixture_id}.json"


@dataclass
class TaskOutcome:
    task: str
    completed: int = 0
    skipped_resume: int = 0
    skipped_missing_inputs: list[str] = field(default_factory=list)
    errors: list[tuple[str, str]] = field(default_factory=list)
    elapsed_s: float = 0.0


_TRANSIENT = {
    "ConnectError", "ConnectTimeout", "ReadError", "ReadTimeout",
    "RemoteProtocolError", "WriteError", "PoolTimeout", "ConnectionError",
    "ConnectionResetError", "IncompleteRead", "APIConnectionError", "APITimeoutError",
}


def _save_artifact(path: Path, *, manifest, fixture, model_id, record, elapsed_s) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "task": manifest.name,
        "fixture_id": fixture.id,
        "model": model_id,
        "prompt": fixture.prompt,
        "expected_answer_intent": fixture.expected_answer_intent,
        "attached_files": list(fixture.files),
        "elapsed_s": elapsed_s,
        "record": record.to_dict(),
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2))


async def run_task(
    manifest: BenchmarkManifest,
    fixtures: list[BenchmarkFixture],
    adapter: Adapter,
    model_id: str,
    task_dir: Path,
    artifact_root: Path,
    resume: bool = True,
) -> TaskOutcome:
    started = time.time()
    sem = asyncio.Semaphore(manifest.runtime.concurrency)
    outcome = TaskOutcome(task=manifest.name)

    # Skip fixtures whose declared input files don't exist under <task>/files/
    # — running them just scores 0 because the agent has nothing to read.
    files_dir = task_dir / "files"
    runnable: list[BenchmarkFixture] = []
    for f in fixtures:
        missing = [ref for ref in (f.files or []) if not (files_dir / ref).is_file()]
        if missing:
            outcome.skipped_missing_inputs.append(f.id)
            continue
        runnable.append(f)

    async def _one(f: BenchmarkFixture) -> None:
        art = fixture_artifact_path(artifact_root, manifest.name, f.id)
        if resume and art.exists():
            outcome.skipped_resume += 1
            outcome.completed += 1
            return
        async with sem:
            for attempt in range(max(1, manifest.runtime.attempts) + 2):
                t0 = time.time()
                try:
                    coro = adapter.run(manifest, f, f.model or model_id)
                    rec = await asyncio.wait_for(coro, timeout=manifest.runtime.timeout_per_fixture_s)
                    _save_artifact(art, manifest=manifest, fixture=f, model_id=f.model or model_id,
                                   record=rec, elapsed_s=time.time() - t0)
                    outcome.completed += 1
                    return
                except asyncio.TimeoutError:
                    outcome.errors.append((f.id, "TimeoutError"))
                    return
                except Exception as e:
                    if type(e).__name__ in _TRANSIENT and attempt < 2:
                        await asyncio.sleep(2 * (attempt + 1))
                        continue
                    outcome.errors.append((f.id, f"{type(e).__name__}: {e}"))
                    return

    await asyncio.gather(*(_one(f) for f in runnable))
    outcome.elapsed_s = time.time() - started
    return outcome
