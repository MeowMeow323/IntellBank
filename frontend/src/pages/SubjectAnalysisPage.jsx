import React, { useEffect, useState, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line, ResponsiveContainer, Cell,
} from 'recharts'
import { AnalyticsService } from '../services/api'
import Sidebar from '../components/layout/Sidebar.jsx'

// ── Constants ─────────────────────────────────────────────────────────────────
const DIFF_COLORS  = { easy: '#5AB552', medium: '#F4C430', hard: '#E04A3F', untagged: '#94a3b8' }
const LINE_PALETTE = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#6366f1', '#ef4444', '#14b8a6']
const PAPER_LIMIT_OPTIONS = [
  { label: 'All papers',     value: null },
  { label: '5 latest',       value: 5  },
  { label: '10 latest',      value: 10 },
  { label: '20 latest',      value: 20 },
]

const truncate = (str, n = 18) => str.length > n ? str.slice(0, n - 1) + '…' : str


// ── Tooltips ──────────────────────────────────────────────────────────────────
const FreqTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div style={{ background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.65rem 0.9rem', fontSize: '0.82rem' }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div>Questions: <strong>{d?.count}</strong></div>
      {d?.easy_pct    != null && <div style={{ color: DIFF_COLORS.easy    }}>Easy: {d.easy_pct}%</div>}
      {d?.medium_pct  != null && <div style={{ color: DIFF_COLORS.medium  }}>Medium: {d.medium_pct}%</div>}
      {d?.hard_pct    != null && <div style={{ color: DIFF_COLORS.hard    }}>Hard: {d.hard_pct}%</div>}
      {d?.untagged_pct > 0    && <div style={{ color: DIFF_COLORS.untagged }}>Untagged: {d.untagged_pct}%</div>}
    </div>
  )
}

const TrendTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.65rem 0.9rem', fontSize: '0.82rem' }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
      {payload.map(p => <div key={p.name} style={{ color: p.color }}>{truncate(p.name, 28)}: {p.value}</div>)}
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────
const Stat = ({ label, value }) => (
  <div style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '0.9rem 1.2rem', textAlign: 'center', flex: 1, minWidth: 110 }}>
    <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--color-primary)' }}>{value ?? '—'}</div>
    <div style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)', marginTop: 3 }}>{label}</div>
  </div>
)

