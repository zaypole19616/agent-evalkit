'use client'

export function EventsTimeline({ events }: { events: Array<{ event: string; t_ms: number }> }) {
  if (!events || events.length === 0) return <p className="text-sm text-slate-700">无事件记录。</p>
  return (
    <ol className="text-sm font-mono space-y-1 panel p-4">
      {events.map((e, i) => (
        <li key={i} className="flex gap-4 group">
          <span className="text-slate-500 w-16 text-right tabular-nums">{(e.t_ms / 1000).toFixed(2)}s</span>
          <span className="text-slate-700 group-hover:text-indigo-700 transition-colors">{e.event}</span>
        </li>
      ))}
    </ol>
  )
}
