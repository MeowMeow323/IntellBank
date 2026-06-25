import { create } from 'zustand'
import { AuthService } from '../services/api'

/**
 * Turn an Axios error into a user-friendly message. Network/timeout errors have
 * no response, so distinguish them from real server-side validation errors.
 */
const resolveError = (err, fallback) => {
  if (err?.response) {
    return err.response.data?.message || fallback
  }
  return "Can't reach the server. Check your connection and try again."
}

/**
 * Zustand store for authentication state.
 */
const useAuthStore = create((set) => ({
  // ── State ────────────────────────────────────────────────────────────────
  user: AuthService.getLocalUser(),
  token: AuthService.getToken(),
  isAuthenticated: AuthService.isAuthenticated(),
  isLoading: false,
  error: null,

  // ── Actions ──────────────────────────────────────────────────────────────
  login: async (credentials, remember = false) => {
    set({ isLoading: true, error: null })
    try {
      await AuthService.login(credentials, remember)
      // AuthService persists token+user; mirror the canonical copy into state.
      set({
        user: AuthService.getLocalUser(),
        token: AuthService.getToken?.() ?? null,
        isAuthenticated: true,
        isLoading: false,
      })
    } catch (err) {
      set({
        error: resolveError(err, 'Login failed'),
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
        error: resolveError(err, 'Registration failed'),
        isLoading: false,
      })
      throw err
    }
  },

  // Request a reset link. Returns the generic server message on success.
  forgotPassword: async (email) => {
    set({ isLoading: true, error: null })
    try {
      const response = await AuthService.forgotPassword(email)
      set({ isLoading: false })
      return response.data?.message
    } catch (err) {
      set({
        error: resolveError(err, 'Could not send reset email'),
        isLoading: false,
      })
      throw err
    }
  },

  // Complete a reset using the token from the email link.
  resetPassword: async (token, password) => {
    set({ isLoading: true, error: null })
    try {
      const response = await AuthService.resetPassword(token, password)
      set({ isLoading: false })
      return response.data?.message
    } catch (err) {
      set({
        error: resolveError(err, 'Could not reset password'),
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
