import React from 'react'
import useWorkspaceStore from '../../store/workspaceStore'
import '../../styles/workspace-tabs.css'

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
    </div>
  )
}

export default WorkspaceTabBar