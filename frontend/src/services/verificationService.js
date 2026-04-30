import api from './api'

const VerificationService = {
  /** GET /api/verification/pending */
  getPending: () => api.get('/api/verification/pending'),

  /** GET /api/verification/{questionId} */
  getById: (questionId) => api.get(`/api/verification/${questionId}`),

  /** PUT /api/verification/{questionId}/approve */
  approve: (questionId) => api.put(`/api/verification/${questionId}/approve`),

  /** PUT /api/verification/{questionId}/reject */
  reject: (questionId, reason) =>
    api.put(`/api/verification/${questionId}/reject`, { reason }),

  /** PUT /api/verification/{questionId}/edit */
  edit: (questionId, data) => api.put(`/api/verification/${questionId}/edit`, data),
}

export default VerificationService
