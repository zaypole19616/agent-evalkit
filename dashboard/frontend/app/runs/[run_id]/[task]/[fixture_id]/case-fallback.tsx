'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'

export default function CaseFallback() {
  const params = useParams<{ run_id: string; task: string; fixture_id: string }>()
  return (
    <div className="space-y-4 animate-fade-in">
      <h2 className="text-2xl font-semibold font-mono text-slate-900">{params.fixture_id}</h2>
      <p className="text-sm text-slate-700 font-mono">{params.task} · {params.run_id}</p>
      <div className="panel p-5 space-y-2 border-amber-200">
        <p className="font-semibold text-amber-700">单 Case 详情需要后端服务</p>
        <p className="text-sm text-slate-700">
          完整 prompt + 模型回复 + 事件流 + 诊断信息存在 pod 上的{' '}
          <code className="bg-slate-100 text-indigo-700 px-1 rounded text-xs">artifacts/benchmarks/{`{run_id}`}/{`{task}`}/{`{fixture_id}`}.json</code>{' '}
          中。
        </p>
        <p><Link href="/leaderboard" className="text-indigo-600 hover:text-indigo-700 transition-colors">← 回到总榜</Link></p>
      </div>
    </div>
  )
}
