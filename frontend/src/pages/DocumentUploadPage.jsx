import React, { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { DocumentService } from '../services/api'
import Sidebar from '../components/layout/Sidebar.jsx'
import '../styles/document-upload.css'
import '../styles/modals.css'

const STATUS_COLORS = {
  UPLOADED: 'badge-blue',
  PROCESSING: 'badge-amber',
  PROCESSED: 'badge-green',
  FAILED: 'badge-red',
}

const DocumentUploadPage = () => {
  const { projectId } = useParams()
  const fileRef = useRef(null)
  const [documents, setDocuments] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)

  // New UI States for Flow Alignment
  const [mockedTopics, setMockedTopics] = useState({})
  const [showTopicAlert, setShowTopicAlert] = useState(false)

  useEffect(() => {
    loadDocuments()
  }, [projectId])

  const loadDocuments = async () => {
    setIsLoading(true)
    try {
      const res = await DocumentService.getByProject(projectId)
      setDocuments(res.data)
    } catch {
      // TODO: handle error
    } finally {
      setIsLoading(false)
    }
  }

  const handleUpload = async (files) => {
    if (!files || files.length === 0) return
    setUploading(true)
    const formData = new FormData()
    formData.append('file', files[0])
    formData.append('projectId', projectId)
    try {
      await DocumentService.upload(formData)
      await loadDocuments()
    } catch {
      // TODO: handle error
    } finally {
      setUploading(false)
    }
  }

  const handleProcess = async (documentId) => {
    // Visually update to processing immediately for UX feedback
    setDocuments(docs => docs.map(d => d.id === documentId ? { ...d, processingStatus: 'PROCESSING' } : d))
    try {
      await DocumentService.process(documentId)
      await loadDocuments()
    } catch {
      await loadDocuments() // Revert state on failure
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragActive(false)
    handleUpload(e.dataTransfer.files)
  }

  const handleAnalyzeTopics = (docId) => {
    // Mock displaying topics since backend DB mapping isn't fully ready
    setMockedTopics(prev => ({
      ...prev,
      [docId]: ['Calculus', 'Algebra']
    }))
    // Show "To be implemented" alert
    setShowTopicAlert(true)
    setTimeout(() => setShowTopicAlert(false), 4000)
  }

  return (
    <div className="page-layout">
      <Sidebar />
      <main className="main-content relative">

        {/* Floating System Alerts */}
        {showTopicAlert && (
          <div className="topic-alert">
            <strong>To be implemented:</strong> Saving clustered topic tags to the DB is not fully wired yet. Showing mock topics instead!
          </div>
        )}

        <div className="page-header flex justify-between items-center">
          <div>
            <h1 className="page-title">Document Upload</h1>
            <p className="page-subtitle">Upload PDFs and images to extract questions automatically</p>
          </div>
        </div>

        {/* Drop Zone */}
        <div
          id="drop-zone"
          className={`drop-zone ${dragActive ? 'active' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            onChange={(e) => handleUpload(e.target.files)}
          />
          <div className="drop-icon">{uploading ? '⏳' : '📄'}</div>
          <p className="drop-text">
            {uploading ? 'Uploading...' : 'Drop PDF or image here, or click to browse'}
          </p>
          <p>
            Supported: PDF, PNG, JPG
          </p>
        </div>

        {/* Documents List */}
        <div>
          <h2>
            Uploaded Documents
          </h2>
          {isLoading ? (
            <div className="flex justify-center">
              <div className="spinner" />
            </div>
          ) : documents.length === 0 ? (
            <p>No documents uploaded yet.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {documents.map((doc) => (
                <div key={doc.id} className="card flex justify-between items-center" id={`doc-${doc.id}`}>
                  <div>
                    <p>{doc.fileName}</p>
                    <p>
                      Uploaded {new Date(doc.createdAt).toLocaleDateString()}
                    </p>

                    {/* Topic Labels (Shown after Analysis) */}
                    {mockedTopics[doc.id] && (
                      <div className="flex gap-2">
                        {mockedTopics[doc.id].map(topic => (
                          <span key={topic} className="badge badge-blue">
                            {topic}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <span className={`badge ${STATUS_COLORS[doc.processingStatus] || 'badge-blue'}`}>
                      {doc.processingStatus}
                    </span>

                    {doc.processingStatus === 'UPLOADED' && (
                      <button
                        className="btn btn-secondary"
                        onClick={() => handleProcess(doc.id)}
                        id={`process-${doc.id}`}
                      >
                        Extract Text
                      </button>
                    )}

                    {/* Analyze Topics Button for PROCESSED files */}
                    {doc.processingStatus === 'PROCESSED' && (
                      <button
                        className="btn btn-secondary analyze-topics-btn"
                        onClick={() => handleAnalyzeTopics(doc.id)}
                      >
                        Analyze Topics
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </main>
    </div>
  )
}

export default DocumentUploadPage
