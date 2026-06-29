"""RunRecord — the standard result contract an Adapter returns.

This is the seam between the framework and whatever actually runs a test
case. The framework (judge / scorer / report) only ever reads a RunRecord;
it neither knows nor cares whether the result came from an OpenAI call, a
local agent, or a remote product API.

Shape is product-agnostic on purpose. Anything provider-specific an adapter
wants to keep (conversation ids, raw event payloads, ...) goes in ``raw``,
which the framework does not read.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class ToolCallObservation:
    """One tool invocation the agent made during the run.

    ``content_excerpt`` is the head of the tool result — enough for a judge
    to tell a successful "Wrote file X" from "Error: ..." without dragging
    multi-megabyte payloads into the prompt.
    """

    name: str
    success: bool | None = None
    content_excerpt: str = ""
    t_ms: int = 0


@dataclass
class GeneratedFile:
    """A file the agent produced. For file-generation tasks this — not the
    text narration — is the real answer, so surface it to the judge."""

    path: str = ""          # logical path / name
    url: str = ""           # hosting URL if any
    local_path: str = ""    # on-disk path the judge can open, if downloaded
    raw: dict = field(default_factory=dict)


@dataclass
class RunRecord:
    """Everything an assertion or judge needs about one fixture run."""

    request_id: str
    response_text: str = ""
    tool_results: list[ToolCallObservation] = field(default_factory=list)
    generated_files: list[GeneratedFile] = field(default_factory=list)
    tool_call_count: int = 0
    ttfr_ms: int | None = None          # time to first response token (ms)
    elapsed_ms: int | None = None       # total wall-clock (ms)
    tokens: dict | None = None          # {prompt, completion, total, cost_usd?}
    events: list[dict] = field(default_factory=list)  # optional debug trace
    raw: dict = field(default_factory=dict)           # adapter-specific extras

    def to_dict(self) -> dict:
        return {
            "request_id": self.request_id,
            "response_text": self.response_text,
            "tool_results": [
                {
                    "name": t.name,
                    "success": t.success,
                    "content_excerpt": t.content_excerpt,
                    "t_ms": t.t_ms,
                }
                for t in self.tool_results
            ],
            "generated_files": [
                {"path": g.path, "url": g.url, "local_path": g.local_path}
                for g in self.generated_files
            ],
            "tool_call_count": self.tool_call_count,
            "ttfr_ms": self.ttfr_ms,
            "elapsed_ms": self.elapsed_ms,
            "tokens": self.tokens,
            "events": self.events,
        }
