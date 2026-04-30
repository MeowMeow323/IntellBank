import api from './api'

const DocumentService = {
  /**
   * Upload a document (multipart/form-data).
   * POST /api/documents/upload
   */
  upload: (formData) =>
    api.post('/api/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  /** GET /api/documents/{documentId} */
  getById: (documentId) => api.get(`/api/documents/${documentId}`),

  /** GET /api/documents/project/{projectId} */
  getByProject: (projectId) => api.get(`/api/documents/project/${projectId}`),

  /**
   * Trigger AI text extraction for a document.
   * POST /api/documents/{documentId}/process
   */
  process: (documentId) => api.post(`/api/documents/${documentId}/process`),
}

export default DocumentService
