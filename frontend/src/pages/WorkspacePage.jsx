import React, { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom' // 👈 Fixed: Explicitly imported useNavigate
import useWorkspaceStore from '../store/workspaceStore'    // 👈 Adjust path if your store folder location is different
import WorkspaceTabBar from '../components/workspace/WorkspaceTabBar'
import WorkspaceContent from '../components/workspace/WorkspaceContent'

const WorkspacePage = () => {
  const { projectId } = useParams()
  const navigate = useNavigate()
  
  // Safe extraction with fallback array to prevent processing crashes
  const { tabs = [], activeTabId, loadTabs, setActiveTab, isLoading } = useWorkspaceStore()

  useEffect(() => {
    if (projectId) {
      loadTabs(projectId)
    }
  }, [projectId, loadTabs])

  return (
    <div className="workspace-layout-grid">
      
      {/* 1. LEFT SIDEBAR: DIRECTORY FILE TREE FOR THE ACTIVE PROJECT */}
      <div className="workspace-sidebar">
        <div className="sidebar-project-header">
          <h3>📁 Project Explorer</h3>
          <span className="project-id-sub">ID: {projectId?.slice(0, 8)}...</span>
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
              >
                <span className="doc-icon">📄</span>
                <span className="doc-name">{doc.title || 'Untitled Document'}</span>
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

      <style>{`
        .workspace-layout-grid {
          display: flex;
          width: 100vw;
          height: 100vh;
          background: #0b131a;
          overflow: hidden;
          color: #ffffff;
        }
        .workspace-sidebar {
          width: 260px;
          background: #111c24;
          border-right: 1px solid #1f2e3d;
          display: flex;
          flex-direction: column;
          padding: 1.25rem 1rem;
        }
        .sidebar-project-header h3 { font-size: 1rem; font-weight: 600; margin-bottom: 0.25rem; }
        .project-id-sub { font-size: 0.75rem; color: #6c7d8c; }
        .sidebar-document-list {
          flex: 1;
          margin-top: 1.5rem;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .sidebar-doc-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.6rem 0.75rem;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.85rem;
          color: #a4b3c1;
          transition: background 0.2s, color 0.2s;
        }
        .sidebar-doc-item:hover { background: #1c2b36; color: #ffffff; }
        .sidebar-doc-item.active-item { background: #0066cc; color: #ffffff; font-weight: 500; }
        .status-text, .status-textempty { font-size: 0.8rem; color: #6c7d8c; text-align: center; margin-top: 2rem; }
        .back-projects-btn {
          background: transparent;
          border: 1px solid #1f2e3d;
          color: #a4b3c1;
          padding: 0.5rem;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.8rem;
          margin-top: auto;
          transition: border-color 0.2s;
        }
        .back-projects-btn:hover { border-color: #0066cc; color: #ffffff; }
        .workspace-main-panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
        .workspace-canvas-scrollbox { flex: 1; padding: 1.5rem; overflow-y: auto; }
      `}</style>
    </div>
  )
}

export default WorkspacePage