'use client'

// Custom PolarAngleAxis tick that pushes each label further outward
// along the radial direction. Recharts' default tick sits right on
// the outer ring — when ``outerRadius`` is small the labels overlap
// the polygon edge. We compute the unit radial vector from chart
// center ``(cx, cy)`` to the tick position ``(x, y)`` and add a
// fixed offset along it.

import type { ReactElement } from 'react'

interface TickProps {
  // Recharts injects these at render time.
  x?: number
  y?: number
  cx?: number
  cy?: number
  payload?: { value: string }
  textAnchor?: string
  // Style — passed when used as ``tick={<OutwardTick fill="..." />}``
  fill?: string
  fontSize?: number
  fontWeight?: number | string
  offset?: number
}

export function OutwardTick({
  x = 0,
  y = 0,
  cx = 0,
  cy = 0,
  payload,
  textAnchor = 'middle',
  fill = '#475569',
  fontSize = 12,
  fontWeight = 500,
  offset = 14,
}: TickProps): ReactElement {
  const dx = x - cx
  const dy = y - cy
  const len = Math.hypot(dx, dy) || 1
  const nx = x + (dx / len) * offset
  const ny = y + (dy / len) * offset
  return (
    <text x={nx} y={ny} textAnchor={textAnchor} dominantBaseline="middle" fill={fill} fontSize={fontSize} fontWeight={fontWeight}>
      {payload?.value ?? ''}
    </text>
  )
}
