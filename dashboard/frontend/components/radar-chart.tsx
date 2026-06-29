'use client'

import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
} from 'recharts'
import type { TaskSummary } from '@/lib/types'
import { OutwardTick } from '@/components/radar-tick'

const TASK_LABELS: Record<string, string> = {
  search: '搜索', html_gen: 'HTML', recall: '召回',
  md_gen: 'Markdown', html_gen_doc: 'HTML 文档',
  xlsx_gen: 'Excel', pptx_gen: 'PPT', pdf_docx_gen: 'PDF/Word',
}

export function TaskRadar({ tasks }: { tasks: TaskSummary[] }) {
  const data = tasks.map((t) => ({
    task: TASK_LABELS[t.task] ?? t.task,
    score: t.score,
  }))
  return (
    <div className="w-full h-80">
      <ResponsiveContainer>
        <RadarChart data={data} outerRadius="68%" margin={{ top: 24, right: 50, bottom: 24, left: 50 }}>
          <defs>
            <radialGradient id="taskRadarFill" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.55} />
              <stop offset="100%" stopColor="#6366f1" stopOpacity={0.08} />
            </radialGradient>
          </defs>
          <PolarGrid stroke="rgba(148,163,184,0.35)" strokeDasharray="2 3" />
          <PolarAngleAxis dataKey="task" tick={<OutwardTick fill="#475569" fontSize={12} offset={14} />} />
          <PolarRadiusAxis angle={90} domain={[0, 5]} tick={{ fill: '#94a3b8', fontSize: 10 }} stroke="rgba(148,163,184,0.35)" axisLine={false} />
          <Radar
            dataKey="score"
            stroke="#22d3ee"
            strokeWidth={2}
            fill="url(#taskRadarFill)"
            fillOpacity={1}
            dot={{ fill: '#22d3ee', stroke: '#ffffff', strokeWidth: 1.5, r: 3 }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}
