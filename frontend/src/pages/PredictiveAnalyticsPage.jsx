import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnalyticsService } from '../services/api'
import Sidebar from '../components/layout/Sidebar.jsx'

const masteryColor = (score) => {
  if (score >= 90) return '#10b981'
  if (score >= 70) return '#34d399'
  if (score >= 50) return '#f59e0b'
  return '#ef4444'
}

const PredictiveAnalyticsPage = () => {
  const navigate = useNavigate()

  // All mastery rows fetched once — never mutated
  const allMastery = useRef([])

  const [subjects, setSubjects]     = useState([])
  const [subject, setSubject]       = useState('')
  const [mastery, setMastery]       = useState([])
  const [weaknesses, setWeaknesses] = useState([])
  const [predicted, setPredicted]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [predLoading, setPredLoading] = useState(false)

  // ── Initial load: fetch subjects + all mastery once ────────────────────────
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

      // Pick the first subject that has mastery data, or fall back to first in list
      const masterySubjects = [...new Set(allMastery.current.map(m => m.subjectName).filter(Boolean))]
      const initial =
        masterySubjects[0] ||
        subjectList[0] ||
        'Software Project Management'

      setSubject(initial)
      applySubjectFilter(initial)
      setLoading(false)

      // Load predictions for the initial subject
      loadPredictions(initial)
    }
    init()
  }, [])

  // ── Re-filter + reload predictions when subject changes ────────────────────
  const handleSubjectChange = (newSubject) => {
    setSubject(newSubject)
    applySubjectFilter(newSubject)
    loadPredictions(newSubject)
  }

  const applySubjectFilter = (subj) => {
    const filtered = allMastery.current.filter(m => m.subjectName === subj)
    setMastery(filtered)
    setWeaknesses(filtered.filter(m => m.score < 50))
  }

  const loadPredictions = async (subj) => {
    setPredLoading(true)
    try {
      const res = await AnalyticsService.getPredictedTopics(subj)
      setPredicted(res.data?.predictions || [])
    } catch {
      setPredicted([])
    } finally {
      setPredLoading(false)
    }
  }

  const generateTargetedPractice = () => {
    const topics = weaknesses.map((w) => w.topicName)
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
            <p className="page-subtitle">Topic mastery, identified weaknesses, and predicted exam topics</p>
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
          <div className="pa-grid">
            {/* ── Topic Mastery Heatmap ──────────────────────────────────────── */}
            <div className="card pa-card">
              <h3 className="chart-title">Topic Mastery Heatmap</h3>
              {mastery.length === 0 ? (
                <p className="pa-empty">
                  No mastery data for this subject yet. Submit a graded practice paper to build your profile.
                </p>
              ) : (
                <>
                  <div className="pa-heatmap">
                    {mastery.map((m) => (
                      <div
                        key={m.topicId}
                        className="pa-cell"
                        style={{ background: masteryColor(m.score) }}
                        title={`${m.topicName} — ${m.masteryLevel} (${m.score}%)`}
                      >
                        <span className="pa-cell-name">{m.topicName}</span>
                        <span className="pa-cell-score">{m.score}%</span>
                      </div>
                    ))}
                  </div>
                  <div className="pa-legend">
                    <span><i style={{ background: '#ef4444' }} /> Beginner</span>
                    <span><i style={{ background: '#f59e0b' }} /> Intermediate</span>
                    <span><i style={{ background: '#34d399' }} /> Advanced</span>
                    <span><i style={{ background: '#10b981' }} /> Mastered</span>
                  </div>
                </>
              )}
            </div>

            {/* ── Identified Weaknesses ──────────────────────────────────────── */}
            <div className="card pa-card">
              <h3 className="chart-title">⚠ Identified Weaknesses</h3>
              {weaknesses.length === 0 ? (
                <p className="pa-empty">No weak topics — nice work! Topics below 50% mastery appear here.</p>
              ) : (
                <div className="pa-weak-list">
                  {weaknesses.map((w) => (
                    <div key={w.topicId} className="pa-weak-item">
                      <span>{w.topicName}</span>
                      <span className="badge badge-red">{w.score}% mastery</span>
                    </div>
                  ))}
                </div>
              )}
              <button className="pa-generate" onClick={generateTargetedPractice}
                disabled={weaknesses.length === 0}>
                Generate Targeted Practice
              </button>
            </div>

            {/* ── Predicted Topics (K-Means) ────────────────────────────────── */}
            <div className="card pa-card pa-span">
              <h3 className="chart-title">Predicted Topics for Next Exam — {subject}</h3>
              {predLoading ? (
                <p className="pa-empty">Loading predictions…</p>
              ) : predicted.length === 0 ? (
                <p className="pa-empty">No prediction data for this subject. Run the topic predictor training to populate this.</p>
              ) : (
                <div className="pa-pred-list">
                  {predicted.slice(0, 8).map((p, i) => (
                    <div key={p.topic} className="pa-pred-item">
                      <div className="pa-pred-rank">#{i + 1}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500 }}>{p.topic}</div>
                        <div className="pa-pred-bar">
                          <div className="pa-pred-fill" style={{ width: `${Math.round((p.confidence || 0) * 100)}%` }} />
                        </div>
                      </div>
                      <span className={`badge ${p.tier === 'High' ? 'badge-green' : p.tier === 'Medium' ? 'badge-amber' : 'badge-gray'}`}>
                        {Math.round((p.confidence || 0) * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <style>{`
        .pa-subject-wrap { display: flex; flex-direction: column; gap: 0.3rem; min-width: 240px; }
        .pa-subject-label { font-size: 0.78rem; font-weight: 600; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.06em; }
        .pa-subject-select {
          padding: 0.5rem 0.85rem; border-radius: var(--radius-md);
          border: 1px solid var(--color-border); background: var(--color-bg-secondary);
          color: var(--color-text-primary); font-size: 0.9rem; cursor: pointer;
          appearance: auto;
        }
        .pa-subject-select:focus { outline: none; border-color: var(--color-primary); }
        .pa-grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 1.5rem; }
        .pa-span { grid-column: 1 / -1; }
        .pa-card { min-height: 240px; }
        .chart-title { font-size: 1rem; font-weight: 600; margin-bottom: 1rem; color: var(--color-text-primary); }
        .pa-empty { color: var(--color-text-muted); font-size: 0.9rem; }
        .pa-heatmap { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 0.6rem; }
        .pa-cell {
          border-radius: var(--radius-md); padding: 0.75rem; color: #062018;
          display: flex; flex-direction: column; gap: 0.25rem; min-height: 64px; justify-content: center;
        }
        .pa-cell-name { font-size: 0.82rem; font-weight: 600; }
        .pa-cell-score { font-size: 0.75rem; opacity: 0.85; }
        .pa-legend { display: flex; flex-wrap: wrap; gap: 1rem; margin-top: 1rem; font-size: 0.78rem; color: var(--color-text-muted); }
        .pa-legend i { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 0.35rem; vertical-align: middle; }
        .pa-weak-list { display: flex; flex-direction: column; gap: 0.6rem; }
        .pa-weak-item {
          display: flex; justify-content: space-between; align-items: center;
          padding: 0.7rem 0.9rem; background: var(--color-bg-secondary);
          border: 1px solid var(--color-border); border-radius: var(--radius-md); font-size: 0.9rem;
        }
        .badge-red { background: rgba(239,68,68,0.15); color: #ef4444; }
        .badge-amber { background: rgba(245,158,11,0.15); color: #f59e0b; }
        .badge-gray { background: rgba(148,163,184,0.15); color: #94a3b8; }
        .pa-generate {
          margin-top: 1.25rem; width: 100%; border: none; cursor: pointer;
          background: var(--gradient-primary); color: #fff; font-weight: 600;
          padding: 0.7rem; border-radius: var(--radius-md);
        }
        .pa-generate:disabled { opacity: 0.5; cursor: not-allowed; }
        .pa-pred-list { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; }
        .pa-pred-item {
          display: flex; align-items: center; gap: 0.9rem; padding: 0.75rem 1rem;
          background: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md);
        }
        .pa-pred-rank {
          width: 30px; height: 30px; background: var(--gradient-primary); border-radius: 50%;
          display: flex; align-items: center; justify-content: center; font-size: 0.78rem; font-weight: 700; color: #fff; flex-shrink: 0;
        }
        .pa-pred-bar { height: 6px; background: var(--color-border); border-radius: 999px; margin-top: 0.4rem; overflow: hidden; }
        .pa-pred-fill { height: 100%; background: var(--gradient-primary); }
        @media (max-width: 980px) {
          .pa-grid { grid-template-columns: 1fr; }
          .pa-pred-list { grid-template-columns: 1fr; }
          .page-header { flex-direction: column; }
          .pa-subject-wrap { width: 100%; }
        }
      `}</style>
    </div>
  )
}

export default PredictiveAnalyticsPage
