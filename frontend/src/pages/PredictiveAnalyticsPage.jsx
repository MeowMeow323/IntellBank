import React, { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, RadarChart, PolarGrid, PolarAngleAxis, Radar,
} from 'recharts'
import { AnalyticsService } from '../services/api'
import Sidebar from '../components/layout/Sidebar.jsx'

// ── Placeholder data while API is not connected ───────────────────────────
const PLACEHOLDER_TOPIC_FREQ = [
  { topic: 'Kinematics', frequency: 12 },
  { topic: "Newton's Laws", frequency: 9 },
  { topic: 'Thermodynamics', frequency: 7 },
  { topic: 'Waves', frequency: 6 },
  { topic: 'Electrostatics', frequency: 5 },
  { topic: 'Optics', frequency: 4 },
]

const PLACEHOLDER_TRENDS = [
  { year: '2020', Kinematics: 8, Thermodynamics: 4, Waves: 3 },
  { year: '2021', Kinematics: 9, Thermodynamics: 6, Waves: 5 },
  { year: '2022', Kinematics: 11, Thermodynamics: 7, Waves: 6 },
  { year: '2023', Kinematics: 12, Thermodynamics: 7, Waves: 6 },
  { year: '2024', Kinematics: 10, Thermodynamics: 8, Waves: 7 },
]

const PLACEHOLDER_RADAR = [
  { topic: 'Kinematics', A: 120 },
  { topic: 'Newton', A: 90 },
  { topic: 'Thermo', A: 70 },
  { topic: 'Waves', A: 60 },
  { topic: 'Electro', A: 50 },
  { topic: 'Optics', A: 40 },
]

const CHART_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b']

const PredictiveAnalyticsPage = () => {
  const [topicFreq, setTopicFreq] = useState(PLACEHOLDER_TOPIC_FREQ)
  const [trends, setTrends] = useState(PLACEHOLDER_TRENDS)
  const [predicted, setPredicted] = useState([
    { topic: 'Quantum Mechanics', confidence: '87%' },
    { topic: 'Thermodynamics', confidence: '82%' },
    { topic: 'Waves & Optics', confidence: '75%' },
  ])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    loadAnalytics()
  }, [])

  const loadAnalytics = async () => {
    setIsLoading(true)
    try {
      const [freqRes, trendsRes, predictedRes] = await Promise.allSettled([
        AnalyticsService.getTopicFrequency(),
        AnalyticsService.getYearlyTrends(),
        AnalyticsService.getPredictedTopics(),
      ])
      if (freqRes.status === 'fulfilled') setTopicFreq(freqRes.value.data)
      if (trendsRes.status === 'fulfilled') setTrends(trendsRes.value.data)
      if (predictedRes.status === 'fulfilled') setPredicted(predictedRes.value.data)
    } catch {
      // Keep placeholder data on failure
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="page-layout">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <h1 className="page-title">Predictive Analytics</h1>
          <p className="page-subtitle">AI-driven topic frequency analysis and exam predictions</p>
        </div>

        <div className="analytics-grid">
          {/* Topic Frequency Bar Chart */}
          <div className="card analytics-card" id="topic-freq-chart">
            <h3 className="chart-title">Topic Frequency</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={topicFreq} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="topic" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: '#1a2235', border: '1px solid #1e293b', borderRadius: 8 }}
                  labelStyle={{ color: '#f1f5f9' }}
                />
                <Bar dataKey="frequency" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Yearly Trends Line Chart */}
          <div className="card analytics-card" id="yearly-trends-chart">
            <h3 className="chart-title">Yearly Trends</h3>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trends} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="year" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: '#1a2235', border: '1px solid #1e293b', borderRadius: 8 }}
                />
                <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
                {Object.keys(trends[0] || {})
                  .filter((k) => k !== 'year')
                  .map((key, i) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      stroke={CHART_COLORS[i % CHART_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                  ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Radar / Coverage Chart */}
          <div className="card analytics-card" id="radar-chart">
            <h3 className="chart-title">Topic Coverage Heatmap</h3>
            <ResponsiveContainer width="100%" height={260}>
              <RadarChart data={PLACEHOLDER_RADAR}>
                <PolarGrid stroke="#1e293b" />
                <PolarAngleAxis dataKey="topic" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Radar name="Coverage" dataKey="A" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.3} />
                <Tooltip
                  contentStyle={{ background: '#1a2235', border: '1px solid #1e293b', borderRadius: 8 }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* AI Predicted Topics */}
          <div className="card analytics-card" id="predicted-topics">
            <h3 className="chart-title">AI Predicted Topics (Next Exam)</h3>
            <div className="predicted-list">
              {predicted.map((item, i) => (
                <div key={i} className="predicted-item">
                  <div className="predicted-rank">#{i + 1}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: '0.95rem' }}>{item.topic}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>
                      Predicted confidence
                    </div>
                  </div>
                  <span className="badge badge-green">{item.confidence}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      <style>{`
        .analytics-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1.5rem;
        }
        .analytics-card { min-height: 320px; }
        .chart-title { font-size: 1rem; font-weight: 600; margin-bottom: 1rem; color: var(--color-text-primary); }
        .predicted-list { display: flex; flex-direction: column; gap: 0.75rem; margin-top: 0.5rem; }
        .predicted-item {
          display: flex; align-items: center; gap: 1rem;
          padding: 0.85rem 1rem; background: var(--color-bg-secondary);
          border-radius: var(--radius-md); border: 1px solid var(--color-border);
        }
        .predicted-rank {
          width: 32px; height: 32px; background: var(--gradient-primary);
          border-radius: 50%; display: flex; align-items: center; justify-content: center;
          font-size: 0.8rem; font-weight: 700; color: #fff; flex-shrink: 0;
        }
        @media (max-width: 900px) { .analytics-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  )
}

export default PredictiveAnalyticsPage
