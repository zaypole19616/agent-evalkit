# agent-evalkit dashboard

Next.js frontend + FastAPI backend for viewing evaluation results.
For install/run/deploy, see the [top-level README](../README.md). This file
documents the data contract.

## Data root

The backend reads everything from one directory, set via
`EVALKIT_DASHBOARD_ROOT` (default `/app`). Nothing else is required — no
database, no external services.

```
<root>/benchmarks/leaderboard.json                       # 总榜
<root>/benchmarks/<task>/{fixtures.jsonl,rubric.md,files/} # 测试集
<root>/reports/<run_id>/{summary.json,narrative.md,diagnostics/}  # 报告
<root>/artifacts/benchmarks/<run_id>/<task>/<fixture>.json # 逐题明细
<root>/logs/run-many-<ts>/{plan.json,status.jsonl}        # 实时跑测
```

## Static fallback

The frontend (`lib/api-client.ts`) probes the backend at
`/api/dashboard/auth/config`. If reachable it uses the live API; if not it
reads static JSON from `public/data/`:

```
public/data/leaderboard.json
public/data/notes.json
public/data/benchmarks/manifest.json
public/data/benchmarks/<task>/{fixtures.jsonl,rubric.md}
public/data/reports/index.json
public/data/reports/<batch>/{manifest.json,*.md}
public/data/live.json
public/data/history.json
```

This is what powers the no-backend static deploy. The bundled files are
synthetic demo data (see `demo/generate_demo_data.py`); swap them for your
own to ship a static dashboard of your real results.

## Backend entry point

```bash
EVALKIT_DASHBOARD_ROOT=/path/to/data \
  uvicorn dashboard.backend.routes:build_app --factory --port 8000
```

Routers live in `backend/` (leaderboard, runs, cases, live, benchmarks,
reports, history, notes, auth). The Claude narrative generator
(`narrative/`) is optional and only used by the reports endpoint.
