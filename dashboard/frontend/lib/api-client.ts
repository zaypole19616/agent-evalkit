import type {
  Leaderboard, RunListItem, RunSummary, CaseListItem, CaseDetail,
  LiveStatus, BenchmarkIndex, BenchmarkDetail, FixtureDef, RunNotes,
  ReportBatchListItem, ReportManifest,
  ChainHistoryItem,
} from './types'
import { clearStoredToken, readStoredToken } from './auth-context'

export class BackendRequiredError extends Error {
  constructor(feature: string) {
    super(`${feature} requires the backend daemon`)
    this.name = 'BackendRequiredError'
  }
}

let _backendAvailable: Promise<boolean> | null = null

async function probeBackend(): Promise<boolean> {
  if (_backendAvailable) return _backendAvailable
  _backendAvailable = (async () => {
    try {
      // ``/auth/config`` is unauthenticated and returns 200 whenever the
      // backend is reachable — regardless of whether the JWT is set —
      // so it's the safe probe for "is there a daemon to talk to".
      const r = await fetch('/api/dashboard/auth/config', {
        signal: AbortSignal.timeout(2000),
        cache: 'no-store',
      })
      return r.ok
    } catch {
      return false
    }
  })()
  return _backendAvailable
}

function authHeaders(): HeadersInit {
  const t = readStoredToken()
  return t ? { authorization: `Bearer ${t}` } : {}
}

// Redirect to /login on 401 — token expired or revoked. Skip the redirect
// when we're already on the login page (avoid an infinite loop while the
// user is mid-sign-in and a probe call returns 401).
function handle401(): void {
  if (typeof window === 'undefined') return
  if (window.location.pathname.startsWith('/login')) return
  clearStoredToken()
  window.location.href = '/login/'
}

async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(path, { cache: 'no-store', headers: authHeaders() })
  if (r.status === 401) {
    handle401()
    throw new Error(`${path} → 401`)
  }
  if (!r.ok) throw new Error(`${path} → ${r.status}`)
  return r.json()
}

async function getText(path: string): Promise<string> {
  const r = await fetch(path, { cache: 'no-store', headers: authHeaders() })
  if (r.status === 401) {
    handle401()
    throw new Error(`${path} → 401`)
  }
  if (!r.ok) throw new Error(`${path} → ${r.status}`)
  return r.text()
}

function parseJsonl<T>(text: string): T[] {
  return text.split('\n').filter(l => l.trim()).map(l => JSON.parse(l) as T)
}

export const api = {
  leaderboard: async (): Promise<Leaderboard> => {
    if (await probeBackend()) return getJson('/api/dashboard/leaderboard')
    return getJson('/data/leaderboard.json')
  },
  runs: async (): Promise<RunListItem[]> => {
    if (await probeBackend()) return getJson('/api/dashboard/runs')
    throw new BackendRequiredError('Run list')
  },
  summary: async (id: string): Promise<RunSummary> => {
    if (await probeBackend()) return getJson(`/api/dashboard/runs/${encodeURIComponent(id)}/summary`)
    throw new BackendRequiredError('Run summary')
  },
  narrative: async (id: string): Promise<{ markdown: string }> => {
    if (await probeBackend()) return getJson(`/api/dashboard/runs/${encodeURIComponent(id)}/narrative`)
    throw new BackendRequiredError('Narrative')
  },
  cases: async (id: string, task: string): Promise<CaseListItem[]> => {
    if (await probeBackend()) return getJson(`/api/dashboard/runs/${encodeURIComponent(id)}/tasks/${task}/cases`)
    throw new BackendRequiredError('Cases')
  },
  caseDetail: async (id: string, task: string, fx: string): Promise<CaseDetail> => {
    if (await probeBackend()) return getJson(`/api/dashboard/runs/${encodeURIComponent(id)}/tasks/${task}/cases/${fx}`)
    throw new BackendRequiredError('Case detail')
  },
  live: async (): Promise<LiveStatus> => {
    if (await probeBackend()) return getJson('/api/dashboard/live')
    try {
      return await getJson<LiveStatus>('/data/live.json')
    } catch {
      return { mode: 'idle', active_run_id: null, model: null, started_at: null, tasks: [] }
    }
  },
  benchmarks: async (): Promise<BenchmarkIndex[]> => {
    if (await probeBackend()) return getJson('/api/dashboard/benchmarks')
    return getJson('/data/benchmarks/manifest.json')
  },
  notes: async (): Promise<RunNotes> => {
    if (await probeBackend()) return getJson('/api/dashboard/notes')
    try {
      return await getJson<RunNotes>('/data/notes.json')
    } catch {
      return {}
    }
  },
  note: async (runId: string): Promise<{ markdown: string }> => {
    if (await probeBackend()) return getJson(`/api/dashboard/runs/${encodeURIComponent(runId)}/note`)
    const all = await api.notes().catch(() => ({} as RunNotes))
    return { markdown: all[runId] ?? '' }
  },
  benchmark: async (task: string): Promise<BenchmarkDetail> => {
    if (await probeBackend()) return getJson(`/api/dashboard/benchmarks/${task}`)
    const [rubric, fxText] = await Promise.all([
      getText(`/data/benchmarks/${task}/rubric.md`),
      getText(`/data/benchmarks/${task}/fixtures.jsonl`),
    ])
    const raw = parseJsonl<{
      id: string; prompt?: string; expected_answer_intent?: string | null;
      files?: string[]; tags?: string[];
    }>(fxText)
    const fixtures: FixtureDef[] = raw.map(d => ({
      id: d.id, prompt: d.prompt ?? '',
      expected_answer_intent: d.expected_answer_intent ?? null,
      files: (d.files ?? []).map(name => ({ name, size: 0, mime: 'application/octet-stream' })),
      tags: d.tags ?? [],
    }))
    return { task, rubric_markdown: rubric, fixtures }
  },
  reportBatches: async (): Promise<ReportBatchListItem[]> => {
    if (await probeBackend()) return getJson('/api/dashboard/reports')
    try {
      return await getJson<ReportBatchListItem[]>('/data/reports/index.json')
    } catch {
      return []
    }
  },
  reportManifest: async (batchId: string): Promise<ReportManifest> => {
    if (await probeBackend()) return getJson(`/api/dashboard/reports/${encodeURIComponent(batchId)}`)
    return getJson(`/data/reports/${encodeURIComponent(batchId)}/manifest.json`)
  },
  reportMarkdown: async (batchId: string, file: string): Promise<{ markdown: string }> => {
    if (await probeBackend()) {
      return getJson(`/api/dashboard/reports/${encodeURIComponent(batchId)}/${encodeURIComponent(file)}`)
    }
    const md = await getText(`/data/reports/${encodeURIComponent(batchId)}/${encodeURIComponent(file)}`)
    return { markdown: md }
  },
  history: async (): Promise<ChainHistoryItem[]> => {
    if (await probeBackend()) return getJson('/api/dashboard/history')
    try {
      return await getJson<ChainHistoryItem[]>('/data/history.json')
    } catch {
      return []
    }
  },
}
