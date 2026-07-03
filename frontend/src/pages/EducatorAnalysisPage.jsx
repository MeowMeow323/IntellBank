import React, { useEffect, useState } from 'react'
import { AnalyticsService } from '../services/api'
import Sidebar from '../components/layout/Sidebar.jsx'
import ClassWeaknessPanel from '../components/analytics/ClassWeaknessPanel.jsx'
import ClassMatrixHeatmap from '../components/analytics/ClassMatrixHeatmap.jsx'
import TopicWeaknessBarChart from '../components/analytics/TopicWeaknessBarChart.jsx'
import AnalyticsStats from '../components/analytics/AnalyticsStats.jsx'
import '../styles/analytics.css'

/**
 * Educator / Admin Class Analysis — the cohort weakness view. Mirrors the student
 * Performance Analytics layout (header + KPI stat row + two-card grid + full-width
 * chart) so the analytics surface reads the same for every role.
 */
export default function EducatorAnalysisPage() {
  const [subjects, setSubjects] = useState([])
  const [subject, setSubject] = useState('')
  const [classTopics, setClassTopics] = useState([])

  useEffect(() => {
    AnalyticsService.getSubjects()
      .then((res) => {
        const list = res.data || []
        setSubjects(list)
        setSubject(list[0] || '')
      })
      .catch(() => {})
  }, [])

  // Cohort topic stats for the KPI row (same source the chart/panel use).
  useEffect(() => {
    if (!subject) { setClassTopics([]); return }
    let cancelled = false
    AnalyticsService.getClassWeaknesses(subject)
      .then((res) => { if (!cancelled) setClassTopics(res.data?.topics || []) })
      .catch(() => { if (!cancelled) setClassTopics([]) })
    return () => { cancelled = true }
  }, [subject])

  const avg = classTopics.length
    ? Math.round(classTopics.reduce((a, t) => a + (t.mean_band || 0), 0) / classTopics.length) : null
  const weak = classTopics.filter((t) => (t.mean_band || 0) < 50).length
  const topConcern = [...classTopics].sort((a, b) => (b.weakness_score || 0) - (a.weakness_score || 0))[0]

  const stats = [
    { label: 'Topics analysed', value: classTopics.length },
    { label: 'Weak topics', value: weak, sub: 'below 50% mastery', color: weak ? '#dc2626' : undefined },
    { label: 'Class average', value: avg == null ? '—' : `${avg}%` },
    { label: 'Top concern', value: topConcern ? `${Math.round(topConcern.mean_band)}%` : '—', sub: topConcern?.topic },
  ]

  return (
    <div className="page-layout">
      <Sidebar />
      <main className="main-content">
        <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 className="page-title">Class Analysis</h1>
            <p className="page-subtitle">What the cohort is consistently weak at, per subject</p>
          </div>

          {/* Subject selector — same control as the student page */}
          <div className="pa-subject-wrap">
            <label className="pa-subject-label">Subject</label>
            <select className="pa-subject-select" value={subject} onChange={(e) => setSubject(e.target.value)}>
              {subjects.length === 0
                ? <option value="">No subjects</option>
                : subjects.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {!subject ? (
          <p className="pa-empty">Select a subject to analyse.</p>
        ) : (
          <>
            <AnalyticsStats items={stats} />

            <div className="pa-grid">
              {/* ── LEFT: Class Mastery Matrix ─────────────────────────────────── */}
              <div className="card pa-card">
                <div className="pa-wk-head">
                  <h3 className="chart-title" style={{ margin: 0 }}>Class Mastery Matrix — {subject}</h3>
                </div>
                <p className="pa-sub">Average score per topic across student percentage bands. Click a cell for details.</p>
                <ClassMatrixHeatmap subject={subject} />
              </div>

              {/* ── RIGHT: Class Weaknesses ────────────────────────────────────── */}
              <div className="card pa-card">
                <div className="pa-wk-head">
                  <h3 className="chart-title" style={{ margin: 0 }}>⚠ Class Weaknesses — {subject}</h3>
                </div>
                <p className="pa-sub">Cohort weakness tiers from the trained model (topics below 50% mastery).</p>
                <ClassWeaknessPanel subject={subject} />
              </div>
            </div>

            {/* ── Class average per topic (same chart component as the student page) ── */}
            <div className="card an-chart-card">
              <h3 className="chart-title" style={{ margin: '0 0 0.25rem' }}>Class average per topic — {subject}</h3>
              <p className="pa-sub">The class's average mastery for each topic, weakest topics first.</p>
              <TopicWeaknessBarChart subject={subject} />
            </div>
          </>
        )}
      </main>
    </div>
  )
}
