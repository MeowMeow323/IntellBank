/**
 * Utility helpers for IntellBank frontend.
 * Add shared utility functions here.
 */

/**
 * Format a date string to a readable display format.
 */
export const formatDate = (dateStr) => {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Truncate a string to a maximum length with ellipsis.
 */
export const truncate = (str, maxLength = 100) => {
  if (!str) return ''
  return str.length > maxLength ? str.slice(0, maxLength) + '...' : str
}

/**
 * Map a difficulty string to a badge class.
 */
export const difficultyBadge = (difficulty) => {
  const map = { EASY: 'badge-green', MEDIUM: 'badge-amber', HARD: 'badge-red' }
  return map[difficulty] || 'badge-blue'
}

/**
 * Map a verification status to a badge class.
 */
export const verificationBadge = (status) => {
  const map = { VERIFIED: 'badge-green', PENDING: 'badge-amber', REJECTED: 'badge-red' }
  return map[status] || 'badge-blue'
}

/**
 * Get initials from a full name.
 */
export const getInitials = (name) => {
  if (!name) return 'U'
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}
