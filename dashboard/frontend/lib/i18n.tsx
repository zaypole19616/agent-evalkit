'use client'

// Tiny client-side i18n. Each call site provides both languages inline:
//   const t = useT()
//   <h1>{t('总榜', 'Leaderboard')}</h1>
// No key files to maintain — translations live next to usage. Language is
// persisted in localStorage and defaults to the browser language (zh* → zh,
// otherwise en). Static-export safe: server renders the 'en' default, the
// client effect picks the real language after hydration.

import { createContext, useCallback, useContext, useEffect, useState } from 'react'

export type Lang = 'en' | 'zh'

const LANG_KEY = 'evalkit-lang'

interface LangState {
  lang: Lang
  setLang: (l: Lang) => void
  ready: boolean
}

const Ctx = createContext<LangState>({ lang: 'en', setLang: () => {}, ready: false })

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let initial: Lang = 'en'
    try {
      const stored = window.localStorage.getItem(LANG_KEY)
      if (stored === 'en' || stored === 'zh') initial = stored
      else if (navigator.language?.toLowerCase().startsWith('zh')) initial = 'zh'
    } catch {
      /* ignore */
    }
    setLangState(initial)
    setReady(true)
  }, [])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try {
      window.localStorage.setItem(LANG_KEY, l)
    } catch {
      /* ignore */
    }
  }, [])

  return <Ctx.Provider value={{ lang, setLang, ready }}>{children}</Ctx.Provider>
}

export function useLang(): LangState {
  return useContext(Ctx)
}

// Returns t(zh, en) → the string in the current language.
export function useT(): (zh: string, en: string) => string {
  const { lang } = useContext(Ctx)
  return useCallback((zh: string, en: string) => (lang === 'zh' ? zh : en), [lang])
}
