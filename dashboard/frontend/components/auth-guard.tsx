'use client'

// Client-side route guard: redirects unauthenticated users to /login
// when the backend reports auth is enabled. No-op when auth is disabled
// (dev / Vercel static mode) or when we're already on the login page.

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { ready, enabled, token } = useAuth()
  const pathname = usePathname()

  useEffect(() => {
    if (!ready) return
    if (!enabled) return
    if (pathname?.startsWith('/login')) return
    if (!token) window.location.href = '/login/'
  }, [ready, enabled, token, pathname])

  if (!ready) return <p className="text-slate-700">加载中…</p>
  if (enabled && !token && !pathname?.startsWith('/login')) {
    return <p className="text-slate-700">正在跳转登录…</p>
  }
  return <>{children}</>
}
