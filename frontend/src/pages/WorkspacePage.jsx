import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom' 
import useWorkspaceStore from '../store/workspaceStore'
import WorkspaceTabBar from '../components/workspace/WorkspaceTabBar'
import WorkspaceContent from '../components/workspace/WorkspaceContent'
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
    removeTab 
  } = useWorkspaceStore()

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [paperConfig, setPaperConfig] = useState({
    subject: '',
    topics: '',
    totalMarks: 100
  })

  const [docToDelete, setDocToDelete] = useState(null)
  const [isDeletingDoc, setIsDeletingDoc] = useState(false)

  useEffect(() => {
    if (projectId) {
      loadTabs(projectId)
    }
  }, [projectId, loadTabs])

  const handleCreateRawDocument = async () => {
    try {
      await addTab({
        title: `Document ${tabs.length + 1}`,
        type: 'Raw Document'
      })
    } catch (error) {
      console.error("Error creating raw document:", error);
      alert("Failed to create raw document. Please try again.");
    }
  }

  const handleGenerate = async () => {
    if (!paperConfig.subject) return alert("Please enter a subject.");
    setIsGenerating(true);
    try {
      await addTab({
        title: `${paperConfig.subject} Paper`,
        type: 'Generated Paper'
      });
      setIsModalOpen(false);
    } catch (error) {
      console.error("Error generating paper:", error);
      alert("Failed to generate paper. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  }

  // ── Document Deletion Execution Handler ────────────────────────────
  const handleDocDeleteConfirm = async () => {
    if (!docToDelete) return
    setIsDeletingDoc(true)
    try {
      // 👉 FIXED: Call removeTab instead of deleteTab to cleanly match the store layout definition
      if (typeof removeTab === 'function') {
        // Change "student@example.com" if you store user context inside localStorage or an Auth Store
        await removeTab(docToDelete.documentId, "student@example.com")
      } else {
        console.warn("removeTab function was missing from your useWorkspaceStore config layer.")
      }
      setDocToDelete(null)
    } catch (error) {
      console.error("Error deleting document entry row:", error)
      alert("Failed to completely drop document. Verify your API connections.")
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
        
        {/* Action Button Container */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
          {/* Generate Paper Button */}
          <button 
            className="generate-btn" 
            onClick={() => setIsModalOpen(true)}
            style={{ margin: 0 }}
          >
            ✨ Generate AI Paper
          </button>

          {/* 👉 NEW BUTTON: Quick manual create document button relocated from deprecated TabBar */}
          <button 
            className="generate-btn" 
            onClick={handleCreateRawDocument}
            style={{ 
              margin: 0, 
              background: 'transparent', 
              border: '1px dashed #0066cc', 
              color: '#0066cc' 
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(0, 102, 204, 0.1)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
            }}
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
            tabs.map((doc) => (
              <div 
                key={doc.documentId}
                className={`sidebar-doc-item ${activeTabId === doc.documentId ? 'active-item' : ''}`}
                onClick={() => setActiveTab(doc.documentId)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden', flex: 1 }}>
                  <span className="doc-icon">📄</span>
                  <span className="doc-name">{doc.title || 'Untitled Document'}</span>
                </div>

                {/* Individual Document Delete Action Trigger icon button */}
                <button
                  type="button"
                  title="Delete Document"
                  onClick={(e) => {
                    e.stopPropagation(); // Prevents layout from highlighting the item when clicking delete
                    setDocToDelete(doc);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: activeTabId === doc.documentId ? '#ffffff' : '#64748b',
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
            ))
          )}
        </div>
        
        <button className="back-projects-btn" onClick={() => navigate('/projects')}>
          ← Back to Dashboard
        </button>
      </div>

      {/* 2. RIGHT PANEL: BROWSER TABS & GOOGLE DOCS CANVAS */}
      <div className="workspace-main-panel">
        <WorkspaceTabBar projectId={projectId} />
        <div className="workspace-canvas-scrollbox">
          <WorkspaceContent />
        </div>
      </div>
      
      {/* 3. GENERATE PAPER MODAL */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>✨ Generate Exam Paper</h2>
            
            <div className="input-group">
              <label>Subject</label>
              <input 
                type="text" 
                placeholder="e.g. Software Engineering" 
                value={paperConfig.subject}
                onChange={e => setPaperConfig({...paperConfig, subject: e.target.value})}
              />
            </div>

            <div className="input-group">
              <label>Topics (comma separated)</label>
              <input 
                type="text" 
                placeholder="e.g. Risk, SQA, Cost Estimation" 
                value={paperConfig.topics}
                onChange={e => setPaperConfig({...paperConfig, topics: e.target.value})}
              />
            </div>

            <div className="input-group">
              <label>Total Marks</label>
              <input 
                type="number" 
                value={paperConfig.totalMarks}
                onChange={e => setPaperConfig({...paperConfig, totalMarks: parseInt(e.target.value) || 0})}
              />
            </div>

            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => setIsModalOpen(false)}>
                Cancel
              </button>
              <button className="submit-btn" onClick={handleGenerate} disabled={isGenerating}>
                {isGenerating ? 'Generating...' : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. 🗑️ THE POPUP CONFIRMATION MODAL */}
      {docToDelete && (
        <div className="modal-overlay" onClick={() => setDocToDelete(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>⚠️ Delete Document?</h2>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', lineHeight: '1.5', marginBottom: '1.5rem' }}>
              Are you sure you want to permanently delete <strong>{docToDelete.title || 'this document'}</strong>? All sub-scores, records, and evaluation analytics attached to this file will be wiped out from the backend database. This cannot be undone.
            </p>

            <div className="modal-actions">
              <button 
                className="cancel-btn" 
                onClick={() => setDocToDelete(null)}
                disabled={isDeletingDoc}
              >
                Cancel
              </button>
              <button 
                className="submit-btn" 
                style={{ background: '#ef4444' }} 
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