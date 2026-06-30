'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { useLang, useT } from '@/lib/i18n'

const NAV_LINKS = [
  {
    href: '/leaderboard',
    label: ['总榜', 'Leaderboard'] as const,
    isActive: (pathname: string) =>
      pathname.startsWith('/leaderboard') ||
      pathname.startsWith('/runs') ||
      pathname.startsWith('/models'),
  },
  {
    href: '/live',
    label: ['实时', 'Live'] as const,
    isActive: (pathname: string) => pathname.startsWith('/live'),
  },
  {
    href: '/benchmarks',
    label: ['测试集', 'Test sets'] as const,
    isActive: (pathname: string) => pathname.startsWith('/benchmarks'),
  },
  {
    href: '/compare',
    label: ['对比', 'Compare'] as const,
    isActive: (pathname: string) => pathname.startsWith('/compare'),
  },
  {
    href: '/reports',
    label: ['报告', 'Reports'] as const,
    isActive: (pathname: string) => pathname.startsWith('/reports'),
  },
]

export function Nav() {
  const pathname = usePathname()
  const { enabled, user, signOut } = useAuth()
  const { lang, setLang } = useLang()
  const t = useT()

  // /login is a full-bleed marketing-style page — the chrome would
  // compete with the centered card. Skip the nav entirely there.
  if (pathname?.startsWith('/login')) return null

  return (
    <nav className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur-md px-6 py-3 flex gap-7 text-sm items-center">
      {/* Brand mark — small diamond + gradient wordmark. */}
      <Link href="/leaderboard" className="flex items-center gap-2 group">
        <span className="relative inline-flex w-5 h-5">
          <span className="absolute inset-0 rounded-sm rotate-45 bg-accent-gradient opacity-80 group-hover:opacity-100 transition-opacity" />
          <span className="absolute inset-1 rounded-[3px] rotate-45 bg-white" />
        </span>
        <span className="font-semibold tracking-tight heading-gradient text-[15px]">agent-evalkit</span>
      </Link>

      <div className="flex gap-1 items-center">
        {NAV_LINKS.map(({ href, label, isActive }) => {
          const active = isActive(pathname)
          return (
            <Link
              key={href}
              href={href}
              className={`relative px-3 py-1.5 rounded-md transition-colors duration-150 ${
                active ? 'text-slate-900' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {t(label[0], label[1])}
              {active && (
                <span
                  aria-hidden
                  className="absolute left-2 right-2 -bottom-[14px] h-[2px] bg-accent-gradient rounded-full shadow-glow-cyan"
                />
              )}
            </Link>
          )
        })}
      </div>

      <div className="ml-auto flex items-center gap-3">
        <button
          onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
          className="text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors border border-slate-200 rounded-md px-2 py-1"
          title={t('切换语言', 'Switch language')}
        >
          {lang === 'zh' ? 'EN' : '中'}
        </button>
        {enabled && user && (
          <>
            <span className="hidden sm:inline-flex items-center gap-2 text-xs text-slate-600">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-glow-emerald" />
              {user.email}
            </span>
            <button
              onClick={signOut}
              className="text-xs text-slate-500 hover:text-slate-900 transition-colors"
              title={t('退出登录', 'Sign out')}
            >
              {t('退出', 'Sign out')}
            </button>
          </>
        )}
      </div>
    </nav>
  )
}
