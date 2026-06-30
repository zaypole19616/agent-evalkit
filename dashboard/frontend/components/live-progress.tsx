'use client'

// /live page renderer. Three modes from the backend:
//   - chain   — full model × task matrix (the common case once run-many
//               is in use). Rendered as a table: rows = models, columns =
//               tasks, each cell colored by status with score (done) or
//               progress (running) inline.
//   - single  — legacy single-run ad-hoc invocation; per-task progress bars.
//   - idle    — nothing running; show empty state.

import useSWR from 'swr'
import { api } from '@/lib/api-client'
import { taskLabel, groupTasksByCategory } from '@/lib/task-meta'
import { modelDisplayName } from '@/lib/model-meta'
import { useT } from '@/lib/i18n'
import type { LiveCell, LiveStatus } from '@/lib/types'

// Sort task slugs into the canonical 生成类→检索类 order so the chain
// matrix columns line up with /models/<X>/ history (same order is enforced
// runner-side in ``run_many.cmd_run_many``).
function orderTasks(tasks: string[]): string[] {
  return groupTasksByCategory(tasks).flatMap((g) => g.tasks)
}

export function LiveProgress() {
  const t = useT()
  const { data, error } = useSWR<LiveStatus>('live', () => api.live(), { refreshInterval: 5000 })
  if (error) return <p className="text-sm text-slate-700">{t('暂时无法加载实时状态，请稍后刷新。', 'Unable to load live status, please refresh later.')}</p>
  if (!data) return <p className="text-slate-700">{t('加载中…', 'Loading…')}</p>
  if (data.mode === 'chain') return <ChainView data={data} />
  if (data.mode === 'single') return <SingleView data={data} />
  return <IdleView />
}

function IdleView() {
  const t = useT()
  return (
    <div className="panel p-10 text-center">
      <div className="inline-flex items-center gap-2 text-slate-700 text-sm">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-500" />
        {t('当前没有正在跑的测试', 'Nothing running right now')}
      </div>
      <p className="text-xs text-slate-500 mt-2">{t('触发一条 chain 后这里会自动渲染矩阵', 'trigger a chain and the matrix renders here')}</p>
    </div>
  )
}

