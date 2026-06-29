'use client'

// Auth context for the dashboard. Owns the JWT (in localStorage) + the
// in-memory user. Wraps the app so `useAuth()` is available everywhere.
//
// Behavior:
//   - On mount, try /api/dashboard/auth/config. If backend reports
//     `configured=false` (env vars missing) OR the call fails (no
//     backend at all, e.g. Vercel static export), we mark auth as
//     disabled and let the SPA run as anonymous read-only.
//   - When configured, gated pages redirect to /login if no JWT.
//   - signIn() accepts a Google id_token (from <GoogleLogin>), POSTs
//     to /api/dashboard/auth/google, stores the returned JWT.
//   - signOut() wipes localStorage and reloads to /login.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

type User = { email: string; name: string; picture: string }

interface AuthConfig {
  google_client_id: string
  configured: boolean
  allowed_domains: string[]
}

interface AuthState {
  ready: boolean
  enabled: boolean | null
  config: AuthConfig | null
  token: string | null
  user: User | null
  signIn: (googleIdToken: string) => Promise<{ ok: true } | { ok: false; error: string }>
  signOut: () => void
}

const Ctx = createContext<AuthState | null>(null)

const TOKEN_KEY = 'evalkit-dashboard-jwt'
const USER_KEY = 'evalkit-dashboard-user'

function loadStored<T>(key: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [config, setConfig] = useState<AuthConfig | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)

  // Boot: detect whether the backend has auth turned on.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let cfg: AuthConfig | null = null
      try {
        const r = await fetch('/api/dashboard/auth/config', { cache: 'no-store' })
        if (r.ok) cfg = (await r.json()) as AuthConfig
      } catch {
        cfg = null
      }
      if (cancelled) return
      setConfig(cfg)
      const on = !!(cfg && cfg.configured)
      setEnabled(on)
      if (on) {
        setToken(typeof window !== 'undefined' ? window.localStorage.getItem(TOKEN_KEY) : null)
        setUser(loadStored<User>(USER_KEY))
      }
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const signIn = useCallback(
    async (googleIdToken: string): Promise<{ ok: true } | { ok: false; error: string }> => {
      try {
        const r = await fetch('/api/dashboard/auth/google', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id_token: googleIdToken }),
        })
        if (!r.ok) {
          const detail = await r.json().catch(() => ({}))
          return { ok: false, error: detail.detail || `HTTP ${r.status}` }
        }
        const data = (await r.json()) as { access_token: string; user: User }
        window.localStorage.setItem(TOKEN_KEY, data.access_token)
        window.localStorage.setItem(USER_KEY, JSON.stringify(data.user))
        setToken(data.access_token)
        setUser(data.user)
        return { ok: true }
      } catch (e) {
        return { ok: false, error: String(e) }
      }
    },
    [],
  )

  const signOut = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(TOKEN_KEY)
      window.localStorage.removeItem(USER_KEY)
      window.location.href = '/login/'
    }
  }, [])

  const value = useMemo<AuthState>(
    () => ({ ready, enabled, config, token, user, signIn, signOut }),
    [ready, enabled, config, token, user, signIn, signOut],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>')
  return v
}

// Read the current JWT directly from localStorage. Used by the fetch
// wrapper which runs outside React render — context access would
// require threading a hook through every call site.
export function readStoredToken(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(TOKEN_KEY)
}

export function clearStoredToken(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(TOKEN_KEY)
  window.localStorage.removeItem(USER_KEY)
}
