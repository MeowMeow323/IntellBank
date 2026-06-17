import axios from 'axios'

// ── Axios Instance ────────────────────────────────────────────────────────────
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080',
})

// Attach JWT token to every outgoing request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('intellbank_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ── Auth Service ──────────────────────────────────────────────────────────────
export const AuthService = {
  register: (data) => api.post('/api/auth/register', data),

  login: async (credentials) => {
    const response = await api.post('/api/auth/login', credentials)
    const { token, userId, email, fullName, role } = response.data
    const user = { userId, email, fullName, username: email, role }
    localStorage.setItem('intellbank_token', token)
    localStorage.setItem('intellbank_user', JSON.stringify(user))
    return response
  },

  getMe: () => api.get('/api/auth/me'),

  logout: () => {
    localStorage.removeItem('intellbank_token')
    localStorage.removeItem('intellbank_user')
  },

  getLocalUser: () => {
    const raw = localStorage.getItem('intellbank_user')
    if (!raw) return null
    try {
      return JSON.parse(raw)
    } catch (e) {
      console.warn("Corrupted user data in localStorage, clearing it.")
      localStorage.removeItem('intellbank_user')
      return null
    }
  },

  isAuthenticated: () => !!localStorage.getItem('intellbank_token'),
}

// ── Project Service ───────────────────────────────────────────────────────────
export const ProjectService = {
  getAll: () => api.get('/api/projects'),
  create: (data) => api.post('/api/projects', data),
  getById: (projectId) => api.get(`/api/projects/${projectId}`),
  update: (projectId, data) => api.put(`/api/projects/${projectId}`, data),
  delete: (projectId) => api.delete(`/api/projects/${projectId}`),
}

// ── Document Service ──────────────────────────────────────────────────────────
export const DocumentService = {
  getByProject: (projectId) => api.get(`/api/documents/by-project/${projectId}`),
  getById: (documentId) => api.get(`/api/documents/${documentId}`),
  upload: (projectId, title, type = "Raw Document", file = null) => {
    const fd = new FormData()
    fd.append('projectId', projectId)
    fd.append('title', title)
    fd.append('type', type)
    if (file) fd.append('file', file)
    return api.post('/api/documents/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  delete: (documentId, email) => api.delete(`/api/documents/${documentId}`, { params: { email } }),
  process: (documentId) => api.post(`/api/documents/${documentId}/process`),
}

// ── Exam Service ──────────────────────────────────────────────────────────────
export const ExamService = {
  generate: (data) => api.post('/api/exams/generate', data),
  getById: (examId) => api.get(`/api/exams/${examId}`),
  getByUser: (userId) => api.get(`/api/exams/user/${userId}`),
  submit: (examId, answers) => api.post(`/api/exams/${examId}/submit`, { answers }),
}

// ── Submission Service ────────────────────────────────────────────────────────
export const SubmissionService = {
  submit: (documentId) => api.post('/api/submissions', { documentId }),
  getByDocument: (documentId) => api.get(`/api/submissions/by-document/${documentId}`),
  getById: (id) => api.get(`/api/submissions/${id}`),
}

// ── Question Service ──────────────────────────────────────────────────────────
export const QuestionService = {
  getAll: (params) => api.get('/api/questions', { params }),
  getById: (questionId) => api.get(`/api/questions/${questionId}`),
  create: (data) => api.post('/api/questions', data),
  update: (questionId, data) => api.put(`/api/questions/${questionId}`, data),
  delete: (questionId) => api.delete(`/api/questions/${questionId}`),
  getByTopic: (topic) => api.get('/api/questions/by-topic', { params: { topic } }),
  getBySubject: (subject) => api.get('/api/questions/by-subject', { params: { subject } }),
  getByPyp: (pypId) => api.get(`/api/questions/by-pyp/${pypId}`),
  getByDocument: (docId) => api.get(`/api/questions/by-document/${docId}`),
}

// ── Verification Service ──────────────────────────────────────────────────────
export const VerificationService = {
  getPending: () => api.get('/api/verification/pending'),
  getById: (id) => api.get(`/api/verification/${id}`),
  approve: (id) => api.put(`/api/verification/${id}/approve`),
  reject: (id, reason) => api.put(`/api/verification/${id}/reject`, { reason }),
  edit: (id, data) => api.put(`/api/verification/${id}/edit`, data),
}

// ── Workspace Service ─────────────────────────────────────────────────────────
export const WorkspaceService = {
  getTabs: (projectId) => api.get(`/api/workspace/${projectId}/tabs`),
  createTab: (data) => api.post('/api/workspace/tabs', data),
  updateTab: (tabId, data) => api.put(`/api/workspace/tabs/${tabId}`, data),
  deleteTab: (tabId) => api.delete(`/api/workspace/tabs/${tabId}`),
  setActiveTab: (tabId) => api.put(`/api/workspace/tabs/${tabId}/active`),
}

// ── Analytics Service ─────────────────────────────────────────────────────────
export const AnalyticsService = {
  getTopicFrequency: () => api.get('/api/analytics/topic-frequency'),
  getYearlyTrends: () => api.get('/api/analytics/yearly-trends'),
  getHighPriorityTopics: () => api.get('/api/analytics/high-priority-topics'),
  getPredictedTopics: () => api.get('/api/analytics/predicted-topics'),
}

// ── Metadata Service ──────────────────────────────────────────────────────────
export const MetadataService = {
  getSubjectTopics: () => api.get('/api/metadata/subject-topics'),
}

// ── AI Gateway Service ────────────────────────────────────────────────────────
export const AIService = {
  generateQuestions: (data) => api.post('/api/ai/generate/question', data),
  generateSolution:  (data) => api.post('/api/ai/generate/solution', data),
  classifyQuestion:  (data) => api.post('/api/ai/classify/question', data),
  predictTopics:     (data) => api.post('/api/ai/predict/topics',    data),
  generatePaper:     (data) => api.post('/api/ai/generate/paper',    data),  // new
}
// Default export is the Axios client instance
export default api