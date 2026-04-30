import api from './api'

const ExamService = {
  /**
   * Generate an exam.
   * POST /api/exams/generate
   * Body: { subject, topic, difficulty, totalMarks, numQuestions, generationType }
   */
  generate: (data) => api.post('/api/exams/generate', data),

  /** GET /api/exams/{examId} */
  getById: (examId) => api.get(`/api/exams/${examId}`),

  /** GET /api/exams/user/{userId} */
  getByUser: (userId) => api.get(`/api/exams/user/${userId}`),

  /**
   * Submit an exam attempt.
   * POST /api/exams/{examId}/submit
   * Body: { answers: { questionId: answerText } }
   */
  submit: (examId, answers) => api.post(`/api/exams/${examId}/submit`, { answers }),
}

export default ExamService
