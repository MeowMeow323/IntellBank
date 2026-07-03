import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnalyticsService } from '../services/api'
import Sidebar from '../components/layout/Sidebar.jsx'
import ClassWeaknessPanel from '../components/analytics/ClassWeaknessPanel.jsx'
import ClassMatrixHeatmap from '../components/analytics/ClassMatrixHeatmap.jsx'
import TopicWeaknessBarChart from '../components/analytics/TopicWeaknessBarChart.jsx'
import AnalyticsStats from '../components/analytics/AnalyticsStats.jsx'
import { heatColor, heatText } from '../components/analytics/heatScale'
import '../styles/analytics.css'

const masteryBand = (s) =>
  s >= 90 ? 'Mastered' : s >= 70 ? 'Advanced' : s >= 50 ? 'Intermediate' : 'Beginner'

const PredictiveAnalyticsPage = () => {
  const navigate = useNavigate()

  // All mastery rows fetched once — never mutated
  const allMastery = useRef([])

  const [subjects, setSubjects] = useState([])
  const [subject, setSubject] = useState('')
  const [weaknesses, setWeaknesses] = useState([])
  const [mastery, setMastery] = useState([])      // this subject's mastery rows
  const [selected, setSelected] = useState(null)    // clicked mastery cell
  const [heatmapMode, setHeatmapMode] = useState('mastery')   // 'mastery' | 'class'
  const [weaknessMode, setWeaknessMode] = useState('mine')    // 'mine' | 'class'
  const [loading, setLoading] = useState(true)

  // ── Initial load: subjects + all mastery once ──────────────────────────────
  useEffect(() => {
    const init = async () => {
      setLoading(true)
      const [subjRes, masteryRes] = await Promise.allSettled([
        AnalyticsService.getSubjects(),
        AnalyticsService.getMyMastery(),
      ])

      let subjectList = []
      if (subjRes.status === 'fulfilled') {
        subjectList = subjRes.value.data || []
        setSubjects(subjectList)
      }
      if (masteryRes.status === 'fulfilled') {
        allMastery.current = masteryRes.value.data || []
      }

      const masterySubjects = [...new Set(allMastery.current.map(m => m.subjectName).filter(Boolean))]
      const initial = masterySubjects[0] || subjectList[0] || 'Software Project Management'

      setSubject(initial)
      applySubjectFilter(initial)
      setLoading(false)
    }
    init()
  }, [])

  const handleSubjectChange = (newSubject) => {
    setSubject(newSubject)
    setSelected(null)
    applySubjectFilter(newSubject)
  }

  const switchHeatmap = (mode) => { setHeatmapMode(mode); setSelected(null) }

  const applySubjectFilter = (subj) => {
    const filtered = allMastery.current.filter(m => m.subjectName === subj)
    // Weakest first, so a real reading order emerges across the heatmap grid.
    setMastery([...filtered].sort((a, b) => a.score - b.score))
    setWeaknesses(filtered.filter(m => m.score < 50))
  }

  const practiceTopics = (topics) => {
    localStorage.setItem('intellbank_targeted_topics', JSON.stringify(topics))
    navigate('/dashboard')
  }

  // KPI tiles from the student's own mastery for this subject.
  const avgMastery = mastery.length ? Math.round(mastery.reduce((a, m) => a + m.score, 0) / mastery.length) : null
  const weakest = mastery[0]  // sorted weakest-first
  const studentStats = [
    { label: 'Topics tracked', value: mastery.length },
    { label: 'Weak topics', value: weaknesses.length, sub: 'below 50% mastery', color: weaknesses.length ? '#dc2626' : undefined },
    { label: 'Avg mastery', value: avgMastery == null ? '—' : `${avgMastery}%` },
    { label: 'Weakest topic', value: weakest ? `${weakest.score}%` : '—', sub: weakest?.topicName },
  ]

  return (
    <div className="page-layout">
      <Sidebar />
      <main className="main-content">
        <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 className="page-title">Performance Analytics</h1>
            <p className="page-subtitle">Your topic mastery and weaknesses, and how the class compares</p>
          </div>

          {/* Subject selector */}
          <div className="pa-subject-wrap">
            <label className="pa-subject-label">Subject</label>
            <select
              className="pa-subject-select"
              value={subject}
              onChange={e => handleSubjectChange(e.target.value)}
              disabled={loading}
            >
              {subjects.length === 0
                ? <option value={subject}>{subject}</option>
                : subjects.map(s => <option key={s} value={s}>{s}</option>)
              }
            </select>
          </div>
        </div>

        {loading ? (
          <p style={{ color: 'var(--color-text-muted)' }}>Loading analytics…</p>
        ) : (
          <>
            <AnalyticsStats items={studentStats} />
            <div className="pa-grid">
              {/* ── LEFT: Topic Heatmap (Mastery ↔ Class switch) ───────────────── */}
              <div className="card pa-card">
                <div className="pa-wk-head">
                  <h3 className="chart-title" style={{ margin: 0 }}>
                    {heatmapMode === 'mastery' ? 'Topic Mastery' : 'Class Mastery Matrix'} — {subject}
                  </h3>
                  <div className="pa-toggle">
                    <button className={heatmapMode === 'mastery' ? 'active' : ''} onClick={() => switchHeatmap('mastery')}>Mastery</button>
                    <button className={heatmapMode === 'class' ? 'active' : ''} onClick={() => switchHeatmap('class')}>Class</button>
                  </div>
                </div>

                {heatmapMode === 'mastery' ? (
                  <>
                    <p className="pa-sub">How well you've scored on each topic, from your graded papers.</p>
                    {mastery.length === 0 ? (
                      <p className="pa-empty">No mastery data for {subject} yet. Submit a graded paper to build your heatmap.</p>
                    ) : (
                      <>
                        <div className="pa-heatmap">
                          {mastery.map((m) => {
                            const isSel = selected?.topicId === m.topicId
                            return (
                              <button key={m.topicId}
                                className={`pa-cell pa-cell-btn ${isSel ? 'pa-cell-selected' : ''}`}
                                style={{ background: heatColor(m.score), color: heatText(m.score) }}
                                onClick={() => setSelected(isSel ? null : m)}
                                title={`${m.topicName} — ${masteryBand(m.score)} (${m.score}%)`}>
                                <span className="pa-cell-name">{m.topicName}</span>
                                <span className="pa-cell-score">{m.score}%</span>
                              </button>
                            )
                          })}
                        </div>
                        <div className="pa-scale">
                          <span>Weak</span>
                          <div className="pa-scale-bar" />
                          <span>Strong</span>
                        </div>

                        {selected && (
                          <div className="pa-detail">
                            <div className="pa-detail-head">
                              <span className="pa-detail-topic">{selected.topicName}</span>
                              <span className="badge" style={{ background: heatColor(selected.score), color: heatText(selected.score) }}>
                                {masteryBand(selected.score)} · {selected.score}%
                              </span>
                            </div>
                            <div className="pa-detail-rows">
                              <div><span>Mastery level</span><strong>{masteryBand(selected.score)}</strong></div>
                              <div><span>Score</span><strong>{selected.score}%</strong></div>
                              {selected.comment && <div><span>Educator note</span><strong>“{selected.comment}”</strong></div>}
                            </div>
                            <button className="pa-generate" onClick={() => practiceTopics([selected.topicName])}>
                              Practice “{selected.topicName}”
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <p className="pa-sub">How the class scores per topic — student percentage bands across the top, topics down the side. Click a cell for details.</p>
                    <ClassMatrixHeatmap subject={subject} />
                  </>
                )}
              </div>

              {/* ── RIGHT: Weaknesses (Mine ↔ Class toggle) ────────────────────── */}
              <div className="card pa-card">
                <div className="pa-wk-head">
                  <h3 className="chart-title" style={{ margin: 0 }}>⚠ Weaknesses</h3>
                  <div className="pa-toggle">
                    <button className={weaknessMode === 'mine' ? 'active' : ''} onClick={() => setWeaknessMode('mine')}>Mine</button>
                    <button className={weaknessMode === 'class' ? 'active' : ''} onClick={() => setWeaknessMode('class')}>Class</button>
                  </div>
                </div>

                {weaknessMode === 'mine' ? (
                  <>
                    <p className="pa-sub">Topics below 50% mastery from your graded papers.</p>
                    {weaknesses.length === 0 ? (
                      <p className="pa-empty">No weak topics — nice work! Topics below 50% mastery appear here.</p>
                    ) : (
                      <div className="pa-weak-list">
                        {weaknesses.map((w) => (
                          <div key={w.topicId} className="pa-weak-item">
                            <div style={{ flex: 1 }}>
                              <div>{w.topicName}</div>
                              {w.comment && <div className="pa-weak-comment">“{w.comment}”</div>}
                            </div>
                            <span className="badge badge-red">{w.score}% mastery</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <button className="pa-generate" onClick={() => practiceTopics(weaknesses.map(w => w.topicName))}
                      disabled={weaknesses.length === 0}>
                      Generate Targeted Practice
                    </button>
                  </>
                ) : (
                  <>
                    <p className="pa-sub">What the class is consistently weak at (below 50%).</p>
                    <ClassWeaknessPanel subject={subject} />
                  </>
                )}
              </div>
            </div>

            {/* ── Topic-weakness comparison chart: you vs class ────────────────── */}
            <div className="card an-chart-card">
              <h3 className="chart-title" style={{ margin: '0 0 0.25rem' }}>Topic weakness — you vs class</h3>
              <p className="pa-sub">Your mastery per topic against the class average, weakest topics first.</p>
              <TopicWeaknessBarChart subject={subject} mine={mastery} />
            </div>
          </>
        )}
      </main>
    </div>
  )
}

export default PredictiveAnalyticsPage
