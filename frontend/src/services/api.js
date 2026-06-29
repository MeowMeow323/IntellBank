import axios from 'axios'

// ── Axios Instance ────────────────────────────────────────────────────────────
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080',
})

// ── Token Storage ──────────────────────────────────────────────────────────────
// "Remember me" → localStorage (survives browser restarts).
// Unchecked     → sessionStorage (cleared when the tab/browser closes).
// Reads check both so the rest of the app doesn't care which was used.
const TOKEN_KEY = 'intellbank_token'
const USER_KEY = 'intellbank_user'

const tokenStorage = {
  getToken: () => localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY),
  getUserRaw: () => localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY),
  set: (token, user, remember) => {
    const store = remember ? localStorage : sessionStorage
    const other = remember ? sessionStorage : localStorage
    store.setItem(TOKEN_KEY, token)
    store.setItem(USER_KEY, JSON.stringify(user))
    other.removeItem(TOKEN_KEY)
    other.removeItem(USER_KEY)
  },
  clear: () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    sessionStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(USER_KEY)
  },
}

// Attach JWT token to every outgoing request
api.interceptors.request.use((config) => {
  const token = tokenStorage.getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// On an expired/invalid token (401) for an authenticated request, clear the
// session and bounce to login with a notice. Auth endpoints are excluded so a
// bad-credentials 401 doesn't trigger a redirect loop on the login page.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    const url = error.config?.url || ''
    const isAuthCall = url.includes('/api/auth/')
    if (status === 401 && !isAuthCall && tokenStorage.getToken()) {
      tokenStorage.clear()
      if (!window.location.pathname.startsWith('/login')) {
        window.location.assign('/login?expired=1')
      }
    }
    return Promise.reject(error)
  }
)

// ── Auth Service ──────────────────────────────────────────────────────────────
export const AuthService = {
  register: (data) => api.post('/api/auth/register', data),

  login: async (credentials, remember = false) => {
    const response = await api.post('/api/auth/login', credentials)
    const { token, userId, email, fullName, role } = response.data
    const user = { userId, email, fullName, username: email, role }
    tokenStorage.set(token, user, remember)
    return response
  },

  forgotPassword: (email) => api.post('/api/auth/forgot-password', { email }),

  resetPassword: (token, password) =>
    api.post('/api/auth/reset-password', { token, password }),

  logout: () => tokenStorage.clear(),

  getLocalUser: () => {
    const raw = tokenStorage.getUserRaw()
    if (!raw) return null
    try {
      return JSON.parse(raw)
    } catch (e) {
      console.warn("Corrupted user data in storage, clearing it.")
      tokenStorage.clear()
      return null
    }
  },

  isAuthenticated: () => !!tokenStorage.getToken(),

  getToken: () => tokenStorage.getToken(),
}

// ── Project Service ───────────────────────────────────────────────────────────
export const ProjectService = {
  getAll: () => api.get('/api/projects'),
  create: (data) => api.post('/api/projects', data),
  update: (projectId, data) => api.put(`/api/projects/${projectId}`, data),
  delete: (projectId) => api.delete(`/api/projects/${projectId}`),
}

// ── Document Service ──────────────────────────────────────────────────────────
export const DocumentService = {
  getByProject: (projectId) => api.get(`/api/documents/by-project/${projectId}`),
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
  rename: (documentId, title) => api.put(`/api/documents/${documentId}/rename`, { title }),
  delete: (documentId, email) => api.delete(`/api/documents/${documentId}`, { params: { email } }),
  process: (documentId) => api.post(`/api/documents/${documentId}/process`),
  openPastYearPaper: (pypId, projectId) => api.post('/api/documents/open-past-year-paper', { pypId, projectId }),
}

// ── Exam Service ──────────────────────────────────────────────────────────────
export const ExamService = {
  generate: (data) => api.post('/api/exams/generate', data),
  submit: (examId, answers) => api.post(`/api/exams/${examId}/submit`, { answers }),
}

// ── Submission Service ────────────────────────────────────────────────────────
export const SubmissionService = {
  // Student submits an answered "AI Generated Exam" (one active submission at a time)
  submit: (documentId) => api.post('/api/submissions', { documentId }),
  // Student withdraws their own PENDING submission (frees the slot)
  unsubmit: (id) => api.post(`/api/submissions/${id}/unsubmit`),
  // The logged-in student's full submission history (Submissions page)
  getMine: () => api.get('/api/submissions/mine'),
  // The student's own reviewed answers (educator /verification routes are educator-only)
  reviewMine: (id) => api.get(`/api/submissions/${id}/review`),
}

// ── Question Service ──────────────────────────────────────────────────────────
export const QuestionService = {
  getAll: (params) => api.get('/api/questions', { params }),
  create: (data) => api.post('/api/questions', data),
  update: (questionId, data) => api.put(`/api/questions/${questionId}`, data),
  delete: (questionId) => api.delete(`/api/questions/${questionId}`),
  getByPyp: (pypId) => api.get(`/api/questions/by-pyp/${pypId}`),
}

