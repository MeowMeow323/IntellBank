import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PastYearPaperService, MetadataService } from '../services/api'
import Sidebar from '../components/layout/Sidebar.jsx'
import Paginator from '../components/Paginator.jsx'
import useAuthStore from '../store/authStore'
import '../styles/document-upload.css'
import '../styles/modals.css'

const PAGE_SIZE = 10

const STATUS_COLORS = {
  UPLOADED: 'badge-blue',
  QUEUED: 'badge-amber',
  PROCESSING: 'badge-amber',
  PROCESSED: 'badge-green',
  FAILED: 'badge-red',
}
const ALL_STATUSES = ['UPLOADED', 'QUEUED', 'PROCESSING', 'PROCESSED', 'FAILED']
const ACTIVE_STATUSES = new Set(['QUEUED', 'PROCESSING'])
const POLL_INTERVAL_MS = 2000

const SORT_FIELDS = [
  { key: 'uploadDate',  label: 'Date' },
  { key: 'title',       label: 'Name' },
  { key: 'examSession', label: 'Session' },
  { key: 'status',      label: 'Status' },
]

// ── Inline-edit form ───────────────────────────────────────────────────────
const EditForm = ({ values, onChange, onSave, onCancel, isSaving, subjects }) => (
  <div style={{ flex: 1 }}>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.6rem' }}>
      <div>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.2rem' }}>Paper Name</label>
        <input className="input form-input" style={{ marginBottom: 0 }}
          value={values.title} onChange={e => onChange('title', e.target.value)} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.2rem' }}>Exam Session</label>
        <input className="input form-input" style={{ marginBottom: 0 }}
          value={values.examSession} onChange={e => onChange('examSession', e.target.value)}
          placeholder="e.g. May 2024/2025" />
      </div>
    </div>
    <div style={{ marginBottom: '0.75rem' }}>
      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.2rem' }}>Subject</label>
      <select className="input form-input" style={{ marginBottom: 0 }}
        value={values.subject} onChange={e => onChange('subject', e.target.value)}>
        <option value="">Select subject…</option>
        {subjects.map(s => <option key={s.subjectId} value={s.name}>{s.name}</option>)}
      </select>
    </div>
    <div className="flex gap-2">
      <button className="btn btn-primary" onClick={onSave}
        disabled={isSaving || !values.title.trim()}>
        {isSaving ? 'Saving…' : 'Save'}
      </button>
      <button className="btn btn-secondary" onClick={onCancel} disabled={isSaving}>Cancel</button>
    </div>
  </div>
)

