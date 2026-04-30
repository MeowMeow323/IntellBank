import React, { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import DocumentService from '../services/documentService'
import Sidebar from '../components/layout/Sidebar.jsx'

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
    try {
      await DocumentService.process(documentId)
      await loadDocuments()
    } catch {
      // TODO: handle error
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragActive(false)
    handleUpload(e.dataTransfer.files)
  }

  return (
    <div className="page-layout">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <h1 className="page-title">Document Upload</h1>
          <p className="page-subtitle">Upload PDFs and images to extract questions automatically</p>
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
            style={{ display: 'none' }}
            onChange={(e) => handleUpload(e.target.files)}
          />
          <div className="drop-icon">{uploading ? '⏳' : '📄'}</div>
          <p className="drop-text">
            {uploading ? 'Uploading...' : 'Drop PDF or image here, or click to browse'}
          </p>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
            Supported: PDF, PNG, JPG
          </p>
        </div>

        {/* Documents List */}
        <div style={{ marginTop: '2rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '1rem' }}>
            Uploaded Documents
          </h2>
          {isLoading ? (
            <div className="flex justify-center" style={{ padding: '2rem' }}>
              <div className="spinner" />
            </div>
          ) : documents.length === 0 ? (
            <p style={{ color: 'var(--color-text-secondary)' }}>No documents uploaded yet.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {documents.map((doc) => (
                <div key={doc.id} className="card flex justify-between items-center" id={`doc-${doc.id}`}>
                  <div>
                    <p style={{ fontWeight: '500' }}>{doc.fileName}</p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                      Uploaded {new Date(doc.createdAt).toLocaleDateString()}
                    </p>
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
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <style>{`
        .drop-zone {
          border: 2px dashed var(--color-border); border-radius: var(--radius-lg);
          padding: 3rem 2rem; text-align: center; cursor: pointer;
          transition: all var(--transition-base);
        }
        .drop-zone.active, .drop-zone:hover {
          border-color: var(--color-accent-blue);
          background: rgba(59,130,246,0.05);
        }
        .drop-icon { font-size: 3rem; margin-bottom: 1rem; }
        .drop-text { font-size: 1rem; color: var(--color-text-primary); margin-bottom: 0.5rem; }
      `}</style>
    </div>
  )
}

export default DocumentUploadPage
