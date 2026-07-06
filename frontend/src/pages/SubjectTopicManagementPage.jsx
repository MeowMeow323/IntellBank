import React, { useEffect, useMemo, useState } from 'react'
import { Search, Plus, X, BookOpen, Tag } from 'lucide-react'
import { MetadataService } from '../services/api'
import useAuthStore from '../store/authStore'
import Sidebar from '../components/layout/Sidebar.jsx'

const SubjectTopicManagementPage = () => {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'ADMIN'

  const [subjects, setSubjects] = useState([])
  const [topicCounts, setTopicCounts] = useState({})   // subjectName -> topic count
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [topics, setTopics] = useState([])
  const [isLoadingSubjects, setIsLoadingSubjects] = useState(true)
  const [isLoadingTopics, setIsLoadingTopics] = useState(false)

  const [subjectQuery, setSubjectQuery] = useState('')
  const [topicQuery, setTopicQuery] = useState('')

  const [showAddSubject, setShowAddSubject] = useState(false)
  const [newSubjectName, setNewSubjectName] = useState('')
  const [newTopicName, setNewTopicName] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    loadSubjects()
  }, [])

  useEffect(() => {
    if (selectedSubjectId) loadTopics(selectedSubjectId)
    else setTopics([])
  }, [selectedSubjectId])

  const loadSubjects = async () => {
    setIsLoadingSubjects(true)
    setError('')
    try {
      const [subjRes, mapRes] = await Promise.all([
        MetadataService.getSubjects(),
        MetadataService.getSubjectTopics(),
      ])
      setSubjects(subjRes.data)
      const counts = {}
      Object.entries(mapRes.data || {}).forEach(([name, list]) => { counts[name] = list.length })
      setTopicCounts(counts)
      if (subjRes.data.length > 0 && !selectedSubjectId) {
        setSelectedSubjectId(subjRes.data[0].subjectId)
      }
    } catch {
      setError('Failed to load subjects.')
    } finally {
      setIsLoadingSubjects(false)
    }
  }

  const loadTopics = async (subjectId) => {
    setIsLoadingTopics(true)
    try {
      const res = await MetadataService.getTopics(subjectId)
      setTopics(res.data)
    } catch {
      setError('Failed to load topics.')
    } finally {
      setIsLoadingTopics(false)
    }
  }

  const selectedSubject = useMemo(
    () => subjects.find((s) => s.subjectId === selectedSubjectId) || null,
    [subjects, selectedSubjectId]
  )

  const filteredSubjects = useMemo(() => {
    const q = subjectQuery.trim().toLowerCase()
    if (!q) return subjects
    return subjects.filter((s) => s.name.toLowerCase().includes(q))
  }, [subjects, subjectQuery])

  const filteredTopics = useMemo(() => {
    const q = topicQuery.trim().toLowerCase()
    if (!q) return topics
    return topics.filter((t) => t.name.toLowerCase().includes(q))
  }, [topics, topicQuery])

  const totalTopics = useMemo(
    () => Object.values(topicCounts).reduce((a, n) => a + n, 0),
    [topicCounts]
  )

  const handleCreateSubject = async (e) => {
    e.preventDefault()
    const names = newSubjectName.split(',').map((n) => n.trim()).filter(Boolean)
    if (names.length === 0) return
    setError('')
    try {
      let lastId
      for (const name of names) {
        const res = await MetadataService.createSubject(name)
        lastId = res.data.subjectId
      }
      setNewSubjectName('')
      setShowAddSubject(false)
      await loadSubjects()
      setSelectedSubjectId(lastId)
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to add subject.')
    }
  }

  const handleCreateTopic = async (e) => {
    e.preventDefault()
    if (!selectedSubjectId) return
    const names = newTopicName.split(',').map((n) => n.trim()).filter(Boolean)
    if (names.length === 0) return
    setError('')
    try {
      for (const name of names) {
        await MetadataService.createTopic(selectedSubjectId, name)
      }
      setNewTopicName('')
      await loadTopics(selectedSubjectId)
      if (selectedSubject) {
        setTopicCounts((prev) => ({ ...prev, [selectedSubject.name]: (prev[selectedSubject.name] || 0) + names.length }))
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to add topic.')
    }
  }

  const handleDeleteTopic = async (topic) => {
    if (!window.confirm(`Remove "${topic.name}"? Questions already tagged with it keep the label, but new classification won't use it.`)) return
    setError('')
    try {
      await MetadataService.deleteTopic(topic.topicId)
      await loadTopics(selectedSubjectId)
      if (selectedSubject) {
        setTopicCounts((prev) => ({ ...prev, [selectedSubject.name]: Math.max(0, (prev[selectedSubject.name] || 1) - 1) }))
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to remove topic.')
    }
  }

  return (
    <div className="page-layout">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <h1 className="page-title">Subjects &amp; Topics</h1>
          <p className="page-subtitle">
            Define the topic names AI classification matches questions against —
            a subject needs at least one topic here before paper processing can
            tag its questions automatically.
          </p>
        </div>

        {!isLoadingSubjects && (
          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-icon"><BookOpen size={18} /></div>
              <div>
                <div className="stat-value">{subjects.length}</div>
                <div className="stat-label">Subjects</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon"><Tag size={18} /></div>
              <div>
                <div className="stat-value">{totalTopics}</div>
                <div className="stat-label">Topics</div>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div style={{ color: 'var(--danger)', background: 'var(--danger-soft)', border: '1px solid rgba(185,28,28,0.25)', borderRadius: 8, padding: '0.7rem 1rem', marginBottom: '1rem', fontSize: '0.88rem' }}>
            {error}
          </div>
        )}

        {isLoadingSubjects ? (
          <div className="flex justify-center"><div className="spinner" /></div>
        ) : (
          <div className="st-grid">
            {/* ── Subjects column ─────────────────────────────────────────── */}
            <div className="card st-col">
              <div className="st-col-head">
                <h3 className="st-col-title">Subjects</h3>
                {isAdmin && (
                  <button
                    type="button"
                    className="btn btn-secondary st-add-btn"
                    onClick={() => setShowAddSubject((v) => !v)}
                  >
                    <Plus size={15} /> Add
                  </button>
                )}
              </div>

              {isAdmin && showAddSubject && (
                <form onSubmit={handleCreateSubject} className="st-add-form">
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Subject name(s), comma-separated"
                    value={newSubjectName}
                    onChange={(e) => setNewSubjectName(e.target.value)}
                    autoFocus
                  />
                  <div className="st-add-form-actions">
                    <button type="submit" className="btn btn-primary">Create</button>
                    <button type="button" className="btn btn-secondary" onClick={() => { setShowAddSubject(false); setNewSubjectName('') }}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {subjects.length > 4 && (
                <div className="st-search">
                  <Search size={15} />
                  <input
                    type="text"
                    placeholder="Filter subjects…"
                    value={subjectQuery}
                    onChange={(e) => setSubjectQuery(e.target.value)}
                  />
                </div>
              )}

              {subjects.length === 0 ? (
                <div className="st-empty">
                  <p>No subjects yet.</p>
                  {isAdmin
                    ? <p className="st-empty-sub">Add one above to get started.</p>
                    : <p className="st-empty-sub">Ask an administrator to create one.</p>}
                </div>
              ) : filteredSubjects.length === 0 ? (
                <p className="st-empty-sub">No subjects match "{subjectQuery}".</p>
              ) : (
                <div className="st-subject-list">
                  {filteredSubjects.map((s) => (
                    <button
                      key={s.subjectId}
                      className={`st-subject ${selectedSubjectId === s.subjectId ? 'active' : ''}`}
                      onClick={() => setSelectedSubjectId(s.subjectId)}
                    >
                      <span className="st-subject-name">{s.name}</span>
                      <span className="badge badge-gray">{topicCounts[s.name] ?? 0}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── Topics column ───────────────────────────────────────────── */}
            <div className="card st-col">
              {!selectedSubject ? (
                <p className="st-empty-sub">Select a subject to manage its topics.</p>
              ) : (
                <>
                  <div className="st-col-head">
                    <h3 className="st-col-title">
                      {selectedSubject.name}
                      <span className="badge badge-gray" style={{ marginLeft: '0.6rem' }}>
                        {topics.length} topic{topics.length !== 1 ? 's' : ''}
                      </span>
                    </h3>
                  </div>

                  <form onSubmit={handleCreateTopic} className="st-add-form st-add-form-inline">
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Topic name(s), comma-separated (e.g. Integration by Parts, Limits)"
                      value={newTopicName}
                      onChange={(e) => setNewTopicName(e.target.value)}
                    />
                    <button type="submit" className="btn btn-primary" disabled={!newTopicName.trim()}>
                      <Plus size={15} /> Add
                    </button>
                  </form>

                  {topics.length > 6 && (
                    <div className="st-search">
                      <Search size={15} />
                      <input
                        type="text"
                        placeholder="Filter topics…"
                        value={topicQuery}
                        onChange={(e) => setTopicQuery(e.target.value)}
                      />
                    </div>
                  )}

                  {isLoadingTopics ? (
                    <div className="flex justify-center"><div className="spinner" /></div>
                  ) : topics.length === 0 ? (
                    <div className="st-empty">
                      <p>No topics yet for this subject.</p>
                      <p className="st-empty-sub">Classification will fall back to keywords or "General" until topics exist.</p>
                    </div>
                  ) : filteredTopics.length === 0 ? (
                    <p className="st-empty-sub">No topics match "{topicQuery}".</p>
                  ) : (
                    <div className="st-topic-chips">
                      {filteredTopics.map((t) => (
                        <span key={t.topicId} className="st-chip">
                          {t.name}
                          <button
                            type="button"
                            className="st-chip-remove"
                            title={`Remove ${t.name}`}
                            onClick={() => handleDeleteTopic(t)}
                          >
                            <X size={13} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </main>

      <style>{`
        .st-grid { display: grid; grid-template-columns: 300px 1fr; gap: 1.25rem; align-items: start; }
        .st-col { display: flex; flex-direction: column; gap: 0.85rem; }
        .st-col-head { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
        .st-col-title { display: flex; align-items: center; font-size: 1rem; margin: 0; }
        .st-add-btn { padding: 0.4rem 0.8rem; font-size: 0.82rem; }

        .st-add-form { display: flex; flex-direction: column; gap: 0.6rem; }
        .st-add-form-inline { flex-direction: row; align-items: center; }
        .st-add-form-inline .form-input { flex: 1; }
        .st-add-form-actions { display: flex; gap: 0.5rem; }

        .st-search {
          display: flex; align-items: center; gap: 0.5rem;
          border: 1px solid var(--border); border-radius: var(--radius-md);
          padding: 0.45rem 0.75rem; color: var(--text-muted);
        }
        .st-search input {
          border: none; outline: none; background: transparent; width: 100%;
          font-family: var(--font-primary); font-size: 0.85rem; color: var(--text);
        }

        .st-subject-list { display: flex; flex-direction: column; gap: 0.4rem; max-height: calc(100vh - 420px); overflow-y: auto; }
        .st-subject {
          display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
          text-align: left; width: 100%; background: var(--bg-surface-2);
          border: 1px solid transparent; border-radius: var(--radius-md);
          padding: 0.6rem 0.8rem; cursor: pointer; font-size: 0.88rem;
          transition: border-color var(--transition-fast), background var(--transition-fast);
        }
        .st-subject:hover { background: var(--inset); }
        .st-subject.active { background: var(--accent-soft); border-color: var(--accent-border); }
        .st-subject.active .st-subject-name { color: var(--accent); font-weight: 600; }
        .st-subject-name { color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        .st-topic-chips { display: flex; flex-wrap: wrap; gap: 0.5rem; }
        .st-chip {
          display: inline-flex; align-items: center; gap: 0.4rem;
          background: var(--bg-surface-2); border: 1px solid var(--border);
          border-radius: 999px; padding: 0.4rem 0.5rem 0.4rem 0.85rem;
          font-size: 0.84rem; color: var(--text);
        }
        .st-chip-remove {
          display: inline-flex; align-items: center; justify-content: center;
          width: 20px; height: 20px; border-radius: 999px; border: none;
          background: transparent; color: var(--text-subtle); cursor: pointer;
          transition: background var(--transition-fast), color var(--transition-fast);
        }
        .st-chip-remove:hover { background: var(--danger-soft); color: var(--danger); }

        .st-empty { padding: 1.5rem 0.25rem; }
        .st-empty p { color: var(--text-muted); font-size: 0.9rem; }
        .st-empty-sub { color: var(--text-subtle); font-size: 0.82rem; margin-top: 0.25rem; }

        @media (max-width: 880px) { .st-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  )
}

export default SubjectTopicManagementPage
