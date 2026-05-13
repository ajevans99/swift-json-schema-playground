import { useEffect, useState } from 'react'

type MonacoTheme = 'playground-light' | 'playground-dark'

function getCurrentTheme(): MonacoTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'playground-light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'playground-dark'
    : 'playground-light'
}

export function useMonacoTheme(): MonacoTheme {
  const [theme, setTheme] = useState<MonacoTheme>(getCurrentTheme)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (event: MediaQueryListEvent) => {
      setTheme(event.matches ? 'playground-dark' : 'playground-light')
    }
    media.addEventListener('change', handler)
    return () => media.removeEventListener('change', handler)
  }, [])

  return theme
}
