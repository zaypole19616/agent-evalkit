'use client'

import { useEffect, useState } from 'react'
import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google'
import { useAuth } from '@/lib/auth-context'

// /login — Google Sign-In, full-bleed marketing-style page. Three
// long-period drifting gradient blobs paint behind the card so the
// page feels alive without distracting; the layout uses ``fixed
// inset-0`` to escape the bounded ``<main>`` wrapper from layout.tsx.
// Nav.tsx already short-circuits on this route.

function AnimatedBackdrop() {
  return (
    <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
      {/* Three blobs, each on its own slow drift cycle, sized + blurred
          to read as ambient mist rather than discrete shapes. */}
      <div className="absolute -top-40 -left-32 h-[680px] w-[680px] rounded-full bg-violet-300/50 blur-3xl animate-drift-a" />
      <div className="absolute top-1/4 right-[-15%] h-[600px] w-[600px] rounded-full bg-cyan-300/45 blur-3xl animate-drift-b" />
      <div className="absolute bottom-[-25%] left-1/3 h-[700px] w-[700px] rounded-full bg-indigo-300/40 blur-3xl animate-drift-c" />
      {/* Faint grid for a subtle "computational" texture. */}
      <div className="absolute inset-0 bg-subtle-grid bg-[size:48px_48px] opacity-40" />
    </div>
  )
}

export default function LoginPage() {
  const { ready, enabled, config, token, signIn } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (ready && token) window.location.href = '/leaderboard/'
  }, [ready, token])

  if (!ready) return <p className="text-slate-500">加载中…</p>

  if (enabled === false) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-50">
        <AnimatedBackdrop />
        <div className="max-w-md panel p-8 space-y-3 relative">
          <h1 className="text-xl font-semibold text-slate-900">登录</h1>
          <p className="text-sm text-slate-700">
            当前后端未启用鉴权（开发模式）。直接访问任意页面即可。
          </p>
          <a href="/leaderboard/" className="btn-primary w-fit mt-2">→ 进入总榜</a>
        </div>
      </div>
    )
  }

  const clientId = config?.google_client_id || ''
  const allowed = (config?.allowed_domains || []).map((d) => `@${d}`).join(' / ')

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-slate-50">
      <AnimatedBackdrop />
      <div className="w-full max-w-md mx-6 panel p-8 space-y-7 animate-fade-in shadow-glow-indigo relative">
        {/* Branded header */}
        <div className="text-center space-y-3">
          <div className="inline-flex w-12 h-12 items-center justify-center">
            <span className="relative inline-flex w-10 h-10">
              <span className="absolute inset-0 rounded-md rotate-45 bg-accent-gradient opacity-90 animate-pulse-soft" />
              <span className="absolute inset-1.5 rounded-[5px] rotate-45 bg-white" />
            </span>
          </div>
          <h1 className="text-2xl font-semibold heading-gradient tracking-tight">agent-evalkit</h1>
          <p className="text-sm text-slate-600">
            {allowed ? <>仅限 <span className="text-slate-900 font-mono">{allowed}</span> 邮箱登录</> : '登录以访问私有看板'}
          </p>
        </div>

        <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

        {!clientId ? (
          <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
            Google OAuth 客户端未配置。请联系管理员设置 <code className="text-rose-800">DASHBOARD_GOOGLE_CLIENT_ID</code>。
          </div>
        ) : (
          <GoogleOAuthProvider clientId={clientId}>
            <div className="flex flex-col items-center gap-3">
              <GoogleLogin
                onSuccess={async (cred) => {
                  if (!cred.credential) {
                    setError('Google 未返回凭证')
                    return
                  }
                  setBusy(true)
                  setError(null)
                  const res = await signIn(cred.credential)
                  setBusy(false)
                  if (res.ok) {
                    window.location.href = '/leaderboard/'
                  } else {
                    setError(res.error)
                  }
                }}
                onError={() => setError('Google 登录失败，请重试')}
                theme="filled_black"
                size="large"
                text="signin_with"
                shape="pill"
              />
              {busy && (
                <p className="text-sm text-cyan-700 inline-flex items-center gap-1.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse-soft" />
                  校验中…
                </p>
              )}
              {error && (
                <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2 w-full text-center">
                  {error}
                </p>
              )}
            </div>
          </GoogleOAuthProvider>
        )}
      </div>
    </div>
  )
}
