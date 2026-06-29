'use client'

import { LiveProgress } from '@/components/live-progress'
import { RunHistory } from '@/components/run-history'

export default function LivePage() {
  return (
    <div className="space-y-8 animate-fade-in">
      <header>
        <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">
          实时<span className="heading-gradient">跑测</span>
        </h1>
        <p className="text-sm text-slate-700 mt-2">每 5 秒自动刷新 · chain 模式展示完整 model × task 矩阵 · 下方为历史记录</p>
      </header>
      <LiveProgress />
      <RunHistory />
    </div>
  )
}
