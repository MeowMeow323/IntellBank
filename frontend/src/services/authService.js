import api from './api'

const AuthService = {
  /**
   * Register a new user account.
   * POST /api/auth/register
   */
  register: (data) => api.post('/api/auth/register', data),

  /**
   * Login and receive a JWT token.
   * POST /api/auth/login
   */
  login: async (credentials) => {
    const response = await api.post('/api/auth/login', credentials)
    const { token, user } = response.data
    // Persist token and user info to localStorage
    localStorage.setItem('intellbank_token', token)
    localStorage.setItem('intellbank_user', JSON.stringify(user))
    return response
  },

  /**
   * Get the currently authenticated user's profile.
   * GET /api/auth/me
   */
  getMe: () => api.get('/api/auth/me'),

  /**
   * Clear local session.
   */
  logout: () => {
    localStorage.removeItem('intellbank_token')
    localStorage.removeItem('intellbank_user')
  },

  /**
   * Get user from localStorage (no network call).
   */
  getLocalUser: () => {
    const raw = localStorage.getItem('intellbank_user')
    return raw ? JSON.parse(raw) : null
  },

  /**
   * Check if a user is logged in locally.
   */
  isAuthenticated: () => !!localStorage.getItem('intellbank_token'),
}

export default AuthService
