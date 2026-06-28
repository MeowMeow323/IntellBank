import { create } from 'zustand'
import { DocumentService, AIService, PastYearPaperService } from '../services/api'

// 🛠️ Keep track of the active network request so we can cancel it on delete
let autoSaveAbortController = null;

// ── Helper: converts paper_structure from Python into HTML for the editor ──
// Must live OUTSIDE the store object — plain function declarations can't be
// object properties, which caused all the ts(1005) / ts(1128) errors.
// ── JS-side sub-question formatter ───────────────────────────────────────────
// Mirrors QuestionHtmlFormatter.renderSubQuestions() — applied when Java
// buildFormattedPaperHtml is not used (Python markdown fallback path).
function preprocessSubQMarkers(text) {
  // "a)\n   Content" (lone marker line) → "a) Content"
  text = text.replace(/^([ \t]*)(\(?[a-z]{1,3}[).]|\(?[ivx]{1,5}[).])\s*\n[ \t]*/gm, '$1$2 ')
  return text
}

function formatSubQuestionsInHtml(html) {
  return html.replace(/<p([^>]*)>([\s\S]*?)<\/p>/g, (match, _attrs, content) => {
    if (!content.match(/\([a-z]{1,3}\)|\([ivx]{1,5}\)|(?:^|[\s.;:,])[a-z]{1,3}[).]|(?:^|[\s.;:,])[ivx]{1,5}[).]/)) {
      return match
    }
    const formatted = renderSubQuestionsJs(content)
    return formatted || match
  })
}

