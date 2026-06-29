// Server component shell — generateStaticParams enumerates every model
// present in the build-time leaderboard.json snapshot. The client view
// reads /data/leaderboard.json at request time to show all historical
// runs for that model.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import ModelView from './model-view'

// dynamicParams=true lets the route fall back to client-side rendering
// for models not enumerated at build time. Required for the Docker
// (backend-served) build where copy-data.mjs skips the static snapshot
// — generateStaticParams returns [] and the page hydrates at runtime
// from the API. Vercel static build still pre-renders every model.
export const dynamicParams = true

export async function generateStaticParams() {
  // ``_`` is ALWAYS included — it's the SPA fallback shell that the
  // backend serves for any model added to leaderboard.json at runtime
  // (after the Docker image was built). Without it on disk, the
  // fallback handler in ``service/src/main.py`` returns 404
  // ``page not built`` instead of the client-rendered page.
  const params = new Set<string>(['_'])
  const file = path.join(process.cwd(), 'public', 'data', 'leaderboard.json')
  try {
    const text = await fs.readFile(file, 'utf8')
    const lb = JSON.parse(text) as { global: Array<{ model: string }> }
    for (const r of lb.global) params.add(r.model)
  } catch {
    // Backend-served mode — data lives at runtime, not in the bundle.
    // Only the ``_`` shell ships; the SPA fallback handler routes every
    // real request to it and the page hydrates from the API.
  }
  return Array.from(params).map((model) => ({ model }))
}

export default function ModelPage() {
  return <ModelView />
}
