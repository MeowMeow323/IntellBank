import axios from 'axios'

const API = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080',
})

// Attach JWT to every request
API.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  register: (data) => API.post('/api/auth/register', data),
  login:    (data) => API.post('/api/auth/login', data),
  me:       ()     => API.get('/api/auth/me'),
}

// ── Projects ──────────────────────────────────────────────────────────────────
export const projectApi = {
  getAll:   ()              => API.get('/api/projects'),
  getById:  (id)            => API.get(`/api/projects/${id}`),
  create:   (projectName)   => API.post('/api/projects', { projectName }),
  update:   (id, projectName) => API.put(`/api/projects/${id}`, { projectName }),
  delete:   (id)            => API.delete(`/api/projects/${id}`),
}

// ── Documents ────────────────────────────────────────────────────────────────
export const documentApi = {
  getByProject: (projectId)             => API.get(`/api/documents/by-project/${projectId}`),
  getById:      (documentId)            => API.get(`/api/documents/${documentId}`),
  upload:       (projectId, title, type, file) => {
    const fd = new FormData()
    fd.append('projectId', projectId)
    fd.append('title', title)
    fd.append('type', type)
    if (file) fd.append('file', file)
    return API.post('/api/documents/upload', fd)
  },
  delete:       (documentId)            => API.delete(`/api/documents/${documentId}`),
}

// ── Questions ─────────────────────────────────────────────────────────────────
export const questionApi = {
  getAll:       ()           => API.get('/api/questions'),
  getById:      (id)         => API.get(`/api/questions/${id}`),
  getByPyp:     (pypId)      => API.get(`/api/questions/by-pyp/${pypId}`),
  getByDocument:(docId)      => API.get(`/api/questions/by-document/${docId}`),
  create:       (data)       => API.post('/api/questions', data),
  update:       (id, data)   => API.put(`/api/questions/${id}`, data),
  delete:       (id)         => API.delete(`/api/questions/${id}`),
}

// ── Exams (AI Generated – stored as Documents) ────────────────────────────────
export const examApi = {
  /**
   * Generate an AI exam.
   * Returns: { documentId, title, type: "AI Generated Exam", totalScore, questions }
   */
  generate: (data) => API.post('/api/exams/generate', data),
  getById:  (documentId) => API.get(`/api/exams/${documentId}`),
}

// ── Submissions ───────────────────────────────────────────────────────────────
export const submissionApi = {
  /** Submit: only allowed when document.type === "AI Generated Exam" */
  submit:       (documentId) => API.post('/api/submissions', { documentId }),
  getByDocument:(documentId) => API.get(`/api/submissions/by-document/${documentId}`),
  getById:      (id)         => API.get(`/api/submissions/${id}`),
}

// ── Verification (Solution-based) ─────────────────────────────────────────────
export const verificationApi = {
  /** Pending = solutions where isVerified = false */
  getPending: ()            => API.get('/api/verification/pending'),
  getById:    (solutionId)  => API.get(`/api/verification/${solutionId}`),
  approve:    (solutionId)  => API.post(`/api/verification/${solutionId}/approve`),
  reject:     (solutionId)  => API.post(`/api/verification/${solutionId}/reject`),
  edit:       (solutionId, data) => API.put(`/api/verification/${solutionId}`, data),
}

// ── AI Gateway ────────────────────────────────────────────────────────────────
export const aiApi = {
  generateQuestions: (data) => API.post('/api/ai/generate/question', data),
  generateSolution:  (data) => API.post('/api/ai/generate/solution', data),
  classifyQuestion:  (data) => API.post('/api/ai/classify/question', data),
  predictTopics:     (data) => API.post('/api/ai/predict/topics', data),
}

export default API
