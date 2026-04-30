import React, { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import useWorkspaceStore from '../store/workspaceStore'
import Sidebar from '../components/layout/Sidebar.jsx'
import WorkspaceTabBar from '../components/workspace/WorkspaceTabBar.jsx'
import WorkspaceContent from '../components/workspace/WorkspaceContent.jsx'

const WorkspacePage = () => {
  const { projectId } = useParams()
  const { loadTabs, isLoading, error } = useWorkspaceStore()

  useEffect(() => {
    if (projectId) {
      loadTabs(projectId)
    }
  }, [projectId])

  return (
    <div className="page-layout">
      <Sidebar />
      <div className="workspace-wrapper">
        <WorkspaceTabBar projectId={projectId} />
        <div className="workspace-content-area">
          {isLoading ? (
            <div className="flex justify-center items-center" style={{ height: '60vh' }}>
              <div className="spinner" />
            </div>
          ) : error ? (
            <div style={{ color: 'var(--color-accent-rose)', padding: '2rem' }}>{error}</div>
          ) : (
            <WorkspaceContent />
          )}
        </div>
      </div>

      <style>{`
        .workspace-wrapper {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .workspace-content-area {
          flex: 1;
          overflow-y: auto;
          padding: 1.5rem;
        }
      `}</style>
    </div>
  )
}

export default WorkspacePage
