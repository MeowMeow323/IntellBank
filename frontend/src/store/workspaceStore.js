import { create } from 'zustand'
import { DocumentService } from '../services/api'

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
    set({ activeTabId: tabId });
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

  // Updates the content in the tab
  updateTabContent: async (documentId, newContent) => {
    // 1. Instantly update the text in local frontend memory so typing is flawless
    set((state) => ({
      tabs: (state.tabs || []).map((tab) =>
        tab.documentId === documentId ? { ...tab, localDraftContent: newContent, storageUrl: newContent } : tab
      )
    }));

    try {
      const currentState = get();
      const activeTab = (currentState.tabs || []).find(t => t.documentId === documentId);
      if (!activeTab) return;

      const projectId = currentState.currentProjectId || activeTab.project?.projectId;
      if (!projectId) return;

      // 2. Wrap text into a clean file blob
      const textBlob = new Blob([newContent], { type: 'text/plain' });
      const fileName = activeTab.title ? `${activeTab.title}.txt` : `Document_${documentId}.txt`;
      const virtualFile = new File([textBlob], fileName, { type: 'text/plain' });

      // 3. Post to backend
      await DocumentService.upload(
        projectId,
        activeTab.title || 'Untitled Document',
        activeTab.type || 'Raw Document',
        virtualFile
      );

      console.log("Cloud text synchronized successfully.");
    } catch (err) {
      console.error("Cloud auto-save deferred:", err);
      throw err;
    }
  },

  removeTab: async (documentId) => {
    try {
      await DocumentService.delete(documentId)

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
      set({ error: 'Failed to delete document' })
    }
  },

  clearWorkspace: () => set({ tabs: [], activeTabId: null, currentProjectId: null }),
}))

export default useWorkspaceStore
