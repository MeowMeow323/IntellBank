import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import useWorkspaceStore from '../../store/workspaceStore'
import S from '../../utils/workspaceStyles'
import { useEditorKeyboard } from '../../utils/useEditorKeyboard'
import { SubmissionService } from '../../services/api'
import '../../styles/workspace-editor.css'

// ─── Constants ────────────────────────────────────────────────────────────────
const PAGE_SIZES = {
  letter: { width: 816, height: 1056 },
  a4: { width: 794, height: 1123 },
}
const PAD_V = 96
const PAD_H = 96
const HDR_H = 32
const FTR_H = 32
const PAGE_BREAK_MARKER = '<!--PAGE-->'

// ─── PageEditor ───────────────────────────────────────────────────────────────
const PageEditor = React.forwardRef(({
  pageNum, pageCount, pageW, pageH,
  headerText, footerText, editingHF,
  onDoubleClickHF, onBlurHeader, onBlurFooter,
  onInput, onKeyDown, onPaste,
  isExam,
}, ref) => {
  const contentH = pageH - PAD_V * 2 - HDR_H - FTR_H - 12
  return (
    <div style={{
      width: `${pageW}px`,
      ...(isExam
        ? { minHeight: `${pageH}px`, height: 'auto', maxHeight: 'none' }
        : { height: `${pageH}px`, maxHeight: `${pageH}px` }
      ),
      background: '#fff',
      boxShadow: '0 1px 4px rgba(0,0,0,0.1), 0 6px 20px rgba(0,0,0,0.06)',
      border: '1px solid #e0e0e0',
      display: 'flex', flexDirection: 'column',
      boxSizing: 'border-box', overflow: 'hidden', flexShrink: 0,
      padding: `${PAD_V}px ${PAD_H}px`,
      ...(editingHF ? { outline: '1.5px dashed var(--accent)' } : {}),
    }}>
      {/* Header */}
      <div
        contentEditable={editingHF}
        suppressContentEditableWarning
        onDoubleClick={onDoubleClickHF}
        onBlur={onBlurHeader}
        dangerouslySetInnerHTML={editingHF ? undefined : {
          __html: headerText || '<span style="color:#ccc;font-style:italic">Double-click to add header…</span>'
        }}
        style={{
          fontSize: '8pt', color: '#70757a', fontFamily: 'Arial,sans-serif',
          height: `${HDR_H}px`, flexShrink: 0, outline: 'none', cursor: 'pointer', overflow: 'hidden'
        }}
      />
      <div style={{ borderTop: '1px dashed #e8eaed', marginBottom: '4px', flexShrink: 0 }} />
      {/* Content */}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={onInput}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        data-page={pageNum}
        style={{
          ...(isExam
            ? { minHeight: `${contentH}px`, height: 'auto', maxHeight: 'none' }
            : { height: `${contentH}px`, maxHeight: `${contentH}px`, minHeight: `${contentH}px` }
          ),
          overflow: 'hidden', outline: 'none', border: 'none',
          fontFamily: 'Arial, sans-serif', fontSize: '11pt', lineHeight: 1.6,
          color: '#222', background: 'transparent', wordWrap: 'break-word',
          boxSizing: 'border-box', flexShrink: 0,
        }}
      />
      <div style={{ borderTop: '1px dashed #e8eaed', marginTop: '4px', flexShrink: 0 }} />
      {/* Footer */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        height: `${FTR_H}px`, flexShrink: 0
      }}>
        <span
          contentEditable={editingHF}
          suppressContentEditableWarning
          onDoubleClick={onDoubleClickHF}
          onBlur={onBlurFooter}
          dangerouslySetInnerHTML={editingHF ? undefined : { __html: footerText || '' }}
          style={{ fontSize: '8pt', color: '#70757a', fontFamily: 'Arial,sans-serif', outline: 'none', cursor: 'pointer' }}
        />
        <span style={{
          fontSize: '8pt', color: 'var(--accent)', fontWeight: 600,
          background: 'var(--accent-soft)', padding: '1px 8px', borderRadius: '4px'
        }}>
          {pageNum} / {pageCount}
        </span>
      </div>
    </div>
  )
})
PageEditor.displayName = 'PageEditor'

