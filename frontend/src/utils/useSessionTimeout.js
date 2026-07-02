import { useEffect, useRef } from 'react'
import useAuthStore from '../store/authStore'
import { AuthService, activityTracker } from '../services/api'

/**
 * useSessionTimeout — enforces the NFR-Security requirement that an active
 * session is automatically terminated after a period of inactivity (default
 * 90 minutes), so a student who forgets to log out of a shared lab computer is
 * signed out once the machine is left idle.
 *
 * How it works:
 *  - Real user interaction (mouse / keyboard / scroll / touch) refreshes a shared
 *    "last activity" timestamp in localStorage, so activity in ANY tab keeps every
 *    tab alive. The timestamp is seeded at login and removed at logout (api.js).
 *  - A periodic check — plus an immediate check on tab focus / visibility — logs
 *    the user out once the idle window is exceeded, even if the tab was left in the
 *    background. On timeout the local session is cleared and the app redirects to
 *    the login page with an inactivity notice (matches UC_002).
 *
 * The window is overridable via VITE_IDLE_TIMEOUT_MINUTES (handy for testing).
 */
const IDLE_LIMIT_MS = (Number(import.meta.env.VITE_IDLE_TIMEOUT_MINUTES) || 90) * 60 * 1000
const CHECK_INTERVAL_MS = 20 * 1000  // how often we re-evaluate the idle window
const WRITE_THROTTLE_MS = 5 * 1000   // cap how often activity is written to storage

const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'wheel', 'scroll', 'touchstart', 'click']

export default function useSessionTimeout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const lastWrite = useRef(0)

  useEffect(() => {
    if (!isAuthenticated) return

    // If this browsing session has no activity record yet (e.g. a remembered user
    // opening the app), start the window now rather than expiring on load.
    if (activityTracker.last() == null) activityTracker.touch()

    const markActivity = () => {
      const now = Date.now()
      if (now - lastWrite.current < WRITE_THROTTLE_MS) return
      lastWrite.current = now
      activityTracker.touch()
    }

    const expire = () => {
      AuthService.logout()               // clears token + activity timestamp
      if (!window.location.pathname.startsWith('/login')) {
        window.location.assign('/login?expired=inactivity')
      }
    }

    const check = () => {
      const last = activityTracker.last()
      if (last != null && Date.now() - last >= IDLE_LIMIT_MS) expire()
    }

    const onVisibility = () => { if (document.visibilityState === 'visible') check() }

    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, markActivity, { passive: true }))
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', check)
    const interval = setInterval(check, CHECK_INTERVAL_MS)

    // Enforce immediately in case the window was already exceeded before mount.
    check()

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, markActivity))
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', check)
      clearInterval(interval)
    }
  }, [isAuthenticated])
}
