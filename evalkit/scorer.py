"""Scoring — pure aggregation. No network, no IO.

Caller runs hard assertions + judge per fixture, hands FixtureScore
objects here for roll-up into a TaskSummary, then GlobalSummary.
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass, field
from typing import Literal

ShipVerdict = Literal["RECOMMENDED", "NEEDS_ADAPTATION", "DO_NOT_SHIP"]

DROP_THRESHOLD_PCT = 5
MIN_ABSOLUTE_SCORE = 3.0


def _percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    if len(s) == 1:
        return float(s[0])
    k = (len(s) - 1) * (pct / 100.0)
    lo = int(k)
    hi = min(lo + 1, len(s) - 1)
    return float(s[lo] + (s[hi] - s[lo]) * (k - lo))


@dataclass
class FixtureScore:
    fixture_id: str
    judge_score: int
    hard_pass: bool
    tokens: int
    tool_calls: int
    badcase: bool
    judge_reason: str = ""
    ttfr_ms: int | None = None
    cost_usd: float | None = None


@dataclass
class TaskSummary:
    task: str
    score: float
    vs_baseline: float | None
    token_median: int
    vs_baseline_token_pct: float | None
    badcase_count: int
    hard_pass_rate: float
    regression_flag: bool
    ttfr_p95_ms: float | None = None
    ttfr_p95_pass: bool | None = None
    cost_median_usd: float | None = None


@dataclass
class GlobalSummary:
    weighted_score: float
    vs_baseline: float | None
    ship_verdict: ShipVerdict
    regression_tasks: list[str] = field(default_factory=list)


def aggregate_task(
    task: str,
    scores: list[FixtureScore],
    baseline_score: float | None,
    baseline_token_median: int | None,
    total_fixtures: int | None = None,
    ttfr_p95_threshold_ms: int | None = None,
) -> TaskSummary:
    # total_fixtures = attempts (incl. errored/skipped), so failures count as
    # 0 in the mean rather than vanishing. None keeps the scored-only denom.
    denom = total_fixtures if total_fixtures is not None else len(scores)
    if denom == 0 or not scores:
        return TaskSummary(task, 0.0, None, 0, None, 0, 0.0, False, None, None, None)

    score = sum(s.judge_score for s in scores) / denom
    token_med = int(statistics.median([s.tokens for s in scores]))
    real_costs = [s.cost_usd for s in scores if s.cost_usd]
    cost_median = round(statistics.median(real_costs), 4) if real_costs else None
    badcases = sum(1 for s in scores if s.badcase)
    hard_pass_rate = sum(1 for s in scores if s.hard_pass) / len(scores)

    ttfr_obs = [s.ttfr_ms for s in scores if s.ttfr_ms is not None]
    ttfr_p95: float | None = None
    ttfr_p95_pass: bool | None = None
    if ttfr_obs:
        ttfr_p95 = round(_percentile([float(v) for v in ttfr_obs], 95), 1)
        if ttfr_p95_threshold_ms is not None:
            ttfr_p95_pass = ttfr_p95 < ttfr_p95_threshold_ms

    vs_baseline = (score - baseline_score) if baseline_score is not None else None
    vs_token_pct: float | None = None
    if baseline_token_median:
        vs_token_pct = (token_med - baseline_token_median) * 100 / baseline_token_median

    regression = False
    if baseline_score is not None and baseline_score > 0 and vs_baseline is not None:
        regression = (vs_baseline / baseline_score) * 100 < -DROP_THRESHOLD_PCT

    return TaskSummary(
        task=task,
        score=round(score, 3),
        vs_baseline=round(vs_baseline, 3) if vs_baseline is not None else None,
        token_median=token_med,
        vs_baseline_token_pct=round(vs_token_pct, 1) if vs_token_pct is not None else None,
        badcase_count=badcases,
        hard_pass_rate=hard_pass_rate,
        regression_flag=regression,
        ttfr_p95_ms=ttfr_p95,
        ttfr_p95_pass=ttfr_p95_pass,
        cost_median_usd=cost_median,
    )


def global_summary(tasks: list[TaskSummary], baseline_global: float | None) -> GlobalSummary:
    if not tasks:
        return GlobalSummary(0.0, None, "DO_NOT_SHIP")
    weighted = sum(t.score for t in tasks) / len(tasks)
    vs = (weighted - baseline_global) if baseline_global is not None else None
    return GlobalSummary(
        weighted_score=round(weighted, 3),
        vs_baseline=round(vs, 3) if vs is not None else None,
        ship_verdict=decide_ship_verdict(tasks),
        regression_tasks=[t.task for t in tasks if t.regression_flag],
    )


def decide_ship_verdict(tasks: list[TaskSummary]) -> ShipVerdict:
    if any(t.score < MIN_ABSOLUTE_SCORE for t in tasks):
        return "DO_NOT_SHIP"
    if any(t.regression_flag for t in tasks):
        return "DO_NOT_SHIP"
    if all(t.vs_baseline is None for t in tasks):
        return "NEEDS_ADAPTATION"
    if any(t.vs_baseline is not None and t.vs_baseline / max(t.score, 0.01) < -0.02 for t in tasks):
        return "NEEDS_ADAPTATION"
    return "RECOMMENDED"
