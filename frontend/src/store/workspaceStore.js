import { create } from 'zustand'
import { WorkspaceService } from '../services/api'

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
      const response = await WorkspaceService.getTabs(projectId)
      const tabs = response.data
      const active = tabs.find((t) => t.isActive) || tabs[0] || null
      set({ tabs, activeTabId: active?.id || null, isLoading: false })
    } catch (err) {
      set({ error: 'Failed to load workspace tabs', isLoading: false })
    }
  },

  setActiveTab: async (tabId) => {
    set({ activeTabId: tabId })
    try {
      await WorkspaceService.setActiveTab(tabId)
    } catch {
      // Silent fail – local state still updated
    }
  },

  addTab: async (tabData) => {
    try {
      const response = await WorkspaceService.createTab({
        ...tabData,
        projectId: get().currentProjectId,
      })
      const newTab = response.data
      set((state) => ({ tabs: [...state.tabs, newTab], activeTabId: newTab.id }))
    } catch (err) {
      set({ error: 'Failed to create tab' })
    }
  },

  updateTab: async (tabId, data) => {
    try {
      const response = await WorkspaceService.updateTab(tabId, data)
      set((state) => ({
        tabs: state.tabs.map((t) => (t.id === tabId ? response.data : t)),
      }))
    } catch {
      set({ error: 'Failed to update tab' })
    }
  },

  removeTab: async (tabId) => {
    try {
      await WorkspaceService.deleteTab(tabId)
      set((state) => {
        const remaining = state.tabs.filter((t) => t.id !== tabId)
        return {
          tabs: remaining,
          activeTabId:
            state.activeTabId === tabId
              ? remaining[0]?.id || null
              : state.activeTabId,
        }
      })
    } catch {
      set({ error: 'Failed to delete tab' })
    }
  },

  clearWorkspace: () => set({ tabs: [], activeTabId: null, currentProjectId: null }),
}))

export default useWorkspaceStore
