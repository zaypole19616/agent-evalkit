"""Generate reports/<run_id>/narrative.md from summary + diagnostics + artifacts.

One Claude Sonnet 4.6 call with prompt caching. The system prompt + rubrics
form the cached prefix (stable across runs); the user prompt is per-run.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from anthropic import Anthropic

from dashboard.backend import paths
from dashboard.narrative import prompts
from dashboard.narrative.case_picker import pick_worst

MODEL = "claude-sonnet-4-6"
MAX_TOKENS = 4096
TOP_PER_TASK = 3


def _build_client() -> Anthropic:
    """Built behind a function so tests can monkeypatch it."""
    return Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])


def _load_rubrics(tasks: list[str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for task in tasks:
        p = paths.task_rubric_path(task)
        if p.exists():
            out[task] = p.read_text()
    return out


def _build_messages(summary: dict, run_id: str) -> tuple[list[dict], list[dict]]:
    """Return (system_blocks, messages) for anthropic.messages.create.

    System is a list with two blocks — the stable instructions and the
    rubrics — the second is marked ephemeral so it lives in the cache.
    """
    task_names = [t["task"] for t in summary["tasks"]]
    rubrics = _load_rubrics(task_names)
    worst = {task: pick_worst(run_id, task, top=TOP_PER_TASK) for task in task_names}

    system_blocks: list[dict] = [
        {"type": "text", "text": prompts.SYSTEM_PROMPT},
        {
            "type": "text",
            "text": prompts.RUBRICS_BLOCK_TEMPLATE.render(rubrics=rubrics),
            "cache_control": {"type": "ephemeral"},
        },
    ]

    user_text = prompts.USER_PROMPT_TEMPLATE.render(
        summary_json=json.dumps(summary, ensure_ascii=False, indent=2),
        worst_per_task=worst,
    )
    messages = [{"role": "user", "content": [{"type": "text", "text": user_text}]}]
    return system_blocks, messages


def generate(run_id: str) -> Path:
    """Produce reports/<run_id>/narrative.md and return its path.

    Raises FileNotFoundError if summary.json is missing.
    """
    summary_path = paths.summary_path(run_id)
    if not summary_path.exists():
        raise FileNotFoundError(f"summary.json not found for run {run_id}")
    summary = json.loads(summary_path.read_text())

    system_blocks, messages = _build_messages(summary, run_id)

    client = _build_client()
    response = client.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        system=system_blocks,
        messages=messages,
    )
    markdown = "".join(block.text for block in response.content)

    out_path = paths.narrative_path(run_id)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(markdown)
    return out_path
