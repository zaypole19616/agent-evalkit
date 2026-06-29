// Server component shell for output: export.
// generateStaticParams must return ≥1 entry to satisfy the static-export check;
// the placeholder path is never served — client SWR fetches real data at runtime.
export function generateStaticParams() {
  return [{ task: '_', fixture_id: '_' }]
}

import FixtureViewClient from './fixture-view'
export default function FixturePage() { return <FixtureViewClient /> }
