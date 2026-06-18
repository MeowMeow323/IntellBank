import { create } from 'zustand'
import { DocumentService, AIService, PastYearPaperService } from '../services/api'

// 🛠️ Keep track of the active network request so we can cancel it on delete
let autoSaveAbortController = null;

// ── Helper: converts paper_structure from Python into HTML for the editor ──
// Must live OUTSIDE the store object — plain function declarations can't be
// object properties, which caused all the ts(1005) / ts(1128) errors.
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

  // 4. Replace TOPICS
  html = html.replace(/^TOPICS: (.*)$/gm, '<p style="margin-bottom: 1rem; font-style: italic; color: #475569;">[Topics: $1]</p>')

  // 5. Wrap remaining text in <p> (excluding empty lines and HTML tags we just added)
  // Split by double newline, wrap non-HTML blocks in <p>
  const paragraphs = html.split(/\n\s*\n/)
  html = paragraphs.map(p => {
    const trimmed = p.trim()
    if (!trimmed) return ''
    if (trimmed.startsWith('<h') || trimmed.startsWith('<hr') || trimmed.startsWith('<!--PAGE-->')) return trimmed
    return `<p style="margin-bottom: 0.5rem; line-height: 1.6;">${trimmed.replace(/\n/g, '<br/>')}</p>`
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
      const res = await DocumentService.upload(
        projectId,
        `${paperConfig.subject} Exam Paper`,
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
        set({ error: `Paper generation failed: ${aiRes.data.error}` })
        return newDoc.documentId
      }

      markdownContent = aiRes.data.markdown_content
    } catch (err) {
      console.error('❌ Step 2 FAILED:', err)
      set({ error: 'AI paper generation failed' })
      return newDoc.documentId
    }

    console.log('⏳ Step 3 - Formatting HTML...')
    const html = convertMarkdownToHTML(markdownContent)
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
    // Instantly update local memory so typing feels snappy
    set((state) => ({
      tabs: (state.tabs || []).map((tab) =>
        tab.documentId === documentId
          ? { ...tab, localDraftContent: newContent, storageUrl: newContent }
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