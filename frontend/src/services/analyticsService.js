import api from './api'

const AnalyticsService = {
  /** GET /api/analytics/topic-frequency */
  getTopicFrequency: () => api.get('/api/analytics/topic-frequency'),

  /** GET /api/analytics/yearly-trends */
  getYearlyTrends: () => api.get('/api/analytics/yearly-trends'),

  /** GET /api/analytics/high-priority-topics */
  getHighPriorityTopics: () => api.get('/api/analytics/high-priority-topics'),

  /** GET /api/analytics/predicted-topics */
  getPredictedTopics: () => api.get('/api/analytics/predicted-topics'),
}

export default AnalyticsService
