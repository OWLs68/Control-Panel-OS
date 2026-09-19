import { useCallback, useEffect, useState } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'cpos.theme'

function readStored(): ThemePreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw === 'light' || raw === 'dark' ? raw : 'system'
  } catch {
    // Private mode / blocked storage: fall back to following the system.
    return 'system'
  }
}

function apply(preference: ThemePreference): void {
  const root = document.documentElement
  if (preference === 'system') {
    root.removeAttribute('data-theme')
  } else {
    root.setAttribute('data-theme', preference)
  }
}

/**
 * Theme preference, persisted per browser.
 *
 * This is the one thing the panel keeps in localStorage: a per-viewer display
 * convenience, never system state. Everything else comes from adapters.
 */
export function useTheme(): [ThemePreference, (next: ThemePreference) => void] {
  const [preference, setPreference] = useState<ThemePreference>(readStored)

  useEffect(() => {
    apply(preference)
  }, [preference])

  const update = useCallback((next: ThemePreference) => {
    setPreference(next)
    try {
      if (next === 'system') {
        localStorage.removeItem(STORAGE_KEY)
      } else {
        localStorage.setItem(STORAGE_KEY, next)
      }
    } catch {
      // Storage unavailable — the theme still applies for this session.
    }
  }, [])

  return [preference, update]
}
