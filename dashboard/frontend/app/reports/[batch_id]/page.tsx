// Server component shell for output: export. generateStaticParams enumerates
// every report batch present in the build-time static snapshot
// (public/data/reports/index.json) so the Vercel static build pre-renders
// each batch page. dynamicParams=true lets the backend-served build fall
// back to client-side rendering for batches added at runtime.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import BatchView from './batch-view'

export const dynamicParams = true

export async function generateStaticParams() {
  const params = new Set<string>(['_'])
  const file = path.join(process.cwd(), 'public', 'data', 'reports', 'index.json')
  try {
    const text = await fs.readFile(file, 'utf8')
    const batches = JSON.parse(text) as Array<{ batch_id: string }>
    for (const b of batches) params.add(b.batch_id)
  } catch {
    // Backend-served mode — batches live at runtime, not in the bundle.
  }
  return Array.from(params).map((batch_id) => ({ batch_id }))
}

export default function ReportBatchPage() {
  return <BatchView />
}
