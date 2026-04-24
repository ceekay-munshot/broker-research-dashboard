import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export type Theme = 'dark' | 'light'

interface ThemeContextValue {
  readonly theme: Theme
  readonly setTheme: (t: Theme) => void
  readonly toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const STORAGE_KEY = 'research-theme'

// Read initial theme: localStorage first, then OS preference, then fall back
// to dark (the product's original default). The same resolution runs
// inline in index.html to avoid a flash of the wrong theme — see that
// file for the anti-FOUC snippet that mirrors this logic.
function resolveInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'dark' || stored === 'light') return stored
  } catch {
    // localStorage can throw in some privacy modes — fall through.
  }
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches === false) return 'light'
  return 'dark'
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => resolveInitialTheme())

  // Reflect the current theme onto <html> so Tailwind's `dark:` variants
  // and our CSS variable overrides activate. Persist to localStorage so
  // the choice survives reloads.
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    try { window.localStorage.setItem(STORAGE_KEY, theme) } catch { /* noop */ }
  }, [theme])

  const toggleTheme = useCallback(() => {
    setThemeState((t) => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    setTheme: setThemeState,
    toggleTheme,
  }), [theme, toggleTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const v = useContext(ThemeContext)
  if (!v) throw new Error('useTheme called outside ThemeProvider')
  return v
}
