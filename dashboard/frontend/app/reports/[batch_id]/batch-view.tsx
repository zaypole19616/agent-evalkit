'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { useState } from 'react'
import { api } from '@/lib/api-client'
import { useRouteId } from '@/lib/use-route-id'
import { NarrativeRenderer } from '@/components/narrative-renderer'
import { useT } from '@/lib/i18n'
import type { ReportEntry } from '@/lib/types'

const GROUP_ORDER: ReportEntry['type'][] = ['overview', 'model', 'backlog']

export default function BatchView() {
  const t = useT()
  const groupLabel = (type: ReportEntry['type']) =>
    type === 'overview'
      ? t('综合', 'Overview')
      : type === 'model'
        ? t('逐模型', 'Per-model')
        : t('Bug Backlog', 'Bug Backlog')
  const batchId = useRouteId('batch_id')
  const { data: manifest, error } = useSWR(
    batchId ? `report-manifest-${batchId}` : null,
    () => api.reportManifest(batchId),
  )
  const [selected, setSelected] = useState<string | null>(null)

  if (error) return <p className="text-rose-400">{t('无法加载报告：', 'Couldn’t load this report: ')}{String(error)}</p>
  if (!manifest) return <p className="text-slate-700">{t('加载中…', 'Loading…')}</p>

  // Default to the overview (or the first report) until the user picks one.
  const current =
    selected ??
    manifest.reports.find((r) => r.type === 'overview')?.file ??
    manifest.reports[0]?.file ??
    null

  const groups = GROUP_ORDER
    .map((type) => ({ type, items: manifest.reports.filter((r) => r.type === type) }))
    .filter((g) => g.items.length > 0)

  return (
    <div className="animate-fade-in">
      <header className="mb-5">
        <Link href="/reports" className="text-xs text-slate-500 hover:text-slate-900">← {t('全部报告', 'All reports')}</Link>
        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight mt-1">{manifest.title}</h1>
        <div className="flex flex-wrap gap-1.5 mt-2">
          <span className="chip">{manifest.date}</span>
          {manifest.engine_version && <span className="chip font-mono">engine {manifest.engine_version}</span>}
          {manifest.judge && <span className="chip">judge {manifest.judge}</span>}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
        {/* Report list */}
        <aside className="space-y-4">
          {groups.map((g) => (
            <div key={g.type}>
              <div className="section-eyebrow text-slate-500 mb-1.5">{groupLabel(g.type)}</div>
              <div className="flex flex-col gap-0.5">
                {g.items.map((r) => {
                  const active = r.file === current
                  return (
                    <button
                      key={r.file}
                      onClick={() => setSelected(r.file)}
                      className={`text-left text-sm px-2.5 py-1.5 rounded-md transition-colors ${
                        active ? 'bg-slate-100 text-slate-900 font-medium' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      {r.title}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </aside>

        {/* Rendered markdown */}
        <main className="panel p-6 min-w-0">
          {current ? <ReportBody batchId={batchId} file={current} /> : <p className="text-slate-500">{t('没有报告。', 'No report.')}</p>}
        </main>
      </div>
    </div>
  )
}

function ReportBody({ batchId, file }: { batchId: string; file: string }) {
  const t = useT()
  const { data, error } = useSWR(`report-md-${batchId}-${file}`, () => api.reportMarkdown(batchId, file))
  if (error) return <p className="text-rose-400">{t('无法加载该报告：', 'Couldn’t load this report: ')}{String(error)}</p>
  if (!data) return <p className="text-slate-700">{t('加载中…', 'Loading…')}</p>
  return <NarrativeRenderer markdown={data.markdown} />
}
