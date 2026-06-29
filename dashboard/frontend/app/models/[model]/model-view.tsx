'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { api } from '@/lib/api-client'
import { useRouteId } from '@/lib/use-route-id'
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { taskLabel, groupTasksByCategory } from '@/lib/task-meta'
import { modelDisplayName } from '@/lib/model-meta'
import { OutwardTick } from '@/components/radar-tick'
import { computeChainCategoryCost, computeCostByModel, computeWeightedByModel } from '@/lib/score'

export default function ModelView() {
  const model = useRouteId('model')
  const { data, isLoading, error } = useSWR('leaderboard', () => api.leaderboard())
  const { data: bench } = useSWR('benchmarks', () => api.benchmarks())
  const { data: notes } = useSWR('notes', () => api.notes())

  if (isLoading) return <p className="text-slate-700">加载中…</p>
  if (error) return <p className="text-rose-400">加载失败：{String(error)}</p>
  if (!data) return null

  const runs = data.global
    .filter((r) => r.model === model)
    .sort((a, b) => b.tested_at.localeCompare(a.tested_at))

  if (runs.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">{modelDisplayName(model)}</h2>
        <p className="text-sm text-slate-700">未找到该模型的跑测记录。</p>
        <p><Link href="/leaderboard" className="text-indigo-600 hover:text-indigo-700">← 回到总榜</Link></p>
      </div>
    )
  }

  // Source of truth for "which tasks exist on the platform" = benchmarks
  // endpoint. Union with leaderboard.json tasks for backward safety.
  // Radar + history columns enumerate all of these, with score=null
  // (→ '—' / 0 in radar axis) when this model hasn't run that task.
  const benchTaskNames = (bench ?? []).map((b) => b.task)
  const allTasks = Array.from(new Set([...benchTaskNames, ...Object.keys(data.tasks)]))

  // Real cross-task weighted for *this* model — overrides the per-cell
  // value the chain runner writes (see ``lib/score.ts``).
  const trueWeightedForModel = computeWeightedByModel(data.tasks).get(model) ?? null
  // Per-model cost split by task category (生成/检索). One mixed number
  // is meaningless — generation tasks cost ~100x retrieval. See the
  // shape in ``lib/score.ts``. ``null`` until at least one task in the
  // matching category has a backfilled cost (→ "—" for that side).
  const costForModel = computeCostByModel(data.tasks).get(model) ?? null

  // Each leaderboard ``global`` entry is ONE (model, task) cell — the chain
  // runner emits a separate run_id per task. Map each cell to its single
  // task score first…
  const cellRows = runs.map((run) => {
    const taskScores: Record<string, number | null> = {}
    const taskCosts: Record<string, number | null> = {}
    const taskCoverage: Record<string, { n_scored: number; n_full: number } | null> = {}
    for (const t of allTasks) {
      const rows = data.tasks[t] ?? []
      const match = rows.find((x) => x.run_id === run.run_id)
      taskScores[t] = match ? match.score : null
      // per-fixture-median cost for this cell — surfaces in both the
      // history task cells (score / cost stack) and the per-task cost
      // trend chart below the radar.
      taskCosts[t] = match?.cost_median_usd ?? null
      // Coverage — n_scored/n_full. Flags a cell whose score is computed over
      // fewer than the full test set (fixtures lost to the overlay bug, etc.).
      taskCoverage[t] =
        match && match.n_scored != null && match.n_full != null
          ? { n_scored: match.n_scored, n_full: match.n_full }
          : null
    }
    return { ...run, taskScores, taskCosts, taskCoverage }
  })

  // …then regroup those per-task cells into campaigns ("chains"). The runner
  // fires a chain's cells back-to-back, so a gap > 6h between consecutive
  // cells marks a separate campaign (mirrors the backend /history grouping;
  // longest single cell ~3h). A chain row carries ALL its tasks at once — so
  // the radar spans every task and the history shows one row per run, not 8
  // single-task rows.
  const GAP_MS = 6 * 3600 * 1000
  type ChainRow = {
    tested_at: string
    taskScores: Record<string, number | null>
    taskCosts: Record<string, number | null>
    taskCoverage: Record<string, { n_scored: number; n_full: number } | null>
    runIdByTask: Record<string, string>
    weighted: number
  }
  const ascCells = [...cellRows].sort((a, b) => a.tested_at.localeCompare(b.tested_at))
  const chainRows: ChainRow[] = []
  let _lastMs = -Infinity
  for (const r of ascCells) {
    const t = Date.parse(r.tested_at)
    if (chainRows.length === 0 || t - _lastMs > GAP_MS) {
      chainRows.push({ tested_at: r.tested_at, taskScores: {}, taskCosts: {}, taskCoverage: {}, runIdByTask: {}, weighted: 0 })
    }
    _lastMs = t
    const c = chainRows[chainRows.length - 1]
    c.tested_at = r.tested_at // chain's latest cell
    for (const tk of allTasks) {
      if (r.taskScores[tk] != null) {
        c.taskScores[tk] = r.taskScores[tk]
        c.runIdByTask[tk] = r.run_id
        c.taskCoverage[tk] = r.taskCoverage[tk]
      }
      if (r.taskCosts[tk] != null) c.taskCosts[tk] = r.taskCosts[tk]
    }
  }
  for (const c of chainRows) {
    const vals = allTasks.map((t) => c.taskScores[t]).filter((v): v is number => v != null)
    c.weighted = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
  }
  chainRows.reverse() // newest first

  const latestRow = chainRows[0]
  const groups = groupTasksByCategory(allTasks)
  // Order radar axes by category so 生成类 sits together and 检索类 sits
  // together — visually groups related tasks instead of shuffling them.
  const orderedTasks = groups.flatMap((g) => g.tasks)

  // A chain is "complete" when it has a score for every known task. Partial
  // chains (e.g. a one-off recall re-run) get hidden from radar + trend so
  // 0-axes for unmeasured tasks don't drag the polygon flat or skew the
  // line. They still appear in the history table below — that's the place
  // for raw run-by-run facts.
  const completeChains = chainRows.filter((c) =>
    allTasks.every((t) => c.taskScores[t] != null),
  )
  const radarRow = completeChains[0] ?? null
  const radarData = radarRow
    ? orderedTasks.map((t) => ({ task: taskLabel(t), score: radarRow.taskScores[t] ?? 0 }))
    : []
  const trendData = [...completeChains].reverse().map((c) => ({
    label: c.tested_at.slice(5, 10),
    weighted: Number(c.weighted.toFixed(3)),
  }))

  // Per-category cost trend — one summed line per category per chain.
  // 8-line per-task version was visually noisy and obscured the "is total
  // chain cost moving up or down" answer the user actually wanted. Now:
  // two side-by-side panels (生成 / 检索), each a single line that's the
  // SUM of that category's task costs in that chain.
  //
  // Partial chains (category coverage < total) → ``null`` so the line
  // doesn't dip on missing-backfill data and read as "got cheaper"; the
  // panel header surfaces N/total covered chains so the gap isn't silent.
  // ``connectNulls`` keeps the line continuous over the gaps.
  const categoryCostTrend = [...chainRows].reverse().map((c) => {
    const cc = computeChainCategoryCost(c.runIdByTask, data.tasks)
    const sumIfFull = (cat: { mean: number | null; covered: number; total: number } | undefined) => {
      if (!cat || cat.mean == null || cat.covered < cat.total) return null
      return Number((cat.mean * cat.covered).toFixed(4))
    }
    return {
      label: c.tested_at.slice(5, 10),
      generation: sumIfFull(cc?.generation),
      retrieval: sumIfFull(cc?.retrieval),
    }
  })
  const genCoverage = categoryCostTrend.filter((r) => r.generation != null).length
  const retCoverage = categoryCostTrend.filter((r) => r.retrieval != null).length

  return (
    <div className="space-y-8 animate-fade-in">
      <header>
        <Link
          href="/leaderboard"
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-700 transition-colors mb-3"
        >
          <span aria-hidden>←</span> 总榜
        </Link>
        <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">
          {modelDisplayName(model)}
        </h1>
        <p className="text-sm text-slate-700 mt-2 font-mono">
          {model} · 共 {chainRows.length} 次跑测 · 完整轮次{' '}
          <span className="text-slate-900 font-semibold">{completeChains.length}</span>
          {radarRow && (
            <>
              {' · 加权分 '}
              <span className="text-indigo-700 font-semibold">
                {(trueWeightedForModel ?? radarRow.weighted).toFixed(3)}
              </span>
            </>
          )}
          {' · 生成均价 '}
          <span
            className="text-slate-900 font-semibold"
            title="生成类任务的平均单次成本（mean of html_gen, html_gen_doc, md_gen, pdf_docx_gen, pptx_gen, xlsx_gen 的 cost_median_usd）"
          >
            {costForModel?.generation.mean != null
              ? `$${costForModel.generation.mean.toFixed(4)}`
              : '—'}
            {costForModel?.generation.mean != null &&
              costForModel.generation.covered < costForModel.generation.total && (
                <span
                  aria-hidden
                  className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 align-middle ml-1"
                  title={`仅含 ${costForModel.generation.covered}/${costForModel.generation.total} 个生成任务的成本`}
                />
              )}
          </span>
          {' · 检索均价 '}
          <span
            className="text-slate-900 font-semibold"
            title="检索类任务的平均单次成本（mean of recall, search 的 cost_median_usd）"
          >
            {costForModel?.retrieval.mean != null
              ? `$${costForModel.retrieval.mean.toFixed(4)}`
              : '—'}
            {costForModel?.retrieval.mean != null &&
              costForModel.retrieval.covered < costForModel.retrieval.total && (
                <span
                  aria-hidden
                  className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 align-middle ml-1"
                  title={`仅含 ${costForModel.retrieval.covered}/${costForModel.retrieval.total} 个检索任务的成本`}
                />
              )}
          </span>
        </p>
      </header>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="panel p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="section-eyebrow">最近完整轮次 · 雷达 (0–5)</h3>
            {radarRow && (
              <span className="chip-violet">{(trueWeightedForModel ?? radarRow.weighted).toFixed(3)}</span>
            )}
          </div>
          <div className="w-full h-80">
            {!radarRow ? (
              <div className="h-full flex items-center justify-center text-sm text-slate-500 px-6 text-center">
                还没有覆盖全 {allTasks.length} 个任务的完整轮次
                <br />
                <span className="text-xs text-slate-500">单任务跑测仅在下方历史表展示</span>
              </div>
            ) : (
            <ResponsiveContainer>
              <RadarChart data={radarData} outerRadius="62%" margin={{ top: 24, right: 60, bottom: 28, left: 60 }}>
                <defs>
                  <radialGradient id="radarFill" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.6} />
                    <stop offset="60%" stopColor="#a855f7" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0.05} />
                  </radialGradient>
                </defs>
                <PolarGrid stroke="rgba(148,163,184,0.35)" strokeDasharray="2 3" />
                <PolarAngleAxis
                  dataKey="task"
                  tick={<OutwardTick fill="#475569" fontSize={12} fontWeight={500} offset={16} />}
                />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 5]}
                  tickCount={6}
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                  axisLine={false}
                  stroke="rgba(148,163,184,0.35)"
                />
                <Tooltip
                  formatter={(v: number) => v.toFixed(2)}
                  contentStyle={{
                    background: 'rgba(255, 255, 255, 0.98)',
                    border: '1px solid rgba(148, 163, 184, 0.3)',
                    borderRadius: 6,
                    fontSize: 12,
                    padding: '6px 10px',
                    color: '#0f172a',
                  }}
                  labelStyle={{ color: '#475569' }}
                />
                <Radar
                  name="分数"
                  dataKey="score"
                  stroke="#22d3ee"
                  strokeWidth={2}
                  fill="url(#radarFill)"
                  fillOpacity={1}
                  dot={{ fill: '#22d3ee', stroke: '#ffffff', strokeWidth: 1.5, r: 3.5 }}
                />
              </RadarChart>
            </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="panel p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="section-eyebrow">加权分趋势 · 完整轮次</h3>
            <span className="text-[11px] text-slate-500 font-mono">{completeChains.length} runs</span>
          </div>
          <div className="w-full h-80">
            {trendData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-slate-500 text-center px-6">
                还没有覆盖全 {allTasks.length} 个任务的完整轮次
                <br />
                <span className="text-xs text-slate-500">下方历史表展示所有单任务跑测</span>
              </div>
            ) : (
            <ResponsiveContainer>
              <LineChart data={trendData} margin={{ top: 16, right: 12, bottom: 8, left: -12 }}>
                <defs>
                  <linearGradient id="trendLine" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#22d3ee" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="rgba(148,163,184,0.12)" />
                <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={{ stroke: 'rgba(148,163,184,0.35)' }} tickLine={false} />
                <YAxis domain={[0, 5]} tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={{ stroke: 'rgba(148,163,184,0.35)' }} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(255, 255, 255, 0.98)',
                    border: '1px solid rgba(148, 163, 184, 0.3)',
                    borderRadius: 6,
                    fontSize: 12,
                    color: '#0f172a',
                  }}
                />
                <Line type="monotone" dataKey="weighted" stroke="url(#trendLine)" strokeWidth={2.5} name="加权" dot={{ fill: '#22d3ee', r: 3.5, strokeWidth: 0 }} activeDot={{ r: 6, fill: '#22d3ee', stroke: '#ffffff', strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
            )}
          </div>
        </div>
      </section>

      {(genCoverage > 0 || retCoverage > 0) && (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CategoryCostTrendPanel
            title="生成类成本趋势"
            subtitle={`${genCoverage}/${categoryCostTrend.length} 完整轮次`}
            dataKey="generation"
            data={categoryCostTrend}
            stroke="#22d3ee"
            fill="#22d3ee"
          />
          <CategoryCostTrendPanel
            title="检索类成本趋势"
            subtitle={`${retCoverage}/${categoryCostTrend.length} 完整轮次`}
            dataKey="retrieval"
            data={categoryCostTrend}
            stroke="#a855f7"
            fill="#a855f7"
          />
        </section>
      )}

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="section-eyebrow">历史跑测 · {chainRows.length} runs</h2>
          <span className="text-[11px] text-slate-500 font-mono">最新一次高亮</span>
        </div>
        <div className="panel overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
                <th rowSpan={2} className="text-center p-2.5 align-middle border-b border-slate-200">测试时间</th>
                <th
                  rowSpan={2}
                  className="text-center p-2.5 align-middle border-b border-slate-200"
                  title="加权分（粗体）+ 该 chain 内所有已 backfill 任务的真实 cost_median_usd 之和（带 (X/Y) 表示部分 task 未 backfill）"
                >
                  加权分<br/>
                  <span className="text-[10px] font-normal text-slate-500 normal-case tracking-normal">/ 生成 · 检索 均价</span>
                </th>
                {groups.map((g) => (
                  <th
                    key={g.category}
                    colSpan={g.tasks.length}
                    className="text-center p-2.5 text-[11px] uppercase tracking-wider text-slate-700 border-b border-slate-200 border-l border-slate-200"
                  >
                    {g.category}
                  </th>
                ))}
                <th rowSpan={2} className="text-center p-2.5 align-middle border-b border-slate-200 border-l border-slate-200">备注</th>
                <th rowSpan={2} className="text-center p-2.5 align-middle border-b border-slate-200">Run ID</th>
              </tr>
              <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
                {groups.map((g) =>
                  g.tasks.map((task, ti) => (
                    <th
                      key={task}
                      className={`text-center p-2 whitespace-nowrap border-b border-slate-200 ${ti === 0 ? 'border-l border-slate-200' : ''}`}
                    >
                      {taskLabel(task)}
                    </th>
                  )),
                )}
              </tr>
            </thead>
            <tbody>
              {chainRows.map((c, i) => {
                // A chain spans many run_ids (one per task); surface a note
                // if any of its cells carries one.
                const noteVal = orderedTasks
                  .map((t) => c.runIdByTask[t])
                  .map((id) => (id ? notes?.[id] : undefined))
                  .find(Boolean)
                const isLatest = i === 0
                return (
                  <tr
                    key={`${c.tested_at}-${i}`}
                    className={`border-t border-slate-200/80 transition-colors ${
                      isLatest
                        ? 'bg-gradient-to-r from-cyan-100/50 via-violet-100/40 to-transparent'
                        : 'hover:bg-slate-100/60'
                    }`}
                  >
                    <td className="p-2.5 whitespace-nowrap text-center align-middle font-mono text-xs text-slate-700">
                      {c.tested_at.slice(0, 16).replace('T', ' ')}Z
                    </td>
                    <td className="p-2.5 text-center align-middle">
                      <div className="font-mono font-semibold text-slate-900">{c.weighted.toFixed(3)}</div>
                      {(() => {
                        // Per-chain category cost: mean of cost_median_usd
                        // across generation tasks vs retrieval tasks in this
                        // chain. Shown compactly as "G $X.XX · R $Y.YY" —
                        // sum-of-all hidden in the title (still useful as
                        // ops/budget reference).
                        const cc = computeChainCategoryCost(c.runIdByTask, data.tasks)
                        if (!cc) return <div className="text-[10px] text-slate-500 font-mono">—</div>
                        const fmt = (cat: { mean: number | null; covered: number; total: number }) => {
                          if (cat.mean == null) return '—'
                          const part = cat.covered < cat.total
                          return part ? `$${cat.mean.toFixed(4)}*` : `$${cat.mean.toFixed(4)}`
                        }
                        return (
                          <div
                            className="text-[10px] text-slate-500 font-mono"
                            title={`生成均价 (${cc.generation.covered}/${cc.generation.total}) · 检索均价 (${cc.retrieval.covered}/${cc.retrieval.total}) · 该 chain 全套总和 $${cc.full_sum.toFixed(4)}`}
                          >
                            <span title="生成均价">生 {fmt(cc.generation)}</span>
                            <span className="text-slate-400 mx-1">·</span>
                            <span title="检索均价">检 {fmt(cc.retrieval)}</span>
                          </div>
                        )
                      })()}
                    </td>
                    {groups.map((g) =>
                      g.tasks.map((task, ti) => {
                        const score = c.taskScores[task]
                        const cost = c.taskCosts[task]
                        const rid = c.runIdByTask[task]
                        const cov = c.taskCoverage[task]
                        // Mark only when a test set ran at < 50% coverage —
                        // a near-complete run (e.g. 10/12) isn't worth flagging.
                        const partial =
                          cov != null && cov.n_full > 0 && cov.n_scored * 2 < cov.n_full
                        return (
                          <td
                            key={task}
                            className={`p-2 text-center font-mono align-middle ${ti === 0 ? 'border-l border-slate-200/80' : ''}`}
                          >
                            <div
                              className={score == null ? 'text-slate-500' : partial ? 'text-amber-600' : 'text-slate-900'}
                              title={partial ? `测试集未跑全：仅 ${cov!.n_scored}/${cov!.n_full} 个用例有分，分数按已跑出的用例计算` : undefined}
                            >
                              {score == null ? (
                                '—'
                              ) : rid ? (
                                <Link
                                  href={`/runs/${encodeURIComponent(rid)}`}
                                  className="hover:text-indigo-700 hover:underline"
                                >
                                  {score.toFixed(2)}
                                </Link>
                              ) : (
                                score.toFixed(2)
                              )}
                              {partial && <span className="align-super text-[9px] text-amber-600">*</span>}
                            </div>
                            {partial && (
                              <div className="text-[9px] text-amber-600 font-mono leading-tight">
                                {cov!.n_scored}/{cov!.n_full}
                              </div>
                            )}
                            <div
                              className="text-[10px] text-slate-500"
                              title="该任务在这次跑测的 cost_median_usd（每次对话的成本估算）"
                            >
                              {cost != null && cost > 0 ? `$${cost.toFixed(4)}` : '—'}
                            </div>
                          </td>
                        )
                      }),
                    )}
                    <td
                      className="p-2 text-xs text-slate-700 border-l border-slate-200/80 align-middle text-center max-w-[28ch]"
                      title={noteVal ?? ''}
                    >
                      {noteVal ? (
                        <span className="whitespace-pre-wrap line-clamp-3 inline-block text-left">{noteVal}</span>
                      ) : (
                        <span className="text-slate-700">—</span>
                      )}
                    </td>
                    <td className="p-2 text-center align-middle">
                      <span className="group relative inline-block">
                        <span
                          className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 text-slate-700 group-hover:bg-cyan-100 group-hover:text-indigo-700 text-xs cursor-help select-none transition-colors"
                          aria-label="Run IDs"
                        >
                          ⓘ
                        </span>
                        <span
                          className="invisible opacity-0 group-hover:visible group-hover:opacity-100 absolute z-20 bottom-full right-0 mb-1 bg-white border border-cyan-200 text-slate-900 text-[11px] px-2.5 py-1.5 rounded-md pointer-events-none transition-opacity shadow-glow-cyan text-left max-h-64 overflow-auto"
                          role="tooltip"
                        >
                          {orderedTasks
                            .filter((t) => c.runIdByTask[t])
                            .map((t) => (
                              <div key={t} className="font-mono whitespace-nowrap text-slate-900">
                                {taskLabel(t)}: {c.runIdByTask[t]}
                              </div>
                            ))}
                        </span>
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function CategoryCostTrendPanel({
  title,
  subtitle,
  dataKey,
  data,
  stroke,
  fill,
}: {
  title: string
  subtitle: string
  dataKey: 'generation' | 'retrieval'
  data: Array<{ label: string; generation: number | null; retrieval: number | null }>
  stroke: string
  fill: string
}) {
  const hasData = data.some((r) => r[dataKey] != null)
  return (
    <div className="panel p-5">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="section-eyebrow">{title}</h3>
        <span className="text-[11px] text-slate-500 font-mono">{subtitle}</span>
      </div>
      <div className="w-full h-64">
        {!hasData ? (
          <div className="h-full flex items-center justify-center text-sm text-slate-500 text-center px-6">
            还没有完整覆盖该类全部任务的 chain
          </div>
        ) : (
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 12, right: 12, bottom: 8, left: -8 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(148,163,184,0.15)" />
              <XAxis
                dataKey="label"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                axisLine={{ stroke: 'rgba(148,163,184,0.35)' }}
                tickLine={false}
              />
              <YAxis
                domain={[0, 'auto']}
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                axisLine={{ stroke: 'rgba(148,163,184,0.35)' }}
                tickLine={false}
                tickFormatter={(v: number) => `$${v < 1 ? v.toFixed(2) : v.toFixed(1)}`}
                width={56}
              />
              <Tooltip
                contentStyle={{
                  background: 'rgba(255, 255, 255, 0.98)',
                  border: '1px solid rgba(148, 163, 184, 0.3)',
                  borderRadius: 6,
                  fontSize: 12,
                  color: '#0f172a',
                }}
                formatter={(v: number) => `$${v.toFixed(4)}`}
              />
              <Line
                type="monotone"
                dataKey={dataKey}
                name="整套成本"
                stroke={stroke}
                strokeWidth={2.5}
                dot={{ fill, r: 3.5, strokeWidth: 0 }}
                activeDot={{ r: 6, fill, stroke: '#ffffff', strokeWidth: 2 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
