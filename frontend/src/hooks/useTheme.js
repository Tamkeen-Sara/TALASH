import { useState, useEffect } from 'react'

export default function useTheme() {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('talash_theme') || 'dark'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('talash_theme', theme)
  }, [theme])

  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark')
  const isDark = theme === 'dark'

  return { theme, toggle, isDark }
}