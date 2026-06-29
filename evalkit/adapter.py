"""The Adapter seam — the one abstraction that makes evalkit pluggable.

An adapter answers a single question: given a fixture (prompt + input
files) and a model id, produce a RunRecord. That's the only thing the
framework needs from "whatever runs the test". Everything else — loading
tasks, hard assertions, the LLM judge, scoring, the leaderboard — is the
framework's job and is adapter-agnostic.

Write your own by implementing ``async def run(...) -> RunRecord`` and
pointing the CLI at it with ``--adapter module:Class`` (or registering a
short name in ``BUILTIN_ADAPTERS``).
"""

from __future__ import annotations

import importlib
from typing import Protocol, runtime_checkable

from .models import BenchmarkFixture, BenchmarkManifest
from .record import RunRecord


@runtime_checkable
class Adapter(Protocol):
    async def run(
        self,
        manifest: BenchmarkManifest,
        fixture: BenchmarkFixture,
        model_id: str,
    ) -> RunRecord:
        ...


# Short names → "module:Class". Keeps the CLI ergonomic for built-ins while
# still allowing any "module:Class" path for user adapters.
BUILTIN_ADAPTERS: dict[str, str] = {
    "openai_chat": "adapters.openai_chat:OpenAIChatAdapter",
    "mock": "adapters.mock:MockAdapter",
}


def load_adapter(spec: str, adapter_config: dict | None = None) -> Adapter:
    """Resolve ``spec`` (a built-in short name or "module:Class") to an
    Adapter instance. The class is constructed with ``adapter_config`` if
    its __init__ accepts it, else with no args."""
    target = BUILTIN_ADAPTERS.get(spec, spec)
    if ":" not in target:
        raise ValueError(
            f"unknown adapter '{spec}'. Use a built-in "
            f"({', '.join(BUILTIN_ADAPTERS)}) or a 'module:Class' path."
        )
    mod_name, _, cls_name = target.partition(":")
    cls = getattr(importlib.import_module(mod_name), cls_name)
    try:
        return cls(adapter_config or {})
    except TypeError:
        return cls()
