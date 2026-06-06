import React, { useState, useEffect, useRef } from 'react'
import useWorkspaceStore from '../../store/workspaceStore'

const WorkspaceContent = () => {
  const { tabs = [], activeTabId, updateTabContent } = useWorkspaceStore()
  const activeTab = tabs.find((t) => t.documentId === activeTabId)

  const editorRef = useRef(null)
  
  // App UI State Vectors
  const [saveStatus, setSaveStatus] = useState('saved')
  const [zoomScale, setZoomScale] = useState(100) // 🔍 Google Docs Zoom Scaling State
  const [fontSize, setFontSize] = useState(11)
  
  // UI Toggles
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [showFindReplace, setShowFindReplace] = useState(false)
  const [isEditingHeaderFooter, setIsEditingHeaderFooter] = useState(false) // 📝 Interactive Header/Footer Editing State
  
  // Active Window Menu Popovers
  const [activeMenuHeader, setActiveMenuHeader] = useState(null)
  
  // Real-time Metrics Trackers
  const [wordCount, setWordCount] = useState(0)
  const [charCount, setCharCount] = useState(0)
  const [pageCount, setPageCount] = useState(1) // Dynamic physical sheets counter

  // Overlay Component Controllers
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [selectedImage, setSelectedImage] = useState(null)

  // Format Painter Clipboard Cache State
  const [activePaintStyle, setActivePaintStyle] = useState(null)
  const [isPainterActive, setIsPainterActive] = useState(false)

  // Responsive Document Geometry Setup State Variables
  const [pageSetup, setPageSetup] = useState({
    orientation: 'portrait', 
    paperSize: 'letter',     
    marginTop: 1,            
    marginBottom: 1,
    marginLeft: 1,
    marginRight: 1,
    headerText: 'Double-click to customize header content...',
    footerText: 'Internal Working Document'
  })

  // Synchronize and load canvas HTML string securely on tab mutation
  useEffect(() => {
    if (activeTab && editorRef.current) {
      const targetContent = activeTab.localDraftContent !== undefined 
        ? activeTab.localDraftContent 
        : (activeTab.storageUrl || '')
      
      editorRef.current.innerHTML = targetContent || '<div><p><br></p></div>'
      document.execCommand('styleWithCSS', false, true)
      recalculateMetricsAndPages()
      setSaveStatus('saved')
    }
  }, [activeTabId])

  // Contextual Element Click Interceptor Loop
  useEffect(() => {
    const handleElementSelection = (e) => {
      if (e.target.tagName === 'IMG') {
        if (selectedImage && selectedImage !== e.target) {
          selectedImage.style.outline = 'none'
        }
        setSelectedImage(e.target)
        e.target.style.outline = '3px solid #1a73e8'
      } else {
        if (selectedImage) {
          selectedImage.style.outline = 'none'
          setSelectedImage(null)
        }
      }

      if (isPainterActive && activePaintStyle) {
        e.preventDefault()
        applyCachedPaintStyles(e.target)
        setIsPainterActive(false)
      }
    }

    const editorNode = editorRef.current
    if (editorNode) {
      editorNode.addEventListener('click', handleElementSelection)
    }
    return () => {
      if (editorNode) {
        editorNode.removeEventListener('click', handleElementSelection)
      }
    }
  }, [selectedImage, isPainterActive, activePaintStyle, activeTabId])

  // Close menus when clicking outside anywhere on the window viewport document
  useEffect(() => {
    const closeMenus = (e) => {
      if (!e.target.closest('.more-tools-container')) {
        setShowMoreMenu(false)
      }
      if (!e.target.closest('.menu-bar-item-wrapper')) {
        setActiveMenuHeader(null)
      }
    }
    document.addEventListener('click', closeMenus)
    return () => document.removeEventListener('click', closeMenus)
  }, [])

  // Core Mutation Wrapper
  const executeCmd = (command, value = null) => {
    document.execCommand(command, false, value)
    recalculateMetricsAndPages()
    triggerAutoSave()
  }

  // Real-Time Analytics & Automated Page-Overflow Geometry Recalculator
  const recalculateMetricsAndPages = () => {
    if (!editorRef.current) return
    const plainText = editorRef.current.innerText || ''
    const words = plainText.trim() === '' ? 0 : plainText.trim().split(/\s+/).length
    const chars = plainText.length
    
    setWordCount(words)
    setCharCount(chars)

    // 🔄 Dynamic Page Overflow Engine:
    // Standard Letter Page height allowance minus running margin zones maps to approx 960px.
    // If text flows continuously past this threshold, it increments page count metrics immediately.
    const maxPageContentHeight = 960
    const currentScrollHeight = editorRef.current.scrollHeight
    const calculatedPages = Math.max(1, Math.ceil(currentScrollHeight / maxPageContentHeight))
    setPageCount(calculatedPages)
  }

  // Paint Styles Core Block Logic
  const triggerFormatPainter = () => {
    const selection = window.getSelection()
    if (selection.rangeCount > 0) {
      const anchorNode = selection.anchorNode.parentElement
      if (anchorNode) {
        const computedStyles = window.getComputedStyle(anchorNode)
        setActivePaintStyle({
          fontWeight: computedStyles.fontWeight,
          fontStyle: computedStyles.fontStyle,
          textDecoration: computedStyles.textDecoration,
          color: computedStyles.color,
          fontSize: computedStyles.fontSize,
          fontFamily: computedStyles.fontFamily
        })
        setIsPainterActive(true)
      }
    }
  }

  const applyCachedPaintStyles = (targetElement) => {
    if (!activePaintStyle) return
    targetElement.style.fontWeight = activePaintStyle.fontWeight
    targetElement.style.fontStyle = activePaintStyle.fontStyle
    targetElement.style.textDecoration = activePaintStyle.textDecoration
    targetElement.style.color = activePaintStyle.color
    targetElement.style.fontSize = activePaintStyle.fontSize
    targetElement.style.fontFamily = activePaintStyle.fontFamily
    triggerAutoSave()
  }

  const insertGridTable = () => {
    const rows = parseInt(prompt("Enter row allocation count:", "3") || "0")
    const cols = parseInt(prompt("Enter column capacity count:", "3") || "0")
    if (rows <= 0 || cols <= 0) return

    let tableHTML = `<table style="width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 11pt;"><tbody>`
    for (let r = 0; r < rows; r++) {
      tableHTML += `<tr>`
      for (let c = 0; c < cols; c++) {
        tableHTML += `<td style="border: 1px solid #c4c7c5; padding: 8px; min-width: 50px; height: 24px; vertical-align: top; background-color: #ffffff;">&nbsp;</td>`
      }
      tableHTML += `</tr>`
    }
    tableHTML += `</tbody></table><p><br></p>`
    executeCmd('insertHTML', tableHTML)
    setShowMoreMenu(false)
  }

  const adjustLineSpacing = (spacingValue) => {
    const selection = window.getSelection()
    if (selection.rangeCount > 0) {
      let parentNode = selection.getRangeAt(0).commonAncestorContainer
      if (parentNode.nodeType === Node.TEXT_NODE) parentNode = parentNode.parentNode
      
      const blockNode = parentNode.closest('p, li, h1, h2, h3, h4, h5, h6') || parentNode
      blockNode.style.lineHeight = spacingValue
      triggerAutoSave()
    }
  }

  const handleEditorInput = () => {
    recalculateMetricsAndPages()
    triggerAutoSave()
  }

  // Comprehensive Hotkey Macro Interceptor Loop
  const handleKeyDown = (e) => {
    const isCtrl = e.ctrlKey || e.metaKey
    const isShift = e.shiftKey
    const key = e.key.toLowerCase()

    // 📄 Ctrl + N: Google Docs Native Dynamic Page Split Break
    if (isCtrl && key === 'n') {
      e.preventDefault()
      // Injects a print-safe native structural break block into the unified editor stream
      executeCmd('insertHTML', '<div class="google-docs-page-break" style="page-break-before: always; break-before: page; margin-top: 40px; height: 1px;" contenteditable="false"></div><p><br></p>')
      return
    }

    // 🔀 Structural Inline Manipulations
    if (isShift && e.key === 'Enter') {
      e.preventDefault()
      executeCmd('insertLineBreak')
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      const selection = window.getSelection()
      let insideList = false
      if (selection.rangeCount > 0) {
        let node = selection.getRangeAt(0).commonAncestorContainer
        if (node.nodeType === Node.TEXT_NODE) node = node.parentNode
        if (node.closest('li')) insideList = true
      }

      if (insideList) {
        executeCmd(isShift ? 'outdent' : 'indent')
      } else {
        executeCmd('insertHTML', '&nbsp;&nbsp;&nbsp;&nbsp;')
      }
      return
    }

    // ✍️ Core Rich Content Editing Hooks
    if (isCtrl && key === 'z') { e.preventDefault(); executeCmd('undo'); return; }
    if (isCtrl && key === 'f') { e.preventDefault(); setShowFindReplace(true); return; }
    if (isCtrl && key === 'b') { e.preventDefault(); executeCmd('bold'); return; }
    if (isCtrl && key === 'i') { e.preventDefault(); executeCmd('italic'); return; }
    if (isCtrl && key === 'u') { e.preventDefault(); executeCmd('underline'); return; }
  }

  const handleExportPDF = () => {
    window.print()
  }

  const executeFindReplace = (replaceAll = false) => {
    if (!findText || !editorRef.current) return
    const content = editorRef.current.innerHTML
    const escapedSearchTerm = findText.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
    const regex = new RegExp(escapedSearchTerm, replaceAll ? 'g' : '')
    
    editorRef.current.innerHTML = content.replace(regex, replaceText)
    recalculateMetricsAndPages()
    triggerAutoSave()
  }

  const changeFontSize = (delta) => {
    const newSize = Math.max(1, fontSize + delta)
    setFontSize(newSize)
    executeCmd('fontSize', '7') 
    const selection = window.getSelection()
    if (selection.rangeCount > 0) {
      let parent = selection.getRangeAt(0).commonAncestorContainer
      if (parent.nodeType === Node.TEXT_NODE) parent = parent.parentNode
      parent.style.fontSize = `${newSize}pt`
    }
  }

  const promptLink = () => {
    const targetUrl = prompt("Enter destination Hyperlink URL:")
    if (targetUrl) executeCmd('createLink', targetUrl)
    setShowMoreMenu(false)
  }

  // Cloud Synchronization Save Debouncer
  let saveTimer = null
  const triggerAutoSave = () => {
    if (!activeTabId || !editorRef.current) return
    setSaveStatus('saving')
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(async () => {
      try {
        await updateTabContent(activeTabId, editorRef.current.innerHTML)
        setSaveStatus('saved')
      } catch (err) { setSaveStatus('error') }
    }, 1500)
  }

  const toggleMenuHeader = (menuKey, e) => {
    e.stopPropagation()
    setActiveMenuHeader(activeMenuHeader === menuKey ? null : menuKey)
  }

  // Dynamic iteration generation matrix layout indexer mapped to screen loop layers
  const sheetsRenderMatrixArray = Array.from({ length: pageCount }, (_, i) => i + 1)

  if (!activeTab) {
    return (
      <div className="workspace-empty">
        <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>📂</div>
        <h3>No Document Selected</h3>
        <p>Select an asset node entry pointer path from your active catalog workspace explorer to load page buffers.</p>
      </div>
    )
  }

  return (
    <div className="workspace-tab-content" onClick={() => setIsEditingHeaderFooter(false)}>
      
      {/* 🏛️ TOP TIER: DESKTOP APPLICATION MENU ROW BAR */}
      <div className="google-docs-desktop-menu-bar" onClick={(e) => e.stopPropagation()}>
        <div className="menu-bar-left-cluster">
          
          {/* File Tab */}
          <div className="menu-bar-item-wrapper">
            <button className={`menu-bar-tab ${activeMenuHeader === 'file' ? 'active-tab' : ''}`} onClick={(e) => toggleMenuHeader('file', e)}>File</button>
            {activeMenuHeader === 'file' && (
              <div className="menu-bar-dropdown-panel">
                <button className="dropdown-panel-item" onClick={() => { handleExportPDF(); setActiveMenuHeader(null); }}>🖨️ Export to PDF File</button>
                <button className="dropdown-panel-item" onClick={() => { triggerAutoSave(); setActiveMenuHeader(null); }}>💾 Save State Snapshot</button>
              </div>
            )}
          </div>

          {/* View Tab */}
          <div className="menu-bar-item-wrapper">
            <button className={`menu-bar-tab ${activeMenuHeader === 'view' ? 'active-tab' : ''}`} onClick={(e) => toggleMenuHeader('view', e)}>View</button>
            {activeMenuHeader === 'view' && (
              <div className="menu-bar-dropdown-panel">
                <button className="dropdown-panel-item" onClick={() => { setShowFindReplace(true); setActiveMenuHeader(null); }}>🔍 Show Find & Replace</button>
              </div>
            )}
          </div>

          {/* Insert Tab */}
          <div className="menu-bar-item-wrapper">
            <button className={`menu-bar-tab ${activeMenuHeader === 'insert' ? 'active-tab' : ''}`} onClick={(e) => toggleMenuHeader('insert', e)}>Insert</button>
            {activeMenuHeader === 'insert' && (
              <div className="menu-bar-dropdown-panel">
                <button className="dropdown-panel-item" onClick={() => { insertGridTable(); setActiveMenuHeader(null); }}>📊 Matrix Grid Table...</button>
                <button className="dropdown-panel-item" onClick={() => { promptLink(); setActiveMenuHeader(null); }}>🔗 Hyperlink Anchor URL...</button>
                <button className="dropdown-panel-item" onClick={() => { executeCmd('insertHorizontalRule'); setActiveMenuHeader(null); }}>➖ Horizontal Page Divider Line</button>
              </div>
            )}
          </div>

        </div>

        <div className="toolbar-cloud-sync-status-capsule">
          {saveStatus === 'saved' && <span className="cloud-badge text-success">☁️ Saved</span>}
          {saveStatus === 'saving' && <span className="cloud-badge text-warning">⏳ Syncing...</span>}
          {saveStatus === 'error' && <span className="cloud-badge text-danger">⚠️ Offline</span>}
        </div>
      </div>

      {/* 💻 SECOND TIER: MINIMALISTIC INTERACTIVE TOOLBAR RIBBON */}
      <div className="google-docs-toolbar" onClick={(e) => e.stopPropagation()}>
        <button className="toolbar-icon-btn" onClick={() => executeCmd('undo')} title="Undo">↩</button>
        <button className="toolbar-icon-btn" onClick={() => executeCmd('redo')} title="Redo">↪</button>
        
        <div className="toolbar-divider-line" />

        {/* 🔍 EXCLUSIVE GOOGLE DOCS CANVAS PAGE SCALE FACTOR SELECTOR */}
        <select 
          className="toolbar-dropdown zoom-dropdown" 
          value={zoomScale} 
          onChange={(e) => setZoomScale(Number(e.target.value))}
          title="Change Page Scaling"
        >
          <option value="50">50%</option>
          <option value="75">75%</option>
          <option value="90">90%</option>
          <option value="100">100%</option>
          <option value="125">125%</option>
          <option value="150">150%</option>
        </select>

        <div className="toolbar-divider-line" />

        <select className="toolbar-dropdown style-dropdown" onChange={(e) => executeCmd('formatBlock', e.target.value)} defaultValue="p" title="Paragraph Style">
          <option value="p">Normal text</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </select>

        <select className="toolbar-dropdown font-dropdown" onChange={(e) => executeCmd('fontName', e.target.value)} defaultValue="Arial" title="Font Family">
          <option value="Arial">Arial</option>
          <option value="Times New Roman">Times New Roman</option>
          <option value="Courier New">Courier New</option>
          <option value="Georgia">Georgia</option>
        </select>

        <div className="font-size-stepper-control">
          <button className="step-btn" onClick={() => changeFontSize(-1)}>−</button>
          <input type="text" className="size-value-readout" value={fontSize} readOnly />
          <button className="step-btn" onClick={() => changeFontSize(1)}>+</button>
        </div>

        <div className="toolbar-divider-line" />

        <button className="toolbar-icon-btn font-bold-weight" onClick={() => executeCmd('bold')} title="Bold">B</button>
        <button className="toolbar-icon-btn font-italic-style" onClick={() => executeCmd('italic')} title="Italic">I</button>
        <button className="toolbar-icon-btn font-underline-style" onClick={() => executeCmd('underline')} title="Underline">U</button>
        
        <div className="color-picker-wrapper" title="Font Color">
          <span className="color-label-indicator">A</span>
          <input type="color" className="native-color-node" onChange={(e) => executeCmd('foreColor', e.target.value)} defaultValue="#222222" />
        </div>

        <div className="toolbar-divider-line" />

        <button className="toolbar-icon-btn" onClick={() => executeCmd('justifyLeft')} title="Align Left">⫷</button>
        <button className="toolbar-icon-btn" onClick={() => executeCmd('justifyCenter')} title="Align Center">⫸</button>
        <button className="toolbar-icon-btn" onClick={() => executeCmd('justifyFull')} title="Justify">≡</button>

        <div className="toolbar-divider-line" />

        {/* 🛠️ CONSOLIDATED MORE TOOLS DROPDOWN */}
        <div className="more-tools-container">
          <button 
            className={`toolbar-icon-btn more-tools-trigger-btn ${showMoreMenu ? 'popover-active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setShowMoreMenu(!showMoreMenu); }}
            title="More tools"
          >
            ⚙️ More Tools ▾
          </button>

          {showMoreMenu && (
            <div className="more-tools-popover-menu" onClick={(e) => e.stopPropagation()}>
              <div className="popover-section-label">Formatting Layouts</div>
              
              <button 
                className={`popover-item-btn ${isPainterActive ? 'painter-active-node' : ''}`} 
                onClick={() => { triggerFormatPainter(); setShowMoreMenu(false); }}
              >
                🎨 Paint Format Brush
              </button>
              
              <button className="popover-item-btn font-strikethrough-style" onClick={() => { executeCmd('strikeThrough'); setShowMoreMenu(false); }}>
                S Strikethrough Layout
              </button>
              
              <button className="popover-item-btn" onClick={() => { executeCmd('removeFormat'); setShowMoreMenu(false); }}>
                ✕ Clear All Custom Stylings
              </button>

              <div className="popover-item-wrapper-row">
                <span className="row-title">Highlight Marker</span>
                <div className="color-picker-wrapper highlight-wrapper">
                  <span className="color-label-indicator">✏️ Selection</span>
                  <input type="color" className="native-color-node" onChange={(e) => executeCmd('hiliteColor', e.target.value)} defaultValue="#ffffff" />
                </div>
              </div>

              <div className="popover-item-wrapper-row">
                <span className="row-title">Line Spacing</span>
                <select className="popover-inline-dropdown" onChange={(e) => { adjustLineSpacing(e.target.value); setShowMoreMenu(false); }} defaultValue="1.5">
                  <option value="1.0">Single Space</option>
                  <option value="1.15">1.15 Balanced</option>
                  <option value="1.5">1.5 Standard</option>
                  <option value="2.0">Double Space</option>
                </select>
              </div>
            </div>
          )}
        </div>

        <button className="toolbar-icon-btn primary-pdf-btn" onClick={handleExportPDF} title="Export canvas to PDF">
          🖨️ Export PDF
        </button>
      </div>

      {/* SEARCH HUD OVERLAY */}
      {showFindReplace && (
        <div className="google-docs-find-hud" onClick={(e) => e.stopPropagation()}>
          <input type="text" placeholder="Search query..." value={findText} onChange={(e) => setFindText(e.target.value)} />
          <input type="text" placeholder="Replace string..." value={replaceText} onChange={(e) => setReplaceText(e.target.value)} />
          <button onClick={() => executeFindReplace(false)}>Replace</button>
          <button onClick={() => executeFindReplace(true)}>Replace All</button>
          <button className="hud-close" onClick={() => setShowFindReplace(false)}>✕</button>
        </div>
      )}

      {/* 👥 DESKTOP PLATFORM WORKSPACE BODY GRID */}
      <div className="workspace-desktop-split-view-body">
        
        {/* 📄 TRANSLUCENT CENTRIFUGAL CANVAS VIEWPORT */}
        <div className="google-docs-canvas-centered">
          <div 
            className="docs-zoom-scaler-node"
            style={{ transform: `scale(${zoomScale / 100})`, transformOrigin: 'top center' }}
          >
            {sheetsRenderMatrixArray.map((pageNum) => (
              <div 
                key={pageNum}
                className={`docs-page-sheet size-${pageSetup.paperSize} orientation-${pageSetup.orientation} ${isEditingHeaderFooter ? 'editing-margins-mode' : ''}`}
                style={{ 
                  paddingTop: `${pageSetup.marginTop}in`,
                  paddingBottom: `${pageSetup.marginBottom}in`,
                  paddingLeft: `${pageSetup.marginLeft}in`,
                  paddingRight: `${pageSetup.marginRight}in`
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* 📝 DOUBLE CLICKABLE HEADER REGION */}
                <div 
                  className="docs-running-header-margin" 
                  contentEditable={isEditingHeaderFooter}
                  suppressContentEditableWarning
                  onDoubleClick={(e) => { e.stopPropagation(); setIsEditingHeaderFooter(true); }}
                  onBlur={(e) => setPageSetup({ ...pageSetup, headerText: e.target.innerText })}
                  title="Double-click to edit header inline"
                >
                  {pageSetup.headerText}
                  <div className="header-divider-border" />
                </div>

                {/* SINGLE SEAMLESS INTEGRATED EDITOR CONTEXT BODY */}
                {pageNum === 1 ? (
                  <div
                    ref={editorRef}
                    className="docs-inline-rich-editor master-flow-container"
                    contentEditable
                    suppressContentEditableWarning
                    onInput={handleEditorInput}
                    onKeyDown={handleKeyDown}
                    placeholder="Start typing... Content automatically increments pages when full, or press Ctrl + N to force a split layout."
                  />
                ) : (
                  // Downstream structural sheet extension mask layers
                  <div className="docs-inline-rich-editor view-proxy-overflow-placeholder" contentEditable="false">
                    <span className="scrolling-flow-notice">(Continuous multi-page document sheet workflow buffer)</span>
                  </div>
                )}

                {/* 📄 DOUBLE CLICKABLE FOOTER REGION WITH INTEGRATED AUTO NUMBERING */}
                <div 
                  className="docs-running-footer-margin"
                  onDoubleClick={(e) => { e.stopPropagation(); setIsEditingHeaderFooter(true); }}
                  title="Double-click to change custom footer description tokens"
                >
                  <div className="footer-divider-border" />
                  <div className="footer-flex-row-layout">
                    <span
                      contentEditable={isEditingHeaderFooter}
                      suppressContentEditableWarning
                      onBlur={(e) => setPageSetup({ ...pageSetup, footerText: e.target.innerText })}
                      style={{ outline: 'none', minWidth: '20px', display: 'inline-block' }}
                    >
                      {pageSetup.footerText}
                    </span>
                    
                    {/* Native dynamic page pagination tracker badge indicator */}
                    <span className="page-numerical-indexer-badge">
                      Page {pageNum} of {pageCount}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 📋 MINIMALIST PAGE SETUP SINGLE SIDEBAR CONTROL SYSTEM */}
        <div className="google-docs-utility-sidebar" onClick={(e) => e.stopPropagation()}>
          <div className="sidebar-tab-selectors-header">
            <div className="sidebar-header-title-label">⚙️ Page Setup Parameters</div>
          </div>

          <div className="sidebar-tab-viewport-contents">
            <div className="sidebar-panel-wrapper setup-panel">
              
              <label className="input-group-label-block">Orientation</label>
              <div className="flex-radio-row">
                <label><input type="radio" name="orientation" checked={pageSetup.orientation === 'portrait'} onChange={() => setPageSetup({...pageSetup, orientation: 'portrait'})} /> Portrait</label>
                <label><input type="radio" name="orientation" checked={pageSetup.orientation === 'landscape'} onChange={() => setPageSetup({...pageSetup, orientation: 'landscape'})} /> Landscape</label>
              </div>

              <label className="input-group-label-block">Paper Metrics</label>
              <select className="panel-select-node" value={pageSetup.paperSize} onChange={(e) => setPageSetup({...pageSetup, paperSize: e.target.value})}>
                <option value="letter">Letter Size Dimensions (8.5" x 11")</option>
                <option value="a4">A4 International Sheet (210mm x 297mm)</option>
              </select>

              <label className="input-group-label-block">Page Margin Allocations (Inches)</label>
              <div className="grid-margin-inputs-quad">
                <label>Top <input type="number" step="0.1" value={pageSetup.marginTop} onChange={(e) => setPageSetup({...pageSetup, marginTop: parseFloat(e.target.value) || 0})} /></label>
                <label>Bottom <input type="number" step="0.1" value={pageSetup.marginBottom} onChange={(e) => setPageSetup({...pageSetup, marginBottom: parseFloat(e.target.value) || 0})} /></label>
                <label>Left <input type="number" step="0.1" value={pageSetup.marginLeft} onChange={(e) => setPageSetup({...pageSetup, marginLeft: parseFloat(e.target.value) || 0})} /></label>
                <label>Right <input type="number" step="0.1" value={pageSetup.marginRight} onChange={(e) => setPageSetup({...pageSetup, marginRight: parseFloat(e.target.value) || 0})} /></label>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* 📊 FOOTER SUMMARY STATUS METRICS PANEL */}
      <div className="google-docs-footer-status-bar">
        <div className="status-item">📄 Document Size: <strong>{pageCount} Page{pageCount !== 1 ? 's' : ''}</strong></div>
        <div className="status-item">✍️ Volume Metrics: <strong>{wordCount} Words</strong></div>
        <div className="status-item">🔤 Stream Size: <strong>{charCount} Characters</strong></div>
        <div className="status-item shortcuts-notice">Tip: Double-click header or footer margins to unlock full inline editing configuration screens.</div>
      </div>

      {/* 🎨 INTERACTIVE STYLING REGIME SCHEMA */}
      <style>{`
        .workspace-tab-content { display: flex; flex-direction: column; height: 100vh; width: 100%; background: #f9fbfd; position: relative; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; overflow: hidden; }
        
        /* 🏛️ Tier 1 Navigation System styles */
        .google-docs-desktop-menu-bar { display: flex; align-items: center; justify-content: space-between; background: #f0f4f9; padding: 0.25rem 0.85rem; border-bottom: 1px solid #d3e3fd; height: 32px; z-index: 110; }
        .menu-bar-left-cluster { display: flex; gap: 0.2rem; }
        .menu-bar-item-wrapper { position: relative; }
        .menu-bar-tab { background: transparent; border: none; color: #444746; font-size: 0.82rem; font-weight: 500; padding: 4px 10px; border-radius: 4px; cursor: pointer; transition: background 0.1s; }
        .menu-bar-tab:hover, .menu-bar-tab.active-tab { background: #e0e8f6; color: #0b57d0; }
        
        .menu-bar-dropdown-panel { position: absolute; top: 100%; left: 0; margin-top: 4px; background: #ffffff; border: 1px solid #c4c7c5; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.12); width: 210px; padding: 6px 0; z-index: 250; }
        .dropdown-panel-item { background: transparent; border: none; text-align: left; padding: 6px 14px; font-size: 0.8rem; color: #1f1f1f; width: 100%; cursor: pointer; }
        .dropdown-panel-item:hover { background: #f0f4f9; color: #0b57d0; }

        /* 💻 Tier 2 Command Ribbon styles */
        .google-docs-toolbar { display: flex; align-items: center; gap: 0.35rem; background: #edf2fa; padding: 0.4rem 0.82rem; border-bottom: 1px solid #d3e3fd; flex-wrap: wrap; box-shadow: 0 1px 2px rgba(0,0,0,0.02); z-index: 100; }
        .toolbar-icon-btn { background: transparent; border: none; color: #444746; padding: 5px 9px; font-size: 0.82rem; font-weight: 500; border-radius: 4px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
        .toolbar-icon-btn:hover { background: #e0e8f6; }
        
        .zoom-dropdown { width: 80px; font-weight: 600; color: #0b57d0; text-align: center; background: rgba(11,87,208,0.04); border: 1px solid #d3e3fd; border-radius: 4px; padding: 3px; cursor: pointer; }
        .primary-pdf-btn { background: #0b57d0 !important; color: #ffffff !important; font-weight: 600; margin-left: auto; padding: 5px 14px; box-shadow: 0 1px 2px rgba(11,87,208,0.2); }
        .primary-pdf-btn:hover { background: #1b66df !important; }
        
        .font-bold-weight { font-weight: 800; }
        .font-italic-style { font-style: italic; }
        .font-underline-style { text-decoration: underline; }
        .font-strikethrough-style { text-decoration: line-through; }
        
        .toolbar-dropdown { background: transparent; border: none; color: #444746; font-size: 0.82rem; padding: 4px; cursor: pointer; font-weight: 500; border-radius: 4px; }
        .toolbar-dropdown:hover { background: #e0e8f6; }
        .style-dropdown { width: 105px; font-weight: 600; }
        .font-dropdown { width: 105px; }
        .toolbar-divider-line { width: 1px; height: 18px; background: #c4c7c5; margin: 0 2px; }
        
        .font-size-stepper-control { display: flex; align-items: center; }
        .font-size-stepper-control .step-btn { background: transparent; border: none; font-size: 0.9rem; cursor: pointer; padding: 0 3px; font-weight: bold; }
        .font-size-stepper-control .size-value-readout { width: 24px; text-align: center; border: 1px solid #c4c7c5; border-radius: 4px; font-size: 0.8rem; margin: 0 3px; padding: 1px 0; font-weight: bold; }
        
        .color-picker-wrapper { position: relative; display: inline-flex; align-items: center; padding: 0 4px; border-radius: 4px; height: 24px; cursor: pointer; }
        .color-picker-wrapper:hover { background: #e0e8f6; }
        .color-label-indicator { font-size: 0.82rem; font-weight: bold; pointer-events: none; }
        .native-color-node { position: absolute; left: 0; top: 0; opacity: 0; width: 100%; height: 100%; cursor: pointer; }

        /* 🛠️ More Tools Menu Popover */
        .more-tools-container { position: relative; display: inline-block; }
        .more-tools-trigger-btn { font-weight: 600; color: #0b57d0; background: rgba(11,87,208,0.05); border: 1px solid rgba(11,87,208,0.15); }
        
        .more-tools-popover-menu { position: absolute; top: 100%; left: 0; margin-top: 6px; background: #ffffff; border: 1px solid #c4c7c5; border-radius: 8px; box-shadow: 0 6px 20px rgba(0,0,0,0.15); width: 230px; padding: 8px 0; display: flex; flex-direction: column; z-index: 200; }
        .popover-section-label { font-size: 0.68rem; font-weight: 800; color: #70757a; text-transform: uppercase; letter-spacing: 0.5px; padding: 6px 14px 4px 14px; }
        .popover-item-btn { background: transparent; border: none; text-align: left; padding: 8px 14px; font-size: 0.82rem; color: #1f1f1f; cursor: pointer; display: block; width: 100%; }
        .popover-item-btn:hover { background: #f0f4f9; color: #0b57d0; }
        .popover-item-wrapper-row { display: flex; align-items: center; justify-content: space-between; padding: 4px 14px; font-size: 0.82rem; color: #1f1f1f; }
        .popover-inline-dropdown { border: 1px solid #c4c7c5; border-radius: 4px; padding: 3px; font-size: 0.78rem; background: #fff; width: 105px; }
        .painter-active-node { background: #0b57d0 !important; color: #ffffff !important; }

        .cloud-badge { font-size: 0.72rem; font-weight: 700; padding: 2px 8px; border-radius: 10px; }
        .text-success { color: #146c43; background: #d1e7dd; }
        .text-warning { color: #664d03; background: #fff3cd; }
        .text-danger { color: #842029; background: #f8d7da; }

        .google-docs-find-hud { position: absolute; top: 84px; right: 320px; background: #ffffff; box-shadow: 0 4px 16px rgba(0,0,0,0.12); border: 1px solid #c4c7c5; border-radius: 8px; padding: 12px; display: flex; gap: 8px; z-index: 150; align-items: center; }
        .google-docs-find-hud input { border: 1px solid #c4c7c5; border-radius: 4px; padding: 5px 8px; font-size: 0.8rem; outline: none; width: 130px; }
        .google-docs-find-hud button { background: #1a73e8; border: none; color: #fff; padding: 5px 12px; font-size: 0.78rem; border-radius: 4px; cursor: pointer; font-weight: 600; }
        .google-docs-find-hud .hud-close { background: transparent; color: #5f6368; font-size: 0.9rem; cursor: pointer; border: none; }

        /* Canvas Layout Viewport Platform */
        .workspace-desktop-split-view-body { display: flex; flex: 1; overflow: hidden; width: 100%; position: relative; }
        .google-docs-canvas-centered { flex: 1; overflow-y: auto; background: #f0f4f9; display: flex; justify-content: center; padding: 2rem 0; position: relative; }
        
        /* Scaler Node wraps sequential dynamic output pages cleanly */
        .docs-zoom-scaler-node { display: flex; flex-direction: column; gap: 28px; transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1); }

        .docs-page-sheet { background: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.04); border: 1px solid #e0e0e0; display: flex; flex-direction: column; position: relative; box-sizing: border-box; overflow: hidden; }
        .docs-page-sheet.editing-margins-mode { border: 1px dashed #0b57d0; background-color: #fafbfe; }
        
        .docs-page-sheet.size-letter.orientation-portrait { width: 816px; min-height: 1056px; height: 1056px; }
        .docs-page-sheet.size-letter.orientation-landscape { width: 1056px; min-height: 816px; height: 816px; }
        .docs-page-sheet.size-a4.orientation-portrait { width: 794px; min-height: 1123px; height: 1123px; }
        .docs-page-sheet.size-a4.orientation-landscape { width: 1123px; min-height: 794px; height: 794px; }

        /* 📝 Editable Headers and Footers Styles */
        .docs-running-header-margin { font-size: 8.5pt; color: #70757a; font-family: Arial, sans-serif; margin-bottom: 12px; outline: none; padding: 4px; border-radius: 4px; cursor: pointer; transition: background 0.15s; min-height: 18px; }
        .docs-running-header-margin:hover { background: rgba(11,87,208,0.06); }
        .header-divider-border { border-bottom: 1px dashed #e0e0e0; margin-top: 4px; width: 100%; }
        
        .docs-running-footer-margin { font-size: 8.5pt; color: #70757a; font-family: Arial, sans-serif; margin-top: auto; padding: 4px; border-radius: 4px; cursor: pointer; transition: background 0.15s; }
        .docs-running-footer-margin:hover { background: rgba(11,87,208,0.06); }
        .footer-divider-border { border-top: 1px dashed #e0e0e0; margin-bottom: 4px; width: 100%; }
        .footer-flex-row-layout { display: flex; justify-content: space-between; align-items: center; }
        .page-numerical-indexer-badge { background: #f0f4f9; padding: 2px 8px; border-radius: 4px; color: #0b57d0; font-weight: 600; }

        /* Integrated Flow Editor and page proxy breaks */
        .docs-inline-rich-editor { flex: 1; width: 100%; border: none; outline: none; font-family: 'Arial', sans-serif; font-size: 11pt; line-height: 1.5; color: #222222; background: transparent; word-wrap: break-word; overflow: visible; }
        .google-docs-page-break { border-top: 2px dashed #b1cffc; margin: 24px 0; position: relative; }
        
        .view-proxy-overflow-placeholder { display: flex; align-items: center; justify-content: center; background: #fdfdfd; border-radius: 4px; border: 1px dashed #dcdcdc; max-height: 100px; }
        .scrolling-flow-notice { font-size: 0.8rem; color: #a0a0a0; font-style: italic; }
        
        .google-docs-utility-sidebar { width: 280px; border-left: 1px solid #d3e3fd; background: #ffffff; display: flex; flex-direction: column; z-index: 20; box-shadow: -2px 0 6px rgba(0,0,0,0.01); }
        .sidebar-tab-selectors-header { background: #f8fafc; border-bottom: 1px solid #edf2fa; padding: 12px; }
        .sidebar-header-title-label { font-size: 0.82rem; font-weight: 700; color: #1f1f1f; text-transform: uppercase; letter-spacing: 0.5px; }
        
        .sidebar-tab-viewport-contents { padding: 14px; }
        .input-group-label-block { display: block; font-size: 0.75rem; font-weight: 700; color: #444746; margin: 14px 0 6px 0; text-transform: uppercase; letter-spacing: 0.3px; }
        .flex-radio-row { display: flex; gap: 14px; font-size: 0.82rem; color: #1f1f1f; }
        .panel-select-node { width: 100%; border: 1px solid #c4c7c5; border-radius: 4px; padding: 6px; font-size: 0.8rem; }
        .grid-margin-inputs-quad { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.75rem; color: #5f6368; }
        .grid-margin-inputs-quad input { border: 1px solid #c4c7c5; border-radius: 4px; padding: 4px; font-size: 0.8rem; width: 100%; box-sizing: border-box; }

        .google-docs-footer-status-bar { height: 26px; background: #ffffff; border-top: 1px solid #d3e3fd; display: flex; align-items: center; font-size: 0.75rem; color: #444746; gap: 20px; padding: 0 12px; z-index: 30; }
        .shortcuts-notice { margin-left: auto; color: #70757a; }
        .workspace-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 65vh; color: #5f6368; width: 100%; text-align: center; }
      `}</style>
    </div>
  )
}

export default WorkspaceContent