"""evalkit CLI.

    evalkit run --model gpt-4o-mini [--adapter openai_chat] [--tasks a,b]
    evalkit plan --model gpt-4o-mini          # list what would run, no API calls
    evalkit leaderboard                        # render the current leaderboard
"""

from __future__ import annotations

import argparse
import asyncio
import os
from pathlib import Path

from . import leaderboard as lb_mod
from .loader import discover_tasks, load_fixtures, load_manifest
from .run_many import run_many
from .runner import run_eval


def _root(args) -> Path:
    return Path(args.root or os.environ.get("EVALKIT_DASHBOARD_ROOT") or ".").resolve()


def _tasks(args) -> list[str] | None:
    return [t.strip() for t in args.tasks.split(",") if t.strip()] if args.tasks else None


def cmd_run(args) -> int:
    result = asyncio.run(run_eval(
        root=_root(args),
        model=args.model,
        adapter_spec=args.adapter,
        tasks_filter=_tasks(args),
        resume=not args.no_resume,
        resume_run_id=args.resume,
        judge_enabled=not args.no_judge,
        stable=args.stable,
    ))
    g = result["global"]
    print(f"\n=== run {result['run_id']} ===")
    print(f"weighted: {g['weighted_score']}  verdict: {g['ship_verdict']}")
    print(f"leaderboard: {result['leaderboard_path']}")
    return 0


def cmd_run_many(args) -> int:
    models = [m.strip() for m in args.models.split(",") if m.strip()]
    if len(models) < 1:
        print("--models must list at least one model")
        return 1
    result = asyncio.run(run_many(
        root=_root(args),
        models=models,
        adapter_spec=args.adapter,
        tasks_filter=_tasks(args),
        judge_enabled=not args.no_judge,
    ))
    print(f"\n=== chain {result['chain_id']} === {len(result['models'])} models × {len(result['tasks'])} tasks")
    return 0


def cmd_plan(args) -> int:
    root = _root(args)
    paths = discover_tasks(root / "benchmarks", _tasks(args))
    if not paths:
        print(f"no tasks under {root/'benchmarks'}")
        return 1
    print(f"model: {args.model} · adapter: {args.adapter} · root: {root}")
    total = 0
    for mp in paths:
        m = load_manifest(mp)
        n = len(load_fixtures(mp.parent / m.fixtures_file))
        total += n
        print(f"  {m.name:<20} {n:>4} fixtures · judge={m.judge.model}")
    print(f"total: {len(paths)} tasks, {total} fixtures (no API calls made)")
    return 0


def cmd_leaderboard(args) -> int:
    path = _root(args) / "benchmarks" / "leaderboard.json"
    if not path.exists():
        print(f"no leaderboard at {path} — run `evalkit run` first")
        return 1
    print(lb_mod.render_markdown(lb_mod.load_or_empty(path)))
    return 0


def main() -> None:
    p = argparse.ArgumentParser(prog="evalkit", description="Eval framework for file/tool-producing agents")
    p.add_argument("--root", default=None, help="data root (default: $EVALKIT_DASHBOARD_ROOT or .)")
    sub = p.add_subparsers(dest="cmd", required=True)

    run = sub.add_parser("run", help="run the eval pipeline")
    run.add_argument("--model", required=True)
    run.add_argument("--adapter", default="openai_chat")
    run.add_argument("--tasks", default=None, help="comma-separated subset")
    run.add_argument("--resume", default=None, metavar="RUN_ID",
                     help="resume a prior run: reuse its run_id and skip fixtures that already have an artifact")
    run.add_argument("--no-resume", action="store_true", help="re-run fixtures even if an artifact exists")
    run.add_argument("--no-judge", action="store_true", help="run + score structure only, skip the LLM judge")
    run.add_argument("--stable", action="store_true", help="mark this run as the baseline")
    run.set_defaults(fn=cmd_run)

    plan = sub.add_parser("plan", help="list what would run, no API calls")
    plan.add_argument("--model", required=True)
    plan.add_argument("--adapter", default="openai_chat")
    plan.add_argument("--tasks", default=None)
    plan.set_defaults(fn=cmd_plan)

    rm = sub.add_parser("run-many", help="evaluate a model × task matrix (feeds the dashboard Live view)")
    rm.add_argument("--models", required=True, help="comma-separated model list")
    rm.add_argument("--adapter", default="openai_chat")
    rm.add_argument("--tasks", default=None, help="comma-separated subset")
    rm.add_argument("--no-judge", action="store_true")
    rm.set_defaults(fn=cmd_run_many)

    lb = sub.add_parser("leaderboard", help="render the current leaderboard")
    lb.set_defaults(fn=cmd_leaderboard)

    args = p.parse_args()
    raise SystemExit(args.fn(args))


if __name__ == "__main__":
    main()