function renderSubQuestionsJs(text) {
  text = preprocessSubQMarkers(text)
  // Accepts markers after punct/newline/space; allows "a." format and newline between marker and content.
  const MARKER = /(?:(?<=[.!?;:,])[ \t]+|(?<=\n)[ \t]*|^[ \t]*|(?<=[ \t])(?=\([a-z]{1,3}\)|\([ivx]{1,5}\))|(?<=[ \t])(?=[ivx]{2,5}[).][ \t]))(\([a-z]{1,3}\)|\([ivx]{1,5}\)|[a-z]{1,3}[).]|[ivx]{1,5}[).])[ \t]*\n?[ \t]*(?=[A-Za-z'"(0-9])/gm

  const matches = []
  let m
  while ((m = MARKER.exec(text)) !== null) {
    matches.push({ index: m.index, end: MARKER.lastIndex, marker: m[1] })
  }
  if (matches.length === 0) return null

  const pBase = 'margin-bottom:0.8rem;line-height:1.6;text-align:justify;'
  let out = ''
  let pos = 0

  for (let i = 0; i < matches.length; i++) {
    const stem = text.substring(pos, matches[i].index).trim()
    if (stem) out += `<p style="${pBase}">${stem.replace(/\n/g, ' ')}</p>`

    const contentEnd = i + 1 < matches.length ? matches[i + 1].index : text.length
    const fullContent = text.substring(matches[i].end, contentEnd).trim()
    const marker = matches[i].marker
    const isRoman = /\([ivx]+\)/.test(marker)
    const ml = isRoman ? '2.5rem' : '1.5rem'
    const subStyle = `margin-left:${ml};margin-bottom:0.6rem;padding-left:0.75rem;line-height:1.6;text-align:justify;word-wrap:break-word;overflow-wrap:break-word;`

    // Split multi-paragraph sub-questions so each paragraph is a separate moveable node
    const paras = fullContent.split(/\n{2,}/)
    out += `<p style="${subStyle}"><strong style="color:#334155;">${marker}</strong>&nbsp;${paras[0].trim().replace(/\n/g, ' ')}</p>`
    for (let j = 1; j < paras.length; j++) {
      const para = paras[j].trim()
      if (para) out += `<p style="${subStyle}">${para.replace(/\n/g, ' ')}</p>`
    }

    pos = contentEnd
  }
  return out || null
}

function convertMarkdownToHTML(markdownText) {
  let html = markdownText

  // 1. Remove METADATA block
  html = html.replace(/\[METADATA_START\][\s\S]*?\[METADATA_END\]/g, '')

  // 2. Replace hr
  html = html.replace(/^---$/gm, '<hr style="border: 0; border-top: 2px solid #000; margin: 2rem 0;" />')

  // 3. Replace headers
  html = html.replace(/^# (.*)$/gm, '<h1 style="text-align:center; font-family: serif; font-size: 1.5rem; font-weight: bold; margin-bottom: 0.5rem;">$1</h1>')
  html = html.replace(/^### (.*)$/gm, '<h3 style="text-align:center; font-weight: normal; margin: 0 0 2rem 0; font-size: 1.1rem;">$1</h3>')
  html = html.replace(/^## (.*)$/gm, '<h2 style="font-size: 1.25rem; font-weight: bold; margin-bottom: 1rem;">$1</h2>')

  // 4. Strip TOPICS metadata — stored as data attribute on h2, not visible text
  html = html.replace(/^TOPICS: (.*)$/gm, '')

  // 5. Wrap remaining text in <p> (excluding empty lines and HTML tags we just added)
  // Split by double newline, wrap non-HTML blocks in <p>
  const paragraphs = html.split(/\n\s*\n/)
  html = paragraphs.map(p => {
    const trimmed = p.trim()
    if (!trimmed) return ''
    if (trimmed.startsWith('<h') || trimmed.startsWith('<hr') || trimmed.startsWith('<!--PAGE-->')) return trimmed
    return `<p style="margin-bottom: 0.8rem; line-height: 1.6; text-align: justify;">${trimmed.replace(/\n/g, ' ')}</p>`
  }).join('\n')

  return html
}

/**
 * Zustand store for persistent multi-tab workspace state.
 */
const useWorkspaceStore = create((set, get) => ({
  // ── State ────────────────────────────────────────────────────────────────
  tabs: [],
  activeTabId: null,
  currentProjectId: null,
  isLoading: false,
  error: null,

  // ── Actions ──────────────────────────────────────────────────────────────
  loadTabs: async (projectId) => {
    set({ isLoading: true, error: null, currentProjectId: projectId })
    try {
      const response = await DocumentService.getByProject(projectId)
      const tabs = (response.data || []).map((tab) => ({
        ...tab,
        localDraftContent: tab.storageUrl || ''
      }))
      const active = tabs.find((t) => t.isActive) || tabs[0] || null
      set({ tabs, activeTabId: active?.documentId || null, isLoading: false })
    } catch (err) {
      console.error('Error loading workspace tabs:', err)
      set({ error: 'Failed to load workspace tabs', isLoading: false })
    }
  },

  setActiveTab: (tabId) => {
    set({ activeTabId: tabId })
  },

  addTab: async (tabData) => {
    const projectId = get().currentProjectId
    if (!projectId) {
      set({ error: 'No project selected' })
      return
    }

    try {
      const response = await DocumentService.upload(
        projectId,
        tabData.title || 'Untitled Document',
        tabData.type || 'Raw Document',
        null
      )
      const newDocumentTab = response.data

      set((state) => ({
        tabs: [...state.tabs, newDocumentTab],
        activeTabId: newDocumentTab.documentId,
        error: null
      }))
    } catch (err) {
      console.error('Error creating document:', err)
      set({ error: 'Failed to create document' })
    }
  },

  generateTabWithAI: async (paperConfig) => {
    const projectId = get().currentProjectId
    if (!projectId) { set({ error: 'No project selected' }); return null }

    let newDoc
    try {
      // Unique title per generation — the backend's upload reuses a document when
      // the title matches, so a fixed title would make each new paper overwrite the
      // previous one. A timestamp keeps every generated paper as its own document.
      const stamp = new Date().toLocaleString('en-GB', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit'
      })
      const res = await DocumentService.upload(
        projectId,
        `${paperConfig.subject} Exam Paper — ${stamp}`,
        'AI Generated Exam',
        null
      )
      newDoc = res.data
      console.log('✅ Step 1 - Doc created:', newDoc.documentId)
      set((state) => {
        const filtered = state.tabs.filter(t => t.documentId !== newDoc.documentId)
        return {
          tabs: [...filtered, { ...newDoc, localDraftContent: '' }],
          activeTabId: newDoc.documentId,
          error: null
        }
      })
    } catch (err) {
      console.error('❌ Step 1 FAILED:', err)
      set({ error: 'Failed to create document' })
      return null
    }

    let markdownContent
    try {
      const topicsArray = Array.isArray(paperConfig.topics)
        ? paperConfig.topics.filter(Boolean)
        : paperConfig.topics
          ? paperConfig.topics.split(',').map(t => t.trim()).filter(Boolean)
          : ['General']

      console.log('⏳ Step 2 - Calling AI with:', { subject: paperConfig.subject, total_marks: paperConfig.totalMarks, topics: topicsArray })
      const aiRes = await AIService.generatePaper({
        subject: paperConfig.subject,
        total_marks: paperConfig.totalMarks,
        topics: topicsArray,
        document_id: newDoc.documentId,
      })

      if (aiRes.data.error) {
        await get()._discardGeneratedDoc(newDoc.documentId, `Paper generation failed: ${aiRes.data.error}`)
        return null
      }

      markdownContent = aiRes.data.markdown_content
    } catch (err) {
      console.error('❌ Step 2 FAILED:', err)
      // The AI service rejects the request (HTTP 400) when the chosen subject has no
      // questions in the DB — surface that exact reason instead of a generic message.
      const data = err?.response?.data || {}
      const serverMsg = data.error || data.message || data.detail
      await get()._discardGeneratedDoc(newDoc.documentId, serverMsg || 'AI paper generation failed. Please try again.')
      return null
    }

    console.log('⏳ Step 3 - Formatting HTML...')
    let html
    if (markdownContent.includes('<!--PAGE-->')) {
      // Java backend returned pre-formatted paged HTML — use directly
      html = markdownContent
    } else {
      // Fallback: convert Python markdown → HTML, apply sub-question formatting,
      // then inject page-break markers before each Question header.
      html = convertMarkdownToHTML(markdownContent)
      html = formatSubQuestionsInHtml(html)
      html = html.replace(/(<h2\b[^>]*>Question\s+\d+)/g, '<!--PAGE-->$1')
    }
    console.log('✅ Step 3 - has page markers:', html.includes('<!--PAGE-->'))
    console.log('✅ Step 3 - HTML length:', html.length)
    console.log('✅ Step 3 - HTML preview:', html.substring(0, 200))

    console.log('⏳ Step 4 - Saving to store and Supabase...')
    await get().updateTabContent(newDoc.documentId, html)

    // Force the store to update localDraftContent so WorkspaceContent re-renders
    set((state) => ({
      tabs: state.tabs.map(t =>
        t.documentId === newDoc.documentId
          ? { ...t, localDraftContent: html, storageUrl: html }
          : t
      )
    }))

    console.log('✅ Step 4 - Done. Current tabs:', get().tabs.map(t => ({
      id: t.documentId,
      draftLength: t.localDraftContent?.length
    })))

    return newDoc.documentId
  },

  // Roll back the empty placeholder doc created before a failed AI generation,
  // so the workspace isn't littered with blank "Exam Paper" tabs, and record why.
  _discardGeneratedDoc: async (documentId, errorMsg) => {
    set((state) => {
      const remaining = state.tabs.filter((t) => t.documentId !== documentId)
      return {
        tabs: remaining,
        activeTabId: state.activeTabId === documentId
          ? (remaining[remaining.length - 1]?.documentId || null)
          : state.activeTabId,
        error: errorMsg,
      }
    })
    try {
      const rawUser = localStorage.getItem('intellbank_user')
      const email = rawUser ? JSON.parse(rawUser)?.email : null
      if (email) await DocumentService.delete(documentId, email)
    } catch { /* best-effort cleanup — leaving an empty doc is non-fatal */ }
  },

  openPastYearPaperTab: async (pypId) => {
    const projectId = get().currentProjectId
    if (!projectId) { set({ error: 'No project selected' }); return null }

    try {
      const res = await DocumentService.openPastYearPaper(pypId, projectId)
      const doc = res.data
      set((state) => {
        const already = state.tabs.find(t => t.documentId === doc.documentId)
        if (already) return { activeTabId: doc.documentId }
        return {
          tabs: [...state.tabs, { ...doc, localDraftContent: doc.storageUrl || '' }],
          activeTabId: doc.documentId,
          error: null,
        }
      })
      return doc.documentId
    } catch (err) {
      console.error('Failed to open past year paper:', err)
      set({ error: 'Failed to open past year paper' })
      return null
    }
  },

  loadPastYearPapers: async () => {
    try {
      const res = await PastYearPaperService.getAll()
      return res.data || []
    } catch (err) {
      console.error('Failed to load past year papers:', err)
      return []
    }
  },

  // Updates the content in the tab
  updateTabContent: async (documentId, newContent) => {
    // Update both fields so tab-switching always shows the latest typed content.
    // Effect 2 in WorkspaceContent skips DOM injection when the element is focused,
    // so the cursor is never reset mid-typing even though Effect 1 fires here.
    set((state) => ({
      tabs: (state.tabs || []).map((tab) =>
        tab.documentId === documentId
          ? { ...tab, localDraftContent: newContent, storageUrl: newContent, updatedAt: new Date().toISOString() }
          : tab
      )
    }))

    // Cancel any previous auto-save still running over the network
    if (autoSaveAbortController) {
      autoSaveAbortController.abort()
    }
    autoSaveAbortController = new AbortController()

    try {
      const currentState = get()
      const activeTab = (currentState.tabs || []).find(t => t.documentId === documentId)
      if (!activeTab) return

      const projectId = currentState.currentProjectId || activeTab.project?.projectId
      if (!projectId) return

      const textBlob = new Blob([newContent], { type: 'text/plain' })
      const fileName = activeTab.title
        ? `${activeTab.title}.txt`
        : `Document_${documentId}.txt`
      const virtualFile = new File([textBlob], fileName, { type: 'text/plain' })

      await DocumentService.upload(
        projectId,
        activeTab.title || 'Untitled Document',
        activeTab.type || 'Raw Document',
        virtualFile,
        { signal: autoSaveAbortController.signal }
      )

      console.log('Cloud text synchronized successfully.')
    } catch (err) {
      if (err.name === 'AbortError' || err.message === 'canceled') {
        console.log('Previous save request cancelled safely.')
      } else {
        console.error('Cloud auto-save deferred:', err)
        throw err
      }
    }
  },

  // Rename a document — persists the new title to the DB, then updates the tab in place.
  renameTab: async (documentId, title) => {
    const next = (title || '').trim()
    if (!next) return
    try {
      await DocumentService.rename(documentId, next)
      set((state) => ({
        tabs: (state.tabs || []).map((t) =>
          t.documentId === documentId ? { ...t, title: next } : t
        ),
        error: null,
      }))
    } catch (err) {
      console.error('Failed to rename document:', err)
      set({ error: 'Failed to rename document' })
    }
  },

  removeTab: async (documentId, email) => {
    // Instantly cut off any active save requests to unlock the database row
    if (autoSaveAbortController) {
      autoSaveAbortController.abort()
      autoSaveAbortController = null
    }

    try {
      await DocumentService.delete(documentId, email)

      set((state) => {
        const remaining = state.tabs.filter((t) => t.documentId !== documentId)
        return {
          tabs: remaining,
          activeTabId:
            state.activeTabId === documentId
              ? remaining[0]?.documentId || null
              : state.activeTabId,
          error: null
        }
      })
    } catch (err) {
      console.error('Failed to delete document tab safely:', err)
      set({ error: 'Failed to delete document' })
    }
  },

  clearWorkspace: () => set({ tabs: [], activeTabId: null, currentProjectId: null }),
}))

export default useWorkspaceStore