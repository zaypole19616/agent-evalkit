export function generateStaticParams() {
  return [{ run_id: '_', task: '_', fixture_id: '_' }]
}

import CaseView from './case-view'
export default function CasePage() { return <CaseView /> }
