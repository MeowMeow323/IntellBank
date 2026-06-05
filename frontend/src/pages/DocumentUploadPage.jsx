import React, { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { DocumentService } from '../services/api'
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

  // New UI States for Flow Alignment
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [generateState, setGenerateState] = useState('idle') // idle, generating, done
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

  const handleGeneratePaper = (e) => {
    e.preventDefault()
    setGenerateState('generating')
    // Simulate API delay for paper generation
    setTimeout(() => {
      setGenerateState('done')
    }, 2000)
  }

  return (
    <div className="page-layout">
      <Sidebar />
      <main className="main-content relative">
        
        {/* Floating System Alerts */}
        {showTopicAlert && (
          <div style={{
            position: 'absolute', top: '20px', right: '20px', background: '#3b82f6', color: 'white',
            padding: '1rem', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', zIndex: 50
          }}>
            <strong>To be implemented:</strong> Saving clustered topic tags to the DB is not fully wired yet. Showing mock topics instead!
          </div>
        )}

        <div className="page-header flex justify-between items-center">
          <div>
            <h1 className="page-title">Document Upload</h1>
            <p className="page-subtitle">Upload PDFs and images to extract questions automatically</p>
          </div>
          <button 
            className="btn btn-primary" 
            style={{ padding: '0.75rem 1.5rem', fontWeight: 'bold' }}
            onClick={() => { setShowGenerateModal(true); setGenerateState('idle') }}
          >
            + Generate New Paper
          </button>
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
                    
                    {/* Topic Labels (Shown after Analysis) */}
                    {mockedTopics[doc.id] && (
                      <div className="flex gap-2" style={{ marginTop: '0.5rem' }}>
                        {mockedTopics[doc.id].map(topic => (
                          <span key={topic} className="badge badge-blue" style={{ fontSize: '0.75rem' }}>
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
                        className="btn btn-secondary"
                        onClick={() => handleAnalyzeTopics(doc.id)}
                        style={{ border: '1px solid #3b82f6', color: '#3b82f6', background: 'transparent' }}
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

        {/* Paper Generation Modal */}
        {showGenerateModal && (
          <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: generateState === 'done' ? '800px' : '500px' }}>
              <div className="flex justify-between items-center" style={{ marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>Generate New Paper</h2>
                <button 
                  onClick={() => setShowGenerateModal(false)}
                  style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', lineHeight: '1' }}
                >
                  &times;
                </button>
              </div>

              {generateState === 'idle' && (
                <form onSubmit={handleGeneratePaper}>
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Number of Questions</label>
                    <input 
                      type="number" min="1" max="50" defaultValue="10" 
                      className="input-field" 
                      style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #ccc' }} 
                      required 
                    />
                  </div>
                  <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Topic Selection (Optional)</label>
                    <select 
                      className="input-field" 
                      style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #ccc' }}
                    >
                      <option value="">All Topics</option>
                      <option value="Calculus">Calculus</option>
                      <option value="Algebra">Algebra</option>
                      <option value="Kinematics">Kinematics</option>
                    </select>
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.75rem' }}>
                    Generate Paper
                  </button>
                </form>
              )}

              {generateState === 'generating' && (
                <div className="flex flex-col items-center justify-center" style={{ padding: '3rem 0' }}>
                  <div className="spinner" style={{ width: '40px', height: '40px', borderWidth: '4px', marginBottom: '1rem' }} />
                  <p style={{ color: '#475569', fontWeight: '500' }}>AI is generating your paper...</p>
                </div>
              )}

              {generateState === 'done' && (
                <div className="generated-paper-view" style={{ maxHeight: '65vh', overflowY: 'auto', paddingRight: '0.5rem' }}>
                  
                  {/* Structured Format Output */}
                  <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid #e2e8f0' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '1rem', color: '#1e293b' }}>Section A: Short Answer Questions</h3>
                    <div style={{ marginBottom: '1.5rem', paddingBottom: '1.5rem', borderBottom: '1px solid #cbd5e1' }}>
                      <p style={{ fontWeight: '500', marginBottom: '0.5rem' }}>Q1. Explain the concept of limits in your own words. [2 marks]</p>
                      <div style={{ height: '60px', border: '1px dashed #94a3b8', borderRadius: '4px', background: '#fff' }}></div>
                    </div>
                    <div>
                      <p style={{ fontWeight: '500', marginBottom: '0.5rem' }}>Q2. Differentiate f(x) = 3x^2 + 2x with respect to x. [3 marks]</p>
                      <div style={{ height: '60px', border: '1px dashed #94a3b8', borderRadius: '4px', background: '#fff' }}></div>
                    </div>
                  </div>

                  <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '1rem', color: '#1e293b' }}>Section B: Long Answer Questions</h3>
                    <div>
                      <p style={{ fontWeight: '500', marginBottom: '0.5rem' }}>Q3. Using first principles, prove the derivative of sin(x). Show all working clearly. [10 marks]</p>
                      <div style={{ height: '150px', border: '1px dashed #94a3b8', borderRadius: '4px', background: '#fff' }}></div>
                    </div>
                  </div>
                  
                  <div className="flex justify-end" style={{ marginTop: '1.5rem' }}>
                     <button className="btn btn-primary" onClick={() => setShowGenerateModal(false)}>Done</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

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
        
        /* Modal Styles */
        .modal-overlay {
          position: fixed; top: 0; left: 0; width: 100%; height: 100%;
          background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(4px);
          display: flex; justify-content: center; align-items: center;
          z-index: 100;
        }
        .modal-content {
          background: white; padding: 2rem; border-radius: 12px; width: 90%;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          transition: max-width 0.3s ease;
        }
      `}</style>
    </div>
  )
}

export default DocumentUploadPage
