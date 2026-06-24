import React, { useEffect, useMemo, useState } from 'react'
import { AnalyticsService } from '../../services/api'
import { heatColor, heatText, HEAT_GRADIENT } from './heatScale'

const bandFromScore = (s) =>
  s >= 90 ? 'Mastered' : s >= 70 ? 'Advanced' : s >= 50 ? 'Intermediate' : 'Beginner'

/**
 * Topics × Students mastery heat map (a true two-axis matrix).
 * Rows are topics, columns are students — or, when `groupSize` > 1, fixed-size
 * student groups (1–2, 3–4, …) whose cell is the group's average score. Grouping
 * also fills most empty cells, since a group is only blank when no member has data.
 */
export default function ClassMatrixHeatmap({ subject, anonymize = false, groupSize = 1, minGroups = 0 }) {
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

  // Columns: individual students, or fixed-size groups (1–2, 3–4, …).
  const columns = useMemo(() => {
    const students = data?.students || []
    if (groupSize <= 1) {
      return students.map((s, i) => ({
        id: s.id, label: anonymize ? `Student ${i + 1}` : s.name, memberIds: [s.id], grouped: false,
      }))
    }
    // Always show at least `minGroups` slots (e.g. 1–2, 3–4, 5–6, 7–8, 9–10);
    // groups with no students yet render as empty boxes so the grid stays full.
    const out = []
    const slots = Math.max(students.length, minGroups * groupSize)
    for (let i = 0; i < slots; i += groupSize) {
      const members = students.slice(i, i + groupSize)
      out.push({
        id: `g${i}`,
        label: groupSize > 1 ? `${i + 1}–${i + groupSize}` : `${i + 1}`,
        memberIds: members.map((m) => m.id),   // empty for padded groups
        grouped: true,
      })
    }
    return out
  }, [data, groupSize, anonymize])

  if (loading) return <p className="cm-empty">Building heat map…</p>
  if (!data || !columns.length || !(data.rows || []).length)
    return <p className="cm-empty">No student mastery data for {subject} yet.</p>

  // Average a column's member scores for a topic row (students with no data are skipped).
  const cellFor = (row, col) => {
    const cells = col.memberIds
      .map((id) => row.cells.find((c) => c.studentId === id))
      .filter((c) => c && c.score != null)
    if (!cells.length) return { score: null, n: 0, single: null }
    const score = Math.round(cells.reduce((a, c) => a + c.score, 0) / cells.length)
    return { score, n: cells.length, single: cells.length === 1 ? cells[0] : null }
  }

  // Grouped student view stretches columns to fill the card; individual view keeps
  // fixed-size square cells (so many students scroll horizontally instead of shrinking).
  const fill = groupSize > 1
  const gridCols = fill
    ? `180px repeat(${columns.length}, minmax(60px, 1fr))`
    : `180px repeat(${columns.length}, 58px)`

  return (
    <div>
      <div className="cm-axis">{groupSize > 1 ? 'Student groups →' : 'Students →'}</div>
      <div className="cm-scroll">
        <div className={`cm-grid ${fill ? 'cm-fill' : ''}`}
             style={{ gridTemplateColumns: gridCols, width: fill ? '100%' : undefined }}>
          <div className="cm-corner">Topic</div>
          {columns.map((c) => <div key={c.id} className="cm-colhead" title={c.label}>{c.label}</div>)}

          {data.rows.map((row) => (
            <React.Fragment key={row.topicId}>
              <div className="cm-rowhead" title={row.topicName}>{row.topicName}</div>
              {columns.map((col) => {
                const { score, n, single } = cellFor(row, col)
                const has = score != null
                const isSel = sel && sel.topicId === row.topicId && sel.colId === col.id
                return (
                  <button
                    key={col.id}
                    className={`cm-cell ${has ? '' : 'cm-na'} ${isSel ? 'cm-sel' : ''}`}
                    style={has ? { background: heatColor(score), color: heatText(score) } : undefined}
                    disabled={!has}
                    onClick={() => setSel(isSel ? null : {
                      topicId: row.topicId, topicName: row.topicName, colId: col.id, colLabel: col.label,
                      grouped: col.grouped, score, n,
                      band: single ? single.band : bandFromScore(score),
                      comment: single ? single.comment : null,
                    })}
                    title={has
                      ? `${col.grouped ? 'Students ' + col.label : col.label} · ${row.topicName}: ${single ? single.band : bandFromScore(score)} (${score}%)`
                      : 'Not assessed'}
                  >
                    {has ? score : '·'}
                  </button>
                )
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="cm-scalebar"><span>Weak</span><div /><span>Strong</span></div>

      {sel && (
        <div className="cm-detail">
          <div className="cm-detail-head">
            <span className="cm-detail-title">
              {sel.grouped ? `Students ${sel.colLabel}` : sel.colLabel} · {sel.topicName}
            </span>
            <span className="cm-pill" style={{ background: heatColor(sel.score), color: heatText(sel.score) }}>
              {sel.band} · {sel.score}%
            </span>
          </div>
          <p className="cm-note">
            {sel.grouped
              ? `Group average across ${sel.n} student${sel.n === 1 ? '' : 's'}.`
              : sel.comment ? `“${sel.comment}”` : 'No educator note.'}
          </p>
        </div>
      )}

      <style>{`
        .cm-empty { color: var(--text-muted); font-size: 0.9rem; }
        .cm-axis { font-size: 0.7rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-subtle); margin-bottom: 0.4rem; }
        /* Capped height with a frozen header row + topic column, so a long matrix
           scrolls inside the card instead of stretching the page. */
        .cm-scroll { overflow: auto; max-height: 520px; padding-bottom: 0.25rem; }
        .cm-grid { display: grid; gap: 5px; }
        .cm-grid:not(.cm-fill) { justify-content: start; }
        .cm-corner {
          font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
          color: var(--text-subtle); display: flex; align-items: flex-end; padding: 0 0.4rem 0.3rem;
          position: sticky; top: 0; left: 0; z-index: 3; background: var(--paper);
        }
        .cm-colhead {
          font-size: 0.72rem; font-weight: 600; color: var(--ink-soft); text-align: center;
          padding: 0 0.2rem 0.3rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          position: sticky; top: 0; z-index: 2; background: var(--paper);
        }
        .cm-rowhead {
          font-size: 0.78rem; font-weight: 500; color: var(--ink); display: flex; align-items: center;
          padding-right: 0.5rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          position: sticky; left: 0; z-index: 1; background: var(--paper);
        }
        .cm-cell {
          border: none; border-radius: 6px; cursor: pointer; font: inherit;
          font-size: 0.95rem; font-weight: 800; letter-spacing: -0.02em;
          display: flex; align-items: center; justify-content: center;
          transition: transform 0.1s, box-shadow 0.1s, outline 0.1s; outline: 2px solid transparent;
        }
        .cm-grid:not(.cm-fill) .cm-cell { aspect-ratio: 1 / 1; }
        .cm-grid.cm-fill .cm-cell { min-height: 76px; font-size: 1.45rem; }
        .cm-cell:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 3px 9px rgba(20,24,33,0.2); }
        .cm-na { background: var(--inset); color: var(--text-subtle); cursor: default; font-weight: 600; }
        .cm-sel { outline: 2.5px solid var(--ink); box-shadow: 0 0 0 3px rgba(26,30,39,0.12); }
        .cm-scalebar { display: flex; align-items: center; gap: 0.6rem; margin-top: 1rem; font-size: 0.74rem; color: var(--text-muted); }
        .cm-scalebar > div { flex: 1; height: 8px; border-radius: 4px; background: ${HEAT_GRADIENT}; }
        .cm-detail { margin-top: 1rem; background: var(--bg-surface-2); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 0.85rem 1rem; }
        .cm-detail-head { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; }
        .cm-detail-title { font-weight: 600; font-size: 0.9rem; }
        .cm-pill { padding: 0.2rem 0.6rem; border-radius: 999px; font-size: 0.74rem; font-weight: 700; white-space: nowrap; }
        .cm-note { margin: 0.5rem 0 0; font-size: 0.85rem; color: var(--text-muted); font-style: italic; }
      `}</style>
    </div>
  )
}
