import React, { useEffect, useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, LabelList,
} from 'recharts'
import { AnalyticsService } from '../../services/api'
import useThemeStore from '../../store/themeStore'

/**
 * Topic-weakness comparison as a grouped horizontal bar chart, ranked weakest-first.
 * - With `mine` (an array of {topicName, score}) → two series: You vs Class average.
 * - Without `mine` (educator view) → a single Class-average series.
 *
 * Colours are validated colourblind-safe and theme-aware. Identity is never
 * colour-alone: a legend is always shown and every bar is direct-labelled with its %.
 */
const label = (name) => (name === 'you' ? 'You' : 'Class avg')

export default function TopicWeaknessBarChart({ subject, mine }) {
  const showMine = Array.isArray(mine)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const dark = useThemeStore((s) => s.theme) === 'dark'

  // Theme-aware chart colours (series colours stay contrast-safe on both surfaces).
  const YOU_COLOR = dark ? '#5B8CFF' : '#0052FF'
  const CLASS_COLOR = dark ? '#F97316' : '#C2410C'
  const GRID = dark ? '#2B3341' : '#e6e8eb'
  const INK = dark ? '#E6EAF2' : '#1e293b'
  const MUTED = dark ? '#9BA7BA' : '#64748b'
  const tooltipStyle = {
    background: dark ? '#1B1F29' : '#ffffff',
    border: `1px solid ${GRID}`, borderRadius: 8, color: INK,
  }

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      let classTopics = []
      try {
        const res = await AnalyticsService.getClassWeaknesses(subject)
        classTopics = res.data?.topics || []
      } catch { classTopics = [] }
      if (cancelled) return

      const classMap = new Map()   // lower(topic) -> class mean %
      const names = new Map()      // lower(topic) -> display name
      classTopics.forEach((t) => {
        const key = (t.topic || '').toLowerCase()
        classMap.set(key, Math.round(t.mean_band ?? 0))
        names.set(key, t.topic)
      })

      const mineMap = new Map()
      if (showMine) {
        (mine || []).forEach((m) => {
          const key = (m.topicName || '').toLowerCase()
          mineMap.set(key, m.score)
          if (!names.has(key)) names.set(key, m.topicName)
        })
      }

      const data = [...names.entries()].map(([key, name]) => ({
        topic: name,
        ...(showMine ? { you: mineMap.has(key) ? mineMap.get(key) : null } : {}),
        class: classMap.has(key) ? classMap.get(key) : null,
      }))

      // Weakest first (ascending mastery %). Prefer the student's own score to rank.
      data.sort((a, b) => {
        const av = showMine ? (a.you ?? a.class ?? 999) : (a.class ?? 999)
        const bv = showMine ? (b.you ?? b.class ?? 999) : (b.class ?? 999)
        return av - bv
      })

      setRows(data)
      setLoading(false)
    }
    run()
    return () => { cancelled = true }
  }, [subject, mine, showMine])

  if (loading) return <p className="pa-empty">Loading chart…</p>
  if (rows.length === 0) return <p className="pa-empty">Not enough graded data to chart yet.</p>

  const rowH = showMine ? 46 : 34
  const height = Math.max(200, rows.length * rowH + 56)

  return (
    <div style={{ width: '100%', maxHeight: 520, overflowY: 'auto', overflowX: 'hidden' }}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 8, right: 44, bottom: 8, left: 8 }}
          barCategoryGap="26%"
          barGap={2}
        >
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis
            type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`}
            tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false}
          />
          <YAxis
            type="category" dataKey="topic" width={150}
            tick={{ fill: INK, fontSize: 12 }} axisLine={false} tickLine={false}
          />
          <Tooltip
            cursor={{ fill: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }}
            contentStyle={tooltipStyle}
            labelStyle={{ color: INK }}
            itemStyle={{ color: INK }}
            formatter={(v, n) => [v == null ? '—' : `${v}%`, label(n)]}
          />
          <Legend formatter={(v) => label(v)} />
          {showMine && (
            <Bar dataKey="you" name="you" fill={YOU_COLOR} barSize={12} radius={[0, 4, 4, 0]} isAnimationActive={false}>
              <LabelList dataKey="you" position="right" formatter={(v) => (v == null ? '' : `${v}%`)} style={{ fill: MUTED, fontSize: 10 }} />
            </Bar>
          )}
          <Bar dataKey="class" name="class" fill={CLASS_COLOR} barSize={12} radius={[0, 4, 4, 0]} isAnimationActive={false}>
            <LabelList dataKey="class" position="right" formatter={(v) => (v == null ? '' : `${v}%`)} style={{ fill: MUTED, fontSize: 10 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
