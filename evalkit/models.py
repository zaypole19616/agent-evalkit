"""Value objects for a benchmark manifest + fixtures.

Pure data — no IO, no validation beyond Python type checks. Filesystem
validation (rubric exists, fixtures parse) lives in loader.py.

A benchmark task lives under ``benchmarks/<name>/``:

    manifest.yaml   task metadata + runtime + scoring + assertions + judge
    fixtures.jsonl  one JSON object per line, the test cases
    rubric.md       scoring guide injected into the judge system prompt
    files/          task-specific attachments referenced by fixtures[*].files
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal


@dataclass
class RuntimeConfig:
    concurrency: int = 4
    timeout_per_fixture_s: int = 600
    attempts: int = 1
    # Opaque dict handed verbatim to the adapter. Adapter-specific config
    # (base_url, account ids, working dir, ...) lives here — the framework
    # never reads it.
    adapter_config: dict = field(default_factory=dict)


@dataclass
class ScoringConfig:
    # NOTE: only ``judge_score`` + ``mean`` are wired today. ``primary_metric``
    # and median/weighted aggregation are reserved for forward-compat (see
    # scorer.global_summary). They're parsed but don't yet change scoring.
    primary_metric: str = "judge_score"
    aggregate: Literal["mean", "median"] = "mean"


@dataclass
class HardAssertionConfig:
    response_min_chars: int | None = None
    tool_call_count_max: int | None = None
    ttfr_ms_p95_lt: int | None = None  # task-level p95, never gates a single fixture


@dataclass
class JudgeConfig:
    rubric_file: str = "rubric.md"
    model: str = "gpt-4o-2024-11-20"
    scale: tuple[int, int] = (0, 5)
    threshold_per_fixture: int = 3
    on_response: bool = True
    on_tool_trace: bool = True
    # When the deliverable is a generated FILE (not the text response): the
    # judge is shown each generated file's content (read from
    # RunRecord.generated_files[].local_path). With expects_file=true, a
    # fixture that produced no usable file is marked a delivery failure so a
    # file-output rubric scores it 0 instead of judging the text/trace.
    on_generated_files: bool = True
    expects_file: bool = False


@dataclass
class GuardConfig:
    # Reserved for future ship-gating. Parsed but not yet wired into the
    # verdict (scorer uses fixed thresholds). Kept for forward-compat.
    drop_threshold_pct: int = 5
    cost_explosion_pct: int = 50


@dataclass
class BenchmarkManifest:
    name: str
    description: str
    version: int
    owner: str
    fixtures_file: str
    runtime: RuntimeConfig
    scoring: ScoringConfig
    assertions: HardAssertionConfig
    judge: JudgeConfig
    guard: GuardConfig
    tags: list[str] = field(default_factory=list)


@dataclass
class BenchmarkFixture:
    id: str
    prompt: str
    files: list[str] = field(default_factory=list)
    expected_answer_intent: str = ""
    tags: list[str] = field(default_factory=list)
    model: str | None = None  # None = use the run's --model
