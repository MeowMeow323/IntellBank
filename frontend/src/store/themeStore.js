import { create } from 'zustand'

/**
 * Light/dark theme. Default is light; the user's choice is remembered per browser.
 * The active theme is applied as data-theme on <html>; global.css redefines the
 * design tokens under :root[data-theme="dark"].
 *
 * index.html also sets data-theme from localStorage before first paint to avoid a
 * flash of the wrong theme on load.
 */
const KEY = 'intellbank_theme'

const read = () => {
  try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light' } catch { return 'light' }
}

const apply = (theme) => {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme)
  }
}

const initial = read()
apply(initial)

const useThemeStore = create((set, get) => ({
  theme: initial,
  setTheme: (theme) => {
    try { localStorage.setItem(KEY, theme) } catch { /* ignore */ }
    apply(theme)
    set({ theme })
  },
  toggle: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
}))

export default useThemeStore
