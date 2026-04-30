import { create } from 'zustand'
import ExamService from '../services/examService'

/**
 * Zustand store for exam simulator state.
 */
const useExamStore = create((set) => ({
  // ── State ────────────────────────────────────────────────────────────────
  currentExam: null,          // Generated exam object
  answers: {},                // { [questionId]: answerText }
  score: null,
  isGenerating: false,
  isSubmitting: false,
  error: null,
  examHistory: [],            // List of past exams

  // ── Actions ──────────────────────────────────────────────────────────────
  generateExam: async (formData) => {
    set({ isGenerating: true, error: null, currentExam: null, answers: {}, score: null })
    try {
      const response = await ExamService.generate(formData)
      set({ currentExam: response.data, isGenerating: false })
    } catch (err) {
      set({
        error: err.response?.data?.message || 'Failed to generate exam',
        isGenerating: false,
      })
    }
  },

  setAnswer: (questionId, answer) =>
    set((state) => ({
      answers: { ...state.answers, [questionId]: answer },
    })),

  submitExam: async (examId) => {
    set({ isSubmitting: true, error: null })
    try {
      const response = await ExamService.submit(examId, useExamStore.getState().answers)
      set({ score: response.data, isSubmitting: false })
    } catch (err) {
      set({
        error: err.response?.data?.message || 'Failed to submit exam',
        isSubmitting: false,
      })
    }
  },

  loadHistory: async (userId) => {
    try {
      const response = await ExamService.getByUser(userId)
      set({ examHistory: response.data })
    } catch {
      // Non-critical, silent fail
    }
  },

  resetExam: () =>
    set({ currentExam: null, answers: {}, score: null, error: null }),
}))

export default useExamStore
