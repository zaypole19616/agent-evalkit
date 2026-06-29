'use client'

import Link from 'next/link'
import { useState } from 'react'
import useSWR from 'swr'
import type { Leaderboard, LeaderboardRow } from '@/lib/types'
import { api } from '@/lib/api-client'
import { taskLabel, taskDescription } from '@/lib/task-meta'
import { modelDisplayName } from '@/lib/model-meta'
import { computeCostByModel, computeWeightedByModel } from '@/lib/score'

// Per-category mean cost — what does ONE operation in this category cost
// on this model. Generation tasks (html/md/pptx/...) and retrieval tasks
// (recall/search) differ by ~100x in spend, so one combined number was
// meaningless. Showing the two means side-by-side maps to the two real
// user modes ("生成东西" vs "查/答").
import type { CategoryCost, ModelCost } from '@/lib/score'

function CategoryCostCell({ cell }: { cell?: CategoryCost }) {
  if (!cell || cell.mean == null) return <span className="text-slate-500">—</span>
  const partial = cell.covered < cell.total
  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-mono text-xs text-slate-900">${cell.mean.toFixed(4)}</span>
      {partial && (
        <span
          aria-hidden
          className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 align-middle"
          title={`仅含 ${cell.covered}/${cell.total} 个任务的成本（其余未跑测或 token 未 backfill）`}
        />
      )}
    </span>
  )
}

function latestPerModel<T extends { model: string; tested_at: string }>(rows: T[]): T[] {
  const out = new Map<string, T>()
  for (const r of rows) {
    const prev = out.get(r.model)
    if (!prev || prev.tested_at < r.tested_at) out.set(r.model, r)
  }
  return Array.from(out.values())
}

function runCounts(rows: { model: string }[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rows) m.set(r.model, (m.get(r.model) ?? 0) + 1)
  return m
}

// Top-3 row highlight: gold / silver / bronze tinted, kept restrained
// so the rest of the table stays the focus.
const RANK_STYLE: Record<number, { row: string; badge: string }> = {
  1: {
    row: 'bg-gradient-to-r from-amber-200/40 via-transparent to-transparent',
    badge: 'bg-amber-500/20 text-amber-700 border-amber-500/40 shadow-glow-cyan',
  },
  2: {
    row: 'bg-gradient-to-r from-slate-200/50 via-transparent to-transparent',
    badge: 'bg-slate-500/20 text-slate-700 border-slate-400/30',
  },
  3: {
    row: 'bg-gradient-to-r from-orange-200/40 via-transparent to-transparent',
    badge: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  },
}

