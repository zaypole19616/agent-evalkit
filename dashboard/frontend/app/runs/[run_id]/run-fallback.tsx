'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'

export default function RunFallback() {
  const params = useParams<{ run_id: string }>()
  return (
    <div className="space-y-4 animate-fade-in">
      <h2 className="text-2xl font-semibold font-mono text-slate-900">{params.run_id}</h2>
      <div className="panel p-5 space-y-2 border-amber-200">
        <p className="font-semibold text-amber-700">单 Run 报告需要后端服务</p>
        <p className="text-sm text-slate-700">
          P1 报告（雷达图 + cases + LLM 总结）依赖{' '}
          <code className="bg-slate-100 text-indigo-700 px-1 rounded">reports/{`{run_id}`}</code> 和{' '}
          <code className="bg-slate-100 text-indigo-700 px-1 rounded">artifacts/</code> 下的运行产物，这些数据需要后端读取本地评测产物（artifacts/）。
        </p>
        <p className="text-sm text-slate-700">本地查看方式：</p>
        <pre className="bg-slate-50 border border-slate-200 text-slate-700 rounded p-3 text-xs font-mono">{`cd agent-evalkit
EVALKIT_DASHBOARD_ROOT="$PWD" uvicorn dashboard.backend.routes:build_app --factory --port 8000
# 另开终端
cd dashboard/frontend && pnpm dev`}</pre>
        <p><Link href="/leaderboard" className="text-indigo-600 hover:text-indigo-700 transition-colors">← 回到总榜</Link></p>
      </div>
    </div>
  )
}
