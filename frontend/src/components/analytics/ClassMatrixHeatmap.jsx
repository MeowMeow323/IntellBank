import React, { useEffect, useMemo, useState } from 'react'
import { AnalyticsService } from '../../services/api'
import { heatColor, heatText, HEAT_GRADIENT } from './heatScale'
import '../../styles/analytics.css'

const bandFromScore = (s) =>
  s >= 90 ? 'Mastered' : s >= 70 ? 'Advanced' : s >= 50 ? 'Intermediate' : 'Beginner'

const NUM_BUCKETS = 5   // fixed columns → 0–20%, 20–40%, 40–60%, 60–80%, 80–100%

/**
 * Topics × Students mastery heat map (two-axis matrix). The student axis is split into
 * 5 fixed PERCENTAGE buckets of the cohort (0–20% … 80–100%) instead of student numbers,
 * so the column count never grows with class size. Each cell is the average score of the
 * students in that bucket for that topic. Click a cell for details.
 */
export default function ClassMatrixHeatmap({ subject }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [sel, setSel] = useState(null)

  useEffect(() => {
    if (!subject) return
    let cancelled = false
    setLoading(true); setSel(null)
    AnalyticsService.getClassMatrix(subject)
      .then((res) => { if (!cancelled) setData(res.data) })
      .catch(() => { if (!cancelled) setData(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [subject])

  // 5 equal percentage buckets of the cohort, distributed as evenly as possible.
  const columns = useMemo(() => {
    const students = data?.students || []
    const n = students.length
    const base = Math.floor(n / NUM_BUCKETS)
    const extra = n % NUM_BUCKETS
    const cols = []
    let idx = 0
    for (let b = 0; b < NUM_BUCKETS; b++) {
      const size = base + (b < extra ? 1 : 0)
      const memberIds = []
      for (let k = 0; k < size; k++) { if (students[idx]) memberIds.push(students[idx].id); idx++ }
      cols.push({ id: `b${b}`, label: `${b * 20}–${(b + 1) * 20}%`, memberIds })
    }
    return cols
  }, [data])

  if (loading) return <p className="cm-empty">Building heat map…</p>
  if (!data || !(data.rows || []).length)
    return <p className="cm-empty">No student mastery data for {subject} yet.</p>

  // Average the bucket's member scores for a topic row (students with no data are skipped).
  const cellFor = (row, col) => {
    const cells = col.memberIds
      .map((id) => row.cells.find((c) => c.studentId === id))
      .filter((c) => c && c.score != null)
    if (!cells.length) return { score: null, n: 0 }
    const score = Math.round(cells.reduce((a, c) => a + c.score, 0) / cells.length)
    return { score, n: cells.length }
  }

  const gridCols = `180px repeat(${NUM_BUCKETS}, minmax(60px, 1fr))`

  return (
    <div>
      <div className="cm-axis">% of students →</div>
      <div className="cm-scroll">
        <div className="cm-grid" style={{ gridTemplateColumns: gridCols, width: '100%' }}>
          <div className="cm-corner">Topic</div>
          {columns.map((c) => <div key={c.id} className="cm-colhead">{c.label}</div>)}

          {data.rows.map((row) => (
            <React.Fragment key={row.topicId}>
              <div className="cm-rowhead" title={row.topicName}>{row.topicName}</div>
              {columns.map((col) => {
                const { score, n } = cellFor(row, col)
                const has = score != null
                const isSel = sel && sel.topicId === row.topicId && sel.colId === col.id
                return (
                  <button
                    key={col.id}
                    className={`cm-cell ${has ? '' : 'cm-na'} ${isSel ? 'cm-sel' : ''}`}
                    style={has ? { background: heatColor(score), color: heatText(score) } : undefined}
                    disabled={!has}
                    onClick={() => setSel(isSel ? null : {
                      topicId: row.topicId, topicName: row.topicName,
                      colId: col.id, colLabel: col.label, score, n,
                    })}
                    title={has
                      ? `${row.topicName} · ${col.label} of students: avg ${score}% (${n} student${n === 1 ? '' : 's'})`
                      : 'No students in this band'}
                  >
                    {has ? score : '·'}
                  </button>
                )
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="cm-scalebar"><span>Weak</span><div style={{ background: HEAT_GRADIENT }} /><span>Strong</span></div>

      {sel && (
        <div className="cm-detail">
          <div className="cm-detail-head">
            <span className="cm-detail-title">{sel.colLabel} of students · {sel.topicName}</span>
            <span className="cm-pill" style={{ background: heatColor(sel.score), color: heatText(sel.score) }}>
              {bandFromScore(sel.score)} · {sel.score}%
            </span>
          </div>
          <p className="cm-note">Average of {sel.n} student{sel.n === 1 ? '' : 's'} in this segment.</p>
        </div>
      )}

    </div>
  )
}
