'use client'

import { useParams, usePathname } from 'next/navigation'

/**
 * Resolve a single trailing dynamic-route segment robustly under static export.
 *
 * With Next `output: 'export'`, a dynamic route (`[id]/page.tsx`) is
 * pre-rendered ONLY for the `_` placeholder we return from
 * generateStaticParams. On a HARD load or refresh, the server's SPA fallback
 * serves that `_` shell — so `useParams()` hydrates with `'_'`, not the real
 * value from the URL. (On in-app navigation the router sets the real param, so
 * it only bites direct-load / refresh.)
 *
 * Prefer `useParams()` (correct after client-side navigation); when it's the
 * `_` placeholder, fall back to the last URL path segment, which is always the
 * real id. Works for single-trailing-param routes: /reports/[batch_id],
 * /models/[model], /runs/[run_id].
 */
export function useRouteId(name: string): string {
  const params = useParams<Record<string, string>>()
  const pathname = usePathname()
  const fromParams = params?.[name]
  const raw =
    fromParams && fromParams !== '_'
      ? fromParams
      : pathname?.split('/').filter(Boolean).pop() ?? fromParams ?? ''
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}
