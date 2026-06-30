'use client'

import { LiveProgress } from '@/components/live-progress'
import { RunHistory } from '@/components/run-history'
import { useT } from '@/lib/i18n'

export default function LivePage() {
  const t = useT()
  return (
    <div className="space-y-8 animate-fade-in">
      <header>
        <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">
          {t('实时', 'Live ')}<span className="heading-gradient">{t('跑测', 'runs')}</span>
        </h1>
        <p className="text-sm text-slate-700 mt-2">{t('每 5 秒自动刷新', 'Auto-refreshes every 5s')} · {t('chain 模式展示完整 model × task 矩阵', 'chain mode shows the full model × task matrix')} · {t('下方为历史记录', 'history below')}</p>
      </header>
      <LiveProgress />
      <RunHistory />
    </div>
  )
}
