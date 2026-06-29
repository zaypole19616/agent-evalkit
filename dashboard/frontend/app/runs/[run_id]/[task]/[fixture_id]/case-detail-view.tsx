'use client'

import useSWR from 'swr'
import { useParams } from 'next/navigation'
import { api } from '@/lib/api-client'
import { CaseDetailView } from '@/components/case-detail'

export default function CaseDetailPage() {
  const params = useParams<{ run_id: string; task: string; fixture_id: string }>()
  const { data, isLoading, error } = useSWR(
    `case-${params.run_id}-${params.task}-${params.fixture_id}`,
    () => api.caseDetail(params.run_id, params.task, params.fixture_id),
  )
  if (isLoading) return <p>Loading…</p>
  if (error) return <p className="text-red-600">Failed: {String(error)}</p>
  if (!data) return null
  return <CaseDetailView detail={data} />
}
