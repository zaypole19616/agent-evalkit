"""LLM-as-judge. Scores a fixture's deliverable against the task rubric on
an integer scale, via an OpenAI-compatible API.

Credentials: ``OPENAI_API_KEY`` (+ optional ``OPENAI_BASE_URL`` to point at
Azure / a self-hosted gateway / OpenRouter / any OpenAI-shape endpoint).
The default model (``gpt-4o-2024-11-20``) supports strict structured
output, which forces the judge to emit ``{"score": int, "reason": str}``.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass

from openai import OpenAI


@dataclass
class JudgeOutcome:
    score: int
    reason: str
    passed: bool
    raw: str


def _client() -> OpenAI:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY not set — the judge cannot run.")
    base_url = os.environ.get("OPENAI_BASE_URL") or None
    return OpenAI(api_key=api_key, base_url=base_url)


_SYSTEM_TMPL = """\
You are an evaluation judge for an automated agent capability benchmark.

Score how well the agent's response satisfies the user's prompt, on a
{lo}-{hi} INTEGER scale. The rubric below is the authoritative scoring
guide; follow it strictly.

You may write a brief analysis, but your reply MUST end with EXACTLY one
line in this format and nothing after it:

SCORE: <integer in [{lo}, {hi}]>

=== Rubric ===
{rubric}
"""


def build_system_prompt(rubric_text: str, scale: tuple[int, int]) -> str:
    return _SYSTEM_TMPL.format(rubric=rubric_text.strip(), lo=scale[0], hi=scale[1])


def build_user_prompt(prompt: str, response_text: str, tool_trace: str, expected_intent: str) -> str:
    parts = [f"User prompt:\n{prompt}"]
    if expected_intent:
        parts.append(f"\nExpected answer intent:\n{expected_intent}")
    parts.append(f"\nAgent response:\n{response_text}")
    if tool_trace:
        parts.append(f"\nTool trace:\n{tool_trace}")
    return "\n".join(parts)


_SCORE_RX = re.compile(r"SCORE\s*[:：]\s*([0-9]+)", re.IGNORECASE)
_JSON_RX = re.compile(r"\{[\s\S]*\}")
_BARE_RX = re.compile(r"^\s*([0-9]+)\s*$")


def _parse(reply: str, scale: tuple[int, int]) -> tuple[int, str]:
    clamp = lambda n: max(scale[0], min(scale[1], n))
    m = list(_SCORE_RX.finditer(reply))
    if m:
        cut = m[-1].start()
        reason = reply[:cut].strip().replace("\n", " ")[:200] or "(score-line only)"
        return clamp(int(m[-1].group(1))), reason
    j = _JSON_RX.search(reply)
    if j:
        try:
            obj = json.loads(j.group(0))
            return clamp(int(obj.get("score", 0))), str(obj.get("reason", ""))[:200]
        except Exception:
            pass
    b = _BARE_RX.match(reply)
    if b:
        return clamp(int(b.group(1))), "(bare-int reply)"
    return 0, f"judge returned no parseable SCORE: {reply[:200]}"


def _schema(scale: tuple[int, int]) -> dict:
    return {
        "type": "object",
        "properties": {
            "score": {"type": "integer", "minimum": scale[0], "maximum": scale[1]},
            "reason": {"type": "string", "description": "One-sentence rationale, <= 200 chars"},
        },
        "required": ["score", "reason"],
        "additionalProperties": False,
    }


def _call(client: OpenAI, *, model: str, system: str, user: str, scale: tuple[int, int]) -> str:
    # Prefer the Responses API with strict structured output; fall back to
    # chat.completions for older SDKs / endpoints that lack it.
    try:
        resp = client.responses.create(
            model=model,
            instructions=system,
            input=[{"role": "user", "content": user}],
            max_output_tokens=400,
            text={"format": {"type": "json_schema", "name": "judge_result",
                             "schema": _schema(scale), "strict": True}},
        )
        return getattr(resp, "output_text", "") or ""
    except Exception:
        resp = client.chat.completions.create(
            model=model,
            max_tokens=400,
            temperature=0.0,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        )
        return resp.choices[0].message.content or ""


def evaluate_one(
    *,
    rubric_text: str,
    user_prompt: str,
    response_text: str,
    tool_trace: str,
    expected_intent: str,
    scale: tuple[int, int],
    threshold: int,
    model: str,
    client: OpenAI | None = None,
) -> JudgeOutcome:
    system = build_system_prompt(rubric_text, scale)
    user = build_user_prompt(user_prompt, response_text, tool_trace, expected_intent)
    try:
        client = client or _client()  # raises if OPENAI_API_KEY is unset
        raw = _call(client, model=model, system=system, user=user, scale=scale)
    except Exception as e:
        return JudgeOutcome(0, f"judge unavailable: {type(e).__name__}: {e}", False, "")
    score, reason = _parse(raw, scale)
    return JudgeOutcome(score, reason, score >= threshold, raw)


def render_tool_trace(tool_results: list) -> str:
    if not tool_results:
        return ""
    lines = []
    for i, tc in enumerate(tool_results, 1):
        ok = "OK  " if getattr(tc, "success", None) else "FAIL"
        ex = (getattr(tc, "content_excerpt", "") or "").replace("\n", " ").strip()[:600]
        lines.append(f"[{i:>2}] {getattr(tc, 'name', '?'):<16} {ok}  -> {ex}")
    return "\n".join(lines)
