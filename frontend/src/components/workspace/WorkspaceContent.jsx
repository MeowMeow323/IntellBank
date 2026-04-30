import React from 'react'
import useWorkspaceStore from '../../store/workspaceStore'

/**
 * WorkspaceContent renders the content of the active workspace tab.
 * Tab type determines what content to display.
 */
const WorkspaceContent = () => {
  const { tabs, activeTabId } = useWorkspaceStore()

  const activeTab = tabs.find((t) => t.id === activeTabId)

  if (!activeTab) {
    return (
      <div className="workspace-empty" id="workspace-empty">
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📂</div>
        <h3>No tabs open</h3>
        <p>Click the + button in the tab bar to add a new tab</p>
      </div>
    )
  }

  return (
    <div className="workspace-tab-content fade-in" id={`tab-content-${activeTab.id}`}>
      <div className="workspace-tab-header">
        <h2>{activeTab.tabTitle}</h2>
        <span className="badge badge-blue" style={{ textTransform: 'capitalize' }}>
          {activeTab.tabType?.replace('-', ' ')}
        </span>
      </div>

      {/* Render content based on tab type */}
      {activeTab.tabType === 'notes' && (
        <div className="notes-area">
          <textarea
            className="form-textarea notes-textarea"
            placeholder="Write your notes here..."
            defaultValue={activeTab.tabData?.content || ''}
            id={`notes-${activeTab.id}`}
          />
        </div>
      )}

      {activeTab.tabType === 'document' && (
        <div className="tab-placeholder">
          <span>📄</span>
          <p>Document viewer will render here. Linked document: <strong>{activeTab.tabData?.documentId || 'None'}</strong></p>
        </div>
      )}

      {activeTab.tabType === 'question-bank' && (
        <div className="tab-placeholder">
          <span>❓</span>
          <p>Question bank filtered view will render here for this project.</p>
        </div>
      )}

      {activeTab.tabType === 'exam' && (
        <div className="tab-placeholder">
          <span>📝</span>
          <p>Exam simulator embedded view will render here.</p>
        </div>
      )}

      <style>{`
        .workspace-empty {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          height: 60vh; text-align: center; color: var(--color-text-secondary);
        }
        .workspace-empty h3 { font-size: 1.25rem; color: var(--color-text-primary); margin-bottom: 0.5rem; }
        .workspace-tab-header {
          display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem;
        }
        .workspace-tab-header h2 { font-size: 1.1rem; font-weight: 600; }
        .notes-textarea {
          min-height: 60vh; width: 100%;
          background: var(--color-bg-secondary);
          font-family: var(--font-primary);
          font-size: 0.95rem; line-height: 1.7;
          resize: vertical;
        }
        .tab-placeholder {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          height: 50vh; gap: 1rem; color: var(--color-text-secondary); font-size: 0.95rem;
        }
        .tab-placeholder span { font-size: 3rem; }
      `}</style>
    </div>
  )
}

export default WorkspaceContent
