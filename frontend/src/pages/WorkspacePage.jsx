import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom' 
import useWorkspaceStore from '../store/workspaceStore'
import { toast } from '../store/toastStore'
import WorkspaceContent from '../components/workspace/WorkspaceContent'

// ── CONNECT DESIGN SYSTEM LAYERS ──────────────────────────────────────
import '../styles/global.css'
import '../styles/modals.css'
import '../styles/workspace-page.css'

// A 100-mark paper is 4 questions (25 each). Some topics have very few questions,
// so the user must pick a safe spread of topics to reliably fill the paper — at
// least MIN_TOPICS and at most MAX_TOPICS (bounded by what the subject actually has).
const MIN_TOPICS = 4
const MAX_TOPICS = 8

const WorkspacePage = () => {
  const { projectId } = useParams()
  const navigate = useNavigate()
  
  const {
    tabs = [],
    activeTabId,
    loadTabs,
    setActiveTab,
    isLoading,
    addTab,
    removeTab,
    renameTab,
    generateTabWithAI,
    openPastYearPaperTab,
    loadPastYearPapers,
  } = useWorkspaceStore()

  // Inline document rename
  const [renamingDocId, setRenamingDocId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const renameCancel = useRef(false)

  const commitDocRename = async (docId) => {
    const val = renameValue.trim()
    setRenamingDocId(null)
    const current = tabs.find((t) => (t.documentId || t.id) === docId)
    if (val && current && val !== current.title) await renameTab(docId, val)
  }

  // AI Generation Configuration Modal States
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [paperConfig, setPaperConfig] = useState({
    subject: '',
    topics: [],
    totalMarks: 100
  })

  // Dynamic Subject-Topics mapping from database
  const [subjectTopicsMap, setSubjectTopicsMap] = useState({})

  // Past Year Paper Modal States
  const [isPypModalOpen, setIsPypModalOpen] = useState(false)
  const [pypList, setPypList] = useState([])
  const [isPypLoading, setIsPypLoading] = useState(false)
  const [isOpeningPyp, setIsOpeningPyp] = useState(false)
  const [pypSearch, setPypSearch] = useState('')
  const [pypSubject, setPypSubject] = useState('all')
  const [pypYear, setPypYear] = useState('all')
  const [pypToConfirm, setPypToConfirm] = useState(null)  // paper awaiting open confirmation

  // Document Deletion Modal States
  const [docToDelete, setDocToDelete] = useState(null)
  const [isDeletingDoc, setIsDeletingDoc] = useState(false)

  // Fetch project files and metadata on initialization mount
  useEffect(() => {
    if (projectId) {
      loadTabs(projectId)
    }
    
    // Fetch Subjects and Topics
    import('../services/api').then(({ MetadataService }) => {
      MetadataService.getSubjectTopics()
        .then(res => {
          setSubjectTopicsMap(res.data)
          const subjects = Object.keys(res.data)
          if (subjects.length > 0) {
            setPaperConfig(prev => ({ ...prev, subject: subjects[0] }))
          }
        })
        .catch(err => console.error("Failed to load subject-topics:", err))
    })
  }, [projectId, loadTabs])

  // Automatically focus on the first available document entry if none is selected
  useEffect(() => {
    if (tabs.length > 0 && !activeTabId) {
      const fallbackId = tabs[0].documentId || tabs[0].id
      if (typeof setActiveTab === 'function') {
        setActiveTab(fallbackId)
      }
    }
  }, [tabs, activeTabId, setActiveTab])

  const handleOpenPypModal = async () => {
    setIsPypModalOpen(true)
    setIsPypLoading(true)
    setPypSearch(''); setPypSubject('all'); setPypYear('all'); setPypToConfirm(null)
    const papers = await loadPastYearPapers()
    setPypList(papers)
    setIsPypLoading(false)
  }

  // Exam year — prefer a 4-digit year in the title, fall back to the upload year.
  const pypYearOf = (p) => {
    const m = (p.title || '').match(/(19|20)\d{2}/)
    if (m) return m[0]
    return p.uploadDate ? String(new Date(p.uploadDate).getFullYear()) : '—'
  }

  const handleOpenPyp = async (pypId) => {
    setIsOpeningPyp(true)
    try {
      await openPastYearPaperTab(pypId)
      setIsPypModalOpen(false)
    } catch (err) {
      console.error('Failed to open PYP:', err)
    } finally {
      setIsOpeningPyp(false)
    }
  }

  const handleCreateRawDocument = async () => {
    try {
      await addTab({
        title: `Document ${tabs.length + 1}`,
        type: 'Raw Document'
      })
    } catch (error) {
      console.error("Error creating raw document:", error)
    }
  }

  const handleGenerate = async () => {
    if (!paperConfig.subject) return
    const available = subjectTopicsMap[paperConfig.subject] || []
    const minNeeded = Math.min(MIN_TOPICS, available.length)
    if (paperConfig.topics.length < minNeeded) {
      toast(`Please select at least ${minNeeded} topic${minNeeded === 1 ? '' : 's'} so there are enough questions to fill the paper.`, 'error')
      return
    }
    setIsGenerating(true)
    try {
      // Ensure we send topics as an array (fallback to all subject topics if none selected)
      const payload = {
        ...paperConfig,
        topics: paperConfig.topics.length > 0 ? paperConfig.topics : (subjectTopicsMap[paperConfig.subject] || [])
      }
      const result = await generateTabWithAI(payload)
      if (!result) {
        // generateTabWithAI returns null on failure and records the reason in the store.
        const msg = useWorkspaceStore.getState().error || 'Paper generation failed. Please try again.'
        toast(msg, 'error')
        return
      }
      setIsModalOpen(false)
      const subjects = Object.keys(subjectTopicsMap)
      setPaperConfig({ subject: subjects.length > 0 ? subjects[0] : '', topics: [], totalMarks: 100 })
    } catch (error) {
      console.error("Error generating paper:", error)
      toast('Paper generation failed. Please try again.', 'error')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleDocDeleteConfirm = async () => {
    if (!docToDelete) return
    setIsDeletingDoc(true)
    try {
      if (typeof removeTab === 'function') {
        const targetId = docToDelete.documentId || docToDelete.id
        const rawUser = localStorage.getItem('intellbank_user')
        const currentUser = rawUser ? JSON.parse(rawUser) : null
        const email = currentUser?.email

        if (!email) {
          console.error('No logged in user found')
          return
        }
        await removeTab(targetId, email)
      }
      setDocToDelete(null)
    } catch (error) {
      console.error("Error dropping document item:", error)
    } finally {
      setIsDeletingDoc(false)
    }
  }

  // Project Explorer order: most recently edited document on top.
  const sortedTabs = [...tabs].sort((a, b) => {
    const ta = new Date(a.updatedAt || a.createdAt || 0).getTime()
    const tb = new Date(b.updatedAt || b.createdAt || 0).getTime()
    return tb - ta
  })

  // ── Past-year-paper picker: only ready papers, with search + subject + year ──
  const readyPyps = pypList.filter((p) => p.status === 'PROCESSED')
  const pypSubjectOptions = [...new Set(readyPyps.map((p) => p.subject).filter(Boolean))].sort()
  const pypYearOptions = [...new Set(readyPyps.map(pypYearOf))].sort().reverse()
  const visiblePyps = readyPyps.filter((p) =>
    (!pypSearch || (p.title || '').toLowerCase().includes(pypSearch.toLowerCase().trim())) &&
    (pypSubject === 'all' || p.subject === pypSubject) &&
    (pypYear === 'all' || pypYearOf(p) === pypYear)
  )

  // ── Topic-count guard rails for the generate modal ──────────────────────────
  const availableTopics = subjectTopicsMap[paperConfig.subject] || []
  const effectiveMinTopics = Math.min(MIN_TOPICS, availableTopics.length)
  const effectiveMaxTopics = Math.min(MAX_TOPICS, availableTopics.length)
  const selectedCount = paperConfig.topics.length
  const tooFewTopics = selectedCount < effectiveMinTopics
  const atMaxTopics = selectedCount >= effectiveMaxTopics

  return (
    <div className="workspace-layout-grid">

      {/* 1. LEFT SIDEBAR: DIRECTORY FILE TREE FOR THE ACTIVE PROJECT */}
      <div className="workspace-sidebar">
        <div className="sidebar-project-header">
          <h3>📁 Project Explorer</h3>
          <span className="project-id-sub">ID: {projectId?.slice(0, 8)}...</span>
        </div>
        
        {/* Action Button Area */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
          <button 
            className="generate-btn" 
            onClick={() => setIsModalOpen(true)}
            style={{ margin: 0 }}
          >
            ✨ Generate AI Paper
          </button>

          <button className="ws-ghost-btn" onClick={handleOpenPypModal}>
            📄 Practice Past Year Paper
          </button>

          <button className="ws-ghost-btn" onClick={handleCreateRawDocument}>
            ➕ Create Blank Doc
          </button>
        </div>

        <div className="sidebar-document-list">
          {isLoading ? (
            <p className="status-text">Loading workspace files...</p>
          ) : tabs.length === 0 ? (
            <p className="status-textempty">No documents found inside this project.</p>
          ) : (
            sortedTabs.map((doc) => {
              const currentId = doc.documentId || doc.id
              const isActive = activeTabId === currentId

              return (
                <div 
                  key={currentId}
                  className={`sidebar-doc-item ${isActive ? 'active-item' : ''}`}
                  onClick={() => typeof setActiveTab === 'function' && setActiveTab(currentId)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden', flex: 1 }}>
                    <span className="doc-icon">📄</span>
                    {renamingDocId === currentId ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
                          else if (e.key === 'Escape') { renameCancel.current = true; e.currentTarget.blur() }
                        }}
                        onBlur={() => {
                          if (renameCancel.current) { renameCancel.current = false; setRenamingDocId(null); return }
                          commitDocRename(currentId)
                        }}
                        style={{
                          flex: 1, minWidth: 0, font: 'inherit', padding: '2px 6px',
                          border: '1px solid var(--accent)', borderRadius: '4px',
                          background: 'var(--bg-surface)', color: 'var(--text)',
                        }}
                      />
                    ) : (
                      <span className="doc-name">{doc.title || 'Untitled Document'}</span>
                    )}
                  </div>

                  <button
                    type="button"
                    title="Rename Document"
                    onClick={(e) => {
                      e.stopPropagation()
                      setRenamingDocId(currentId)
                      setRenameValue(doc.title || '')
                    }}
                    style={{
                      background: 'none', border: 'none',
                      color: isActive ? 'var(--accent)' : 'var(--ink-faint)',
                      cursor: 'pointer', padding: '4px', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', opacity: 0.7,
                      transition: 'opacity 0.2s, color 0.2s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9"></path>
                      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
                    </svg>
                  </button>

                  <button
                    type="button"
                    title="Delete Document"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDocToDelete(doc)
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: isActive ? 'var(--accent)' : 'var(--ink-faint)',
                      cursor: 'pointer',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: 0.7,
                      transition: 'opacity 0.2s, color 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                  </button>
                </div>
              )
            })
          )}
        </div>
        
        <button className="back-projects-btn" onClick={() => navigate('/projects')}>
          ← Back to Dashboard
        </button>
      </div>

      {/* 2. MAIN PANEL: EDITOR CANVAS */}
      <div className="workspace-main-panel">
        <div className="workspace-canvas-scrollbox">
          {/* Using a key property forces immediate mounting when selection switches */}
          <WorkspaceContent key={activeTabId || 'empty-state'} />
        </div>
      </div>
      
      {/* 3. ✨ GENERATE PAPER MODAL */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}
            style={{ maxWidth: '540px', gap: '1rem' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0 }}>✨ Generate Customized Paper</h2>
              <button onClick={() => setIsModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.25rem', cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>

            {/* Subject */}
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>Subject</label>
              <select className="form-input"
                value={paperConfig.subject}
                onChange={e => setPaperConfig({ ...paperConfig, subject: e.target.value, topics: [] })}
                disabled={Object.keys(subjectTopicsMap).length === 0}
              >
                {Object.keys(subjectTopicsMap).length === 0
                  ? <option>No subjects found — run OCR pipeline first.</option>
                  : Object.keys(subjectTopicsMap).map(s => <option key={s} value={s}>{s}</option>)
                }
              </select>
            </div>

            {/* Topics — checkbox grid */}
            <div className="input-group" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
                  Topics
                </label>
                <span style={{ fontSize: '0.72rem', color: tooFewTopics ? '#f59e0b' : '#64748b' }}>
                  {selectedCount} / {effectiveMinTopics}–{effectiveMaxTopics} selected
                </span>
              </div>

              {/* Checkbox grid */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem',
                maxHeight: '220px', overflowY: 'auto', padding: '0.5rem',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)', background: 'var(--inset)'
              }}>
                {(subjectTopicsMap[paperConfig.subject] || []).map(topic => {
                  const checked = paperConfig.topics.includes(topic)
                  // Block selecting more than the max (already-checked stay toggleable).
                  const disabled = !checked && atMaxTopics
                  return (
                    <label key={topic} style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                      padding: '0.4rem 0.6rem', borderRadius: '5px', cursor: disabled ? 'not-allowed' : 'pointer',
                      background: checked ? 'var(--accent-soft)' : 'transparent',
                      border: `1px solid ${checked ? 'var(--accent-border)' : 'transparent'}`,
                      transition: 'all 0.12s',
                      opacity: disabled ? 0.35 : 1,
                      fontSize: '0.8rem', color: 'var(--text)',
                      userSelect: 'none',
                    }}>
                      <input type="checkbox" checked={checked} disabled={disabled}
                        style={{ accentColor: 'var(--accent)', width: '14px', height: '14px', flexShrink: 0 }}
                        onChange={() => {
                          if (checked) {
                            setPaperConfig({ ...paperConfig, topics: paperConfig.topics.filter(t => t !== topic) })
                          } else if (!disabled) {
                            setPaperConfig({ ...paperConfig, topics: [...paperConfig.topics, topic] })
                          }
                        }}
                      />
                      {topic}
                    </label>
                  )
                })}
                {(subjectTopicsMap[paperConfig.subject] || []).length === 0 && (
                  <span style={{ gridColumn: '1/-1', color: '#64748b', fontSize: '0.8rem', padding: '0.5rem' }}>
                    Select a subject to see topics.
                  </span>
                )}
              </div>

              {/* Guidance on how many topics to pick */}
              {availableTopics.length > 0 && (
                <p style={{ fontSize: '0.74rem', margin: '0.5rem 0 0', color: tooFewTopics ? '#f59e0b' : '#64748b' }}>
                  {tooFewTopics
                    ? `Select at least ${effectiveMinTopics} topics — some topics have few questions, so a wider spread is needed to fill the 100-mark paper.`
                    : atMaxTopics
                      ? `Maximum ${effectiveMaxTopics} topics selected.`
                      : `Pick between ${effectiveMinTopics} and ${effectiveMaxTopics} topics for a well-filled paper.`}
                </p>
              )}

              {/* Selected topic chips */}
              {paperConfig.topics.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
                  {paperConfig.topics.map(t => (
                    <span key={t} style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                      background: 'var(--accent-soft)', color: 'var(--accent)',
                      padding: '2px 10px 2px 10px', borderRadius: '999px',
                      fontSize: '0.72rem', fontWeight: 500, border: '1px solid var(--accent-border)'
                    }}>
                      {t}
                      <button onClick={() => setPaperConfig({ ...paperConfig, topics: paperConfig.topics.filter(x => x !== t) })}
                        style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: '0 0 0 2px', lineHeight: 1, fontSize: '0.85rem' }}>×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Format info */}
            <div style={{
              padding: '0.65rem 0.9rem', borderRadius: 'var(--radius-md)', fontSize: '0.8rem',
              background: 'var(--inset)', border: '1px solid var(--border)',
              color: 'var(--text-muted)'
            }}>
              <strong style={{ color: 'var(--text)' }}>Format: </strong>
              4 Questions × 25 Marks = 100 Marks Total
            </div>

            <div className="modal-actions" style={{ marginTop: '0.25rem' }}>
              <button className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleGenerate}
                disabled={isGenerating || !paperConfig.subject || tooFewTopics}>
                {isGenerating ? '⏳ Generating…' : '✨ Generate Paper'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3b. PAST YEAR PAPER PICKER */}
      {isPypModalOpen && (
        <div className="modal-overlay" onClick={() => setIsPypModalOpen(false)}>
          <div className="modal-content pyp-picker" onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom: '0.2rem' }}>Past Year Papers</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0 0 1rem 0' }}>
              Search and pick a paper to open as a practice document.
            </p>

            <div className="pyp-filters">
              <input
                className="pyp-search"
                placeholder="Search papers…"
                value={pypSearch}
                onChange={e => setPypSearch(e.target.value)}
              />
              <select className="pyp-select" value={pypSubject} onChange={e => setPypSubject(e.target.value)}>
                <option value="all">All subjects</option>
                {pypSubjectOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select className="pyp-select" value={pypYear} onChange={e => setPypYear(e.target.value)}>
                <option value="all">All years</option>
                {pypYearOptions.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            {isPypLoading ? (
              <p className="pyp-empty">Loading papers…</p>
            ) : visiblePyps.length === 0 ? (
              <p className="pyp-empty">
                {readyPyps.length === 0
                  ? 'No processed papers yet. Upload and process a paper first.'
                  : 'No papers match your filters.'}
              </p>
            ) : (
              <div className="pyp-list">
                {visiblePyps.map(pyp => (
                  <button key={pyp.pypId} className="pyp-row" onClick={() => setPypToConfirm(pyp)}>
                    <div style={{ minWidth: 0 }}>
                      <span className="pyp-row-title">{pyp.title}</span>
                      <span className="pyp-row-meta">
                        {pyp.subject && <span className="pyp-chip">{pyp.subject}</span>}
                        <span className="pyp-chip">{pypYearOf(pyp)}</span>
                        <span className="pyp-q">{pyp.questionCount ?? '—'} questions</span>
                      </span>
                    </div>
                    <span className="pyp-open">Open →</span>
                  </button>
                ))}
              </div>
            )}

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setIsPypModalOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* 3c. PAST YEAR PAPER — OPEN CONFIRMATION */}
      {pypToConfirm && (
        <div className="modal-overlay" onClick={() => setPypToConfirm(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '460px' }}>
            <h2 style={{ marginBottom: '0.2rem' }}>Open this paper?</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0 0 1rem 0' }}>
              It opens as a practice document you can answer.
            </p>

            <div className="pyp-confirm-card">
              <div className="pyp-confirm-title">{pypToConfirm.title}</div>
              <div className="pyp-confirm-rows">
                {pypToConfirm.subject && <div><span>Subject</span><strong>{pypToConfirm.subject}</strong></div>}
                <div><span>Year</span><strong>{pypYearOf(pypToConfirm)}</strong></div>
                <div><span>Questions</span><strong>{pypToConfirm.questionCount ?? '—'} (25 marks each)</strong></div>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setPypToConfirm(null)} disabled={isOpeningPyp}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={isOpeningPyp}
                onClick={async () => { await handleOpenPyp(pypToConfirm.pypId); setPypToConfirm(null) }}
              >
                {isOpeningPyp ? 'Opening…' : 'Open paper'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. 🗑️ DELETION CONFIRMATION MODAL */}
      {docToDelete && (
        <div className="modal-overlay" onClick={() => setDocToDelete(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>⚠️ Delete Document?</h2>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', lineHeight: '1.5', margin: '0 0 1.5rem 0' }}>
              Are you sure you want to permanently delete <strong>{docToDelete.title || 'this document'}</strong>? All sub-scores, records, and analytics attached to this file will be wiped out from the backend database. This cannot be undone.
            </p>

            <div className="modal-actions">
              <button 
                className="btn btn-secondary" 
                onClick={() => setDocToDelete(null)}
                disabled={isDeletingDoc}
              >
                Cancel
              </button>
              <button 
                className="btn btn-danger" 
                onClick={handleDocDeleteConfirm} 
                disabled={isDeletingDoc}
              >
                {isDeletingDoc ? 'Deleting...' : 'Yes, Delete Document'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default WorkspacePage