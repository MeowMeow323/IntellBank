import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PastYearPaperService } from '../services/api'
import Sidebar from '../components/layout/Sidebar.jsx'
import '../styles/document-upload.css'
import '../styles/modals.css'

const STATUS_COLORS = {
  UPLOADED: 'badge-blue',
  QUEUED: 'badge-amber',
  PROCESSING: 'badge-amber',
  PROCESSED: 'badge-green',
  FAILED: 'badge-red',
}

const ACTIVE_STATUSES = new Set(['QUEUED', 'PROCESSING'])
const POLL_INTERVAL_MS = 2000

// Processing now runs on the AI service's own background job queue (see
// job_queue_service.py) — this row polls /progress independently of
// whatever else is happening on the page, so it keeps reflecting real
// state even if you navigate away and come back, or refresh entirely.
const PaperRow = ({ paper, onProcess, onSettled, onDeleteRequest, navigate }) => {
  const [progress, setProgress] = useState(null)
  const isActive = ACTIVE_STATUSES.has(paper.status)

  useEffect(() => {
    if (!isActive) {
      setProgress(null)
      return
    }
    let cancelled = false

    const poll = async () => {
      try {
        const res = await PastYearPaperService.getProgress(paper.pypId)
        if (cancelled) return
        setProgress(res.data)
        if (res.data.status === 'PROCESSED' || res.data.status === 'FAILED') {
          onSettled()
        }
      } catch {
        // transient poll failure — try again next tick
      }
    }

    poll()
    const id = setInterval(poll, POLL_INTERVAL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [isActive, paper.pypId])

  const pct = progress?.total_steps ? Math.round((progress.step / progress.total_steps) * 100) : 0

  return (
    <div className="card flex justify-between items-center" id={`pyp-${paper.pypId}`}>
      <div style={{ flex: 1 }}>
        <p>{paper.title}</p>
        <p>Uploaded {paper.uploadDate ? new Date(paper.uploadDate).toLocaleDateString() : '—'}</p>
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
          <a
            className="btn btn-secondary"
            href={paper.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            id={`view-original-${paper.pypId}`}
          >
            View Original
          </a>
        )}

        {paper.status === 'PROCESSED' && (
          <button
            className="btn btn-secondary"
            onClick={() => navigate(`/past-year-papers/${paper.pypId}/questions`)}
            id={`view-questions-${paper.pypId}`}
          >
            View Questions
          </button>
        )}

        <button
          className="btn btn-secondary"
          onClick={() => onProcess(paper.pypId)}
          disabled={isActive}
          id={`process-pyp-${paper.pypId}`}
        >
          {isActive
            ? 'Processing...'
            : paper.status === 'FAILED'
              ? 'Retry Processing'
              : paper.status === 'PROCESSED'
                ? 'Reprocess'
                : 'Process'}
        </button>

        <button
          className="btn btn-secondary"
          onClick={() => onDeleteRequest(paper)}
          disabled={isActive}
          id={`delete-pyp-${paper.pypId}`}
          title="Delete this paper, its extracted questions, and the original PDF"
        >
          Delete
        </button>
      </div>
    </div>
  )
}

// Modal stages: idle (picking files) -> uploading -> error
// There's no "processing"/"result" stage anymore — processing runs
// entirely in the background once queued, so the modal closes right after
// upload and every paper's live progress shows in its own list row instead.
const PastYearPaperLibraryPage = () => {
  const navigate = useNavigate()
  const fileRef = useRef(null)
  const [papers, setPapers] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [dragActive, setDragActive] = useState(false)
  const [title, setTitle] = useState('')
  const [selectedFiles, setSelectedFiles] = useState([])
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)

  const [stage, setStage] = useState('idle')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')

  const [deleteTarget, setDeleteTarget] = useState(null) // { pypId, title } | null
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const busy = stage === 'uploading'

  useEffect(() => {
    loadPapers()
  }, [])

  const loadPapers = async () => {
    setIsLoading(true)
    try {
      const res = await PastYearPaperService.getAll()
      setPapers(res.data)
    } catch {
      // TODO: handle error
    } finally {
      setIsLoading(false)
    }
  }

  const resetModalState = () => {
    setStage('idle')
    setUploadProgress(0)
    setErrorMessage('')
    setTitle('')
    setSelectedFiles([])
  }

  const openUploadModal = () => {
    resetModalState()
    setIsUploadModalOpen(true)
  }

  const closeUploadModal = () => {
    if (busy) return
    setIsUploadModalOpen(false)
    loadPapers()
  }

  const pickFiles = (files) => {
    if (!files || files.length === 0) return
    const list = Array.from(files).filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    )
    if (list.length === 0) return
    setSelectedFiles(list)
    if (list.length === 1 && !title.trim()) {
      setTitle(list[0].name.replace(/\.pdf$/i, ''))
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragActive(false)
    pickFiles(e.dataTransfer.files)
  }

  // Fire-and-forget — the AI service queues the job and returns almost
  // immediately (see job_queue_service.py); the row's own poll picks up
  // real progress from there. Errors here are surfaced as the row settling
  // into a FAILED status on the next poll, not a thrown error here.
  const triggerProcessing = async (pypId) => {
    try {
      await PastYearPaperService.process(pypId)
    } finally {
      loadPapers()
    }
  }

  const requestDelete = (paper) => {
    setDeleteError('')
    setDeleteTarget({ pypId: paper.pypId, title: paper.title })
  }
  const cancelDelete = () => { if (!isDeleting) setDeleteTarget(null) }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    setDeleteError('')
    try {
      await PastYearPaperService.delete(deleteTarget.pypId)
      setDeleteTarget(null)
      loadPapers()
    } catch (err) {
      setDeleteError(err.response?.data?.message || 'Failed to delete paper.')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleUploadSubmit = async () => {
    if (selectedFiles.length === 0) return
    setStage('uploading')
    setUploadProgress(0)
    try {
      const total = selectedFiles.length
      for (let i = 0; i < total; i++) {
        const file = selectedFiles[i]
        const effectiveTitle = (total === 1 && title.trim()) || file.name.replace(/\.pdf$/i, '')
        const res = await PastYearPaperService.upload(effectiveTitle, file, (pct) => {
          setUploadProgress(Math.round(((i + pct / 100) / total) * 100))
        })
        // Queue processing immediately — don't wait for it to finish.
        await PastYearPaperService.process(res.data.pypId)
      }
      setIsUploadModalOpen(false)
      loadPapers()
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Upload failed.')
      setStage('error')
    }
  }

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
          <button className="btn btn-primary" id="open-upload-modal" onClick={openUploadModal}>
            + Upload Paper
          </button>
        </div>

        {/* Papers List */}
        <div>
          <h2>Uploaded Papers</h2>
          {isLoading ? (
            <div className="flex justify-center">
              <div className="spinner" />
            </div>
          ) : papers.length === 0 ? (
            <p>No past year papers uploaded yet. Click "+ Upload Paper" to add one.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {papers.map((paper) => (
                <PaperRow
                  key={paper.pypId}
                  paper={paper}
                  onProcess={triggerProcessing}
                  onSettled={loadPapers}
                  onDeleteRequest={requestDelete}
                  navigate={navigate}
                />
              ))}
            </div>
          )}
        </div>

        {/* Upload Modal */}
        {isUploadModalOpen && (
          <div className="modal-overlay" onClick={closeUploadModal}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>

              {/* ── Stage: idle (picking files) ─────────────────────────── */}
              {stage === 'idle' && (
                <>
                  <h2>📄 Upload Past Year Paper{selectedFiles.length > 1 ? 's' : ''}</h2>

                  {selectedFiles.length <= 1 && (
                    <input
                      type="text"
                      className="input form-input"
                      placeholder="Paper title (optional — defaults to the file name)"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  )}

                  <div
                    id="pyp-drop-zone"
                    className={`drop-zone ${dragActive ? 'active' : ''}`}
                    onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={handleDrop}
                    onClick={() => fileRef.current?.click()}
                  >
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".pdf"
                      multiple
                      onChange={(e) => pickFiles(e.target.files)}
                    />
                    <div className="drop-icon">📄</div>
                    <p className="drop-text">
                      {selectedFiles.length > 0
                        ? `${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''} selected: ${selectedFiles.map((f) => f.name).join(', ')}`
                        : 'Drop one or more past year paper PDFs here, or click to browse'}
                    </p>
                    <p>Supported: PDF — multiple files process in parallel (up to 3 at a time)</p>
                  </div>

                  <div className="modal-actions">
                    <button className="btn btn-secondary" onClick={closeUploadModal}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleUploadSubmit} disabled={selectedFiles.length === 0}>
                      {selectedFiles.length > 1 ? `Upload ${selectedFiles.length} files` : 'Upload'}
                    </button>
                  </div>
                </>
              )}

              {/* ── Stage: uploading ────────────────────────────────────── */}
              {stage === 'uploading' && (
                <>
                  <h2>⏳ Uploading...</h2>
                  <p>{selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''}</p>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
                  </div>
                  <p style={{ textAlign: 'center' }}>{uploadProgress}%</p>
                </>
              )}

              {/* ── Stage: error ─────────────────────────────────────────── */}
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

        {/* Delete Confirmation Modal */}
        {deleteTarget && (
          <div className="modal-overlay" onClick={cancelDelete}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h2>🗑️ Delete "{deleteTarget.title}"?</h2>
              <p>
                This will permanently delete the paper, its extracted questions, and the
                original PDF from storage. This cannot be undone.
              </p>
              {deleteError && <p style={{ color: 'var(--color-danger, #d32f2f)' }}>{deleteError}</p>}
              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={cancelDelete} disabled={isDeleting}>
                  Cancel
                </button>
                <button className="btn btn-danger" onClick={confirmDelete} disabled={isDeleting} id="confirm-delete-pyp">
                  {isDeleting ? 'Deleting...' : 'Delete'}
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
