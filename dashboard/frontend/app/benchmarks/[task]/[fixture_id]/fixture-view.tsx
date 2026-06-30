'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { useParams } from 'next/navigation'
import { api } from '@/lib/api-client'
import { FixtureFiles } from '@/components/fixture-viewer'
import { useT } from '@/lib/i18n'

export default function FixturePage() {
  const t = useT()
  const params = useParams<{ task: string; fixture_id: string }>()
  const { data } = useSWR(`bm-${params.task}`, () => api.benchmark(params.task))
  if (!data) return <p className="text-slate-700">{t('加载中…', 'Loading…')}</p>
  const f = data.fixtures.find((x) => x.id === params.fixture_id)
  if (!f) return <p className="text-rose-400">{t('未找到该测试用例。', 'Test case not found.')}</p>

  return (
    <div className="space-y-6 animate-fade-in">
      <header>
        <Link
          href={`/benchmarks/${params.task}`}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-700 transition-colors mb-3"
        >
          <span aria-hidden>←</span> {params.task}
        </Link>
        <h1 className="text-2xl font-semibold font-mono text-slate-900">{f.id}</h1>
        {f.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {f.tags.map((t) => (
              <span key={t} className="chip">#{t}</span>
            ))}
          </div>
        )}
      </header>

      <section>
        <h2 className="section-eyebrow mb-2">Prompt</h2>
        <pre className="whitespace-pre-wrap panel p-4 text-sm text-slate-700 font-mono leading-relaxed">{f.prompt}</pre>
      </section>

      {f.expected_answer_intent && (
        <section>
          <h2 className="section-eyebrow mb-2">{t('预期答案', 'Expected answer')}</h2>
          <p className="text-sm whitespace-pre-wrap text-slate-700 panel p-4">{f.expected_answer_intent}</p>
        </section>
      )}

      {f.files.length > 0 && (
        <section>
          <h2 className="section-eyebrow mb-2">{t('附件', 'Attachments')} · {f.files.length}</h2>
          <FixtureFiles task={params.task} files={f.files} />
        </section>
      )}
    </div>
  )
}
