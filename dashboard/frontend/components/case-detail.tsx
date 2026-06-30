'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { EventsTimeline } from './events-timeline'
import { useT } from '@/lib/i18n'
import type { CaseDetail as CaseDetailT } from '@/lib/types'

export function CaseDetailView({ detail }: { detail: CaseDetailT }) {
  const t = useT()
  const statusChip = detail.status === 'bad' ? 'chip-rose' : 'chip-emerald'
  return (
    <div className="space-y-6 animate-fade-in">
      <header>
        <h2 className="text-2xl font-semibold font-mono text-slate-900">{detail.fixture_id}</h2>
        <div className="flex flex-wrap items-center gap-2 mt-2 text-sm">
          <code className="text-xs text-slate-500 font-mono">{detail.task}</code>
          <span className="text-slate-700">·</span>
          <code className="text-xs text-slate-500 font-mono">{detail.run_id}</code>
          <span className={statusChip}>{detail.status}</span>
          {detail.judge_score != null && <span className="chip">{t('判官', 'Judge')} {detail.judge_score}</span>}
          {detail.elapsed_s != null && <span className="chip">{detail.elapsed_s.toFixed(1)}s</span>}
          {detail.tool_call_count != null && <span className="chip">{detail.tool_call_count} tools</span>}
        </div>
      </header>

      {detail.prompt && (
        <Section title="Prompt">
          <pre className="whitespace-pre-wrap panel p-4 text-sm text-slate-700 font-mono leading-relaxed">{detail.prompt}</pre>
        </Section>
      )}

      {detail.expected_answer_intent && (
        <Section title={t('预期答案', 'Expected answer')}>
          <p className="text-sm whitespace-pre-wrap text-slate-700 panel p-4">{detail.expected_answer_intent}</p>
        </Section>
      )}

      {detail.response_text && (
        <Section title={t('模型回复', 'Response')}>
          <pre className="whitespace-pre-wrap panel p-4 text-sm text-slate-700 font-mono leading-relaxed">{detail.response_text}</pre>
        </Section>
      )}

      <Section title={t('事件流', 'Event timeline')}>
        <EventsTimeline events={detail.events} />
      </Section>

      {detail.diagnostic_markdown && (
        <Section title={t('诊断', 'Diagnostics')}>
          <div className="panel p-5">
            <div className="prose-light">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{detail.diagnostic_markdown}</ReactMarkdown>
            </div>
          </div>
        </Section>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="section-eyebrow mb-2">{title}</h3>
      {children}
    </section>
  )
}
