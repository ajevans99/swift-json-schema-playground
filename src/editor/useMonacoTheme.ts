import { useEffect, useState } from 'react'

type MonacoTheme = 'vs' | 'vs-dark'

function getCurrentTheme(): MonacoTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'vs'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'vs-dark' : 'vs'
}

export function useMonacoTheme(): MonacoTheme {
  const [theme, setTheme] = useState<MonacoTheme>(getCurrentTheme)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (event: MediaQueryListEvent) => {
      setTheme(event.matches ? 'vs-dark' : 'vs')
    }
    media.addEventListener('change', handler)
    return () => media.removeEventListener('change', handler)
  }, [])

  return theme
}
