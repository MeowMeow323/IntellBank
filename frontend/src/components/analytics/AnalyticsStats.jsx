import React from 'react'

/**
 * A row of KPI stat tiles shared by the student and educator/admin analytics pages,
 * so both read as the same analytics surface.
 * items: [{ label, value, sub?, color? }]
 */
export default function AnalyticsStats({ items }) {
  return (
    <div className="an-stats">
      {items.map((it, i) => (
        <div key={i} className="an-stat">
          <div className="an-stat-value" style={it.color ? { color: it.color } : undefined}>{it.value}</div>
          <div className="an-stat-label">{it.label}</div>
          <div className="an-stat-sub">{it.sub || ' '}</div>
        </div>
      ))}
    </div>
  )
}
