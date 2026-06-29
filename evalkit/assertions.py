"""Hard assertions — pure structural checks on a RunRecord.

These are protocol/shape checks (does the answer have substance, did the
agent loop forever), NOT quality judgement — that's the LLM judge's job.
Per-fixture checks return pass/fail here; the p95 latency SLO is a
distributional property and is evaluated at the TASK level in scorer.py,
never against a single fixture.
"""

from __future__ import annotations

from dataclasses import dataclass

from .models import HardAssertionConfig
from .record import RunRecord


@dataclass
class AssertionResult:
    passed: bool
    failures: list[str]


def check_hard(cfg: HardAssertionConfig, rec: RunRecord) -> AssertionResult:
    failures: list[str] = []

    if cfg.response_min_chars is not None:
        n = len(rec.response_text or "")
        if n < cfg.response_min_chars:
            failures.append(f"response too short: {n} < {cfg.response_min_chars} chars")

    if cfg.tool_call_count_max is not None:
        if rec.tool_call_count > cfg.tool_call_count_max:
            failures.append(
                f"too many tool calls: {rec.tool_call_count} > {cfg.tool_call_count_max}"
            )

    return AssertionResult(passed=not failures, failures=failures)
