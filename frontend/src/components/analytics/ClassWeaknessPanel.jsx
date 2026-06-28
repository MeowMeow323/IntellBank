import React, { useEffect, useState } from 'react'
import { AnalyticsService } from '../../services/api'
import '../../styles/analytics.css'

const TIER_BADGE = { High: 'badge-red', Medium: 'badge-amber', Low: 'badge-green' }

// Adjustable ranking options for the cohort weakness list.
const SORTS = {
  weakness_score: { label: 'Weakness score',         fn: (a, b) => b.weakness_score - a.weakness_score },
  pct_below_50:   { label: '% students below 50%',   fn: (a, b) => b.pct_below_50 - a.pct_below_50 },
  mean_band:      { label: 'Lowest average',         fn: (a, b) => a.mean_band - b.mean_band },
  weak_students:  { label: 'Most students affected', fn: (a, b) => b.weak_students - a.weak_students },
}

/**
 * Cohort "Class Weakness" panel — renders the output of our own trained weakness model
 * for one subject. Shared by the student Analytics page and the educator Analysis page.
 */
export default function ClassWeaknessPanel({ subject }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [sortBy, setSortBy] = useState('weakness_score')

  useEffect(() => {
    if (!subject) return
    let cancelled = false
    setLoading(true)
    AnalyticsService.getClassWeaknesses(subject)
      .then((res) => { if (!cancelled) setData(res.data) })
      .catch(() => { if (!cancelled) setData({ eligible: false, reason: 'Could not load class weaknesses.', topics: [] }) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [subject])

  if (loading) return <p className="pa-empty">Analysing cohort…</p>
  if (!data) return null

  if (!data.eligible) {
    return (
      <div className="pa-empty">
        <p>{data.reason || 'Not enough class data yet.'}</p>
        <p style={{ marginTop: '0.4rem', fontSize: '0.78rem' }}>
          {(data.n_submissions ?? 0)} graded submission{(data.n_submissions === 1 ? '' : 's')} · {(data.n_students ?? 0)} student{(data.n_students === 1 ? '' : 's')} so far.
        </p>
      </div>
    )
  }

  const topics = [...(data.topics || [])].sort(SORTS[sortBy].fn)

  return (
    <div>
      <div className="cw-head">
        <span className="cw-meta">{data.n_students} students · {data.n_submissions} submissions</span>
        <select className="cw-sort" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          {Object.entries(SORTS).map(([k, v]) => (
            <option key={k} value={k}>Sort: {v.label}</option>
          ))}
        </select>
      </div>

      <div className="cw-list">
        {topics.map((t) => (
          <div key={t.topicId} className="cw-item">
            <div style={{ flex: 1 }}>
              <div className="cw-topic">{t.topic}</div>
              <div className="cw-sub">
                {t.pct_below_50}% below 50% · avg {t.mean_band} · {t.weak_students}/{t.students_assessed} weak
              </div>
            </div>
            <span className={`badge ${TIER_BADGE[t.tier] || 'badge-gray'}`}>{t.tier}</span>
          </div>
        ))}
      </div>

      <p className="cw-model">Cohort weakness clustering · retrained on demand</p>
    </div>
  )
}
