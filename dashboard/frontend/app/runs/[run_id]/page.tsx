// Server component shell. generateStaticParams provides a placeholder so
// the static export can build; the actual UI lives in ./run-view (client).
export function generateStaticParams() {
  return [{ run_id: '_' }]
}

import RunView from './run-view'
export default function RunPage() { return <RunView /> }