// ── Exam-session chip ─────────────────────────────────────────────────────────
const SessionChip = ({ title, examSession }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: '0.5rem',
    background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)', padding: '0.45rem 0.75rem',
    fontSize: '0.8rem',
  }}>
    <span style={{ fontWeight: 600 }}>{title}</span>
    {examSession && (
      <span style={{ color: 'var(--color-text-muted)', fontSize: '0.74rem' }}>{examSession}</span>
    )}
  </div>
)

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SubjectAnalysisPage() {
  const [subjects, setSubjects]     = useState([])
  const [subject, setSubject]       = useState('')
  const [paperLimit, setPaperLimit] = useState(null)      // null = all
  const [freq, setFreq]             = useState(null)
  const [trend, setTrend]           = useState(null)
  const [loading, setLoading]       = useState(false)
  const [trendLoading, setTrendLoading] = useState(false)
  const [error, setError]           = useState('')
  const [trendTopics, setTrendTopics]   = useState([])

  // ── Load subjects once ────────────────────────────────────────────────────
  useEffect(() => {
    AnalyticsService.getSubjects()
      .then(res => {
        const list = res.data || []
        setSubjects(list)
        if (list.length) setSubject(list[0])
      })
      .catch(() => {})
  }, [])

  // ── Load data whenever subject or limit changes ───────────────────────────
  const loadFreq = useCallback((subj, limit) => {
    if (!subj) return
    setLoading(true)
    setError('')
    setFreq(null)
    AnalyticsService.getTopicFrequency(subj, limit)
      .then(res => {
        const data = res.data
        if (data.error) { setError(data.error); return }
        setFreq(data)
        setTrendTopics((data.topics || []).slice(0, 5).map(t => t.name))
      })
      .catch(() => setError('Failed to load topic data.'))
      .finally(() => setLoading(false))
  }, [])

  const loadTrend = useCallback((subj, limit) => {
    if (!subj) return
    setTrendLoading(true)
    AnalyticsService.getSubjectTrend(subj, limit)
      .then(res => setTrend(res.data))
      .catch(() => setTrend(null))
      .finally(() => setTrendLoading(false))
  }, [])

  useEffect(() => {
    loadFreq(subject, paperLimit)
    loadTrend(subject, paperLimit)
  }, [subject, paperLimit, loadFreq, loadTrend])

  // ── Trend chart data ──────────────────────────────────────────────────────
  const trendData = React.useMemo(() => {
    if (!trend?.years?.length) return []
    return trend.years.map(yr => {
      const row = { year: yr.year }
      yr.topics.forEach(t => { row[t.name] = t.count })
      return row
    })
  }, [trend])

  const allTrendTopics = React.useMemo(() => {
    if (!trend?.years?.length) return []
    const set = new Set()
    trend.years.forEach(yr => yr.topics.forEach(t => set.add(t.name)))
    return [...set]
  }, [trend])

  const freqChartData = (freq?.topics || []).map(t => ({
    name: truncate(t.name), fullName: t.name,
    count: t.count, easy_pct: t.easy_pct, medium_pct: t.medium_pct,
    hard_pct: t.hard_pct, untagged_pct: t.untagged_pct,
  }))

  const papersIncluded = freq?.papers_included || trend?.papers_included || []

  return (
    <div className="page-layout">
      <Sidebar />
      <main className="main-content">

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 className="page-title">Subject Analysis</h1>
            <p className="page-subtitle">Topic coverage, difficulty distribution, and year-on-year trends</p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {/* Subject */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: 220 }}>
              <label style={labelStyle}>Subject</label>
              <select value={subject} onChange={e => setSubject(e.target.value)} style={selectStyle}>
                {subjects.length === 0
                  ? <option value={subject}>{subject || 'Loading…'}</option>
                  : subjects.map(s => <option key={s} value={s}>{s}</option>)
                }
              </select>
            </div>

            {/* Paper limit */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: 140 }}>
              <label style={labelStyle}>Past Papers</label>
              <select
                value={paperLimit === null ? '' : paperLimit}
                onChange={e => setPaperLimit(e.target.value === '' ? null : Number(e.target.value))}
                style={selectStyle}
              >
                {PAPER_LIMIT_OPTIONS.map(o => (
                  <option key={o.label} value={o.value === null ? '' : o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ── Exam session strip ───────────────────────────────────────────── */}
        {papersIncluded.length > 0 && (
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
              Exam Sessions Included
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {papersIncluded.map(p => (
                <SessionChip key={p.pypId} title={p.title} examSession={p.examSession} />
              ))}
            </div>
          </div>
        )}

        {error && (
          <div style={{ color: '#ef4444', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '0.7rem 1rem', marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        {loading ? (
          <p style={{ color: 'var(--color-text-muted)' }}>Loading analysis…</p>
        ) : freq ? (
          <>
            {/* ── Stat overview ─────────────────────────────────────────────── */}
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
              <Stat label="Total Questions" value={freq.total_questions} />
              <Stat label="Past Year Papers" value={freq.total_papers} />
              <Stat label="Topics Covered"  value={freq.total_topics} />
              <Stat label="PYP Questions"   value={freq.pyp_questions} />
            </div>

            {/* ── Topic Frequency chart ──────────────────────────────────────── */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <h3 className="chart-title">Topic Frequency — {subject}</h3>
              <p style={subStyle}>Number of questions per topic. Bar colour shows dominant difficulty.</p>
              {freqChartData.length === 0 ? (
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>No question data yet for this subject.</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(260, freqChartData.length * 34)}>
                  <BarChart data={freqChartData} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--color-border)" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} />
                    <YAxis type="category" dataKey="name" width={148} tick={{ fontSize: 11, fill: 'var(--color-text-primary)' }} />
                    <Tooltip content={<FreqTooltip />} />
                    <Bar dataKey="count" name="Questions" radius={[0, 4, 4, 0]}>
                      {freqChartData.map((e, i) => {
                        const dom = e.hard_pct >= 40 ? 'hard' : e.easy_pct >= 40 ? 'easy' : e.medium_pct >= 30 ? 'medium' : 'untagged'
                        return <Cell key={i} fill={DIFF_COLORS[dom]} fillOpacity={0.85} />
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
              <div style={{ display: 'flex', gap: '1.2rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                {[['easy','Easy'],['medium','Medium'],['hard','Hard'],['untagged','Untagged']].map(([k, lbl]) => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: DIFF_COLORS[k], display: 'inline-block' }} />
                    {lbl}
                  </div>
                ))}
              </div>
            </div>

            {/* ── Difficulty breakdown table ─────────────────────────────────── */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <h3 className="chart-title">Difficulty Breakdown — {subject}</h3>
              <p style={subStyle}>Per-topic percentage split across Easy / Medium / Hard.</p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                      {['Topic','Total','Easy %','Medium %','Hard %','Untagged %'].map(h => (
                        <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: h === 'Topic' ? 'left' : 'right', color: 'var(--color-text-muted)', fontWeight: 600, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(freq.topics || []).map((t, i) => (
                      <tr key={t.topicId} style={{ borderBottom: '1px solid var(--color-border)', background: i % 2 === 0 ? 'transparent' : 'var(--color-bg-secondary)' }}>
                        <td style={{ padding: '0.5rem 0.75rem', fontWeight: 500 }}>{t.name}</td>
                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>{t.count}</td>
                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: DIFF_COLORS.easy    }}>{t.easy_pct}%</td>
                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: DIFF_COLORS.medium  }}>{t.medium_pct}%</td>
                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: DIFF_COLORS.hard    }}>{t.hard_pct}%</td>
                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: DIFF_COLORS.untagged }}>{t.untagged_pct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : !loading && !error && (
          <p style={{ color: 'var(--color-text-muted)' }}>Select a subject to load analysis.</p>
        )}

        {/* ── Year-on-year trend ─────────────────────────────────────────────── */}
        <div className="card">
          <h3 className="chart-title">Year-on-Year Topic Coverage — {subject || '—'}</h3>
          <p style={subStyle}>Question count per topic from past-year papers, by upload year. Toggle topics to compare.</p>

          {trendLoading ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>Loading trend data…</p>
          ) : !trendData.length ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
              No past-year-paper data available yet. Upload past papers to see trends.
            </p>
          ) : (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                {allTrendTopics.map((name, i) => {
                  const active = trendTopics.includes(name)
                  const color  = LINE_PALETTE[i % LINE_PALETTE.length]
                  return (
                    <button key={name}
                      onClick={() => setTrendTopics(prev => prev.includes(name) ? prev.filter(t => t !== name) : [...prev, name])}
                      style={{
                        border: `1.5px solid ${active ? color : 'var(--color-border)'}`,
                        background: active ? `${color}18` : 'transparent',
                        color: active ? color : 'var(--color-text-muted)',
                        borderRadius: 999, padding: '0.25rem 0.7rem',
                        fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                      }}>
                      {truncate(name, 22)}
                    </button>
                  )
                })}
              </div>

              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={trendData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="year" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} allowDecimals={false} />
                  <Tooltip content={<TrendTooltip />} />
                  {trendTopics.map(name => {
                    const idx   = allTrendTopics.indexOf(name)
                    const color = LINE_PALETTE[idx % LINE_PALETTE.length]
                    return (
                      <Line key={name} type="monotone" dataKey={name}
                        stroke={color} strokeWidth={2}
                        dot={{ r: 4, fill: color }} activeDot={{ r: 6 }}
                      />
                    )
                  })}
                </LineChart>
              </ResponsiveContainer>
            </>
          )}
        </div>

      </main>
    </div>
  )
}

// ── Shared micro-styles ───────────────────────────────────────────────────────
const labelStyle = {
  fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.06em',
}
const selectStyle = {
  padding: '0.5rem 0.85rem', borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)',
  color: 'var(--color-text-primary)', fontSize: '0.9rem', cursor: 'pointer',
}
const subStyle = {
  fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: '0 0 1rem',
}
