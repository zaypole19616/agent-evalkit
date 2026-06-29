'use client'

import useSWR from 'swr'
import { api } from '@/lib/api-client'
import { GlobalRanking, TaskRanking } from '@/components/leaderboard-table'
import { groupTasksByCategory } from '@/lib/task-meta'

export default function LeaderboardPage() {
  const { data, error, isLoading } = useSWR('leaderboard', () => api.leaderboard())
  const { data: bench } = useSWR('benchmarks', () => api.benchmarks())

  if (isLoading) return <p className="text-slate-700">加载中…</p>
  if (error) return <p className="text-rose-400">加载失败：{String(error)}</p>
  if (!data) return null

  // Task list = union of (benchmark suite registered tasks) and (tasks that
  // have at least one run in the leaderboard). The benchmarks endpoint is
  // the source of truth for "what tasks exist on the platform" — that lets
  // a freshly-added task (no runs yet) still show up as 暂无数据.
  const benchTaskNames = (bench ?? []).map((b) => b.task)
  const taskSource = Array.from(new Set([...benchTaskNames, ...Object.keys(data.tasks)]))

  return (
    <div className="space-y-10 animate-fade-in">
      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">
            模型评测<span className="heading-gradient">总榜</span>
          </h1>
          <p className="text-xs text-slate-500 font-mono">
            更新于 {Number.isNaN(Date.parse(data.updated_at)) ? '—' : `${new Date(data.updated_at).toISOString().slice(0, 19)}Z`}
          </p>
        </div>
        <GlobalRanking data={data} />
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-xl font-semibold text-slate-900">按任务排名</h2>
          <p className="section-eyebrow">Per Task</p>
        </div>
        <div className="space-y-8">
          {groupTasksByCategory(taskSource).map(({ category, tasks }) => (
            <div key={category}>
              <div className="flex items-center gap-2 mb-3">
                <span className="h-px flex-1 bg-gradient-to-r from-slate-700 to-transparent" />
                <h3 className="section-eyebrow whitespace-nowrap">{category}</h3>
                <span className="h-px flex-1 bg-gradient-to-l from-slate-700 to-transparent" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {tasks.map((task) => (
                  <TaskRanking key={task} task={task} rows={data.tasks[task] ?? []} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
