"""End-to-end eval: discover tasks → run each fixture through the adapter
→ hard assertions + LLM judge → aggregate → write leaderboard + artifacts
+ per-run summary.

Output layout (under ``root``) matches what the dashboard reads:

    benchmarks/leaderboard.json
    artifacts/benchmarks/<run_id>/<task>/<fixture>.json
    reports/<run_id>/summary.json
"""

from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from . import leaderboard as lb_mod
from .adapter import Adapter, load_adapter
from .assertions import check_hard
from .judge import evaluate_one, render_tool_trace
from .loader import discover_tasks, load_fixtures, load_manifest
from .pipeline import fixture_artifact_path, run_task
from .scorer import FixtureScore, aggregate_task, global_summary


def _slug(s: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "-", s).strip("-") or "model"


@dataclass
class _Fix:
    obj: object  # BenchmarkFixture


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _score_one_artifact(art_path: Path, manifest, rubric_text: str, judge_enabled: bool) -> FixtureScore:
    data = json.loads(art_path.read_text())
    rec = data["record"]
    response_text = rec.get("response_text", "") or ""
    tool_results = rec.get("tool_results", []) or []
    tokens = (rec.get("tokens") or {}) or {}
    total_tokens = int(tokens.get("total") or 0)
    cost = tokens.get("cost_usd")
    ttfr = rec.get("ttfr_ms")

    # hard assertions (reconstruct a minimal record-like for the checker)
    class _R:
        pass
    r = _R()
    r.response_text = response_text
    r.tool_call_count = int(rec.get("tool_call_count") or 0)
    hard = check_hard(manifest.assertions, r)

    if judge_enabled:
        class _T:
            def __init__(self, d):
                self.name = d.get("name", "?")
                self.success = d.get("success")
                self.content_excerpt = d.get("content_excerpt", "")
        trace = render_tool_trace([_T(t) for t in tool_results]) if manifest.judge.on_tool_trace else ""
        outcome = evaluate_one(
            rubric_text=rubric_text,
            user_prompt=data.get("prompt", ""),
            response_text=response_text if manifest.judge.on_response else "",
            tool_trace=trace,
            expected_intent=data.get("expected_answer_intent", ""),
            scale=tuple(manifest.judge.scale),
            threshold=manifest.judge.threshold_per_fixture,
            model=manifest.judge.model,
        )
        score, reason = outcome.score, outcome.reason
    else:
        score, reason = 0, "(judge disabled)"

    return FixtureScore(
        fixture_id=data["fixture_id"],
        judge_score=score,
        hard_pass=hard.passed,
        tokens=total_tokens,
        tool_calls=int(rec.get("tool_call_count") or 0),
        badcase=judge_enabled and score < manifest.judge.threshold_per_fixture,
        judge_reason=reason,
        ttfr_ms=ttfr,
        cost_usd=cost,
    )


async def run_eval(
    *,
    root: Path,
    model: str,
    adapter_spec: str = "openai_chat",
    tasks_filter: list[str] | None = None,
    resume: bool = True,
    judge_enabled: bool = True,
    stable: bool = False,
) -> dict:
    benchmarks_dir = root / "benchmarks"
    run_id = f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')}-{_slug(model)}"
    artifact_root = root / "artifacts" / "benchmarks" / run_id
    reports_dir = root / "reports" / run_id
    lb_path = benchmarks_dir / "leaderboard.json"

    manifest_paths = discover_tasks(benchmarks_dir, tasks_filter)
    if not manifest_paths:
        raise SystemExit(f"no tasks found under {benchmarks_dir}")

    adapter: Adapter = load_adapter(adapter_spec)
    lb = lb_mod.load_or_empty(lb_path)
    tested_at = _now_iso()
    task_summaries = []

    for mp in manifest_paths:
        manifest = load_manifest(mp)
        task_dir = mp.parent
        fixtures = load_fixtures(task_dir / manifest.fixtures_file)
        print(f"\n▶ {manifest.name}: {len(fixtures)} fixtures · model={model} · adapter={adapter_spec}")

        outcome = await run_task(manifest, fixtures, adapter, model, task_dir, artifact_root, resume)
        if outcome.skipped_missing_inputs:
            print(f"  skipped {len(outcome.skipped_missing_inputs)} fixture(s): missing input files")
        if outcome.errors:
            print(f"  {len(outcome.errors)} error(s): {outcome.errors[:3]}")

        rubric_text = (task_dir / manifest.judge.rubric_file).read_text() if (task_dir / manifest.judge.rubric_file).exists() else ""
        scores: list[FixtureScore] = []
        for f in fixtures:
            art = fixture_artifact_path(artifact_root, manifest.name, f.id)
            if not art.exists():
                continue
            scores.append(await asyncio.to_thread(_score_one_artifact, art, manifest, rubric_text, judge_enabled))

        baseline = lb_mod.stable_baseline(lb, manifest.name)
        summary = aggregate_task(
            manifest.name, scores,
            baseline_score=baseline.get("score") if baseline else None,
            baseline_token_median=baseline.get("token_median") if baseline else None,
            total_fixtures=len(fixtures),
            ttfr_p95_threshold_ms=manifest.assertions.ttfr_ms_p95_lt,
        )
        task_summaries.append(summary)
        print(f"  → score {summary.score} · badcases {summary.badcase_count} · hard-pass {summary.hard_pass_rate:.0%}")

        lb_mod.upsert_run(
            lb, task=manifest.name, model=model, score=summary.score,
            token_median=summary.token_median, run_id=run_id,
            report_path=f"reports/{run_id}", tested_at=tested_at, stable=stable,
            cost_median_usd=summary.cost_median_usd,
            n_scored=len(scores), n_full=len(fixtures),
        )

    gsum = global_summary(task_summaries, baseline_global=None)
    lb_mod.upsert_global(lb, model=model, weighted_score=gsum.weighted_score, run_id=run_id, tested_at=tested_at)
    lb_mod.save(lb_path, lb)

    reports_dir.mkdir(parents=True, exist_ok=True)
    summary_payload = {
        "run_id": run_id,
        "model": model,
        "tasks": [vars(t) for t in task_summaries],
        "global": {
            "weighted_score": gsum.weighted_score,
            "vs_baseline": gsum.vs_baseline,
            "ship_verdict": gsum.ship_verdict,
            "regression_tasks": gsum.regression_tasks,
        },
        "cost_usd": round(sum((t.cost_median_usd or 0) for t in task_summaries), 4),
    }
    (reports_dir / "summary.json").write_text(json.dumps(summary_payload, ensure_ascii=False, indent=2))

    return {
        "run_id": run_id,
        "global": summary_payload["global"],
        "tasks": summary_payload["tasks"],
        "leaderboard_path": str(lb_path),
        "artifact_root": str(artifact_root),
    }