function ChainView({ data }: { data: Extract<LiveStatus, { mode: 'chain' }> }) {
  const t = useT()
  const cellMap = new Map<string, LiveCell>()
  for (const c of data.cells) cellMap.set(`${c.model}::${c.task}`, c)
  // Canonical column order — match /models/<X>/ history regardless of
  // what the chain runner declared in plan.json.
  const orderedTasks = orderTasks(data.tasks)

  const settled = data.done_cells + data.failed_cells
  const overallPct = data.total_cells ? Math.round((settled / data.total_cells) * 100) : 0

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="panel p-5 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          {data.finished ? (
            <span className="chip-emerald">{t('已完成', 'Done')}</span>
          ) : (
            <span className="chip-cyan inline-flex items-center gap-1.5">
              <span className="relative inline-flex w-2 h-2">
                <span className="absolute inset-0 rounded-full bg-cyan-400 animate-pulse-soft" />
              </span>
              {t('进行中', 'In progress')}
            </span>
          )}
          <span className="font-mono text-xs text-slate-700">{data.chain_id}</span>
          {data.chain_started_at && (
            <span className="text-xs text-slate-500 font-mono">
              · started {new Date(data.chain_started_at).toISOString().slice(11, 19)} UTC
            </span>
          )}
        </div>

        <div className="flex items-baseline gap-4 flex-wrap text-sm">
          <StatPill label="cells" value={`${settled}/${data.total_cells}`} accent="text-slate-900" />
          <StatPill label="done" value={data.done_cells} accent="text-emerald-700" />
          {data.running_cells > 0 && (
            <StatPill label="running" value={data.running_cells} accent="text-indigo-700" />
          )}
          {data.pending_cells > 0 && (
            <StatPill label="pending" value={data.pending_cells} accent="text-slate-700" />
          )}
          {data.failed_cells > 0 && (
            <StatPill label="failed" value={data.failed_cells} accent="text-rose-700" />
          )}
        </div>

        <div className="relative h-1.5 bg-slate-100 rounded overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-accent-gradient rounded transition-all duration-500"
            style={{ width: `${overallPct}%` }}
          />
        </div>

        {!data.has_plan && (
          <p className="text-xs text-amber-700/90 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            {t('这条 chain 启动时 runner 还没写 plan.json，无法枚举 pending cells；只展示已完成 + 当前运行中。下次新启 chain 即可看到完整矩阵。', 'When this chain started the runner had not written plan.json yet, so pending cells cannot be enumerated; only done + currently running are shown. Start a new chain to see the full matrix.')}
          </p>
        )}
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
              <th className="text-left p-3 sticky left-0 bg-white/95 backdrop-blur whitespace-nowrap z-10">{t('模型', 'Model')}</th>
              {orderedTasks.map((t) => (
                <th key={t} className="text-center p-3 whitespace-nowrap font-medium">
                  {taskLabel(t)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.models.map((m) => (
              <tr key={m} className="border-t border-slate-200/80">
                <td className="p-3 sticky left-0 bg-white/95 backdrop-blur font-medium text-slate-900 whitespace-nowrap z-10">
                  {modelDisplayName(m)}
                </td>
                {orderedTasks.map((t) => (
                  <td key={t} className="p-1.5 align-middle min-w-[110px]">
                    <CellTile cell={cellMap.get(`${m}::${t}`)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-4 text-xs text-slate-700 flex-wrap pt-1">
        <Legend dot="bg-emerald-400 shadow-glow-emerald" label={t('已完成 · 分数', 'Done · score')} />
        <Legend dot="bg-cyan-400 shadow-glow-cyan animate-pulse-soft" label={t('运行中 · done/total', 'Running · done/total')} />
        <Legend dot="bg-slate-500" label={t('待跑', 'Pending')} />
        <Legend dot="bg-rose-400" label={t('失败 / 超时', 'Failed / Timeout')} />
      </div>
    </div>
  )
}

function StatPill({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className={`font-mono text-base font-semibold ${accent}`}>{value}</span>
      <span className="text-[11px] text-slate-500 uppercase tracking-wider">{label}</span>
    </span>
  )
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />
      {label}
    </span>
  )
}

function CellTile({ cell }: { cell: LiveCell | undefined }) {
  const t = useT()
  if (!cell) return <div className="text-center text-xs text-slate-700">—</div>

  if (cell.status === 'done') {
    return (
      <div className="text-center bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1.5 transition-all hover:border-emerald-400 hover:shadow-glow-emerald">
        <div className="font-mono font-semibold text-emerald-700 text-sm">
          {cell.score == null ? '—' : cell.score.toFixed(2)}
        </div>
        <div className="text-[10px] text-emerald-600/70 font-mono">
          {cell.badcases != null && `${cell.badcases} bad · `}
          {cell.elapsed_s != null && `${Math.round(cell.elapsed_s)}s`}
        </div>
      </div>
    )
  }

  if (cell.status === 'failed') {
    return (
      <div className="text-center bg-rose-50 border border-rose-200 rounded-md px-2 py-1.5">
        <div className="font-mono font-semibold text-rose-700 text-sm">
          {cell.timed_out ? 'TIMEOUT' : cell.score == null ? `exit ${cell.exit_code ?? '?'}` : cell.score.toFixed(2)}
        </div>
        <div className="text-[10px] text-rose-600/70 font-mono">
          {cell.elapsed_s != null && `${Math.round(cell.elapsed_s)}s`}
        </div>
      </div>
    )
  }

  if (cell.status === 'running') {
    const p = cell.progress
    const pct = p && p.total ? Math.min(100, (p.done / p.total) * 100) : 0
    return (
      <div className="text-center bg-cyan-50 border border-cyan-300 rounded-md px-2 py-1.5 shadow-glow-cyan animate-breathe">
        <div className="flex items-center justify-center gap-1.5">
          <span className="relative inline-flex w-1.5 h-1.5">
            <span className="absolute inset-0 rounded-full bg-cyan-400 animate-pulse-soft" />
          </span>
          <span className="font-mono text-cyan-700 text-xs font-semibold">
            {p ? `${p.done}/${p.total}` : t('运行中', 'Running')}
          </span>
        </div>
        <div className="h-1 bg-cyan-100 rounded mt-1 overflow-hidden">
          <div className="h-1 bg-cyan-400 rounded transition-all duration-700" style={{ width: `${pct}%` }} />
        </div>
      </div>
    )
  }

  return (
    <div className="text-center bg-slate-50 border border-slate-300 rounded-md px-2 py-1.5">
      <div className="text-xs text-slate-500">{t('待跑', 'Pending')}</div>
    </div>
  )
}

function SingleView({ data }: { data: Extract<LiveStatus, { mode: 'single' }> }) {
  if (!data.active_run_id) return <IdleView />
  const order = orderTasks(data.tasks.map((t) => t.task))
  const taskByName = new Map(data.tasks.map((t) => [t.task, t] as const))
  const sortedTasks = order.map((n) => taskByName.get(n)).filter((v): v is NonNullable<typeof v> => v != null)
  return (
    <div className="space-y-4 animate-fade-in">
      <div className="panel p-5">
        <h2 className="text-xl font-semibold text-slate-900">{modelDisplayName(data.model ?? '')}</h2>
        <p className="text-sm text-slate-700 mt-1 font-mono">
          Run <span className="text-slate-700">{data.active_run_id}</span> · started{' '}
          {data.started_at && new Date(data.started_at).toISOString().slice(11, 19)} UTC
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {sortedTasks.map((t) => (
          <div key={t.task} className="panel p-4">
            <div className="flex justify-between text-sm mb-1.5">
              <span className="font-semibold text-slate-900">{taskLabel(t.task)}</span>
              <span className="text-slate-700 font-mono">{t.done}/{t.total}</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded overflow-hidden">
              <div
                className="h-1.5 bg-accent-gradient rounded transition-all duration-500"
                style={{ width: t.total ? `${Math.min(100, (t.done / t.total) * 100)}%` : '0%' }}
              />
            </div>
            <p className="text-xs text-slate-500 mt-1.5 font-mono truncate">{t.latest_fixture_id ?? '—'}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
