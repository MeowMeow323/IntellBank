import React, { useEffect, useState } from 'react'
import { AnalyticsService } from '../services/api'
import Sidebar from '../components/layout/Sidebar.jsx'
import ClassWeaknessPanel from '../components/analytics/ClassWeaknessPanel.jsx'
import ClassMatrixHeatmap from '../components/analytics/ClassMatrixHeatmap.jsx'

/**
 * Educator Class Analysis — cohort weakness view powered by our own trained model.
 * Educators pick a subject and see what the class is consistently weak at.
 */
export default function EducatorAnalysisPage() {
  const [subjects, setSubjects] = useState([])
  const [subject, setSubject] = useState('')

  useEffect(() => {
    AnalyticsService.getSubjects()
      .then((res) => {
        const list = res.data || []
        setSubjects(list)
        setSubject(list[0] || '')
      })
      .catch(() => {})
  }, [])

  return (
    <div className="page-layout">
      <Sidebar />
      <main className="main-content">
        <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 className="page-title">Class Analysis</h1>
            <p className="page-subtitle">What the cohort is consistently weak at, per subject</p>
          </div>
          <div className="ea-subject-wrap">
            <label className="ea-label">Subject</label>
            <select className="ea-select" value={subject} onChange={(e) => setSubject(e.target.value)}>
              {subjects.length === 0
                ? <option value="">No subjects</option>
                : subjects.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div className="ea-stack">
          <div className="card">
            <h3 className="chart-title">Mastery Heat Map — {subject || '—'}</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 1rem' }}>
              Each student's score per topic. Click a cell for details.
            </p>
            {subject
              ? <ClassMatrixHeatmap subject={subject} />
              : <p className="pa-empty">Select a subject to analyse.</p>}
          </div>

          <div className="card">
            <h3 className="chart-title">⚠ Class Weaknesses — {subject || '—'}</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 1rem' }}>
              Cohort weakness tiers from the trained model (topics below 50% mastery).
            </p>
            {subject
              ? <ClassWeaknessPanel subject={subject} />
              : <p className="pa-empty">Select a subject to analyse.</p>}
          </div>
        </div>
      </main>

      <style>{`
        .ea-stack { display:flex; flex-direction:column; gap:1.5rem; max-width:860px; }
        .ea-subject-wrap { display:flex; flex-direction:column; gap:0.3rem; min-width:240px; }
        .ea-label { font-size:0.78rem; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.06em; }
        .ea-select {
          padding:0.5rem 0.85rem; border-radius:var(--radius-md); border:1px solid var(--border);
          background:var(--bg-surface); color:var(--text); font-size:0.9rem; cursor:pointer;
        }
        .pa-empty { color: var(--text-muted); font-size:0.9rem; }
      `}</style>
    </div>
  )
}
