import { create } from 'zustand'
import AuthService from '../services/authService'

/**
 * Zustand store for authentication state.
 */
const useAuthStore = create((set) => ({
  // ── State ────────────────────────────────────────────────────────────────
  user: AuthService.getLocalUser(),
  token: localStorage.getItem('intellbank_token') || null,
  isAuthenticated: AuthService.isAuthenticated(),
  isLoading: false,
  error: null,

  // ── Actions ──────────────────────────────────────────────────────────────
  login: async (credentials) => {
    set({ isLoading: true, error: null })
    try {
      const response = await AuthService.login(credentials)
      const { token, user } = response.data
      set({ user, token, isAuthenticated: true, isLoading: false })
    } catch (err) {
      set({
        error: err.response?.data?.message || 'Login failed',
        isLoading: false,
      })
      throw err
    }
  },

  register: async (data) => {
    set({ isLoading: true, error: null })
    try {
      await AuthService.register(data)
      set({ isLoading: false })
    } catch (err) {
      set({
        error: err.response?.data?.message || 'Registration failed',
        isLoading: false,
      })
      throw err
    }
  },

  logout: () => {
    AuthService.logout()
    set({ user: null, token: null, isAuthenticated: false })
  },

  clearError: () => set({ error: null }),

  // Helper: check role
  hasRole: (role) => {
    const user = useAuthStore.getState().user
    return user?.role === role
  },

  isEducatorOrAdmin: () => {
    const user = useAuthStore.getState().user
    return user?.role === 'EDUCATOR' || user?.role === 'ADMIN'
  },
}))

export default useAuthStore
