import React, { useState, useEffect } from 'react'
import useWorkspaceStore from '../../store/workspaceStore'

const WorkspaceContent = () => {
  const { tabs = [], activeTabId, updateTabContent } = useWorkspaceStore()
  const activeTab = tabs.find((t) => t.documentId === activeTabId)

  // Isolated local string text state
  const [localText, setLocalText] = useState('')
  // Save status states: 'saved' | 'saving' | 'error'
  const [saveStatus, setSaveStatus] = useState('saved')

  // 1. TRIGGER ON TAB CHANGE: Safely load text values from store memory
  useEffect(() => {
    if (activeTab) {
      setLocalText(activeTab.localDraftContent !== undefined ? activeTab.localDraftContent : activeTab.storageUrl || '')      
      setSaveStatus('saved')
    } else {
      setLocalText('')
    }
  }, [activeTabId, activeTab])

  // 2. BACKGROUND AUTO-SAVE DEBOUNCE MACHINE
  useEffect(() => {
    if (!activeTabId || !activeTab) return

    const databaseText = activeTab.storageUrl || ''
    if (localText === databaseText) {
      return
    }

    setSaveStatus('saving')
    const autoSaveTimer = setTimeout(async () => {
      try {
        await updateTabContent(activeTabId, localText)
        setSaveStatus('saved')
      } catch (err) {
        console.warn("Cloud sync error intercepted gracefully:", err)
        setSaveStatus('error') // Displays the local save warning instead of crashing the app
      }
    }, 1500)

    return () => clearTimeout(autoSaveTimer)
  }, [localText, activeTabId])

  if (!activeTab) {
    return (
      <div className="workspace-empty">
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📂</div>
        <h3>No Document Selected</h3>
        <p>Select a file from your sidebar directory tree to begin typing.</p>
      </div>
    )
  }

  return (
    <div className="workspace-tab-content">
      
      {/* GOOGLE DOCS MINIMAL TOOLBAR CONSOLE STATUS HEADER */}
      <div className="docs-minimal-toolbar">
        <div className="toolbar-left-group">
          <span className="toolbar-item bold-text">B</span>
          <span className="toolbar-item italic-text">I</span>
          <span className="toolbar-item underline-text">U</span>
          <div className="toolbar-separator" />
          <span className="toolbar-item format-algo">LaTeX Editor Active</span>
        </div>

        <div className="toolbar-save-status">
          {saveStatus === 'saved' && (
            <span className="status-msg text-success">
              ☁️ All changes saved to cloud storage
            </span>
          )}
          {saveStatus === 'saving' && (
            <span className="status-msg text-warning">
              ⏳ Saving your modifications...
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="status-msg text-danger">
              ⚠️ Saved locally inside workspace browser memory
            </span>
          )}
        </div>
      </div>

      {/* SINGLE GOOGLE DOCS CENTERED SHEET COMPONENT */}
      <div className="google-docs-canvas-centered">
        <div className="docs-page-sheet">
          <textarea
            className="docs-inline-storyteller"
            value={localText}
            onChange={(e) => setLocalText(e.target.value)}
            placeholder="Start drafting your text content or mathematical equations here..."
          />
        </div>
      </div>

      <style>{`
        .workspace-tab-content { display: flex; flex-direction: column; height: calc(100vh - 120px); width: 100%; background: #182635; }
        .docs-minimal-toolbar { display: flex; align-items: center; justify-content: space-between; background: #111c24; border-bottom: 1px solid #1f2e3d; padding: 0.6rem 2rem; user-select: none; }
        .toolbar-left-group { display: flex; align-items: center; gap: 1.25rem; }
        .toolbar-item { font-size: 0.9rem; color: #a4b3c1; cursor: pointer; font-weight: 600; }
        .bold-text { font-family: sans-serif; font-weight: 800; }
        .italic-text { font-family: serif; font-style: italic; }
        .underline-text { text-decoration: underline; }
        .format-algo { font-size: 0.75rem; background: #0066cc; color: #fff; padding: 2px 8px; border-radius: 4px; }
        .toolbar-separator { width: 1px; height: 16px; background: #1f2e3d; }
        
        .status-msg { font-size: 0.8rem; font-weight: 500; }
        .text-success { color: #2ecc71; }
        .text-warning { color: #f1c40f; animation: pulse 1.5s infinite alternate; }
        .text-danger { color: #e74c3c; font-weight: 600; background: rgba(231, 76, 60, 0.1); padding: 4px 10px; border-radius: 4px; }

        @keyframes pulse { 0% { opacity: 0.5; } 100% { opacity: 1; } }

        .google-docs-canvas-centered { flex: 1; overflow-y: auto; background: #182635; display: flex; justify-content: center; padding: 2rem 0; }
        .docs-page-sheet { background: #ffffff; width: 820px; min-height: 1050px; box-shadow: 0 10px 30px rgba(0,0,0,0.35); border-radius: 4px; display: flex; flex-direction: column; padding: 4rem; }
        .docs-inline-storyteller { flex: 1; width: 100%; border: none; resize: none; outline: none; font-family: 'Georgia', serif; font-size: 1.15rem; line-height: 1.65; color: #222222; background: transparent; padding: 0; margin: 0; }
        .workspace-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 60vh; color: #6c7d8c; }
      `}</style>
    </div>
  )
}

export default WorkspaceContent