'use client'

import Link from 'next/link'
import useSWR from 'swr'
import clsx from 'clsx'
import { api } from '@/lib/api-client'

export function CaseList({ runId, task }: { runId: string; task: string }) {
  const { data, isLoading, error } = useSWR(`cases-${runId}-${task}`, () => api.cases(runId, task))
  if (isLoading) return <p className="text-sm text-slate-700">加载 cases 中…</p>
  if (error) return <p className="text-rose-400 text-sm">加载失败：{String(error)}</p>
  if (!data || data.length === 0) return <p className="text-sm text-slate-700">暂无记录的 case。</p>

  const bad = data.filter((c) => c.status === 'bad')
  const pass = data.filter((c) => c.status === 'pass')

  return (
    <div className="space-y-5">
      <Section title="Bad cases" count={bad.length} cases={bad} runId={runId} task={task} accent="rose" />
      <Section title="Passes" count={pass.length} cases={pass} runId={runId} task={task} accent="emerald" />
    </div>
  )
}

function Section({ title, count, cases, runId, task, accent }: {
  title: string
  count: number
  cases: Array<{ fixture_id: string; status: 'pass' | 'bad'; elapsed_s: number | null; tool_call_count: number | null; response_chars: number; judge_score?: number; failure_class?: string }>
  runId: string
  task: string
  accent: 'rose' | 'emerald'
}) {
  if (cases.length === 0) return null
  return (
    <div>
      <h4 className="section-eyebrow mb-2">
        <span className={accent === 'rose' ? 'text-rose-700' : 'text-emerald-700'}>{title}</span>
        <span className="ml-2 text-slate-500">{count}</span>
      </h4>
      <ul className="panel divide-y divide-slate-200/80 overflow-hidden">
        {cases.map((c) => (
          <li key={c.fixture_id} className="p-3 text-sm flex items-center gap-3 hover:bg-slate-100/60 transition-colors">
            <span
              className={clsx(
                'w-2 h-2 rounded-full shrink-0',
                c.status === 'bad' ? 'bg-rose-400' : 'bg-emerald-400 shadow-glow-emerald',
              )}
            />
            <Link
              className="font-mono text-indigo-600 hover:text-indigo-700 transition-colors"
              href={`/runs/${runId}/${task}/${c.fixture_id}`}
            >
              {c.fixture_id}
            </Link>
            {c.judge_score != null && (
              <span className="chip">判官 {c.judge_score}</span>
            )}
            {c.failure_class && <span className="chip-rose">{c.failure_class}</span>}
            <span className="ml-auto text-xs text-slate-500 font-mono">
              {c.elapsed_s?.toFixed(1)}s · {c.tool_call_count ?? 0} tools · {c.response_chars} chars
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
