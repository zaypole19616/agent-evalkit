export interface LeaderboardRow {
  model: string
  score: number
  token_median: number
  // Median real per-conversation cost (USD), from the run's per-execution
  // estimated_total_cost_usd. Absent until a run's tokens are backfilled.
  cost_median_usd?: number | null
  tested_at: string
  run_id: string
  report_path: string
  stable: boolean
  run_started_at?: string
  // Test-set coverage: how many fixtures produced a valid score (n_scored)
  // vs the full test set for that task (n_full). When n_scored < n_full the
  // run did NOT cover the whole set (e.g. fixtures lost to the overlay bug),
  // and the dashboard flags it. Absent on rows written before this field.
  n_scored?: number
  n_full?: number
}

export interface Leaderboard {
  version: number
  updated_at: string
  tasks: Record<string, LeaderboardRow[]>
  global: Array<{
    model: string
    weighted_score: number
    tested_at: string
    run_id: string
    run_started_at?: string
  }>
}

export interface RunListItem {
  run_id: string
  model: string
  tested_at: string
  weighted_score: number
}

export interface TaskSummary {
  task: string
  score: number
  vs_baseline: number | null
  token_median: number
  vs_baseline_token_pct: number | null
  badcase_count: number
  hard_pass_rate: number
  regression_flag: boolean
  cost_median_usd?: number | null
}

export interface RunSummary {
  run_id: string
  model: string
  tasks: TaskSummary[]
  global: {
    weighted_score: number
    vs_baseline: number | null
    ship_verdict: 'SHIP' | 'NEEDS_ADAPTATION' | 'DO_NOT_SHIP' | string
    regression_tasks: string[]
  }
  cost_usd: number
}

export interface CaseListItem {
  fixture_id: string
  status: 'pass' | 'bad'
  elapsed_s: number | null
  tool_call_count: number | null
  response_chars: number
  judge_score?: number
  failure_class?: string
}

export interface CaseDetail extends CaseListItem {
  task: string
  run_id: string
  prompt: string | null
  expected_answer_intent: string | null
  attached_files: string[]
  response_text: string | null
  tool_results: unknown[]
  events: Array<{ event: string; t_ms: number }>
  generated_files: string[]
  diagnostic_markdown: string | null
}

export interface LiveTaskProgress {
  task: string
  total: number
  done: number
  latest_fixture_id: string | null
  latest_mtime: string | null
}

export type LiveCellStatus = 'done' | 'running' | 'pending' | 'failed'

export interface LiveCell {
  model: string
  task: string
  status: LiveCellStatus
  score?: number | null
  badcases?: number | null
  elapsed_s?: number | null
  started_at?: string | null
  timed_out?: boolean
  exit_code?: number | null
  progress?: {
    run_id: string | null
    done: number
    total: number
    latest_fixture_id: string | null
  }
}

export interface ChainStatus {
  mode: 'chain'
  chain_id: string
  chain_started_at: string | null
  models: string[]
  tasks: string[]
  order: string
  total_cells: number
  done_cells: number
  failed_cells: number
  running_cells: number
  pending_cells: number
  finished: boolean
  timeout_per_cell_s: number | null
  has_plan: boolean
  cells: LiveCell[]
}

export interface SingleRunStatus {
  mode: 'single'
  active_run_id: string | null
  model: string | null
  started_at: string | null
  tasks: LiveTaskProgress[]
}

export interface IdleStatus {
  mode: 'idle'
  active_run_id: null
  model: null
  started_at: null
  tasks: []
}

export type LiveStatus = ChainStatus | SingleRunStatus | IdleStatus

export interface BenchmarkIndex {
  task: string
  fixture_count: number
  has_files: boolean
  rubric_excerpt: string
}

export interface FixtureDef {
  id: string
  prompt: string
  expected_answer_intent: string | null
  files: Array<{ name: string; size: number; mime: string }>
  tags: string[]
}

export interface BenchmarkDetail {
  task: string
  rubric_markdown: string
  fixtures: FixtureDef[]
}

export type RunNotes = Record<string, string>

// ── Curated eval-report batches (eval-reports/<batch_id>/) ──────────────
export interface ReportBatchListItem {
  batch_id: string
  title: string
  date: string
  engine_version: string
  models: string[]
  report_count: number
}

export interface ReportEntry {
  type: 'overview' | 'model' | 'backlog'
  file: string
  title: string
  model?: string
}

export interface ReportManifest {
  batch_id: string
  title: string
  date: string
  engine_version: string
  judge?: string
  run_window_utc?: string
  gcs_bucket?: string
  models: string[]
  tasks: string[]
  run_ids: Record<string, Record<string, string>>
  reports: ReportEntry[]
}

// ── Run history (past campaigns reconstructed from the leaderboard) ─────
export interface ChainHistoryCell {
  model: string
  task: string
  score: number | null
  run_id: string
}

export interface ChainHistoryItem {
  started_at: string
  ended_at: string
  models: string[]
  tasks: string[]
  cell_count: number
  avg_score: number | null
  cells: ChainHistoryCell[]
}