function RankBadge({ rank }: { rank: number }) {
  const s = RANK_STYLE[rank]
  if (s) {
    return (
      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-md border text-xs font-mono font-semibold ${s.badge}`}>
        {rank}
      </span>
    )
  }
  return <span className="text-slate-500 font-mono text-sm pl-2">{rank}</span>
}

export function GlobalRanking({ data }: { data: Leaderboard }) {
  const counts = runCounts(data.global)
  // Override the runner-written ``weighted_score`` with a real
  // cross-task mean per the comment on ``computeWeightedByModel``.
  const trueWeighted = computeWeightedByModel(data.tasks)
  const costByModel = computeCostByModel(data.tasks)
  const rows = latestPerModel(data.global)
    .map((r) => ({ ...r, weighted_score: trueWeighted.get(r.model) ?? r.weighted_score }))
    .sort((a, b) => b.weighted_score - a.weighted_score)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const toggle = (model: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(model)) next.delete(model)
      else next.add(model)
      return next
    })
  }

  const compareHref = `/compare?models=${Array.from(selected).map(encodeURIComponent).join(',')}`

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="section-eyebrow">Global Ranking · {rows.length} 模型</p>
        {selected.size >= 2 ? (
          <Link href={compareHref} className="btn-primary">
            对比所选 ({selected.size})
            <span aria-hidden>→</span>
          </Link>
        ) : (
          <span className="text-xs text-slate-500">勾选 ≥ 2 个模型可对比</span>
        )}
      </div>

      <div className="panel overflow-hidden">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
              <th className="p-3 w-10 text-center align-middle"></th>
              <th className="p-3 w-16 text-center align-middle">排名</th>
              <th className="p-3 text-center align-middle">模型</th>
              <th className="p-3 text-center align-middle">加权分</th>
              <th
                className="p-3 text-center align-middle hidden md:table-cell"
                title="任务类型 1 的平均单次成本：mean(该类别下各测试集的 cost_median_usd)"
              >
                任务类型 1 均价
              </th>
              <th
                className="p-3 text-center align-middle hidden md:table-cell"
                title="任务类型 2 的平均单次成本：mean(该类别下各测试集的 cost_median_usd)"
              >
                任务类型 2 均价
              </th>
              <th className="p-3 text-center align-middle hidden md:table-cell">最新测试</th>
              <th className="p-3 text-center align-middle hidden sm:table-cell">历史</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const rank = i + 1
              const n = counts.get(r.model) ?? 1
              const href = `/models/${encodeURIComponent(r.model)}`
              // No valid tested_at → this is a placeholder/voided model with no
              // real run yet; render date + history as "—" instead of crashing
              // on ``new Date('').toISOString()``.
              const hasRun = !Number.isNaN(Date.parse(r.tested_at))
              const rowStyle = RANK_STYLE[rank]?.row ?? ''
              return (
                <tr
                  key={r.model}
                  className={`border-t border-slate-200 hover:bg-slate-100/60 transition-colors ${rowStyle}`}
                >
                  <td className="p-3 text-center align-middle">
                    <input
                      type="checkbox"
                      checked={selected.has(r.model)}
                      onChange={() => toggle(r.model)}
                      className="accent-cyan-500"
                      aria-label={`选中 ${modelDisplayName(r.model)}`}
                    />
                  </td>
                  <td className="p-3 text-center align-middle">
                    <RankBadge rank={rank} />
                  </td>
                  <td className="p-3 text-center align-middle">
                    <Link
                      href={href}
                      className="font-medium text-indigo-700 hover:text-indigo-900 hover:underline underline-offset-4 decoration-indigo-400 transition-colors"
                    >
                      {modelDisplayName(r.model)}
                    </Link>
                  </td>
                  <td className="p-3 text-center align-middle">
                    <span className="font-mono text-base font-semibold text-slate-900">
                      {Number.isFinite(r.weighted_score) ? r.weighted_score.toFixed(3) : '—'}
                    </span>
                  </td>
                  <td
                    className="p-3 text-center align-middle text-slate-700 hidden md:table-cell"
                    title={
                      costByModel.get(r.model)
                        ? `整套跑测总和: $${costByModel.get(r.model)!.full_sum.toFixed(4)} (${costByModel.get(r.model)!.total_covered}/${costByModel.get(r.model)!.total_tasks} task)`
                        : undefined
                    }
                  >
                    <CategoryCostCell cell={costByModel.get(r.model)?.generation} />
                  </td>
                  <td className="p-3 text-center align-middle text-slate-700 hidden md:table-cell">
                    <CategoryCostCell cell={costByModel.get(r.model)?.retrieval} />
                  </td>
                  <td className="p-3 text-center align-middle text-slate-700 font-mono text-xs hidden md:table-cell">
                    {hasRun ? new Date(r.tested_at).toISOString().slice(0, 10) : <span className="text-slate-500">—</span>}
                  </td>
                  <td className="p-3 text-center align-middle hidden sm:table-cell">
                    {!hasRun ? (
                      <span className="text-slate-500 text-xs">—</span>
                    ) : n > 1 ? (
                      <Link href={href} className="text-slate-700 hover:text-indigo-700 transition-colors text-xs">
                        {n} 次 →
                      </Link>
                    ) : (
                      <span className="text-slate-500 text-xs">1 次</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function TaskRanking({ task, rows }: { task: string; rows: LeaderboardRow[] }) {
  const sorted = latestPerModel(rows).sort((a, b) => b.score - a.score)
  const desc = taskDescription(task)

  return (
    <div className="panel panel-hover p-5 flex flex-col">
      <div className="mb-3">
        <h3 className="font-semibold text-slate-900 text-base">{taskLabel(task)}</h3>
        {desc && <p className="text-xs text-slate-700 mt-1 line-clamp-2 leading-relaxed">{desc}</p>}
      </div>
      {sorted.length === 0 ? (
        <p className="text-xs text-slate-500 italic mt-2">暂无跑测数据</p>
      ) : (
        <table className="w-full text-sm mt-1">
          <tbody>
            {sorted.map((r, i) => (
              <tr key={r.model} className="border-t border-slate-200/80 first:border-t-0">
                <td className="py-2 pr-2 w-6 text-right text-[11px] text-slate-500 font-mono">
                  {i + 1}
                </td>
                <td className="py-2">
                  <Link
                    href={`/models/${encodeURIComponent(r.model)}`}
                    className="text-indigo-700 hover:text-indigo-900 hover:underline underline-offset-4 decoration-indigo-400 transition-colors"
                  >
                    {modelDisplayName(r.model)}
                  </Link>
                </td>
                <td className="py-2 text-right font-mono text-slate-900">
                  {Number.isFinite(r.score) ? r.score.toFixed(3) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
