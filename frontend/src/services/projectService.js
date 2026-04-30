import api from './api'

const ProjectService = {
  /** GET /api/projects */
  getAll: () => api.get('/api/projects'),

  /** POST /api/projects */
  create: (data) => api.post('/api/projects', data),

  /** GET /api/projects/{projectId} */
  getById: (projectId) => api.get(`/api/projects/${projectId}`),

  /** PUT /api/projects/{projectId} */
  update: (projectId, data) => api.put(`/api/projects/${projectId}`, data),

  /** DELETE /api/projects/{projectId} */
  delete: (projectId) => api.delete(`/api/projects/${projectId}`),
}

export default ProjectService
