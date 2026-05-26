// Light/dark theme context. The initial value is read by an inline script in
// index.html (before paint) so we never flash the wrong colors. This module
// keeps React state in sync with the document attribute + localStorage.

import { createContext, useCallback, useContext, useEffect, useState } from 'react'

const STORAGE_KEY = 'quant_theme_v1'

function readInitial() {
  if (typeof document === 'undefined') return 'dark'
  const fromDoc = document.documentElement.getAttribute('data-theme')
  if (fromDoc === 'light' || fromDoc === 'dark') return fromDoc
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {}
  return 'dark'
}

const ThemeContext = createContext({ theme: 'dark', setTheme: () => {}, toggle: () => {} })

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readInitial)

  const setTheme = useCallback((next) => {
    const t = next === 'light' ? 'light' : 'dark'
    setThemeState(t)
    try { localStorage.setItem(STORAGE_KEY, t) } catch {}
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', t)
    }
  }, [])

  const toggle = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme, setTheme])

  // Cross-tab sync
  useEffect(() => {
    function handler(e) {
      if (e.key === STORAGE_KEY && (e.newValue === 'light' || e.newValue === 'dark')) {
        setThemeState(e.newValue)
        document.documentElement.setAttribute('data-theme', e.newValue)
      }
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
