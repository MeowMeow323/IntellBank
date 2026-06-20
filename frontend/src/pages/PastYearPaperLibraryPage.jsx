import React, { useEffect, useRef, useState } from 'react'
import { PastYearPaperService, QuestionService } from '../services/api'
import Sidebar from '../components/layout/Sidebar.jsx'
import '../styles/document-upload.css'
import '../styles/modals.css'

const STATUS_COLORS = {
  UPLOADED: 'badge-blue',
  PROCESSING: 'badge-amber',
  PROCESSED: 'badge-green',
  FAILED: 'badge-red',
}

// Modal stages: idle -> uploading -> processing -> result | error
const PastYearPaperLibraryPage = () => {
  const fileRef = useRef(null)
  const [papers, setPapers] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [dragActive, setDragActive] = useState(false)
  const [title, setTitle] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [processingIds, setProcessingIds] = useState({})
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)

  const [stage, setStage] = useState('idle')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [activePaper, setActivePaper] = useState(null)
  const [resultQuestions, setResultQuestions] = useState([])
  const [errorMessage, setErrorMessage] = useState('')

  const busy = stage === 'uploading' || stage === 'processing'

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
    setActivePaper(null)
    setResultQuestions([])
    setErrorMessage('')
    setTitle('')
    setSelectedFile(null)
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

  const pickFile = (files) => {
    if (!files || files.length === 0) return
    const file = files[0]
    setSelectedFile(file)
    if (!title.trim()) {
      setTitle(file.name.replace(/\.pdf$/i, ''))
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragActive(false)
    pickFile(e.dataTransfer.files)
  }

  const runProcessing = async (pypId) => {
    setStage('processing')
    setProcessingIds((prev) => ({ ...prev, [pypId]: true }))
    try {
      const res = await PastYearPaperService.process(pypId)
      setActivePaper(res.data)

      if (res.data.status === 'PROCESSED') {
        const questionsRes = await QuestionService.getByPyp(pypId)
        setResultQuestions(questionsRes.data)
        setStage('result')
      } else {
        setErrorMessage(
          res.data.error
            ? `Processing failed: ${res.data.error}`
            : 'Processing finished but no questions could be extracted from this PDF — the paper may use a layout the parser doesn\'t recognize yet.'
        )
        setStage('error')
      }
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Processing request failed.')
      setStage('error')
    } finally {
      setProcessingIds((prev) => {
        const next = { ...prev }
        delete next[pypId]
        return next
      })
      loadPapers()
    }
  }

  const handleUploadSubmit = async () => {
    if (!selectedFile) return
    const effectiveTitle = title.trim() || selectedFile.name.replace(/\.pdf$/i, '')
    setStage('uploading')
    setUploadProgress(0)
    try {
      const res = await PastYearPaperService.upload(effectiveTitle, selectedFile, setUploadProgress)
      setActivePaper(res.data)
      await loadPapers()
      await runProcessing(res.data.pypId)
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Upload failed.')
      setStage('error')
    }
  }

  const handleListProcess = async (pypId) => {
    setProcessingIds((prev) => ({ ...prev, [pypId]: true }))
    setPapers((prev) => prev.map((p) => (p.pypId === pypId ? { ...p, status: 'PROCESSING' } : p)))
    try {
      await PastYearPaperService.process(pypId)
    } catch {
      // fall through — reload will show the real (FAILED) status either way
    } finally {
      await loadPapers()
      setProcessingIds((prev) => {
        const next = { ...prev }
        delete next[pypId]
        return next
      })
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
                <div key={paper.pypId} className="card flex justify-between items-center" id={`pyp-${paper.pypId}`}>
                  <div>
                    <p>{paper.title}</p>
                    <p>
                      Uploaded {paper.uploadDate ? new Date(paper.uploadDate).toLocaleDateString() : '—'}
                    </p>
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

                    {(paper.status === 'UPLOADED' || paper.status === 'FAILED') && (
                      <button
                        className="btn btn-secondary"
                        onClick={() => handleListProcess(paper.pypId)}
                        disabled={!!processingIds[paper.pypId]}
                        id={`process-pyp-${paper.pypId}`}
                      >
                        {paper.status === 'FAILED' ? 'Retry Processing' : 'Process'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upload Modal */}
        {isUploadModalOpen && (
          <div className="modal-overlay" onClick={closeUploadModal}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>

              {/* ── Stage: idle (picking file) ───────────────────────────── */}
              {stage === 'idle' && (
                <>
                  <h2>📄 Upload Past Year Paper</h2>

                  <input
                    type="text"
                    className="input form-input"
                    placeholder="Paper title (optional — defaults to the file name)"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />

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
                      onChange={(e) => pickFile(e.target.files)}
                    />
                    <div className="drop-icon">📄</div>
                    <p className="drop-text">
                      {selectedFile ? selectedFile.name : 'Drop a past year paper PDF here, or click to browse'}
                    </p>
                    <p>Supported: PDF</p>
                  </div>

                  <div className="modal-actions">
                    <button className="btn btn-secondary" onClick={closeUploadModal}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleUploadSubmit} disabled={!selectedFile}>
                      Upload
                    </button>
                  </div>
                </>
              )}

              {/* ── Stage: uploading ──────────────────────────────────────── */}
              {stage === 'uploading' && (
                <>
                  <h2>⏳ Uploading...</h2>
                  <p>{selectedFile?.name}</p>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
                  </div>
                  <p style={{ textAlign: 'center' }}>{uploadProgress}%</p>
                </>
              )}

              {/* ── Stage: processing ─────────────────────────────────────── */}
              {stage === 'processing' && (
                <>
                  <h2>✓ Uploaded — running OCR &amp; classification...</h2>
                  <p>
                    This can take a while the first time (downloading the AI models). Extracting text,
                    tables, equations, and classifying questions for <strong>{activePaper?.title}</strong>.
                  </p>
                  <div className="flex justify-center">
                    <div className="spinner" />
                  </div>
                </>
              )}

              {/* ── Stage: result ─────────────────────────────────────────── */}
              {stage === 'result' && (
                <>
                  <h2>✅ Processed successfully</h2>
                  <p>
                    Extracted <strong>{resultQuestions.length}</strong> question(s) from{' '}
                    <strong>{activePaper?.title}</strong>.
                  </p>

                  {resultQuestions.length > 0 && (
                    <div style={{ maxHeight: '320px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {resultQuestions.map((q, i) => (
                        <div key={q.questionId} className="card">
                          <p style={{ fontWeight: 600, margin: '0 0 0.25rem' }}>Q{i + 1} ({q.marks ?? 1} marks)</p>
                          <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                            {q.content?.length > 240 ? q.content.slice(0, 240) + '…' : q.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="modal-actions">
                    {activePaper?.fileUrl && (
                      <a
                        className="btn btn-secondary"
                        href={activePaper.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View Original File
                      </a>
                    )}
                    <button className="btn btn-primary" onClick={closeUploadModal}>Done</button>
                  </div>
                </>
              )}

              {/* ── Stage: error ──────────────────────────────────────────── */}
              {stage === 'error' && (
                <>
                  <h2>⚠️ Something went wrong</h2>
                  <p>{errorMessage}</p>

                  <div className="modal-actions">
                    {activePaper?.fileUrl && (
                      <a
                        className="btn btn-secondary"
                        href={activePaper.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View Original File
                      </a>
                    )}
                    {activePaper?.pypId && (
                      <button className="btn btn-secondary" onClick={() => runProcessing(activePaper.pypId)}>
                        Retry Processing
                      </button>
                    )}
                    <button className="btn btn-primary" onClick={closeUploadModal}>Close</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default PastYearPaperLibraryPage
