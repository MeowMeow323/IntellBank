import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnalyticsService } from '../services/api'
import Sidebar from '../components/layout/Sidebar.jsx'
import ClassWeaknessPanel from '../components/analytics/ClassWeaknessPanel.jsx'
import ClassMatrixHeatmap from '../components/analytics/ClassMatrixHeatmap.jsx'
import { heatColor, heatText } from '../components/analytics/heatScale'
import '../styles/analytics.css'

const pct = (c) => Math.round((c || 0) * 100)

const masteryBand = (s) =>
  s >= 90 ? 'Mastered' : s >= 70 ? 'Advanced' : s >= 50 ? 'Intermediate' : 'Beginner'
const predLabel = (p) => {
  const c = p.confidence ?? 0
  if (p.tier === 'High' || c >= 0.7) return 'High'
  if (p.tier === 'Medium' || c >= 0.4) return 'Medium'
  return 'Low'
}

const PredictiveAnalyticsPage = () => {
  const navigate = useNavigate()

  // All mastery rows fetched once — never mutated
  const allMastery = useRef([])

  const [subjects, setSubjects] = useState([])
  const [predictedSubjects, setPredictedSubjects] = useState([])  // subjects that HAVE predictions
  const [subject, setSubject] = useState('')
  const [weaknesses, setWeaknesses] = useState([])
  const [predicted, setPredicted] = useState([])
  const [mastery, setMastery] = useState([])      // this subject's mastery rows
  const [selected, setSelected] = useState(null)    // clicked prediction cell
  const [heatmapMode, setHeatmapMode] = useState('mastery')   // 'mastery' | 'prediction'
  const [weaknessMode, setWeaknessMode] = useState('mine')    // 'mine' | 'class'
  const [loading, setLoading] = useState(true)
  const [predLoading, setPredLoading] = useState(false)

  const hasPrediction = (subj) =>
    predictedSubjects.some(s => s.toLowerCase() === (subj || '').toLowerCase())

  // ── Initial load: subjects + prediction-subjects + all mastery once ────────
  useEffect(() => {
    const init = async () => {
      setLoading(true)
      const [subjRes, predSubjRes, masteryRes] = await Promise.allSettled([
        AnalyticsService.getSubjects(),
        AnalyticsService.getPredictionSubjects(),
        AnalyticsService.getMyMastery(),
      ])

      let subjectList = []
      if (subjRes.status === 'fulfilled') {
        subjectList = subjRes.value.data || []
        setSubjects(subjectList)
      }
      let predSubjects = []
      if (predSubjRes.status === 'fulfilled') {
        predSubjects = predSubjRes.value.data || []
        setPredictedSubjects(predSubjects)
      }
      if (masteryRes.status === 'fulfilled') {
        allMastery.current = masteryRes.value.data || []
      }

      // Prefer a subject that actually has predictions, then mastery, then anything.
      const masterySubjects = [...new Set(allMastery.current.map(m => m.subjectName).filter(Boolean))]
      const initial =
        predSubjects[0] || masterySubjects[0] || subjectList[0] || 'Software Project Management'

      setSubject(initial)
      applySubjectFilter(initial)
      setLoading(false)
      loadPredictions(initial)
    }
    init()
  }, [])

  const handleSubjectChange = (newSubject) => {
    setSubject(newSubject)
    setSelected(null)
    applySubjectFilter(newSubject)
    loadPredictions(newSubject)
  }

  const switchHeatmap = (mode) => { setHeatmapMode(mode); setSelected(null) }

  const applySubjectFilter = (subj) => {
    const filtered = allMastery.current.filter(m => m.subjectName === subj)
    // Weakest first, so a real reading order emerges across the heatmap grid.
    setMastery([...filtered].sort((a, b) => a.score - b.score))
    setWeaknesses(filtered.filter(m => m.score < 50))
  }

  const loadPredictions = async (subj) => {
    setPredLoading(true)
    try {
      const res = await AnalyticsService.getPredictedTopics(subj)
      const list = res.data?.predictions || []
      // Strongest predictions first
      list.sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
      setPredicted(list)
    } catch {
      setPredicted([])
    } finally {
      setPredLoading(false)
    }
  }

  const practiceTopics = (topics) => {
    localStorage.setItem('intellbank_targeted_topics', JSON.stringify(topics))
    navigate('/dashboard')
  }

  return (
    <div className="page-layout">
      <Sidebar />
      <main className="main-content">
        <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 className="page-title">Performance Analytics</h1>
            <p className="page-subtitle">Topic mastery, exam-topic predictions, and your weaknesses</p>
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
                : subjects.map(s => (
                  <option key={s} value={s}>
                    {hasPrediction(s) ? `${s}  ✓ prediction` : `${s}  — no prediction`}
                  </option>
                ))
              }
            </select>
          </div>
        </div>

        {loading ? (
          <p style={{ color: 'var(--color-text-muted)' }}>Loading analytics…</p>
        ) : (
          <div className="pa-grid">
            {/* ── LEFT: Topic Heatmap (Mastery ↔ Prediction switch) ──────────── */}
            <div className="card pa-card">
              <div className="pa-wk-head">
                <h3 className="chart-title" style={{ margin: 0 }}>
                  {heatmapMode === 'mastery' ? 'Topic Mastery'
                    : heatmapMode === 'class' ? 'Class Mastery Matrix'
                      : 'Topic Prediction'} — {subject}
                </h3>
                <div className="pa-toggle">
                  <button className={heatmapMode === 'mastery' ? 'active' : ''} onClick={() => switchHeatmap('mastery')}>Mastery</button>
                  <button className={heatmapMode === 'prediction' ? 'active' : ''} onClick={() => switchHeatmap('prediction')}>Prediction</button>
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
              ) : heatmapMode === 'class' ? (
                <>
                  <p className="pa-sub">How the class scores per topic — student percentage bands across the top, topics down the side. Click a cell for details.</p>
                  <ClassMatrixHeatmap subject={subject} />
                </>
              ) : (
                <>
                  <p className="pa-sub">Likelihood each topic appears in the next exam. Click a topic for details.</p>
                  {predLoading ? (
                    <p className="pa-empty">Loading predictions…</p>
                  ) : predicted.length === 0 ? (
                    <div className="pa-empty">
                      <p>No prediction data for <strong>{subject}</strong> yet.</p>
                      {predictedSubjects.length > 0 && (
                        <p style={{ marginTop: '0.5rem' }}>
                          Predictions are available for:{' '}
                          {predictedSubjects.map((s, i) => (
                            <button key={s} className="pa-link" onClick={() => handleSubjectChange(s)}>
                              {s}{i < predictedSubjects.length - 1 ? ',' : ''}
                            </button>
                          ))}
                        </p>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="pa-heatmap">
                        {predicted.map((p) => {
                          const v = pct(p.confidence)
                          const isSel = selected?.topic === p.topic
                          return (
                            <button key={p.topic}
                              className={`pa-cell pa-cell-btn ${isSel ? 'pa-cell-selected' : ''}`}
                              style={{ background: heatColor(v), color: heatText(v) }}
                              onClick={() => setSelected(isSel ? null : p)}
                              title={`${p.topic} — ${predLabel(p)} likelihood (${v}%)`}>
                              <span className="pa-cell-name">{p.topic}</span>
                              <span className="pa-cell-score">{v}%</span>
                            </button>
                          )
                        })}
                      </div>
                      <div className="pa-scale">
                        <span>Unlikely</span>
                        <div className="pa-scale-bar" />
                        <span>Likely</span>
                      </div>

                      {selected && (
                        <div className="pa-detail">
                          <div className="pa-detail-head">
                            <span className="pa-detail-topic">{selected.topic}</span>
                            <span className="badge" style={{ background: heatColor(pct(selected.confidence)), color: heatText(pct(selected.confidence)) }}>
                              {predLabel(selected)} · {pct(selected.confidence)}%
                            </span>
                          </div>
                          <div className="pa-detail-rows">
                            <div><span>Confidence</span><strong>{pct(selected.confidence)}%</strong></div>
                            <div><span>Appeared in past papers</span><strong>{selected.frequency ?? '—'}</strong></div>
                            <div><span>Predicted next exam</span><strong>{selected.predicted_next_year ? 'Yes' : 'No'}</strong></div>
                          </div>
                          <button className="pa-generate" onClick={() => practiceTopics([selected.topic])}>
                            Practice “{selected.topic}”
                          </button>
                        </div>
                      )}
                    </>
                  )}
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
        )}
      </main>
    </div>
  )
}

export default PredictiveAnalyticsPage
