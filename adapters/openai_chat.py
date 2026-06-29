"""Reference adapter: run a fixture against any OpenAI-compatible chat
endpoint and return a RunRecord.

This is the simplest possible adapter — text in, text out. It demonstrates
the seam; richer adapters add tool-calling and file generation by filling
``tool_results`` / ``generated_files`` on the RunRecord.

Config (from ``manifest.runtime.adapter_config`` or env):
  - api_key   / OPENAI_API_KEY
  - base_url  / OPENAI_BASE_URL   (Azure / self-hosted gateway / OpenRouter)
  - system_prompt                 (optional, prepended as a system message)
  - price_per_1k_input / price_per_1k_output   (optional, to fill cost_usd)
"""

from __future__ import annotations

import asyncio
import os
import time
import uuid

from openai import OpenAI

from evalkit.models import BenchmarkFixture, BenchmarkManifest
from evalkit.record import RunRecord


class OpenAIChatAdapter:
    def __init__(self, config: dict | None = None):
        self.config = config or {}

    def _client(self, cfg: dict) -> OpenAI:
        api_key = cfg.get("api_key") or os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY not set (or api_key in adapter_config)")
        base_url = cfg.get("base_url") or os.environ.get("OPENAI_BASE_URL") or None
        return OpenAI(api_key=api_key, base_url=base_url)

    def _run_sync(self, cfg: dict, model_id: str, prompt: str) -> RunRecord:
        client = self._client(cfg)
        messages = []
        if cfg.get("system_prompt"):
            messages.append({"role": "system", "content": cfg["system_prompt"]})
        messages.append({"role": "user", "content": prompt})

        t0 = time.time()
        resp = client.chat.completions.create(model=model_id, messages=messages)
        elapsed_ms = int((time.time() - t0) * 1000)

        text = (resp.choices[0].message.content or "") if resp.choices else ""
        usage = getattr(resp, "usage", None)
        tokens = None
        if usage is not None:
            pt = getattr(usage, "prompt_tokens", 0) or 0
            ct = getattr(usage, "completion_tokens", 0) or 0
            tot = getattr(usage, "total_tokens", pt + ct) or (pt + ct)
            tokens = {"prompt": pt, "completion": ct, "total": tot}
            pin = cfg.get("price_per_1k_input")
            pout = cfg.get("price_per_1k_output")
            if pin is not None and pout is not None:
                tokens["cost_usd"] = round(pt / 1000 * pin + ct / 1000 * pout, 6)

        return RunRecord(
            request_id=str(uuid.uuid4()),
            response_text=text,
            ttfr_ms=elapsed_ms,  # non-streaming → first response == full response
            elapsed_ms=elapsed_ms,
            tokens=tokens,
        )

    async def run(
        self, manifest: BenchmarkManifest, fixture: BenchmarkFixture, model_id: str
    ) -> RunRecord:
        cfg = {**self.config, **(manifest.runtime.adapter_config or {})}
        return await asyncio.to_thread(self._run_sync, cfg, model_id, fixture.prompt)