// ── Library card: view or edit mode ───────────────────────────────────────
const PaperRow = ({ paper, onProcess, onSettled, onDeleteRequest, navigate,
                    isEditing, editValues, onEditChange, onEditSave, onEditCancel, isSaving,
                    subjects, onEditRequest, canEdit }) => {
  const [progress, setProgress] = useState(null)
  const isActive = ACTIVE_STATUSES.has(paper.status)

  useEffect(() => {
    if (!isActive) { setProgress(null); return }
    let cancelled = false
    const poll = async () => {
      try {
        const res = await PastYearPaperService.getProgress(paper.pypId)
        if (cancelled) return
        setProgress(res.data)
        if (res.data.status === 'PROCESSED' || res.data.status === 'FAILED') onSettled()
      } catch { /* transient poll failure */ }
    }
    poll()
    const id = setInterval(poll, POLL_INTERVAL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [isActive, paper.pypId])

  const pct = progress?.total_steps
    ? Math.round((progress.step / progress.total_steps) * 100)
    : 0

  if (isEditing) {
    return (
      <div className="card" id={`pyp-${paper.pypId}`} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <EditForm values={editValues} onChange={onEditChange}
          onSave={onEditSave} onCancel={onEditCancel}
          isSaving={isSaving} subjects={subjects} />
      </div>
    )
  }

  return (
    <div className="card flex justify-between items-center" id={`pyp-${paper.pypId}`}>
      <div style={{ flex: 1 }}>
        <p style={{ fontWeight: 600, marginBottom: '0.15rem' }}>{paper.title}</p>
        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.1rem' }}>
          {[paper.subject, paper.examSession].filter(Boolean).join(' · ')}
        </p>
        <p style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
          Uploaded {paper.uploadDate ? new Date(paper.uploadDate).toLocaleDateString() : '—'}
          {paper.questionCount != null ? ` · ${paper.questionCount} question${paper.questionCount !== 1 ? 's' : ''}` : ''}
        </p>
        {isActive && (
          <div style={{ marginTop: '0.4rem', maxWidth: '320px' }}>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', margin: '0.25rem 0 0' }}>
              {progress?.label || 'Queued'}
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <span className={`badge ${STATUS_COLORS[paper.status] || 'badge-blue'}`}>
          {paper.status}
        </span>

        {paper.fileUrl && (
          <a className="btn btn-secondary" href={paper.fileUrl} target="_blank" rel="noopener noreferrer"
            id={`view-original-${paper.pypId}`}>
            View Original
          </a>
        )}

        {paper.status === 'PROCESSED' && (
          <button className="btn btn-secondary"
            onClick={() => navigate(`/past-year-papers/${paper.pypId}/questions`)}
            id={`view-questions-${paper.pypId}`}>
            View Questions
          </button>
        )}

        {canEdit && (
          <>
            <button className="btn btn-secondary" onClick={() => onProcess(paper.pypId)}
              disabled={isActive} id={`process-pyp-${paper.pypId}`}>
              {isActive ? 'Processing…'
                : paper.status === 'FAILED' ? 'Retry'
                : paper.status === 'PROCESSED' ? 'Reprocess'
                : 'Process'}
            </button>

            <button className="btn btn-secondary" onClick={() => onEditRequest(paper)}
              disabled={isActive} id={`edit-pyp-${paper.pypId}`}>
              Edit
            </button>

            <button className="btn btn-secondary" onClick={() => onDeleteRequest(paper)}
              disabled={isActive} id={`delete-pyp-${paper.pypId}`}
              title="Delete this paper, its extracted questions, and the original PDF">
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────
const PastYearPaperLibraryPage = () => {
  const navigate = useNavigate()
  const { isEducatorOrAdmin } = useAuthStore()
  const canEdit = isEducatorOrAdmin()
  const fileRef = useRef(null)
  const [papers, setPapers]   = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [dragActive, setDragActive] = useState(false)
  const [subjects, setSubjects] = useState([])

  // Sort / filter / pagination state
  const [searchTerm,    setSearchTerm]    = useState('')
  const [statusFilter,  setStatusFilter]  = useState('')
  const [subjectFilter, setSubjectFilter] = useState('')
  const [sessionFilter, setSessionFilter] = useState('')
  const [sortField,     setSortField]     = useState('uploadDate')
  const [sortDir,       setSortDir]       = useState('desc')
  const [page,          setPage]          = useState(1)

  // Inline edit state
  const [editingId,   setEditingId]   = useState(null)
  const [editValues,  setEditValues]  = useState({})
  const [isSaving,    setIsSaving]    = useState(false)
  const [saveError,   setSaveError]   = useState('')

  // Upload modal state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [stage,         setStage]         = useState('idle')
  const [fileDetails,   setFileDetails]   = useState([])
  const [isExtracting,  setIsExtracting]  = useState(false)
  const [subject,       setSubject]       = useState('')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [errorMessage,  setErrorMessage]  = useState('')

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [isDeleting,   setIsDeleting]   = useState(false)
  const [deleteError,  setDeleteError]  = useState('')

  const busy = stage === 'uploading'

  useEffect(() => {
    loadPapers()
    MetadataService.getSubjects()
      .then(res => setSubjects(res.data || []))
      .catch(() => setSubjects([]))
  }, [])

  const loadPapers = async () => {
    setIsLoading(true)
    try {
      const res = await PastYearPaperService.getAll()
      setPapers(res.data)
    } catch { /* handled silently */ }
    finally { setIsLoading(false) }
  }

  // ── Sort / filter derived lists ────────────────────────────────────────
  const uniqueSubjects = useMemo(() =>
    [...new Set(papers.map(p => p.subject).filter(Boolean))].sort(), [papers])

  const uniqueSessions = useMemo(() =>
    [...new Set(papers.map(p => p.examSession).filter(Boolean))].sort(), [papers])

  const displayedPapers = useMemo(() => {
    const q = searchTerm.toLowerCase().trim()
    let result = papers.filter(p => {
      if (statusFilter  && p.status      !== statusFilter)  return false
      if (subjectFilter && p.subject     !== subjectFilter) return false
      if (sessionFilter && p.examSession !== sessionFilter) return false
      if (q && !p.title?.toLowerCase().includes(q) && !p.courseCode?.toLowerCase().includes(q)) return false
      return true
    })
    return [...result].sort((a, b) => {
      const va = String(a[sortField] ?? ''), vb = String(b[sortField] ?? '')
      const cmp = va < vb ? -1 : va > vb ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [papers, searchTerm, statusFilter, subjectFilter, sessionFilter, sortField, sortDir])

  // Reset to page 1 whenever filters or sort change
  useEffect(() => { setPage(1) }, [searchTerm, statusFilter, subjectFilter, sessionFilter, sortField, sortDir])

  const totalPages  = Math.max(1, Math.ceil(displayedPapers.length / PAGE_SIZE))
  const pagedPapers = displayedPapers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const hasActiveFilters = searchTerm || statusFilter || subjectFilter || sessionFilter
  const clearFilters = () => {
    setSearchTerm(''); setStatusFilter(''); setSubjectFilter(''); setSessionFilter('')
  }

  // ── Inline edit handlers ───────────────────────────────────────────────
  const startEdit = (paper) => {
    setSaveError('')
    setEditingId(paper.pypId)
    setEditValues({ title: paper.title || '', examSession: paper.examSession || '', subject: paper.subject || '' })
  }

  const cancelEdit = () => { setEditingId(null); setEditValues({}) }

  const handleEditChange = (field, value) =>
    setEditValues(prev => ({ ...prev, [field]: value }))

  const saveEdit = async () => {
    setIsSaving(true); setSaveError('')
    try {
      await PastYearPaperService.update(editingId, editValues)
      setEditingId(null)
      loadPapers()
    } catch (err) {
      setSaveError(err.response?.data?.message || 'Failed to save changes.')
    } finally {
      setIsSaving(false)
    }
  }

  // ── Upload modal helpers ───────────────────────────────────────────────
  const resetModalState = () => {
    setStage('idle'); setUploadProgress(0); setErrorMessage('')
    setFileDetails([]); setIsExtracting(false); setSubject('')
  }

  const openUploadModal = () => { resetModalState(); setIsUploadModalOpen(true) }

  const closeUploadModal = () => {
    if (busy) return
    setIsUploadModalOpen(false)
    loadPapers()
  }

  const autoMatchSubject = (courseCode, courseName, subjectList) => {
    if (subjectList.length === 0) return ''

    // Course-code match first: handles subjects named "BACS2163 Software Engineering"
    if (courseCode) {
      const code = courseCode.toLowerCase()
      const byCode = subjectList.find(s => s.name.toLowerCase().includes(code))
      if (byCode) return byCode.name
    }

    if (!courseName) return ''
    const needle = courseName.toLowerCase()

    // Exact name match
    const exact = subjectList.find(s => s.name.toLowerCase() === needle)
    if (exact) return exact.name

    // Fuzzy — only auto-select when exactly ONE subject matches (avoids picking wrong "Software Engineering")
    const fuzzy = subjectList.filter(s =>
      needle.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(needle)
    )
    return fuzzy.length === 1 ? fuzzy[0].name : ''
  }

  const pickFiles = async (files) => {
    if (!files || files.length === 0) return
    const list = Array.from(files).filter(
      f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    )
    if (list.length === 0) return
    setFileDetails(list.map(f => ({ file: f, title: '', courseCode: '', courseName: '', examSession: '' })))
    setIsExtracting(true)
    try {
      const results = await Promise.all(
        list.map(f =>
          PastYearPaperService.preview(f)
            .then(res => {
              const { course_code, course_name, exam_session } = res.data
              const title = course_code && course_name
                ? `${course_code} ${course_name}`
                : course_code || course_name || f.name.replace(/\.pdf$/i, '')
              return { file: f, courseCode: course_code || '', courseName: course_name || '', title: title || '', examSession: exam_session || '' }
            })
            .catch(() => ({ file: f, courseCode: '', courseName: '', title: f.name.replace(/\.pdf$/i, ''), examSession: '' }))
        )
      )
      setFileDetails(results)
      if (!subject && results.length > 0) {
        const matched = autoMatchSubject(results[0].courseCode, results[0].courseName, subjects)
        if (matched) setSubject(matched)
      }
    } finally {
      setIsExtracting(false)
    }
  }

  const handleDrop = (e) => { e.preventDefault(); setDragActive(false); pickFiles(e.dataTransfer.files) }

  const updateFileDetail = (index, field, value) =>
    setFileDetails(prev => prev.map((fd, i) => i === index ? { ...fd, [field]: value } : fd))

  const triggerProcessing = async (pypId) => {
    try { await PastYearPaperService.process(pypId) }
    finally { loadPapers() }
  }

  const handleUploadSubmit = async () => {
    if (fileDetails.length === 0) return
    if (!subject) { setErrorMessage('Please choose a subject.'); setStage('error'); return }
    setStage('uploading'); setUploadProgress(0)
    try {
      const total = fileDetails.length
      for (let i = 0; i < total; i++) {
        const { file, title, courseCode, examSession } = fileDetails[i]
        const effectiveTitle = title.trim() || file.name.replace(/\.pdf$/i, '')
        const res = await PastYearPaperService.upload(
          effectiveTitle, subject, file,
          { courseCode: courseCode || undefined, examSession: examSession || undefined },
          pct => setUploadProgress(Math.round(((i + pct / 100) / total) * 100))
        )
        await PastYearPaperService.process(res.data.pypId)
      }
      setIsUploadModalOpen(false)
      loadPapers()
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Upload failed.')
      setStage('error')
    }
  }

  const requestDelete = (paper) => { setDeleteError(''); setDeleteTarget({ pypId: paper.pypId, title: paper.title }) }
  const cancelDelete  = () => { if (!isDeleting) setDeleteTarget(null) }
  const confirmDelete = async () => {
    if (!deleteTarget) return
    setIsDeleting(true); setDeleteError('')
    try {
      await PastYearPaperService.delete(deleteTarget.pypId)
      setDeleteTarget(null)
      loadPapers()
    } catch (err) {
      setDeleteError(err.response?.data?.message || 'Failed to delete paper.')
    } finally { setIsDeleting(false) }
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="page-layout">
      <Sidebar />
      <main className="main-content relative">
        <div className="page-header flex justify-between items-center">
          <div>
            <h1 className="page-title">Past Year Paper Library</h1>
            <p className="page-subtitle">
              Upload past year exam papers, then run OCR + classification to extract questions
            </p>
          </div>
          {canEdit && (
            <button className="btn btn-primary" id="open-upload-modal" onClick={openUploadModal}>
              + Upload Paper
            </button>
          )}
        </div>

        {/* ── Filter + Sort bar ─────────────────────────────────────────── */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.5rem', alignItems: 'center' }}>
            <input
              type="search" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search by name or course code…"
              className="input form-input"
              style={{ flex: '1 1 180px', minWidth: '140px', marginBottom: 0 }}
            />
            <select className="input form-input" style={{ marginBottom: 0 }}
              value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All Statuses</option>
              {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="input form-input" style={{ marginBottom: 0 }}
              value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)}>
              <option value="">All Subjects</option>
              {uniqueSubjects.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="input form-input" style={{ marginBottom: 0 }}
              value={sessionFilter} onChange={e => setSessionFilter(e.target.value)}>
              <option value="">All Sessions</option>
              {uniqueSessions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {hasActiveFilters && (
              <button className="btn btn-secondary" style={{ whiteSpace: 'nowrap' }} onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', fontSize: '0.82rem' }}>
            <span style={{ color: 'var(--color-text-secondary)', marginRight: '0.2rem' }}>Sort:</span>
            {SORT_FIELDS.map(({ key, label }) => {
              const active = sortField === key
              return (
                <button key={key}
                  className={`btn btn-secondary${active ? ' active' : ''}`}
                  style={{ fontSize: '0.78rem', padding: '0.2rem 0.55rem' }}
                  onClick={() => handleSort(key)}>
                  {label}{active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                </button>
              )
            })}
            <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
              {displayedPapers.length} paper{displayedPapers.length !== 1 ? 's' : ''}
              {displayedPapers.length !== papers.length ? ` (filtered from ${papers.length})` : ''}
            </span>
          </div>
        </div>

        {saveError && (
          <p style={{ color: 'var(--color-danger, #d32f2f)', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
            {saveError}
          </p>
        )}

        {/* ── Papers List ───────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="flex justify-center"><div className="spinner" /></div>
        ) : papers.length === 0 ? (
          <p>No past year papers uploaded yet. Click "+ Upload Paper" to add one.</p>
        ) : displayedPapers.length === 0 ? (
          <p style={{ color: 'var(--color-text-secondary)' }}>
            No papers match the current filters.{' '}
            <button className="btn btn-secondary"
              style={{ fontSize: '0.82rem', padding: '0.2rem 0.5rem' }} onClick={clearFilters}>
              Clear filters
            </button>
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              {pagedPapers.map(paper => (
                <PaperRow key={paper.pypId} paper={paper}
                  onProcess={triggerProcessing} onSettled={loadPapers}
                  onDeleteRequest={requestDelete} navigate={navigate}
                  isEditing={editingId === paper.pypId}
                  editValues={editValues}
                  onEditChange={handleEditChange}
                  onEditSave={saveEdit}
                  onEditCancel={cancelEdit}
                  isSaving={isSaving}
                  subjects={subjects}
                  onEditRequest={startEdit}
                  canEdit={canEdit}
                />
              ))}
            </div>

            <Paginator page={page} totalPages={totalPages} onChange={p => { setPage(p); window.scrollTo(0, 0) }} />
          </>
        )}

        {/* ── Upload Modal ──────────────────────────────────────────────── */}
        {isUploadModalOpen && (
          <div className="modal-overlay" onClick={closeUploadModal}>
            <div className="modal-content" onClick={e => e.stopPropagation()}
              style={{ maxWidth: '560px', width: '100%' }}>

              {stage === 'idle' && (
                <>
                  <h2>📄 Upload Past Year Paper</h2>
                  <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                    Drop one or more PDF files — details will be extracted from the cover page automatically.
                  </p>
                  <div id="pyp-drop-zone"
                    className={`drop-zone ${dragActive ? 'active' : ''}`}
                    onDragOver={e => { e.preventDefault(); setDragActive(true) }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={handleDrop}
                    onClick={() => !isExtracting && fileRef.current?.click()}>
                    <input ref={fileRef} type="file" accept=".pdf" multiple
                      onChange={e => pickFiles(e.target.files)} />
                    {isExtracting ? (
                      <>
                        <div className="spinner" style={{ margin: '0 auto 0.5rem' }} />
                        <p className="drop-text">Reading cover page…</p>
                      </>
                    ) : (
                      <>
                        <div className="drop-icon">📄</div>
                        <p className="drop-text">
                          {fileDetails.length > 0
                            ? `${fileDetails.length} file${fileDetails.length > 1 ? 's' : ''} selected`
                            : 'Drop PDF files here, or click to browse'}
                        </p>
                        {fileDetails.length > 0 && (
                          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                            {fileDetails.map(fd => fd.file.name).join(', ')}
                          </p>
                        )}
                        <p style={{ fontSize: '0.8rem' }}>Supported: PDF · Multiple files allowed</p>
                      </>
                    )}
                  </div>
                  <div className="modal-actions">
                    <button className="btn btn-secondary" onClick={closeUploadModal}>Cancel</button>
                    <button className="btn btn-primary"
                      onClick={() => setStage('preview')}
                      disabled={fileDetails.length === 0 || isExtracting}>
                      Review Details →
                    </button>
                  </div>
                </>
              )}

              {stage === 'preview' && (
                <>
                  <h2>📋 Confirm Paper Details</h2>
                  <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                    Review the auto-extracted details below. Edit any field before uploading.
                  </p>
                  <div style={{ marginBottom: '1.25rem' }}>
                    <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem', fontSize: '0.9rem' }}>
                      Subject <span style={{ color: 'var(--color-danger, #d32f2f)' }}>*</span>
                    </label>
                    <select className="input form-input" value={subject} onChange={e => setSubject(e.target.value)}>
                      <option value="">Select subject…{subjects.length === 0 ? ' (none assigned to you)' : ''}</option>
                      {subjects.map(s => <option key={s.subjectId} value={s.name}>{s.name}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '340px', overflowY: 'auto' }}>
                    {fileDetails.map((fd, i) => (
                      <div key={i} style={{
                        border: '1px solid var(--color-border, #e0e0e0)',
                        borderRadius: '8px', padding: '0.9rem 1rem',
                        background: 'var(--color-surface-alt, #f9f9f9)',
                      }}>
                        <p style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginBottom: '0.6rem' }}>
                          📄 {fd.file.name}
                        </p>
                        <div style={{ marginBottom: '0.55rem' }}>
                          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.2rem' }}>
                            Paper Name
                          </label>
                          <input className="input form-input" style={{ marginBottom: 0 }}
                            value={fd.title} onChange={e => updateFileDetail(i, 'title', e.target.value)}
                            placeholder="[CourseCode] Course Name" />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.2rem' }}>
                            Exam Session
                          </label>
                          <input className="input form-input" style={{ marginBottom: 0 }}
                            value={fd.examSession} onChange={e => updateFileDetail(i, 'examSession', e.target.value)}
                            placeholder="e.g. May 2024/2025" />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="modal-actions" style={{ marginTop: '1.25rem' }}>
                    <button className="btn btn-secondary" onClick={() => setStage('idle')}>← Back</button>
                    <button className="btn btn-primary"
                      onClick={handleUploadSubmit}
                      disabled={!subject || fileDetails.some(fd => !fd.title.trim())}>
                      Upload {fileDetails.length > 1 ? `${fileDetails.length} Files` : 'File'}
                    </button>
                  </div>
                </>
              )}

              {stage === 'uploading' && (
                <>
                  <h2>⏳ Uploading…</h2>
                  <p>{fileDetails.length} file{fileDetails.length > 1 ? 's' : ''}</p>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
                  </div>
                  <p style={{ textAlign: 'center' }}>{uploadProgress}%</p>
                </>
              )}

              {stage === 'error' && (
                <>
                  <h2>⚠️ Something went wrong</h2>
                  <p>{errorMessage}</p>
                  <div className="modal-actions">
                    <button className="btn btn-primary" onClick={closeUploadModal}>Close</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Delete Confirmation Modal ──────────────────────────────────── */}
        {deleteTarget && (
          <div className="modal-overlay" onClick={cancelDelete}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <h2>🗑️ Delete "{deleteTarget.title}"?</h2>
              <p>
                This will permanently delete the paper, its extracted questions, and the
                original PDF from storage. This cannot be undone.
              </p>
              {deleteError && <p style={{ color: 'var(--color-danger, #d32f2f)' }}>{deleteError}</p>}
              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={cancelDelete} disabled={isDeleting}>Cancel</button>
                <button className="btn btn-danger" onClick={confirmDelete} disabled={isDeleting}
                  id="confirm-delete-pyp">
                  {isDeleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default PastYearPaperLibraryPage
