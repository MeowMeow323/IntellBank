import api from './api'

const QuestionService = {
  /** GET /api/questions */
  getAll: (params) => api.get('/api/questions', { params }),

  /** GET /api/questions/{questionId} */
  getById: (questionId) => api.get(`/api/questions/${questionId}`),

  /** POST /api/questions */
  create: (data) => api.post('/api/questions', data),

  /** PUT /api/questions/{questionId} */
  update: (questionId, data) => api.put(`/api/questions/${questionId}`, data),

  /** DELETE /api/questions/{questionId} */
  delete: (questionId) => api.delete(`/api/questions/${questionId}`),

  /** GET /api/questions/by-topic?topic=X */
  getByTopic: (topic) => api.get('/api/questions/by-topic', { params: { topic } }),

  /** GET /api/questions/by-subject?subject=X */
  getBySubject: (subject) => api.get('/api/questions/by-subject', { params: { subject } }),
}

export default QuestionService
