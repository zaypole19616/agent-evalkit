// Server component shell for output: export.
// generateStaticParams enumerates every task present in the build-time
// benchmarks manifest. dynamicParams defaults to true so backend-served
// builds (no static snapshot) hydrate from the API at runtime.

import { promises as fs } from 'node:fs'
import path from 'node:path'

export async function generateStaticParams() {
  // ``_`` ALWAYS ships — the SPA fallback in ``service/src/main.py``
  // routes any task added after the image build to ``benchmarks/_/index.html``.
  // Without it on disk the fallback returns 404 ``page not built``.
  const params = new Set<string>(['_'])
  const file = path.join(process.cwd(), 'public', 'data', 'benchmarks', 'manifest.json')
  try {
    const text = await fs.readFile(file, 'utf8')
    const manifest = JSON.parse(text) as Array<{ task: string }>
    for (const m of manifest) params.add(m.task)
  } catch {
    // Backend-served — only the ``_`` shell ships; client hydrates
    // from /api/dashboard/benchmarks at runtime.
  }
  return Array.from(params).map((task) => ({ task }))
}

import BenchmarkTaskViewClient from './task-view'
export default function BenchmarkTaskPage() { return <BenchmarkTaskViewClient /> }
