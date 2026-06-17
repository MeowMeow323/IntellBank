import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom' 
import useWorkspaceStore from '../store/workspaceStore'
import WorkspaceContent from '../components/workspace/WorkspaceContent'

// ── CONNECT DESIGN SYSTEM LAYERS ──────────────────────────────────────
import '../styles/global.css'
import '../styles/modals.css'
import '../styles/workspace-page.css'

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
    generateTabWithAI
  } = useWorkspaceStore()

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
    setIsGenerating(true)
    try {
      // Ensure we send topics as an array (fallback to all subject topics if none selected)
      const payload = {
        ...paperConfig,
        topics: paperConfig.topics.length > 0 ? paperConfig.topics : (subjectTopicsMap[paperConfig.subject] || [])
      }
      await generateTabWithAI(payload)
      setIsModalOpen(false)
      const subjects = Object.keys(subjectTopicsMap)
      setPaperConfig({ subject: subjects.length > 0 ? subjects[0] : '', topics: [], totalMarks: 100 })
    } catch (error) {
      console.error("Error generating paper:", error)
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

          <button 
            className="generate-btn" 
            onClick={handleCreateRawDocument}
            style={{ 
              margin: 0, 
              background: 'transparent', 
              border: '1px dashed #0066cc', 
              color: '#0066cc' 
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0, 102, 204, 0.1)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            ➕ Create Blank Doc
          </button>
        </div>

        <div className="sidebar-document-list">
          {isLoading ? (
            <p className="status-text">Loading workspace files...</p>
          ) : tabs.length === 0 ? (
            <p className="status-textempty">No documents found inside this project.</p>
          ) : (
            tabs.map((doc) => {
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
                    <span className="doc-name">{doc.title || 'Untitled Document'}</span>
                  </div>

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
                      color: isActive ? '#ffffff' : '#64748b',
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
      
      {/* 3. ✨ GENERATE PAPER MODAL (Classes mapped to dashboard style system) */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>✨ Generate Exam Paper</h2>
            
            <div className="input-group">
              <label>Subject</label>
              <select 
                className="form-input"
                value={paperConfig.subject}
                onChange={e => setPaperConfig({...paperConfig, subject: e.target.value, topics: []})}
                disabled={Object.keys(subjectTopicsMap).length === 0}
              >
                {Object.keys(subjectTopicsMap).length === 0 ? (
                  <option>No subjects found. Please extract OCR data.</option>
                ) : (
                  Object.keys(subjectTopicsMap).map(s => <option key={s} value={s}>{s}</option>)
                )}
              </select>
            </div>

            <div className="input-group">
              <label>Topics (Hold Ctrl/Cmd to select multiple)</label>
              <select 
                multiple
                className="form-input"
                style={{ minHeight: '120px' }}
                value={paperConfig.topics}
                onChange={e => {
                  const values = Array.from(e.target.selectedOptions, option => option.value)
                  setPaperConfig({...paperConfig, topics: values})
                }}
                disabled={!paperConfig.subject || !subjectTopicsMap[paperConfig.subject]}
              >
                {paperConfig.subject && subjectTopicsMap[paperConfig.subject] ? (
                  subjectTopicsMap[paperConfig.subject].map(t => <option key={t} value={t}>{t}</option>)
                ) : null}
              </select>
            </div>

            {/* Strict Settings Readonly Display */}
            <div style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', marginBottom: '1.5rem' }}>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#475569' }}><strong>Format Locked:</strong> 100 Marks Total (4 Questions x 25 Marks)</p>
            </div>

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleGenerate} disabled={isGenerating}>
                {isGenerating ? 'Generating...' : 'Generate'}
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