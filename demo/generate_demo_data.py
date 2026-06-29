#!/usr/bin/env python3
"""Generate the agent-evalkit demo dataset — PLACEHOLDER MOCK.

The public demo is populated so the dashboard looks alive, but the
content is obviously placeholder, not real evaluation data:

  - Models: a real, public model lineup, in a fixed leaderboard
    order. Scores and prices all render as "—".
  - Test sets: generic placeholders "测试集 1 / 2 / 3" grouped into the
    two generic categories (任务类型 1 / 任务类型 2, defined in
    frontend lib/task-meta.ts).
  - Test cases: "test case 1 / 2 / 3" with body "test case N 内容".
  - Reports: placeholder batches "报告 1 / 2" with mock markdown.

No real prompts, rubrics, scores, or report text ship here.

Writes the files the frontend's static fallback reads:

    <out>/leaderboard.json
    <out>/notes.json
    <out>/benchmarks/manifest.json
    <out>/benchmarks/<task>/fixtures.jsonl
    <out>/benchmarks/<task>/rubric.md
    <out>/reports/index.json
    <out>/reports/<batch>/manifest.json
    <out>/reports/<batch>/<file>.md

Default <out> is the dashboard frontend's public/data. Run:

    python demo/generate_demo_data.py
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

# A real, public model lineup, in a fixed leaderboard order.
MODELS = [
    "Claude Fable 5",
    "Claude Opus 4.8",
    "GPT-5.5",
    "GPT 5.4",
    "Claude Opus 4.6",
    "Gemini 3.5 Flash",
    "Claude Sonnet 4.6",
    "GLM 5.2",
    "DeepSeek V4 Pro",
]

# Placeholder test sets (task key == display label via taskLabel fallback).
# Category assignment lives in frontend lib/task-meta.ts:
#   任务类型 1 → [测试集 1, 测试集 2],  任务类型 2 → [测试集 3]
TASKS = ["测试集 1", "测试集 2", "测试集 3"]
CASES_PER_TASK = 3


def fixtures_jsonl() -> str:
    lines = []
    for c in range(1, CASES_PER_TASK + 1):
        lines.append(json.dumps({
            "id": f"test case {c}",
            "prompt": f"test case {c} 内容",
            "expected_answer_intent": f"test case {c} 期望答案",
            "files": [],
            "tags": ["mock"],
        }, ensure_ascii=False))
    return "\n".join(lines) + "\n"


def rubric_md(task: str) -> str:
    return (
        f"# {task} — 评分标准（mock）\n\n"
        "这是占位评分标准，用于演示看板，非真实评测口径。\n\n"
        "| 分数 | 含义 |\n|---:|---|\n"
        "| 5 | 占位：完全满足 |\n| 3 | 占位：部分满足 |\n| 0 | 占位：未满足 |\n"
    )


def build_leaderboard() -> dict:
    # Scores + prices null, dates blank → every metric renders "—".
    # Model order = MODELS order. The global ranking sort is stable
    # over equal (null) keys, so this order is preserved in the UI.
    tasks_block: dict[str, list[dict]] = {}
    for task in TASKS:
        tasks_block[task] = [
            {
                "model": m,
                "score": None,
                "token_median": 0,
                "cost_median_usd": None,
                "tested_at": "",
                "run_id": "",
                "report_path": "",
                "stable": False,
                "n_scored": 0,
                "n_full": CASES_PER_TASK,
            }
            for m in MODELS
        ]
    global_block = [
        {"model": m, "weighted_score": None, "tested_at": "", "run_id": ""}
        for m in MODELS
    ]
    return {"version": 1, "updated_at": "", "tasks": tasks_block, "global": global_block}


def build_manifest() -> list[dict]:
    return [
        {
            "task": task,
            "fixture_count": CASES_PER_TASK,
            "has_files": False,
            "rubric_excerpt": rubric_md(task)[:500],
        }
        for task in TASKS
    ]


# --- reports -----------------------------------------------------------
REPORT_BATCHES = ["报告 1", "报告 2"]


def report_overview_md(batch: str) -> str:
    return (
        f"# {batch} — 综合报告（mock）\n\n"
        "这是占位综合报告，用于演示「报告」页的渲染，内容非真实结论。\n\n"
        "## TL;DR\n占位：本批次结论一句话。\n\n"
        "## 逐测试集评分\n\n"
        "| 测试集 | 评分 | 说明 |\n|---|---|---|\n"
        "| 测试集 1 | — | 占位 |\n| 测试集 2 | — | 占位 |\n| 测试集 3 | — | 占位 |\n\n"
        "## 使用建议\n占位：建议正文。\n"
    )


def report_model_md(batch: str, model: str) -> str:
    return (
        f"# {model} — 模型报告（mock）\n\n"
        f"占位：{model} 在 {batch} 各测试集上的表现说明。\n\n"
        "- 测试集 1：占位\n- 测试集 2：占位\n- 测试集 3：占位\n"
    )


def report_backlog_md(batch: str) -> str:
    return (
        f"# {batch} — Bug Backlog（mock）\n\n"
        "占位：本批次发现的问题清单。\n\n"
        "1. 占位问题 1\n2. 占位问题 2\n"
    )


def build_report_index() -> list[dict]:
    out = []
    for b in REPORT_BATCHES:
        models = MODELS[:2]
        # overview + per-model(2) + backlog
        out.append({
            "batch_id": b,
            "title": b,
            "date": "2026-06-26",
            "engine_version": "",        # blank → no version chip
            "models": models,
            "report_count": 1 + len(models) + 1,
        })
    return out


def build_report_manifest(batch: str) -> dict:
    models = MODELS[:2]
    reports = [{"type": "overview", "file": "overview.md", "title": "综合报告"}]
    for i, m in enumerate(models, start=1):
        reports.append({"type": "model", "file": f"model-{i}.md", "title": f"{m} 报告", "model": m})
    reports.append({"type": "backlog", "file": "backlog.md", "title": "Bug Backlog"})
    return {
        "batch_id": batch,
        "title": batch,
        "date": "2026-06-26",
        "engine_version": "",
        "judge": "",
        "models": models,
        "tasks": TASKS,
        "run_ids": {},
        "reports": reports,
    }


def write_reports(out_dir: Path) -> None:
    rdir = out_dir / "reports"
    rdir.mkdir(parents=True, exist_ok=True)
    (rdir / "index.json").write_text(json.dumps(build_report_index(), ensure_ascii=False, indent=2))
    for b in REPORT_BATCHES:
        bdir = rdir / b
        bdir.mkdir(parents=True, exist_ok=True)
        (bdir / "manifest.json").write_text(json.dumps(build_report_manifest(b), ensure_ascii=False, indent=2))
        (bdir / "overview.md").write_text(report_overview_md(b))
        for i, m in enumerate(MODELS[:2], start=1):
            (bdir / f"model-{i}.md").write_text(report_model_md(b, m))
        (bdir / "backlog.md").write_text(report_backlog_md(b))


# --- live + history -----------------------------------------------------
def build_live() -> dict:
    models = MODELS[:2]
    # 2 models × 3 test sets = 6 cells; a frozen "进行中" snapshot.
    # done cells carry score=null → the matrix shows "—" (no real scores).
    cells = [
        {"model": models[0], "task": "测试集 1", "status": "done", "score": None, "badcases": 0, "elapsed_s": 1180},
        {"model": models[0], "task": "测试集 2", "status": "done", "score": None, "badcases": 0, "elapsed_s": 970},
        {"model": models[0], "task": "测试集 3", "status": "running",
         "progress": {"run_id": "mock-live-run", "done": 2, "total": 3, "latest_fixture_id": "test case 2"}},
        {"model": models[1], "task": "测试集 1", "status": "pending"},
        {"model": models[1], "task": "测试集 2", "status": "pending"},
        {"model": models[1], "task": "测试集 3", "status": "pending"},
    ]
    return {
        "mode": "chain",
        "chain_id": "mock-live-chain",
        "chain_started_at": "2026-06-26T08:00:00Z",
        "models": models,
        "tasks": TASKS,
        "order": "model-major",
        "total_cells": 6,
        "done_cells": 2,
        "failed_cells": 0,
        "running_cells": 1,
        "pending_cells": 3,
        "finished": False,
        "timeout_per_cell_s": 600,
        "has_plan": True,
        "cells": cells,
    }


def build_history() -> list[dict]:
    models = MODELS[:2]
    cells = [
        {"model": m, "task": t, "score": None, "run_id": ""}
        for m in models for t in TASKS
    ]
    return [{
        "started_at": "2026-06-20T08:00:00Z",
        "ended_at": "2026-06-20T09:30:00Z",
        "models": models,
        "tasks": TASKS,
        "cell_count": len(cells),
        "avg_score": None,
        "cells": cells,
    }]


def main(out_dir: Path) -> None:
    if out_dir.exists():
        shutil.rmtree(out_dir)
    bench = out_dir / "benchmarks"
    bench.mkdir(parents=True, exist_ok=True)

    (out_dir / "leaderboard.json").write_text(
        json.dumps(build_leaderboard(), ensure_ascii=False, indent=2))
    (out_dir / "notes.json").write_text(json.dumps({}, ensure_ascii=False))
    (bench / "manifest.json").write_text(
        json.dumps(build_manifest(), ensure_ascii=False, indent=2))

    for task in TASKS:
        tdir = bench / task
        tdir.mkdir(parents=True, exist_ok=True)
        (tdir / "fixtures.jsonl").write_text(fixtures_jsonl())
        (tdir / "rubric.md").write_text(rubric_md(task))

    write_reports(out_dir)

    (out_dir / "live.json").write_text(json.dumps(build_live(), ensure_ascii=False, indent=2))
    (out_dir / "history.json").write_text(json.dumps(build_history(), ensure_ascii=False, indent=2))

    print(f"wrote placeholder-mock demo dataset → {out_dir}")
    print(f"  models (real names, scores/prices all —): {len(MODELS)}")
    print(f"  test sets: {', '.join(TASKS)} ({CASES_PER_TASK} cases each)")
    print(f"  reports: {', '.join(REPORT_BATCHES)}")
    print(f"  live: frozen chain snapshot · history: 1 past chain")


if __name__ == "__main__":
    default_out = Path(__file__).resolve().parent.parent / "dashboard" / "frontend" / "public" / "data"
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else default_out
    main(out)
