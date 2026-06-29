'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { api } from '@/lib/api-client'

export default function ReportsIndex() {
  const { data, error } = useSWR('report-batches', () => api.reportBatches())
  if (error) return <p className="text-rose-400">暂时无法加载评测报告：{String(error)}</p>
  if (!data) return <p className="text-slate-700">加载中…</p>

  return (
    <div className="space-y-8 animate-fade-in">
      <header>
        <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">
          <span className="heading-gradient">评测报告</span>
        </h1>
        <p className="text-sm text-slate-700 mt-2">
          每次对比战役一份：综合报告 + 逐模型报告 + bug backlog。结论里的 fixture 可顺指针跳到原始日志。
        </p>
      </header>

      {data.length === 0 ? (
        <p className="text-slate-500 text-sm">还没有报告。把一个 batch 目录放进 <code>eval-reports/</code> 即可。</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map((b) => (
            <Link
              key={b.batch_id}
              href={`/reports/${encodeURIComponent(b.batch_id)}`}
              className="panel panel-hover p-5 block group hover:shadow-glow-cyan"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h3 className="font-semibold text-slate-900 text-base group-hover:text-indigo-700 transition-colors">
                    {b.title}
                  </h3>
                  <code className="text-[11px] text-slate-500 font-mono">{b.batch_id}</code>
                </div>
                <span aria-hidden className="text-slate-700 group-hover:text-indigo-700 group-hover:translate-x-0.5 transition-all">
                  →
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                <span className="chip">{b.date}</span>
                <span className="chip">{b.report_count} 份报告</span>
                {b.engine_version && <span className="chip font-mono">engine {b.engine_version}</span>}
              </div>
              <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                {b.models.map((m) => (
                  <span key={m} className="text-[11px] text-slate-500">{m}</span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
