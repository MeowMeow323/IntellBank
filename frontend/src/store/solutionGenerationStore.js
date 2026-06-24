import { create } from 'zustand'
import { PastYearPaperService } from '../services/api'

/**
 * Tracks PYP solution generation jobs across page navigation.
 * The axios request fires inside this store's action, not inside the page
 * component, so navigating away does not cancel or lose the job.
 */
const useSolutionGenerationStore = create((set, get) => ({
  // { [pypId]: 'generating' | { generated, failed, skipped } | { error } }
  jobs: {},

  isGenerating: (pypId) => get().jobs[pypId] === 'generating',

  getResult: (pypId) => {
    const job = get().jobs[pypId]
    return job && job !== 'generating' ? job : null
  },

  clearResult: (pypId) =>
    set((state) => {
      const jobs = { ...state.jobs }
      delete jobs[pypId]
      return { jobs }
    }),

  generate: async (pypId) => {
    if (get().jobs[pypId] === 'generating') return  // already running

    set((state) => ({ jobs: { ...state.jobs, [pypId]: 'generating' } }))
    try {
      const res = await PastYearPaperService.generateSolutions(pypId)
      set((state) => ({ jobs: { ...state.jobs, [pypId]: res.data } }))
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to generate solutions.'
      set((state) => ({ jobs: { ...state.jobs, [pypId]: { error: message } } }))
    }
  },
}))

export default useSolutionGenerationStore
