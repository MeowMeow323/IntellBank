import api from './api'

const WorkspaceService = {
  /** GET /api/workspace/{projectId}/tabs */
  getTabs: (projectId) => api.get(`/api/workspace/${projectId}/tabs`),

  /** POST /api/workspace/tabs */
  createTab: (data) => api.post('/api/workspace/tabs', data),

  /** PUT /api/workspace/tabs/{tabId} */
  updateTab: (tabId, data) => api.put(`/api/workspace/tabs/${tabId}`, data),

  /** DELETE /api/workspace/tabs/{tabId} */
  deleteTab: (tabId) => api.delete(`/api/workspace/tabs/${tabId}`),

  /** PUT /api/workspace/tabs/{tabId}/active */
  setActiveTab: (tabId) => api.put(`/api/workspace/tabs/${tabId}/active`),
}

export default WorkspaceService
