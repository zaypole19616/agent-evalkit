'use client'

// 历史记录 — past campaigns reconstructed from the durable leaderboard
// (/api/dashboard/history clusters per-(model,task) runs into chains by time).
// Collapsed: one row per chain. Expanded: the model × task score matrix, each
// cell linking to that run's detail page. Survives restarts (leaderboard is
// GCS-hydrated) — unlike the live view's ephemeral run-many logs.

import Link from 'next/link'
import useSWR from 'swr'
import { useState } from 'react'
import { api } from '@/lib/api-client'
import { taskLabel } from '@/lib/task-meta'
import { modelDisplayName } from '@/lib/model-meta'
import type { ChainHistoryItem } from '@/lib/types'

function scoreClass(s: number | null): string {
  if (s == null) return 'text-slate-300'
  if (s >= 3.5) return 'text-emerald-600'
  if (s >= 2.5) return 'text-amber-600'
  return 'text-rose-600'
}

function dateRange(item: ChainHistoryItem): string {
  const d = (t: string) => t.slice(0, 10)
  const a = d(item.started_at)
  const b = d(item.ended_at)
  return a === b ? a : `${a} → ${b}`
}

export function RunHistory() {
  const { data, error } = useSWR('history', () => api.history())
  const [open, setOpen] = useState<Set<number>>(new Set([0])) // newest expanded by default

  if (error) return null // history is a nice-to-have; don't break the live page
  if (!data || data.length === 0) return null

  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <h2 className="section-eyebrow text-slate-500">历史记录</h2>
        <span className="h-px flex-1 bg-gradient-to-r from-slate-200 to-transparent" />
        <span className="text-[11px] text-slate-500 font-mono">{data.length} 次</span>
      </div>

      {data.map((item, i) => {
        const expanded = open.has(i)
        return (
          <div key={`${item.started_at}-${i}`} className="panel overflow-hidden">
            <button
              onClick={() => toggle(i)}
              className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-slate-50 transition-colors"
            >
              <span aria-hidden className={`text-slate-400 transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
              <span className="font-medium text-slate-900 text-sm">{dateRange(item)}</span>
              <span className="text-xs text-slate-500">
                {item.models.length} 模型 × {item.tasks.length} 任务 · {item.cell_count} cell
              </span>
              {item.avg_score != null && (
                <span className={`ml-auto text-sm font-mono ${scoreClass(item.avg_score)}`}>
                  均分 {item.avg_score.toFixed(2)}
                </span>
              )}
            </button>

            {expanded && <HistoryMatrix item={item} />}
          </div>
        )
      })}
    </section>
  )
}

function HistoryMatrix({ item }: { item: ChainHistoryItem }) {
  const byKey = new Map(item.cells.map((c) => [`${c.model}::${c.task}`, c]))
  return (
    <div className="overflow-x-auto border-t border-slate-100">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-[11px] text-slate-500">
            <th className="text-left font-medium px-4 py-2 sticky left-0 bg-white">模型</th>
            {item.tasks.map((t) => (
              <th key={t} className="px-3 py-2 font-medium whitespace-nowrap" title={t}>{taskLabel(t)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {item.models.map((m) => (
            <tr key={m} className="border-t border-slate-50">
              <td className="text-left px-4 py-2 text-slate-700 whitespace-nowrap sticky left-0 bg-white">
                {modelDisplayName(m)}
              </td>
              {item.tasks.map((t) => {
                const c = byKey.get(`${m}::${t}`)
                if (!c) return <td key={t} className="px-3 py-2 text-center text-slate-200">—</td>
                return (
                  <td key={t} className="px-3 py-2 text-center">
                    <Link
                      href={`/runs/${encodeURIComponent(c.run_id)}`}
                      className={`font-mono hover:underline ${scoreClass(c.score)}`}
                      title={`${m} · ${t} → ${c.run_id}`}
                    >
                      {c.score == null ? '—' : c.score.toFixed(2)}
                    </Link>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