// ── Verification Service ──────────────────────────────────────────────────────
export const VerificationService = {
  // AI-solution verification (HITL)
  getPending: () => api.get('/api/verification/pending'),
  approve: (id) => api.put(`/api/verification/${id}/approve`),
  reject: (id, reason) => api.put(`/api/verification/${id}/reject`, { reason }),
  edit: (id, data) => api.put(`/api/verification/${id}/edit`, data),

  // Student-submission grading (per-question marks → topic marks → weakness)
  getPendingSubmissions: () => api.get('/api/verification/submissions/pending'),
  // Enriched queue for the Verification list (all statuses + subject/student/date)
  getSubmissionQueue: () => api.get('/api/verification/submissions/queue'),
  reviewSubmission: (id) => api.get(`/api/verification/submissions/${id}`),
  // marks: { "<questionId>": <awardedMarks>, ... }; comments: { "<topicName>": "<feedback>", ... }
  gradeSubmission: (id, marks, comments = {}) =>
    api.put(`/api/verification/submissions/${id}/grade`, { marks, comments }),
  returnSubmission: (id) => api.put(`/api/verification/submissions/${id}/return`),
}

// ── Analytics Service ─────────────────────────────────────────────────────────
export const AnalyticsService = {
  // Personal per-topic mastery (heatmap) + weaknesses (<50%) from StudentPerformance
  getMyMastery: () => api.get('/api/analytics/my-mastery'),
  // All subject names in the DB — for the subject selector
  getSubjects: () => api.get('/api/analytics/subjects'),
  // Subjects that actually have trained topic-prediction data
  getPredictionSubjects: () => api.get('/api/analytics/prediction-subjects'),
  // Topics likely to appear next, from the Python K-Means predictor
  getPredictedTopics: (subject) =>
    api.get('/api/analytics/predicted-topics', { params: subject ? { subject } : {} }),
  // Cohort "Class Weakness" analysis (our own trained model) for a subject
  getClassWeaknesses: (subject) =>
    api.get('/api/analytics/class-weaknesses', { params: { subject } }),
  // Topics × Students mastery matrix for the educator class heat map
  getClassMatrix: (subject) =>
    api.get('/api/analytics/class-matrix', { params: { subject } }),
  // Per-topic question count + difficulty breakdown (limit = N latest papers, omit for all)
  getTopicFrequency: (subject, limit) =>
    api.get('/api/analytics/topic-frequency', { params: limit ? { subject, limit } : { subject } }),
  // Year-by-year topic coverage from past-year-paper upload dates
  getSubjectTrend: (subject, limit) =>
    api.get('/api/analytics/subject-trend', { params: limit ? { subject, limit } : { subject } }),
}

// ── Past Year Paper Service ───────────────────────────────────────────────────
export const PastYearPaperService = {
  getAll: () => api.get('/api/past-year-papers'),
  getById: (pypId) => api.get(`/api/past-year-papers/${pypId}`),
  preview: (file) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post('/api/past-year-papers/preview', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  upload: (title, subject, file, { courseCode, examSession } = {}, onProgress) => {
    const fd = new FormData()
    fd.append('title', title)
    fd.append('subject', subject)
    fd.append('file', file)
    if (courseCode) fd.append('courseCode', courseCode)
    if (examSession) fd.append('examSession', examSession)
    return api.post('/api/past-year-papers/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress
        ? (e) => onProgress(e.total ? Math.round((e.loaded * 100) / e.total) : 0)
        : undefined,
    })
  },
  process: (pypId) => api.post(`/api/past-year-papers/${pypId}/process`),
  getProgress: (pypId) => api.get(`/api/past-year-papers/${pypId}/progress`),
  generateSolutions: (pypId) => api.post(`/api/past-year-papers/${pypId}/generate-solutions`),
  generateSingleSolution: (questionId) => api.post(`/api/past-year-papers/questions/${questionId}/generate-solution`),
  getSolutions: (pypId) => api.get(`/api/past-year-papers/${pypId}/solutions`),
  update: (pypId, data) => api.patch(`/api/past-year-papers/${pypId}`, data),
  delete: (pypId) => api.delete(`/api/past-year-papers/${pypId}`),
}

// ── Metadata Service ──────────────────────────────────────────────────────────
export const MetadataService = {
  getSubjectTopics: () => api.get('/api/metadata/subject-topics'),
  getSubjects: () => api.get('/api/metadata/subjects'),
  createSubject: (name) => api.post('/api/metadata/subjects', { name }),
  getTopics: (subjectId) => api.get('/api/metadata/topics', { params: { subjectId } }),
  createTopic: (subjectId, name) => api.post('/api/metadata/topics', { subjectId, name }),
  deleteTopic: (topicId) => api.delete(`/api/metadata/topics/${topicId}`),
}

// ── Specialization Service (admin only) ───────────────────────────────────────
export const SpecializationService = {
  // Every educator with the subject ids they're currently assigned to
  getEducators: () => api.get('/api/admin/specializations/educators'),
  // All subjects — the assignable options
  getSubjects: () => api.get('/api/admin/specializations/subjects'),
  // Replace an educator's specialization set
  setForEducator: (educatorId, subjectIds) =>
    api.put(`/api/admin/specializations/educators/${educatorId}`, { subjectIds }),
}

// ── AI Gateway Service ────────────────────────────────────────────────────────
export const AIService = {
  generatePaper: (data) => api.post('/api/ai/generate/paper', data),
}
// Default export is the Axios client instance
export default api