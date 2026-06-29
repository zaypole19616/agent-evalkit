# agent-evalkit — architecture

How the pieces fit together and why. For install/run, see
[`README.md`](README.md).

## Philosophy: one seam

Evaluating an agent that **produces files and calls tools** can't be done
with string matching — the real answer is a generated spreadsheet, a tool
trace, a multi-paragraph response. agent-evalkit evaluates these with an
**LLM-as-judge against a rubric**, and keeps the whole thing pluggable
behind a single abstraction:

```python
class Adapter(Protocol):
    async def run(self, manifest, fixture, model_id) -> RunRecord: ...
```

The framework (loader · judge · scorer · leaderboard · pipeline) only ever
reads a `RunRecord`. It neither knows nor cares whether the result came
from an OpenAI call, a local agent, or a remote product API. To evaluate
*your* system you write one adapter; everything else is reused.

## The result contract: `RunRecord`

What an adapter returns ([`evalkit/record.py`](evalkit/record.py)). Shape is
product-agnostic; provider-specific extras go in `raw`, which the framework
ignores.

| Field | Meaning |
|---|---|
| `response_text` | the agent's text answer (required for text tasks) |
| `tool_results` | tool calls observed (name / success / excerpt) |
| `generated_files` | files the agent produced (the real answer for file tasks) |
| `tool_call_count`, `ttfr_ms`, `elapsed_ms`, `tokens` | metrics |

A text-only adapter only needs `response_text`. `tool_results` /
`generated_files` are how you light up tool- and file-generation tasks.

## Task format

A task is a folder under `benchmarks/<name>/`:

```
manifest.yaml    metadata + runtime + scoring + assertions + judge config
fixtures.jsonl   one JSON object per line — the test cases
rubric.md        scoring guide injected into the judge system prompt
files/           optional attachments referenced by fixtures[*].files
```

`manifest.runtime.adapter_config` is an opaque dict handed verbatim to the
adapter — put adapter-specific settings (base_url, account ids, working
dir, pricing) there. The framework never reads it.

## Engine data flow (`evalkit run`)

```
loader      benchmarks/<task>/  → manifest + fixtures
pipeline    run each fixture under a concurrency semaphore (timeout + retry)
              └─ adapter.run(manifest, fixture, model) → RunRecord   ← the seam
            → artifacts/benchmarks/<run_id>/<task>/<fixture>.json
assertions  pure structural checks (min chars, tool-loop guard)
judge       prompt + response + tool trace + rubric → LLM → 0–N score + reason
scorer      FixtureScore[] → TaskSummary (mean, p95, badcases, vs baseline)
leaderboard upsert benchmarks/leaderboard.json + a per-run summary.json
```

Only the adapter step is system-specific. Everything else is pure logic or
a generic LLM call.

## Module map (`evalkit/`)

| Module | Role |
|---|---|
| `record.py` | the `RunRecord` contract |
| `models.py` | manifest / fixture value objects |
| `loader.py` | YAML/JSONL → dataclasses |
| `adapter.py` | the `Adapter` protocol + resolution (`name` or `module:Class`) |
| `assertions.py` | pure hard checks |
| `judge.py` | LLM-as-judge (OpenAI-compatible; strict structured output) |
| `scorer.py` | aggregation, p95, ship verdict |
| `leaderboard.py` | `leaderboard.json` read/write/render |
| `pipeline.py` | per-task concurrent orchestration |
| `runner.py` | end-to-end: run → judge → score → write |
| `cli.py` | `run` / `plan` / `leaderboard` |

Reference adapters live in `adapters/`: `openai_chat` (any OpenAI-compatible
endpoint) and `mock` (offline smoke test).

## Dashboard

A Next.js + FastAPI dashboard reads the engine's output. It is **fully
file-driven** — one env var, `EVALKIT_DASHBOARD_ROOT`, no database — and the
frontend has a **dual mode**: it probes the backend and, if absent, falls
back to static JSON under `public/data/`. So the same build serves a live
backend *or* a pure-static deploy. Data layout and deploy modes are in
[`dashboard/README.md`](dashboard/README.md) and [`README.md`](README.md).

### Engine ↔ dashboard

`evalkit run` writes to the data root in exactly the layout the dashboard
reads:

```
benchmarks/leaderboard.json
artifacts/benchmarks/<run_id>/<task>/<fixture>.json
reports/<run_id>/summary.json
```

Run `evalkit --root /data run …`, then point the dashboard backend at the
same `/data` — your run shows up. For a static deploy, copy those files
into `dashboard/frontend/public/data/`.

## Extending

- **New target** → write an `Adapter` (`async def run → RunRecord`) and pass
  `--adapter module:Class`.
- **New test set** → add `benchmarks/<name>/` with manifest + fixtures +
  rubric. See [`benchmarks/example_qa/`](benchmarks/example_qa/).
- **Different judge backend** → set `OPENAI_BASE_URL` to any OpenAI-shape
  gateway, and `judge.model` in the manifest.

## Roadmap

- Richer reference adapters (tool-calling + file generation end to end).
- HTML report export from the engine.
- Multi-model matrix runs feeding the dashboard's live view.
