# agent-evalkit

An open-source evaluation framework + dashboard for **AI agents that produce
files and call tools** — the kind of work where a plain string-match test
tells you nothing. Define a test set, run your agent over it, let an
LLM-as-judge score each case against a rubric, and read the results on a
leaderboard / per-test-set / report dashboard.

> **Status.** Both halves are runnable today: the **eval engine + CLI**
> (`evalkit/` + `adapters/`) and the **dashboard** (`dashboard/`). See
> [`DESIGN.md`](DESIGN.md) for the architecture and roadmap.
>
> **Demo data is synthetic.** Everything shipped under
> `dashboard/frontend/public/data/` is placeholder mock data — real model
> names but blank ("—") scores, generic "测试集 1 / test case 1" test
> content, and mock reports. Regenerate it any time with
> `python demo/generate_demo_data.py`.

## What's here

```
agent-evalkit/
├─ evalkit/            # the eval engine (loader · judge · scorer · leaderboard · pipeline · CLI)
├─ adapters/           # adapters: openai_chat (reference), mock (offline smoke test)
├─ benchmarks/         # your test sets — one folder per task (example_qa is included)
├─ dashboard/          # the eval dashboard
│  ├─ frontend/        # Next.js — leaderboard / live / test sets / compare / reports
│  └─ backend/         # FastAPI — file-driven API (one env var: EVALKIT_DASHBOARD_ROOT)
├─ demo/               # synthetic demo-data generator (for the dashboard)
├─ DESIGN.md           # full design (engine + adapter interface + roadmap)
└─ README.md
```

## Run an eval (CLI)

The framework runs a fixture through an **adapter** (you implement one
`async def run(...) -> RunRecord`), scores each result with an
LLM-as-judge against the task's rubric, and writes a leaderboard.

```bash
pip install -e .          # installs the `evalkit` command + deps

# Smoke-test the whole loop offline — no API key needed:
evalkit run --adapter mock --no-judge --model mock-model
evalkit leaderboard

# Real run against any OpenAI-compatible endpoint:
export OPENAI_API_KEY=sk-...
evalkit plan --model gpt-4o-mini                 # list what would run, no calls
evalkit run  --model gpt-4o-mini                 # run + judge + score
```

Outputs land under the data root (`--root` or `$EVALKIT_DASHBOARD_ROOT`,
default `.`) in exactly the layout the dashboard reads:
`benchmarks/leaderboard.json`, `artifacts/benchmarks/<run_id>/…`,
`reports/<run_id>/summary.json`. Point the dashboard backend at the same
root to see your run, or copy those files into
`dashboard/frontend/public/data/` for a static deploy.

### Write an adapter

```python
# mypkg/my_adapter.py
from evalkit.record import RunRecord

class MyAdapter:
    async def run(self, manifest, fixture, model_id) -> RunRecord:
        answer = await my_agent(fixture.prompt, files=fixture.files)
        return RunRecord(request_id=fixture.id, response_text=answer.text)
        # also fill tool_results / generated_files for tool- and file-tasks
```

```bash
evalkit run --adapter mypkg.my_adapter:MyAdapter --model my-agent
```

### Add a test set

A task is a folder under `benchmarks/<name>/` with `manifest.yaml`,
`fixtures.jsonl`, and `rubric.md` (+ optional `files/`). See
[`benchmarks/example_qa/`](benchmarks/example_qa/) for the shape.

The dashboard reads everything from a single data root and has **two
runtime modes**: a pure-static build (no backend) and a live backend that
serves your own evaluation artifacts. Pick whichever fits your deploy.

## Run the dashboard

### Option A — static (no backend)

The frontend ships a static fallback: with no backend reachable it reads
the bundled JSON under `public/data/`. Best for a public demo or any
read-only deploy.

```bash
cd dashboard/frontend
pnpm install
pnpm build            # static export → dashboard/frontend/out/
npx serve out         # or copy out/ to nginx / Caddy / any static host
```

Open the printed URL. To show *your* data instead of the demo, replace the
files under `public/data/` (same shape as the generator emits) before
`pnpm build`.

### Option B — live backend (serve your own eval artifacts)

Run the FastAPI backend pointed at a data root laid out like:

```
<root>/benchmarks/leaderboard.json
<root>/benchmarks/<task>/{fixtures.jsonl,rubric.md,files/}
<root>/reports/<run_id>/{summary.json,narrative.md}
<root>/artifacts/benchmarks/<run_id>/<task>/<fixture>.json
<root>/logs/run-many-<ts>/{plan.json,status.jsonl}
```

```bash
# backend
pip install -r dashboard/backend/requirements.txt
EVALKIT_DASHBOARD_ROOT=/path/to/your/eval-data \
  uvicorn dashboard.backend.routes:build_app --factory --port 8000

# frontend (dev mode proxies /api/dashboard → :8000)
cd dashboard/frontend && pnpm install && pnpm dev   # http://localhost:3001
```

The frontend auto-detects the backend; if it's up you get live data, if
not it falls back to the static bundle.

## Auth (optional)

The dashboard runs **fully open** by default. To gate a private deploy, set
Google sign-in env vars on the backend:

```bash
DASHBOARD_GOOGLE_CLIENT_ID=<your-oauth-client-id>
DASHBOARD_JWT_SECRET=<random-secret>
# optional allowlists (empty = any verified Google account):
DASHBOARD_ALLOWED_DOMAINS=example.com
DASHBOARD_ALLOWED_EMAILS=alice@example.com
```

With `DASHBOARD_GOOGLE_CLIENT_ID` unset, auth is off and every page is
anonymous read-only.

## Regenerate the demo data

```bash
python demo/generate_demo_data.py
```

Edit `demo/generate_demo_data.py` to change the model roster, test sets,
test cases, reports, or live snapshot.

## License

MIT — see [`LICENSE`](LICENSE).
