"""Mock adapter — returns a canned response with no network calls.

Use it to smoke-test the pipeline end to end without any API key:

    evalkit run --adapter mock --no-judge --model mock-model

It's also the minimal example of the Adapter contract: take a fixture,
return a RunRecord.
"""

from __future__ import annotations

import uuid

from evalkit.models import BenchmarkFixture, BenchmarkManifest
from evalkit.record import RunRecord


class MockAdapter:
    def __init__(self, config: dict | None = None):
        self.config = config or {}

    async def run(
        self, manifest: BenchmarkManifest, fixture: BenchmarkFixture, model_id: str
    ) -> RunRecord:
        text = (
            f"[mock:{model_id}] response to fixture {fixture.id}. "
            f"Prompt was: {fixture.prompt[:200]}"
        )
        return RunRecord(
            request_id=str(uuid.uuid4()),
            response_text=text,
            ttfr_ms=1,
            elapsed_ms=1,
            tokens={"prompt": 10, "completion": 20, "total": 30, "cost_usd": 0.0},
        )
