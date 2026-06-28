import React, { useEffect, useMemo, useState } from 'react'
import { SpecializationService } from '../services/api'
import Sidebar from '../components/layout/Sidebar.jsx'

/**
 * Admin → Specializations: assign which subjects each educator is allowed to
 * handle. The assignments gate the educator's submission queue, class analysis,
 * subject/topic management and past-year-paper access.
 */
export default function AdminSpecializationsPage() {
  const [educators, setEducators] = useState([])
  const [subjects, setSubjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState(null)
  const [checked, setChecked] = useState(() => new Set())
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      const [eduRes, subjRes] = await Promise.all([
        SpecializationService.getEducators(),
        SpecializationService.getSubjects(),
      ])
      setEducators(eduRes.data || [])
      setSubjects(subjRes.data || [])
    } catch { /* ignore */ } finally { setLoading(false) }
  }

  const activeEducator = useMemo(
    () => educators.find((e) => e.educatorId === activeId) || null,
    [educators, activeId]
  )

  const selectEducator = (e) => {
    setActiveId(e.educatorId)
    setChecked(new Set(e.subjectIds || []))
    setMessage('')
  }

  const toggle = (subjectId) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(subjectId)) next.delete(subjectId); else next.add(subjectId)
      return next
    })
  }

  const save = async () => {
    if (!activeEducator) return
    setSaving(true); setMessage('')
    try {
      await SpecializationService.setForEducator(activeEducator.educatorId, [...checked])
      setMessage('Saved ✓')
      // reflect the change in the local list so counts stay accurate
      setEducators((list) => list.map((e) =>
        e.educatorId === activeEducator.educatorId ? { ...e, subjectIds: [...checked] } : e))
    } catch (err) {
      setMessage(err?.response?.data?.message || 'Failed to save.')
    } finally { setSaving(false) }
  }

  return (
    <div className="page-layout">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <h1 className="page-title">Specializations</h1>
          <p className="page-subtitle">
            Assign the subjects each educator may handle. Educators only see submissions,
            class analysis, papers and topics for their assigned subjects.
          </p>
        </div>

        {loading ? (
          <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
        ) : (
          <div className="spec-grid">
            {/* Educator list */}
            <div className="card spec-list">
              {educators.length === 0
                ? <p style={{ color: 'var(--color-text-muted)' }}>No educators found.</p>
                : educators.map((e) => (
                  <button
                    key={e.educatorId}
                    className={`spec-edu ${activeId === e.educatorId ? 'active' : ''}`}
                    onClick={() => selectEducator(e)}
                  >
                    <div className="spec-edu-name">{e.fullName || e.email || 'Educator'}</div>
                    <div className="spec-edu-sub">
                      {e.email} · {(e.subjectIds?.length || 0)} subject{(e.subjectIds?.length || 0) !== 1 ? 's' : ''}
                    </div>
                  </button>
                ))}
            </div>

            {/* Subject assignment */}
            <div className="card">
              {!activeEducator ? (
                <p style={{ color: 'var(--color-text-muted)' }}>Select an educator to assign subjects.</p>
              ) : (
                <>
                  <h3 style={{ margin: '0 0 0.25rem' }}>{activeEducator.fullName || activeEducator.email}</h3>
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', margin: '0 0 1rem' }}>
                    Tick the subjects this educator is responsible for.
                  </p>

                  {subjects.length === 0 ? (
                    <p style={{ color: 'var(--color-text-muted)' }}>No subjects exist yet.</p>
                  ) : (
                    <div className="spec-checks">
                      {subjects.map((s) => (
                        <label key={s.subjectId} className="spec-check">
                          <input
                            type="checkbox"
                            checked={checked.has(s.subjectId)}
                            onChange={() => toggle(s.subjectId)}
                          />
                          <span>{s.name}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1.25rem' }}>
                    <button className="btn btn-primary" onClick={save} disabled={saving}>
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    {message && <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>{message}</span>}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>

      <style>{`
        .spec-grid { display: grid; grid-template-columns: 280px 1fr; gap: 1.25rem; align-items: start; }
        .spec-list { display: flex; flex-direction: column; gap: 0.5rem; max-height: calc(100vh - 220px); overflow-y: auto; }
        .spec-edu {
          text-align: left; width: 100%; background: var(--color-bg-secondary);
          border: 1px solid var(--color-border); border-radius: var(--radius-md);
          padding: 0.7rem 0.9rem; cursor: pointer;
        }
        .spec-edu.active { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent-soft); }
        .spec-edu-name { font-weight: 600; font-size: 0.9rem; }
        .spec-edu-sub { font-size: 0.76rem; color: var(--color-text-muted); margin-top: 0.15rem; }
        .spec-checks { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.5rem; }
        .spec-check {
          display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.7rem;
          border: 1px solid var(--color-border); border-radius: var(--radius-md); cursor: pointer; font-size: 0.9rem;
        }
        @media (max-width: 880px) { .spec-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  )
}
