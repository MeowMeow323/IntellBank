import { create } from 'zustand'

/**
 * Lightweight global toast notifications — replaces blocking window.alert().
 * Call from anywhere (even outside React) via:
 *   useToastStore.getState().addToast('message', 'error')
 * Types: 'error' | 'success' | 'info'. Toasts auto-dismiss after 4s.
 */
let _id = 0

const useToastStore = create((set) => ({
  toasts: [],
  addToast: (message, type = 'info') => {
    const id = ++_id
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 4000)
    return id
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

// Convenience helper for non-component code.
export const toast = (message, type = 'info') =>
  useToastStore.getState().addToast(message, type)

export default useToastStore
