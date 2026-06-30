'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { useParams } from 'next/navigation'
import { api, BackendRequiredError } from '@/lib/api-client'
import { CaseDetailView } from '@/components/case-detail'
import { useT } from '@/lib/i18n'

export default function CaseView() {
  const t = useT()
  const params = useParams<{ run_id: string; task: string; fixture_id: string }>()
  const runId = decodeURIComponent(params.run_id)
  const { data, isLoading, error } = useSWR(
    `case-${runId}-${params.task}-${params.fixture_id}`,
    () => api.caseDetail(runId, params.task, params.fixture_id),
    { shouldRetryOnError: false },
  )

  if (error instanceof BackendRequiredError) return <BackendFallback fixtureId={params.fixture_id} runId={runId} task={params.task} />
  if (isLoading) return <p className="text-slate-700">{t('加载中…', 'Loading…')}</p>
  if (error) return <p className="text-rose-400">{t('加载失败：', 'Failed to load: ')}{String(error)}</p>
  if (!data) return null
  return <CaseDetailView detail={data} />
}

function BackendFallback({ fixtureId, runId, task }: { fixtureId: string; runId: string; task: string }) {
  const t = useT()
  return (
    <div className="space-y-4 animate-fade-in">
      <h2 className="text-2xl font-semibold font-mono text-slate-900">{fixtureId}</h2>
      <p className="text-sm text-slate-700 font-mono">{task} · {runId}</p>
      <div className="panel p-5 space-y-2 border-amber-200">
        <p className="font-semibold text-amber-700">{t('单 Case 详情需要后端服务', 'Single-case details require the backend service')}</p>
        <p className="text-sm text-slate-700">
          {t('完整 prompt + 模型回复 + 事件流 + 诊断在 pod 上的', 'Full prompt + model response + event timeline + diagnostics live on the pod at')}{' '}
          <code className="bg-slate-100 text-indigo-700 px-1 rounded text-xs">artifacts/benchmarks/{`{run_id}`}/{`{task}`}/{`{fixture_id}`}.json</code>
        </p>
        <p><Link href="/leaderboard" className="text-indigo-600 hover:text-indigo-700 transition-colors">← {t('回到总榜', 'Back to leaderboard')}</Link></p>
      </div>
    </div>
  )
}