// ─── WorkspaceContent ─────────────────────────────────────────────────────────
const WorkspaceContent = () => {
  const { tabs = [], activeTabId, updateTabContent } = useWorkspaceStore()
  const activeTab = tabs.find((t) => t.documentId === activeTabId)

  // ── Submit-for-review (generated exams only; one active submission per student) ──
  const isGeneratedExam = activeTab?.type === 'AI Generated Exam'
  const [submitState, setSubmitState] = useState('idle') // idle | submitting | done | error
  const [submitMsg, setSubmitMsg] = useState('')

  const handleSubmitForReview = async () => {
    if (!activeTab) return
    if (!window.confirm(
      'Submit this paper to an educator for review?\n\n' +
      'You can hold only one active submission at a time — it must be returned before you submit another.'
    )) return
    setSubmitState('submitting'); setSubmitMsg('')
    try {
      await SubmissionService.submit(activeTab.documentId)
      setSubmitState('done'); setSubmitMsg('Submitted ✓')
    } catch (err) {
      setSubmitState('error')
      setSubmitMsg(err?.response?.data?.message || 'Submission failed')
    }
  }

  const [pages, setPages] = useState(['<p><br></p>'])
  const [saveStatus, setSaveStatus] = useState('saved')
  const [zoomScale, setZoomScale] = useState(100)
  const [fontSize, setFontSize] = useState(11)
  const [wordCount, setWordCount] = useState(0)
  const [charCount, setCharCount] = useState(0)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [showFind, setShowFind] = useState(false)
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [activeMenu, setActiveMenu] = useState(null)
  const [editingHF, setEditingHF] = useState(false)
  const [pageSetup, setPageSetup] = useState({
    orientation: 'portrait', paperSize: 'letter',
    headerText: '', footerText: '',
  })

  const pageRefs = useRef([])
  const saveTimer = useRef(null)
  const focusedPage = useRef(0)
  const isInjecting = useRef(false)
  // Tracks last page-length fingerprint we redistributed to prevent infinite loops
  const lastDistKey = useRef('')
  // Scroll container + a pending scrollTop to restore after a repagination re-render
  const canvasRef = useRef(null)
  const pendingScroll = useRef(null)
  // Document-level undo/redo history (snapshots of every page's HTML)
  const history = useRef({ stack: [], index: -1 })
  const restoring = useRef(false)
  const histTimer = useRef(null)

  const dim = PAGE_SIZES[pageSetup.paperSize] || PAGE_SIZES.letter
  const isLandscape = pageSetup.orientation === 'landscape'
  const pageW = isLandscape ? dim.height : dim.width
  const pageH = isLandscape ? dim.width : dim.height
  const contentH = pageH - PAD_V * 2 - HDR_H - FTR_H - 12

  // Keep pageRefs array in sync with pages count
  pageRefs.current = pageRefs.current.slice(0, pages.length)
  while (pageRefs.current.length < pages.length) {
    pageRefs.current.push(React.createRef())
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  const recalcStats = useCallback(() => {
    const allText = pageRefs.current.map(r => r.current?.innerText || '').join(' ')
    const words = allText.trim() ? allText.trim().split(/\s+/).length : 0
    setWordCount(words)
    setCharCount(allText.length)
  }, [])

  // ── Save ──────────────────────────────────────────────────────────────────
  const triggerSave = useCallback(() => {
    if (!activeTabId) return
    setSaveStatus('saving')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const html = pageRefs.current
        .map(r => r.current?.innerHTML || '')
        .join(PAGE_BREAK_MARKER)
      try {
        await updateTabContent(activeTabId, html)
        setSaveStatus('saved')
      } catch {
        setSaveStatus('error')
      }
    }, 1200)
  }, [activeTabId, updateTabContent])

  // Export ONLY the document pages (not the app chrome) to a clean print/PDF window.
  const handleExportPdf = useCallback(() => {
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const pagesHtml = (pageRefs.current || [])
      .map(r => r?.current?.innerHTML || '')
      .filter(h => h.trim() && h.trim() !== '<p><br></p>')
    if (pagesHtml.length === 0) { alert('Nothing to export yet.'); return }

    const title  = activeTab?.title || 'Document'
    const header = (pageSetup.headerText || '').trim()
    const footer = (pageSetup.footerText || '').trim()

    const body = pagesHtml.map(h =>
      `<section class="pp">${header ? `<div class="hf">${esc(header)}</div>` : ''}` +
      `<div class="pc">${h}</div>` +
      `${footer ? `<div class="hf ft">${esc(footer)}</div>` : ''}</section>`
    ).join('')

    const win = window.open('', '_blank', 'width=920,height=1000')
    if (!win) { alert('Please allow pop-ups to export the document as PDF.'); return }
    win.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>` +
        `@page { size: ${isLandscape ? 'landscape' : 'portrait'}; margin: 16mm; }` +
        `*{box-sizing:border-box;} body{font-family:Inter,Arial,sans-serif;color:#1a1e27;margin:0;}` +
        `.pp{page-break-after:always;} .pp:last-child{page-break-after:auto;}` +
        `.pc{line-height:1.6;}` +
        `.hf{font-size:0.78rem;color:#6b7280;} .ft{margin-top:14px;text-align:center;}` +
        `table{border-collapse:collapse;width:100%;} td,th{border:1px solid #cbd5e1;padding:6px;}` +
        `img{max-width:100%;}` +
      `</style></head><body>${body}</body></html>`
    )
    win.document.close()
    win.focus()
    setTimeout(() => { try { win.print() } catch { /* user can print manually */ } }, 350)
  }, [activeTab, pageSetup.headerText, pageSetup.footerText, isLandscape])

  const cmd = useCallback((command, value = null) => {
    document.execCommand(command, false, value)
    recalcStats()
    triggerSave()
  }, [triggerSave, recalcStats])

  // ── Undo / redo: whole-document snapshot history ───────────────────────────
  // The browser's native undo lives per-contentEditable element and is wiped every
  // time the app reprograms innerHTML (injection / pagination), which is why Ctrl+Z
  // was unreliable. We keep our own debounced snapshots of all pages instead.
  const captureSnapshot = useCallback(
    () => pageRefs.current.map((r) => r.current?.innerHTML ?? '<p><br></p>'),
    []
  )

  const recordHistory = useCallback(() => {
    if (restoring.current) return
    const snap = captureSnapshot()
    const h = history.current
    const top = h.stack[h.index]
    if (top && top.length === snap.length && top.every((v, i) => v === snap[i])) return
    h.stack = h.stack.slice(0, h.index + 1)
    h.stack.push(snap)
    if (h.stack.length > 80) h.stack.shift()
    h.index = h.stack.length - 1
  }, [captureSnapshot])

  const scheduleHistory = useCallback(() => {
    clearTimeout(histTimer.current)
    histTimer.current = setTimeout(recordHistory, 500)
  }, [recordHistory])

  const applySnapshot = useCallback((snap) => {
    restoring.current = true
    isInjecting.current = true
    pendingScroll.current = canvasRef.current?.scrollTop ?? null
    setPages(snap.map((h) => h || '<p><br></p>'))
    requestAnimationFrame(() => {
      snap.forEach((html, i) => {
        const el = pageRefs.current[i]?.current
        if (el && el.innerHTML !== html) el.innerHTML = html || '<p><br></p>'
      })
      // Put the caret at the end of the last page so typing can continue naturally.
      const li = snap.length - 1
      const el = pageRefs.current[li]?.current
      if (el) {
        el.focus()
        try {
          const r = document.createRange()
          r.selectNodeContents(el); r.collapse(false)
          const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r)
        } catch { /* ignore caret placement failure */ }
        focusedPage.current = li
      }
      // Mark this layout as already-distributed so Effect 4 doesn't re-paginate it.
      lastDistKey.current = snap.map((p) => (p || '').length).join('-')
      isInjecting.current = false
      restoring.current = false
      recalcStats(); triggerSave()
    })
  }, [recalcStats, triggerSave])

  const undo = useCallback(() => {
    clearTimeout(histTimer.current)
    recordHistory()                 // commit any un-snapshotted edits first
    const h = history.current
    if (h.index <= 0) return
    h.index -= 1
    applySnapshot(h.stack[h.index])
  }, [recordHistory, applySnapshot])

  const redo = useCallback(() => {
    const h = history.current
    if (h.index >= h.stack.length - 1) return
    h.index += 1
    applySnapshot(h.stack[h.index])
  }, [applySnapshot])

  // ── Effect 1: Load content on tab switch ─────────────────────────────────
  // Splits saved HTML by PAGE_BREAK_MARKER into pages array.
  // For AI-generated docs the content arrives via localDraftContent update
  // AFTER the tab is already active, so we also watch localDraftContent.
  useEffect(() => {
    if (!activeTab) return
    const raw = activeTab.localDraftContent ?? activeTab.storageUrl ?? ''
    if (!raw || raw === '<p><br></p>') {
      setPages(['<p><br></p>'])
      return
    }
    const parts = raw.split(PAGE_BREAK_MARKER).filter(p => p.trim())
    setPages(parts.length ? parts : ['<p><br></p>'])
  }, [activeTabId, activeTab?.localDraftContent])

  // ── Effect 2: Inject HTML into DOM after pages state changes ─────────────
  // IMPORTANT: This effect only injects — it does NOT reflow or redistribute.
  // Skip injection for any page the user is actively editing (prevents cursor jumps).
  useEffect(() => {
    pages.forEach((html, i) => {
      const el = pageRefs.current[i]?.current
      if (!el) return
      if (document.activeElement === el) return   // user is typing here — do not reset
      if (el.innerHTML !== html) {
        el.innerHTML = html || '<p><br></p>'
      }
    })
    recalcStats()
  }, [pages, activeTabId, recalcStats])

  // ── Effect 3: AI pagination — only runs when a single large page is loaded ─
  // Detects that page 0 overflows (AI content all on one page) and
  // redistributes nodes across multiple pages WITHOUT touching normal documents.
  useEffect(() => {
    const el = pageRefs.current[0]?.current
    if (!el) return
    // Only paginate if: single page AND content overflows AND not already multi-page
    if (pages.length !== 1) return

    // Double RAF: first frame lets Effect 2 inject HTML, second measures the
    // rendered scrollHeight (which is 0 until the browser paints the content).
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!el || el.scrollHeight <= contentH + 2) return

      // This is AI content on a single overflowing page — redistribute
      isInjecting.current = true
      redistributeNodes(el)
      isInjecting.current = false
    }))
  }, [activeTabId, activeTab?.localDraftContent]) // eslint-disable-line

  // Reset fingerprint + undo history whenever the active tab changes
  useEffect(() => {
    lastDistKey.current = ''
    history.current = { stack: [], index: -1 }
  }, [activeTabId])

  // After any repagination re-render, restore the scroll position we captured so the
  // view doesn't jump up/down while content is redistributed across pages.
  useLayoutEffect(() => {
    if (pendingScroll.current != null && canvasRef.current) {
      canvasRef.current.scrollTop = pendingScroll.current
      pendingScroll.current = null
    }
  }, [pages])

  // Seed the first history entry once the page content is in the DOM.
  useEffect(() => {
    if (history.current.stack.length === 0) {
      requestAnimationFrame(() => recordHistory())
    }
  }, [pages]) // eslint-disable-line

  // ── Effect 4: per-page overflow fix for pre-split multi-page docs ─────────
  // Effect 3 only redistributes single-page AI dumps. This handles each
  // individual pre-split page (past year paper, saved AI paper) that overflows
  // after injection. Cascades one page per RAF pass until all pages are stable.
  // AI exam papers are skipped: each page is one question with auto-height,
  // so content must never cascade across question boundaries.
  useEffect(() => {
    if (pages.length <= 1) return  // Effect 3 handles this
    if (isGeneratedExam) return    // exam pages grow freely — no redistribution
    const key = pages.map(p => p.length).join('-')
    if (key === lastDistKey.current) return

    requestAnimationFrame(() => requestAnimationFrame(() => {
      // Don't re-paginate the page the user is actively editing — that's what causes
      // the cursor/scroll to jump mid-typing. Overflow while typing is handled by
      // reflowOnType; this pass runs for load-time / non-focused content.
      const active = document.activeElement
      if (active && pageRefs.current.some((r) => r.current === active)) return

      let changed = false
      const newPages = [...pages]

      for (let i = 0; i < newPages.length; i++) {
        const el = pageRefs.current[i]?.current
        if (!el || el.scrollHeight <= contentH + 4) continue

        const allNodes = Array.from(el.childNodes).map(n => n.cloneNode(true))
        if (allNodes.length <= 1) continue   // single un-splittable node — skip

        const testDiv = document.createElement('div')
        testDiv.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;width:${el.offsetWidth || 624}px;font-family:Arial,sans-serif;font-size:11pt;line-height:1.6;word-wrap:break-word;box-sizing:border-box;`
        document.body.appendChild(testDiv)

        const fit = [], overflow = []
        for (const node of allNodes) {
          testDiv.innerHTML = ''
          fit.forEach(n => testDiv.appendChild(n.cloneNode(true)))
          testDiv.appendChild(node.cloneNode(true))
          if (testDiv.scrollHeight > contentH + 4 && fit.length > 0) {
            overflow.push(node)
          } else {
            fit.push(node)
          }
        }
        document.body.removeChild(testDiv)
        if (overflow.length === 0) continue

        const fitDiv = document.createElement('div')
        fit.forEach(n => fitDiv.appendChild(n))
        newPages[i] = fitDiv.innerHTML || '<p><br></p>'

        const ovDiv = document.createElement('div')
        overflow.forEach(n => ovDiv.appendChild(n))
        const overflowHtml = ovDiv.innerHTML

        if (i + 1 < newPages.length) {
          const next = newPages[i + 1]
          newPages[i + 1] = overflowHtml + (next === '<p><br></p>' ? '' : next)
        } else {
          newPages.push(overflowHtml)
        }

        changed = true
        break  // one page per pass; re-runs via setPages until stable
      }

      lastDistKey.current = key
      if (changed) {
        pendingScroll.current = canvasRef.current?.scrollTop ?? null
        setPages(newPages)
      }
    }))
  }, [pages, contentH]) // eslint-disable-line

  // ── redistributeNodes: AI pagination engine ───────────────────────────────
  // Takes all child nodes from the first page and distributes them
  // across as many pages as needed. Only called for AI-generated content.
  const redistributeNodes = useCallback((firstPageEl) => {
    // Snapshot all nodes
    const allNodes = Array.from(firstPageEl.childNodes).map(n => n.cloneNode(true))
    if (allNodes.length === 0) return

    // Build pages by filling each one node-by-node
    const pageContents = [[]] // array of arrays of nodes
    let pageIdx = 0

    // Use a temporary off-screen div to measure scrollHeight
    const testDiv = document.createElement('div')
    testDiv.style.cssText = `
      position:absolute; visibility:hidden; pointer-events:none;
      width:${firstPageEl.offsetWidth}px;
      font-family:Arial,sans-serif; font-size:11pt; line-height:1.6;
      word-wrap:break-word; box-sizing:border-box;
    `
    document.body.appendChild(testDiv)

    for (const node of allNodes) {
      // Try adding node to current page test
      testDiv.innerHTML = ''
      pageContents[pageIdx].forEach(n => testDiv.appendChild(n.cloneNode(true)))
      testDiv.appendChild(node.cloneNode(true))

      if (testDiv.scrollHeight > contentH + 2 && pageContents[pageIdx].length > 0) {
        // Overflow — start new page
        pageIdx++
        pageContents.push([node.cloneNode(true)])
      } else {
        pageContents[pageIdx].push(node.cloneNode(true))
      }
    }

    document.body.removeChild(testDiv)

    // Convert node arrays to HTML strings
    const newPages = pageContents.map(nodes => {
      const tmp = document.createElement('div')
      nodes.forEach(n => tmp.appendChild(n))
      return tmp.innerHTML || '<p><br></p>'
    })

    setPages(newPages)
  }, [contentH])

  // ── Typing reflow: overflow only — runs after browser finishes the input event ──
  // Underflow (pull-from-next-page) removed: it cloned/removed DOM nodes on every
  // keypress during the input handler, causing cursor jumps and content flickering.
  const reflowOnType = useCallback((pageIdx) => {
    if (isInjecting.current) return
    if (isGeneratedExam) return   // exam pages grow freely; never push to the next question
    const el = pageRefs.current[pageIdx]?.current
    if (!el) return

    if (el.scrollHeight <= contentH + 2) return   // page has room — nothing to do

    const lastChild = el.lastChild
    if (!lastChild) return

    // Add next page slot if it doesn't exist yet
    setPages(prev => {
      if (prev[pageIdx + 1] !== undefined) return prev
      return [...prev, '<p><br></p>']
    })

    // Move the overflowing last node to the start of the next page.
    // Deferred via setTimeout so the browser finishes processing the input event
    // before we manipulate the DOM — prevents cursor loss.
    setTimeout(() => {
      const nextEl = pageRefs.current[pageIdx + 1]?.current
      if (!nextEl || !el.lastChild) return

      const node = el.lastChild
      if (nextEl.innerHTML === '<p><br></p>' || nextEl.innerHTML === '') {
        nextEl.innerHTML = ''
      }
      nextEl.insertBefore(node, nextEl.firstChild)

      // Move cursor to start of next page
      setTimeout(() => {
        const next = pageRefs.current[pageIdx + 1]?.current
        if (!next) return
        next.focus()
        const range = document.createRange()
        range.setStart(next, 0)
        range.collapse(true)
        window.getSelection().removeAllRanges()
        window.getSelection().addRange(range)
        focusedPage.current = pageIdx + 1
      }, 10)

      recalcStats()
      triggerSave()
    }, 0)
  }, [contentH, recalcStats, triggerSave, isGeneratedExam])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  const { makeOnKeyDown } = useEditorKeyboard({
    pageRefs, contentH, pagesLength: pages.length,
    setPages, reflowPage: reflowOnType,
    triggerSave, recalcStats, setShowFind, focusedPage,
    onUndo: undo, onRedo: redo,
  })

  const makeOnInput = useCallback((pageIdx) => () => {
    if (isInjecting.current) return
    reflowOnType(pageIdx)
    recalcStats()
    triggerSave()
    scheduleHistory()
  }, [reflowOnType, recalcStats, triggerSave, scheduleHistory])

  const makeOnPaste = useCallback((pageIdx) => (e) => {
    e.preventDefault()
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
    setTimeout(() => reflowOnType(pageIdx), 0)
  }, [reflowOnType])

  // ── Close menus on outside click ──────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (!e.target.closest('.wc-more-wrap')) setShowMoreMenu(false)
      if (!e.target.closest('.wc-menu-item')) setActiveMenu(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const changeFontSize = (delta) => {
    const next = Math.max(6, fontSize + delta)
    setFontSize(next)
    const sel = window.getSelection()
    if (sel?.rangeCount) {
      let node = sel.getRangeAt(0).commonAncestorContainer
      if (node.nodeType === Node.TEXT_NODE) node = node.parentNode
      node.style.fontSize = `${next}pt`
    }
    triggerSave()
  }

  const insertTable = () => {
    const r = parseInt(prompt('Rows:', '3') || '0')
    const c = parseInt(prompt('Columns:', '3') || '0')
    if (r <= 0 || c <= 0) return
    let html = `<table style="width:100%;border-collapse:collapse;margin:8px 0"><tbody>`
    for (let i = 0; i < r; i++) {
      html += '<tr>'
      for (let j = 0; j < c; j++)
        html += `<td style="border:1px solid #c4c7c5;padding:6px 8px;min-width:40px">&nbsp;</td>`
      html += '</tr>'
    }
    html += '</tbody></table><p><br></p>'
    document.execCommand('insertHTML', false, html)
    setShowMoreMenu(false)
  }

  const doFindReplace = (all) => {
    if (!findText) return
    const escaped = findText.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
    const re = new RegExp(escaped, all ? 'g' : '')
    pageRefs.current.forEach(r => {
      if (r.current) r.current.innerHTML = r.current.innerHTML.replace(re, replaceText)
    })
    triggerSave()
  }

  if (!activeTab) {
    return (
      <div style={S.empty}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📄</div>
        <h3 style={{ color: '#3c4043', marginBottom: '0.5rem' }}>No document open</h3>
        <p style={{ color: '#70757a', fontSize: '0.9rem' }}>Select a document from the sidebar.</p>
      </div>
    )
  }

  const menus = [
    {
      key: 'file', label: 'File', items: [
        { label: '🖨️ Export PDF', action: () => handleExportPdf() },
        { label: '💾 Save now', action: () => triggerSave() },
      ]
    },
    {
      key: 'insert', label: 'Insert', items: [
        { label: '📊 Table…', action: insertTable },
        { label: '🔗 Hyperlink…', action: () => { const u = prompt('URL:'); if (u) cmd('createLink', u) } },
        { label: '➖ Horizontal rule', action: () => cmd('insertHorizontalRule') },
      ]
    },
    {
      key: 'view', label: 'View', items: [
        { label: '🔍 Find & Replace', action: () => setShowFind(true) },
      ]
    },
  ]

  return (
    <div style={S.root} onClick={() => setEditingHF(false)}>

      {/* ── Menu bar ── */}
      <div style={S.menuBar} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', gap: '2px' }}>
          {menus.map(menu => (
            <div key={menu.key} className="wc-menu-item" style={{ position: 'relative' }}>
              <button
                style={{ ...S.menuTab, ...(activeMenu === menu.key ? S.menuTabActive : {}) }}
                onClick={e => { e.stopPropagation(); setActiveMenu(activeMenu === menu.key ? null : menu.key) }}
              >{menu.label}</button>
              {activeMenu === menu.key && (
                <div style={S.dropdown}>
                  {menu.items.map(item => (
                    <button key={item.label} style={S.dropdownItem}
                      onMouseDown={e => { e.preventDefault(); item.action(); setActiveMenu(null) }}
                    >{item.label}</button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.75rem', fontWeight: 600 }}>
          {saveStatus === 'saved' && <span style={{ color: '#146c43' }}>☁️ Saved</span>}
          {saveStatus === 'saving' && <span style={{ color: '#664d03' }}>⏳ Saving…</span>}
          {saveStatus === 'error' && <span style={{ color: '#842029' }}>⚠️ Error</span>}

          {/* Submit-for-review appears only for AI-generated exam papers */}
          {isGeneratedExam && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {submitMsg && (
                <span style={{ color: submitState === 'error' ? '#842029' : '#146c43' }}>{submitMsg}</span>
              )}
              <button
                onClick={handleSubmitForReview}
                disabled={submitState === 'submitting' || submitState === 'done'}
                style={{
                  background: submitState === 'done' ? '#9aa0a6' : '#16a34a',
                  color: '#fff', border: 'none', borderRadius: 6,
                  padding: '0.35rem 0.9rem', fontWeight: 700, fontSize: '0.75rem',
                  cursor: submitState === 'submitting' || submitState === 'done' ? 'default' : 'pointer',
                }}
              >
                {submitState === 'submitting' ? 'Submitting…'
                  : submitState === 'done' ? 'Submitted'
                    : '📤 Submit for Review'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div style={S.toolbar} onClick={e => e.stopPropagation()}>
        <button style={S.tbBtn} onMouseDown={e => { e.preventDefault(); undo() }}>↩</button>
        <button style={S.tbBtn} onMouseDown={e => { e.preventDefault(); redo() }}>↪</button>
        <div style={S.div} />
        <select style={S.tbSel} value={zoomScale} onChange={e => setZoomScale(+e.target.value)}>
          {[50, 75, 90, 100, 125, 150].map(z => <option key={z} value={z}>{z}%</option>)}
        </select>
        <div style={S.div} />
        <select style={S.tbSel} onChange={e => cmd('formatBlock', e.target.value)} defaultValue="p">
          <option value="p">Normal</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </select>
        <select style={S.tbSel} onChange={e => cmd('fontName', e.target.value)} defaultValue="Arial">
          {['Arial', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana'].map(f =>
            <option key={f} value={f}>{f}</option>)}
        </select>
        <button style={S.tbBtn} onMouseDown={e => { e.preventDefault(); changeFontSize(-1) }}>−</button>
        <span style={S.szLabel}>{fontSize}</span>
        <button style={S.tbBtn} onMouseDown={e => { e.preventDefault(); changeFontSize(1) }}>+</button>
        <div style={S.div} />
        <button style={{ ...S.tbBtn, fontWeight: 800 }} onMouseDown={e => { e.preventDefault(); cmd('bold') }}>B</button>
        <button style={{ ...S.tbBtn, fontStyle: 'italic' }} onMouseDown={e => { e.preventDefault(); cmd('italic') }}>I</button>
        <button style={{ ...S.tbBtn, textDecoration: 'underline' }} onMouseDown={e => { e.preventDefault(); cmd('underline') }}>U</button>
        <button style={{ ...S.tbBtn, textDecoration: 'line-through' }} onMouseDown={e => { e.preventDefault(); cmd('strikeThrough') }}>S</button>
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', height: '24px', padding: '0 4px', cursor: 'pointer' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 'bold', pointerEvents: 'none' }}>A</span>
          <input type="color" style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' }}
            onChange={e => cmd('foreColor', e.target.value)} defaultValue="#222" />
        </div>
        <div style={S.div} />
        <button style={S.tbBtn} onMouseDown={e => { e.preventDefault(); cmd('justifyLeft') }}>⫷</button>
        <button style={S.tbBtn} onMouseDown={e => { e.preventDefault(); cmd('justifyCenter') }}>⫸</button>
        <button style={S.tbBtn} onMouseDown={e => { e.preventDefault(); cmd('justifyFull') }}>≡</button>
        <button style={S.tbBtn} onMouseDown={e => { e.preventDefault(); cmd('insertUnorderedList') }}>•≡</button>
        <button style={S.tbBtn} onMouseDown={e => { e.preventDefault(); cmd('insertOrderedList') }}>1≡</button>
        <div style={S.div} />
        <div className="wc-more-wrap" style={{ position: 'relative' }}>
          <button style={{ ...S.tbBtn, color: 'var(--accent)', fontWeight: 600 }}
            onMouseDown={e => { e.stopPropagation(); setShowMoreMenu(m => !m) }}>⚙️ More ▾</button>
          {showMoreMenu && (
            <div style={S.dropdown} onClick={e => e.stopPropagation()}>
              <button style={S.dropdownItem} onMouseDown={e => { e.preventDefault(); cmd('removeFormat'); setShowMoreMenu(false) }}>✕ Clear formatting</button>
              <button style={S.dropdownItem} onMouseDown={e => { e.preventDefault(); insertTable() }}>📊 Insert table…</button>
              <div style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                <span>Highlight</span>
                <input type="color" onChange={e => cmd('hiliteColor', e.target.value)} defaultValue="#ffffff"
                  style={{ width: '32px', height: '20px', cursor: 'pointer', border: '1px solid #ccc', borderRadius: '3px' }} />
              </div>
            </div>
          )}
        </div>
        <button style={{ ...S.tbBtn, background: 'var(--accent)', color: '#fff', marginLeft: 'auto', padding: '4px 14px', borderRadius: '4px' }}
          onClick={handleExportPdf}>🖨️ Export PDF</button>
      </div>

      {/* ── Find & Replace ── */}
      {showFind && (
        <div style={S.findHud} onClick={e => e.stopPropagation()}>
          <input style={S.findInput} placeholder="Find…" value={findText} onChange={e => setFindText(e.target.value)} />
          <input style={S.findInput} placeholder="Replace…" value={replaceText} onChange={e => setReplaceText(e.target.value)} />
          <button style={S.findBtn} onClick={() => doFindReplace(false)}>Replace</button>
          <button style={S.findBtn} onClick={() => doFindReplace(true)}>All</button>
          <button style={{ ...S.findBtn, background: 'transparent', color: '#5f6368' }} onClick={() => setShowFind(false)}>✕</button>
        </div>
      )}

      {/* ── Body ── */}
      <div style={S.body}>
        <div ref={canvasRef} style={S.canvas} onClick={() => setEditingHF(false)}>
          <div style={{
            display: 'flex', flexDirection: 'column', gap: '28px', alignItems: 'center',
            transform: `scale(${zoomScale / 100})`,
            transformOrigin: 'top center',
            paddingBottom: '48px',
          }}>
            {pages.map((_, i) => (
              <PageEditor
                key={i}
                ref={pageRefs.current[i]}
                pageNum={i + 1}
                pageCount={pages.length}
                pageW={pageW}
                pageH={pageH}
                headerText={pageSetup.headerText}
                footerText={pageSetup.footerText}
                editingHF={editingHF}
                onDoubleClickHF={e => { e.stopPropagation(); setEditingHF(true) }}
                onBlurHeader={e => setPageSetup(p => ({ ...p, headerText: e.currentTarget.innerText }))}
                onBlurFooter={e => setPageSetup(p => ({ ...p, footerText: e.currentTarget.innerText }))}
                onInput={makeOnInput(i)}
                onKeyDown={makeOnKeyDown(i)}
                onPaste={makeOnPaste(i)}
                isExam={isGeneratedExam}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Status bar ── */}
      <div style={S.statusBar}>
        <span>📄 {pages.length} page{pages.length !== 1 ? 's' : ''}</span>
        <span>✍️ {wordCount} words</span>
        <span>🔤 {charCount} chars</span>
        <span style={{ marginLeft: 'auto', color: '#9aa0a6', fontSize: '0.72rem' }}>Double-click header/footer to edit</span>
      </div>

    </div>
  )
}

export default WorkspaceContent