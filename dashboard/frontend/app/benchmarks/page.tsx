'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { api } from '@/lib/api-client'
import { taskLabel, taskDescription, taskScoringScale, groupTasksByCategory, TASK_CATEGORIES } from '@/lib/task-meta'

// Category-level accent — picked once and reused for every card in
// that group so the eye groups them automatically.
const CATEGORY_ACCENT: Record<string, { eyebrow: string; dot: string; ring: string }> = {
  生成类: { eyebrow: 'text-violet-700', dot: 'bg-violet-400', ring: 'hover:shadow-glow-violet' },
  检索类: { eyebrow: 'text-indigo-700', dot: 'bg-cyan-400', ring: 'hover:shadow-glow-cyan' },
}

export default function BenchmarksIndex() {
  const { data, error } = useSWR('benchmarks', () => api.benchmarks())
  if (error) return <p className="text-rose-400">暂时无法加载测试集：{String(error)}</p>
  if (!data) return <p className="text-slate-700">加载中…</p>

  const taskKeys = data.map((b) => b.task)
  const byKey = Object.fromEntries(data.map((b) => [b.task, b]))
  const groups = groupTasksByCategory(taskKeys)
  const totalFixtures = data.reduce((sum, b) => sum + b.fixture_count, 0)

  return (
    <div className="space-y-10 animate-fade-in">
      <header>
        <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">
          <span className="heading-gradient">测试集</span>目录
        </h1>
        <p className="text-sm text-slate-700 mt-2">
          共 {data.length} 个任务 · {totalFixtures} 个测试用例 · 覆盖 {Object.keys(TASK_CATEGORIES).length} 个能力维度
        </p>
      </header>

      {groups.map(({ category, tasks }) => {
        const accent = CATEGORY_ACCENT[category] ?? CATEGORY_ACCENT['生成类']
        return (
          <section key={category}>
            <div className="flex items-center gap-3 mb-4">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${accent.dot} shadow-glow-cyan`} />
              <h2 className={`section-eyebrow ${accent.eyebrow}`}>{category}</h2>
              <span className="h-px flex-1 bg-gradient-to-r from-slate-800 to-transparent" />
              <span className="text-[11px] text-slate-500 font-mono">{tasks.length} tasks</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tasks.map((task) => {
                const b = byKey[task]
                if (!b) return null
                const scale = taskScoringScale(b.task)
                return (
                  <Link
                    key={b.task}
                    href={`/benchmarks/${b.task}`}
                    className={`panel panel-hover p-5 block group ${accent.ring}`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <h3 className="font-semibold text-slate-900 text-base group-hover:text-indigo-700 transition-colors">
                          {taskLabel(b.task)}
                        </h3>
                        <code className="text-[11px] text-slate-500 font-mono">{b.task}</code>
                      </div>
                      <span aria-hidden className="text-slate-700 group-hover:text-indigo-700 group-hover:translate-x-0.5 transition-all">
                        →
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5 mb-3">
                      <span className="chip">{b.fixture_count} 用例</span>
                      {b.has_files && <span className="chip">含附件</span>}
                      {scale && <span className="chip-violet">{scale}</span>}
                    </div>

                    <p className="text-sm text-slate-700 line-clamp-4 leading-relaxed">
                      {taskDescription(b.task) || '暂无任务描述'}
                    </p>
                  </Link>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
