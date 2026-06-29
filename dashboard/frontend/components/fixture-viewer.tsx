'use client'

import type { FixtureDef } from '@/lib/types'

export function FixtureFiles({ task: _task, files }: { task: string; files: FixtureDef['files'] }) {
  if (!files || files.length === 0) return null
  return (
    <ul className="divide-y divide-slate-200/80 panel overflow-hidden">
      {files.map((f) => (
        <li key={f.name} className="px-3 py-2 text-sm font-mono text-slate-700">
          {f.name}
        </li>
      ))}
    </ul>
  )
}
