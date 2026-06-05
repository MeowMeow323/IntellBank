import React from 'react'
import useWorkspaceStore from '../../store/workspaceStore'

const WorkspaceTabBar = ({ projectId }) => {
  const { tabs, activeTabId, setActiveTab, addTab, removeTab } = useWorkspaceStore()

  const handleAddTab = () => {
    addTab({
      title: `Document ${tabs.length + 1}`,
      type: 'Raw Document'
    })
  }

  return (
    <div className="tab-bar" id="workspace-tab-bar">
      <div className="tab-list">
        {tabs.map((tab) => (
          <div
            key={tab.documentId}
            className={`tab-item ${activeTabId === tab.documentId ? 'active' : ''}`}
            id={`tab-${tab.documentId}`}
            onClick={() => setActiveTab(tab.documentId)}
          >
            <span className="tab-label">{tab.title || 'Untitled'}</span>
            <button
              className="tab-close"
              id={`close-tab-${tab.documentId}`}
              onClick={(e) => {
                e.stopPropagation()
                removeTab(tab.documentId)
              }}
              title="Close tab"
            >
              ×
            </button>
          </div>
        ))}
        <button className="tab-add" id="add-tab-btn" onClick={handleAddTab} title="New tab">
          +
        </button>
      </div>

      <style>{`
        .tab-bar {
          background: var(--color-bg-secondary);
          border-bottom: 1px solid var(--color-border);
          padding: 0 1rem;
          overflow-x: auto;
        }
        .tab-list {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          min-height: 48px;
        }
        .tab-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0 1rem;
          height: 42px;
          border-radius: var(--radius-md) var(--radius-md) 0 0;
          cursor: pointer;
          font-size: 0.85rem;
          color: var(--color-text-secondary);
          background: transparent;
          border: 1px solid transparent;
          border-bottom: none;
          transition: all var(--transition-fast);
          white-space: nowrap;
        }
        .tab-item:hover { color: var(--color-text-primary); background: var(--color-bg-hover); }
        .tab-item.active {
          color: var(--color-accent-blue);
          background: var(--color-bg-primary);
          border-color: var(--color-border);
          border-bottom-color: var(--color-bg-primary);
          margin-bottom: -1px;
          z-index: 1;
        }
        .tab-label { max-width: 120px; overflow: hidden; text-overflow: ellipsis; }
        .tab-close {
          background: transparent;
          border: none;
          color: var(--color-text-muted);
          font-size: 1rem;
          cursor: pointer;
          line-height: 1;
          padding: 0 2px;
          border-radius: 3px;
          transition: color var(--transition-fast), background var(--transition-fast);
        }
        .tab-close:hover { color: var(--color-accent-rose); background: rgba(244,63,94,0.1); }
        .tab-add {
          padding: 0.3rem 0.75rem;
          background: transparent;
          border: 1px dashed var(--color-border);
          border-radius: var(--radius-md);
          color: var(--color-text-muted);
          font-size: 1.1rem;
          cursor: pointer;
          transition: all var(--transition-fast);
          margin-left: 0.5rem;
        }
        .tab-add:hover { color: var(--color-accent-blue); border-color: var(--color-accent-blue); }
      `}</style>
    </div>
  )
}

export default WorkspaceTabBar