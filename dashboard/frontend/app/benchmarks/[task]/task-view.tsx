'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { useParams } from 'next/navigation'
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api } from '@/lib/api-client'
import { taskLabel, taskDescription, taskScoringScale } from '@/lib/task-meta'
import { useT } from '@/lib/i18n'
import type { FixtureDef } from '@/lib/types'

// Rough heuristic for "this prompt will get clamped" — at ~13px text on
// a card half the page wide, two lines fit ~80 zh chars / ~120 ascii.
// Cards under this length are already fully visible, so skip the toggle.
const TRUNCATE_THRESHOLD = 80

export default function BenchmarkTaskPage() {
  const t = useT()
  const params = useParams<{ task: string }>()
  const { data } = useSWR(`bm-${params.task}`, () => api.benchmark(params.task))
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  if (!data) return <p className="text-slate-700">{t('加载中…', 'Loading…')}</p>

  const desc = taskDescription(data.task)
  const scale = taskScoringScale(data.task)
  const withFiles = data.fixtures.filter((f) => f.files.length > 0).length

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <header>
        <Link
          href="/benchmarks"
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-700 transition-colors mb-3"
        >
          <span aria-hidden>←</span> {t('测试集', 'Test sets')}
        </Link>
        <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">
          {taskLabel(data.task)}
        </h1>
        <div className="flex flex-wrap items-center gap-3 mt-2">
          <code className="text-xs text-slate-500 font-mono">{data.task}</code>
          <span className="text-slate-700">·</span>
          <span className="text-xs text-slate-700">{data.fixtures.length} {t('个测试用例', 'test cases')}</span>
          {withFiles > 0 && (
            <>
              <span className="text-slate-700">·</span>
              <span className="text-xs text-slate-700">{withFiles} {t('个含附件', 'with attachments')}</span>
            </>
          )}
        </div>
      </header>

      {desc && (
        <section className="panel p-6 space-y-3">
          <h2 className="section-eyebrow">{t('任务说明', 'Task description')}</h2>
          <p className="text-[15px] text-slate-700 leading-relaxed">{desc}</p>
          {scale && (
            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs text-slate-500">{t('评分', 'Scoring')}</span>
              <span className="chip-violet">{scale}</span>
            </div>
          )}
        </section>
      )}

      <section className="panel p-6 space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="section-eyebrow">{t('评分标准 · Rubric', 'Rubric')}</h2>
          <span className="text-[11px] text-slate-500 font-mono">{data.task}/rubric.md</span>
        </div>
        <div className="prose-light">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.rubric_markdown}</ReactMarkdown>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="section-eyebrow">{t('测试用例 · Fixtures', 'Fixtures')}</h2>
          <span className="text-[11px] text-slate-500 font-mono">{data.fixtures.length} items</span>
        </div>
        {/* ``items-start`` so an expanded card grows downward without
            stretching its siblings to match. Collapsed cards stay short
            and uniform. */}
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
          {data.fixtures.map((f) => (
            <FixtureCard
              key={f.id}
              task={params.task}
              fixture={f}
              expanded={expanded.has(f.id)}
              onToggle={() => toggleExpanded(f.id)}
            />
          ))}
        </ul>
      </section>
    </div>
  )
}

function FixtureCard({
  task,
  fixture: f,
  expanded,
  onToggle,
}: {
  task: string
  fixture: FixtureDef
  expanded: boolean
  onToggle: () => void
}) {
  const t = useT()
  const canExpand = (f.prompt?.length ?? 0) > TRUNCATE_THRESHOLD
  return (
    <li className="panel panel-hover p-4">
      <div className="flex items-start justify-between gap-3">
        <Link
          href={`/benchmarks/${task}/${f.id}`}
          className="font-mono text-indigo-600 hover:text-indigo-700 text-sm font-medium transition-colors"
        >
          {f.id}
        </Link>
        {f.files.length > 0 && <span className="chip-cyan shrink-0">{f.files.length} {t('附件', 'Attachments')}</span>}
      </div>
      <p
        className={`text-sm text-slate-700 mt-2 leading-relaxed whitespace-pre-wrap break-words ${
          expanded ? '' : 'line-clamp-2'
        }`}
      >
        {f.prompt}
      </p>
      {canExpand && (
        <button
          onClick={onToggle}
          className="mt-1.5 text-xs text-indigo-600 hover:text-indigo-700 transition-colors inline-flex items-center gap-0.5"
        >
          {expanded ? t('收起', 'Collapse') : t('展开', 'Expand')}
          <span aria-hidden className={`transition-transform ${expanded ? 'rotate-180' : ''}`}>↓</span>
        </button>
      )}
      {f.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {f.tags.map((t) => (
            <span key={t} className="text-[10px] text-slate-500 font-mono">
              #{t}
            </span>
          ))}
        </div>
      )}
    </li>
  )
}
