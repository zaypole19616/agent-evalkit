'use client'

import Link from 'next/link'
import { useState } from 'react'
import useSWR from 'swr'
import { api, BackendRequiredError } from '@/lib/api-client'
import { useRouteId } from '@/lib/use-route-id'
import { TaskRadar } from '@/components/radar-chart'
import { CaseList } from '@/components/case-list'
import { NarrativeRenderer } from '@/components/narrative-renderer'
import { modelDisplayName } from '@/lib/model-meta'
import { useT } from '@/lib/i18n'

const VERDICT_STYLE: Record<string, string> = {
  SHIP: 'chip-emerald',
  NEEDS_ADAPTATION: 'chip-violet',
  DO_NOT_SHIP: 'chip-rose',
}

export default function RunView() {
  const t = useT()
  const runId = useRouteId('run_id')
  const { data: summary, isLoading, error } = useSWR(
    `summary-${runId}`,
    () => api.summary(runId),
    { shouldRetryOnError: false },
  )
  const { data: narrative } = useSWR(
    `narrative-${runId}`,
    () => api.narrative(runId).catch(() => null),
    { shouldRetryOnError: false },
  )
  const { data: note } = useSWR(
    `note-${runId}`,
    () => api.note(runId).then((n) => n.markdown).catch(() => ''),
    { shouldRetryOnError: false },
  )
  const [activeTask, setActiveTask] = useState<string | null>(null)

  if (error instanceof BackendRequiredError) return <BackendFallback runId={runId} />

  if (isLoading) return <p className="text-slate-700">{t('加载中…', 'Loading…')}</p>
  if (error) return <p className="text-rose-400">{t('加载失败：', 'Failed to load: ')}{String(error)}</p>
  if (!summary) return null

  const tasks = summary.tasks
  const selectedTask = activeTask ?? tasks[0]?.task
  const verdictClass = VERDICT_STYLE[summary.global.ship_verdict] ?? 'chip'

  return (
    <div className="space-y-8 animate-fade-in">
      <header>
        <Link
          href={`/models/${encodeURIComponent(summary.model)}`}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-700 transition-colors mb-3"
        >
          <span aria-hidden>←</span> {t('该 model 的全部 run', 'All runs for this model')}
        </Link>
        <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">
          {modelDisplayName(summary.model)}
        </h1>
        <div className="flex flex-wrap items-center gap-3 mt-2">
          <code className="text-xs text-slate-500 font-mono">{summary.run_id}</code>
          <span className="text-slate-700">·</span>
          <span className="text-xs text-slate-700">
            {t('加权', 'Weighted')} <span className="font-mono text-indigo-700 font-semibold">{summary.global.weighted_score.toFixed(3)}</span>
          </span>
          <span className={verdictClass}>{summary.global.ship_verdict}</span>
          <span className="text-xs text-slate-500 font-mono">${summary.cost_usd.toFixed(2)}</span>
        </div>
      </header>

      {note && (
        <section className="panel p-5">
          <h2 className="section-eyebrow mb-2">{t('备注', 'Note')}</h2>
          <div className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed">{note}</div>
        </section>
      )}

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="panel p-5">
          <h3 className="section-eyebrow mb-3">{t('各任务分数 (0–5)', 'Per-task scores (0–5)')}</h3>
          <TaskRadar tasks={tasks} />
        </div>
        <div className="panel p-5">
          <h3 className="section-eyebrow mb-3">{t('LLM 总结', 'LLM summary')}</h3>
          {narrative ? (
            <NarrativeRenderer markdown={narrative.markdown} />
          ) : (
            <p className="text-sm text-slate-700">
              {t('该 run 尚未生成 narrative。本地可跑', 'No narrative generated for this run yet. Run locally')}{' '}
              <code className="bg-slate-100 text-indigo-700 px-1.5 py-0.5 rounded text-xs">
                bin/generate-narrative {runId}
              </code>
            </p>
          )}
        </div>
      </section>

      <section>
        <h2 className="section-eyebrow mb-3">{t('按任务查看 bad cases', 'Bad cases by task')}</h2>
        <div className="flex gap-1 border-b border-slate-200 mb-4 flex-wrap">
          {tasks.map((t) => (
            <button
              key={t.task}
              onClick={() => setActiveTask(t.task)}
              className={
                selectedTask === t.task
                  ? 'px-3 py-2 text-sm border-b-2 border-cyan-400 text-slate-900 font-medium -mb-px'
                  : 'px-3 py-2 text-sm text-slate-700 hover:text-slate-700 transition-colors'
              }
            >
              {t.task} <span className="text-xs text-slate-500 font-mono ml-1">{t.score.toFixed(2)}</span>
            </button>
          ))}
        </div>
        {selectedTask && <CaseList runId={runId} task={selectedTask} />}
      </section>
    </div>
  )
}

function BackendFallback({ runId }: { runId: string }) {
  const t = useT()
  return (
    <div className="space-y-4 animate-fade-in">
      <h2 className="text-2xl font-semibold font-mono text-slate-900">{runId}</h2>
      <div className="panel p-5 space-y-3 border-amber-200">
        <p className="font-semibold text-amber-700">{t('单 Run 报告需要后端服务', 'Single-run report requires the backend service')}</p>
        <p className="text-sm text-slate-700">
          {t('该页面读', 'This page reads')} <code className="bg-slate-100 text-indigo-700 px-1 rounded">reports/{`{run_id}`}</code> {t('和', 'and')}{' '}
          <code className="bg-slate-100 text-indigo-700 px-1 rounded">artifacts/</code>{t('，这些数据只在 pod 上。', ', which only exist on the pod.')}
        </p>
        <p className="text-sm text-slate-700">
          {t('本地查看：', 'View locally:')}
          <code className="block mt-1 bg-slate-100 text-indigo-700 px-2 py-1 rounded text-xs">
            EVALKIT_DASHBOARD_ROOT=$PWD uvicorn dashboard.backend.routes:build_app --factory --port 8000
          </code>
          <span className="block mt-1">{t('然后', 'then open')}</span>
          <code className="block mt-1 bg-slate-100 text-indigo-700 px-2 py-1 rounded text-xs">pnpm dev</code>
        </p>
        <p><Link href="/leaderboard" className="text-indigo-600 hover:text-indigo-700 transition-colors">← {t('回到总榜', 'Back to leaderboard')}</Link></p>
      </div>
    </div>
  )
}
