'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { api } from '@/lib/api-client'
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Legend,
} from 'recharts'
import { taskLabel, groupTasksByCategory } from '@/lib/task-meta'
import { modelDisplayName } from '@/lib/model-meta'
import { OutwardTick } from '@/components/radar-tick'

// Cycle through high-contrast accent colors. First three are tuned
// to play nicely against the slate-900 panel background.
const COLORS = ['#22d3ee', '#a855f7', '#f59e0b', '#10b981', '#ec4899', '#6366f1']

function ComparePageInner() {
  const search = useSearchParams()
  const modelsParam = search.get('models') ?? ''
  const models = modelsParam.split(',').map((s) => s.trim()).filter(Boolean)

  const { data, isLoading } = useSWR('leaderboard', () => api.leaderboard())
  if (isLoading) return <p className="text-slate-700">加载中…</p>
  if (!data) return null

  if (models.length === 0) {
    return (
      <div className="space-y-3 animate-fade-in">
        <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">
          模型<span className="heading-gradient">对比</span>
        </h1>
        <p className="text-sm text-slate-700">
          未选中任何模型。回到 <Link href="/leaderboard" className="text-indigo-600 hover:text-indigo-700 transition-colors">总榜</Link> 勾选 2–3 个后再来。
        </p>
      </div>
    )
  }

  const allTasks = Object.keys(data.tasks)

  type ModelRow = { model: string; weighted: number | null; tested_at: string | null; taskScores: Record<string, number | null> }
  const rows: ModelRow[] = models.map((model) => {
    const globalRuns = data.global.filter((r) => r.model === model).sort((a, b) => b.tested_at.localeCompare(a.tested_at))
    const latestRun = globalRuns[0]
    if (!latestRun) {
      return { model, weighted: null, tested_at: null, taskScores: {} }
    }
    const taskScores: Record<string, number | null> = {}
    for (const t of allTasks) {
      const taskRuns = data.tasks[t] ?? []
      const taskMatch = taskRuns
        .filter((r) => r.model === model)
        .sort((a, b) => b.tested_at.localeCompare(a.tested_at))[0]
      taskScores[t] = taskMatch ? taskMatch.score : null
    }
    return { model, weighted: latestRun.weighted_score, tested_at: latestRun.tested_at, taskScores }
  })

  const radarData = allTasks.map((t) => {
    const row: Record<string, string | number> = { task: taskLabel(t) }
    for (const r of rows) {
      row[r.model] = r.taskScores[t] ?? 0
    }
    return row
  })

  const groups = groupTasksByCategory(allTasks)

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
          模型<span className="heading-gradient">对比</span>
        </h1>
        <p className="text-sm text-slate-700 mt-2">
          {rows.length} 个模型 · 每个 task 取该 model 最新 run 的分数
        </p>
      </header>

      <section className="panel p-5">
        <h2 className="section-eyebrow mb-3">叠加雷达</h2>
        <div className="w-full h-96">
          <ResponsiveContainer>
            <RadarChart data={radarData} outerRadius="65%" margin={{ top: 28, right: 70, bottom: 32, left: 70 }}>
              <PolarGrid stroke="rgba(148,163,184,0.35)" strokeDasharray="2 3" />
              <PolarAngleAxis dataKey="task" tick={<OutwardTick fill="#475569" fontSize={12} offset={18} />} />
              <PolarRadiusAxis angle={90} domain={[0, 5]} tick={{ fill: '#94a3b8', fontSize: 10 }} stroke="rgba(148,163,184,0.35)" axisLine={false} />
              {rows.map((r, i) => (
                <Radar
                  key={r.model}
                  name={modelDisplayName(r.model)}
                  dataKey={r.model}
                  stroke={COLORS[i % COLORS.length]}
                  fill={COLORS[i % COLORS.length]}
                  fillOpacity={0.15}
                  strokeWidth={2}
                  dot={{ fill: COLORS[i % COLORS.length], stroke: '#ffffff', strokeWidth: 1.5, r: 3 }}
                />
              ))}
              <Legend
                wrapperStyle={{ fontSize: 12, color: '#475569' }}
                iconType="circle"
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section>
        <h2 className="section-eyebrow mb-3">分数表</h2>
        <div className="panel overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
                <th rowSpan={2} className="text-left p-3 align-bottom border-b border-slate-200">模型</th>
                <th rowSpan={2} className="text-right p-3 align-bottom border-b border-slate-200">加权</th>
                {groups.map((g) => (
                  <th
                    key={g.category}
                    colSpan={g.tasks.length}
                    className="text-center p-2.5 border-b border-slate-200 border-l border-slate-200"
                  >
                    {g.category}
                  </th>
                ))}
                <th rowSpan={2} className="text-left p-3 align-bottom border-b border-slate-200 border-l border-slate-200">最新测试</th>
              </tr>
              <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
                {groups.map((g) =>
                  g.tasks.map((task, ti) => (
                    <th
                      key={task}
                      className={`text-right p-2 whitespace-nowrap border-b border-slate-200 ${ti === 0 ? 'border-l border-slate-200' : ''}`}
                    >
                      {taskLabel(task)}
                    </th>
                  )),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.model} className="border-t border-slate-200/80 hover:bg-slate-100/60 transition-colors">
                  <td className="p-3">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle"
                      style={{ background: COLORS[i % COLORS.length], boxShadow: `0 0 8px -1px ${COLORS[i % COLORS.length]}` }}
                    />
                    <Link
                      href={`/models/${encodeURIComponent(r.model)}`}
                      className="text-indigo-700 hover:text-indigo-900 hover:underline underline-offset-4 decoration-indigo-400 font-medium transition-colors"
                    >
                      {modelDisplayName(r.model)}
                    </Link>
                  </td>
                  <td className="p-3 text-right font-mono text-slate-900 font-semibold">
                    {r.weighted != null ? r.weighted.toFixed(3) : '—'}
                  </td>
                  {groups.map((g) =>
                    g.tasks.map((task, ti) => {
                      const v = r.taskScores[task]
                      return (
                        <td
                          key={task}
                          className={`p-2 text-right font-mono ${ti === 0 ? 'border-l border-slate-200/80' : ''} ${
                            v == null ? 'text-slate-700' : 'text-slate-700'
                          }`}
                        >
                          {v != null ? v.toFixed(2) : '—'}
                        </td>
                      )
                    }),
                  )}
                  <td className="p-3 text-xs text-slate-500 border-l border-slate-200/80 font-mono">
                    {r.tested_at ? r.tested_at.slice(0, 10) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export default function ComparePage() {
  return (
    <Suspense fallback={<p className="text-slate-700">加载中…</p>}>
      <ComparePageInner />
    </Suspense>
  )
}
