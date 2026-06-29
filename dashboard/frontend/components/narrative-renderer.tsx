'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function NarrativeRenderer({ markdown }: { markdown: string }) {
  return (
    <div className="prose-light">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
    </div>
  )
}
