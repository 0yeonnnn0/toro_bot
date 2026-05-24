import { NavLink } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'

export default function Nav() {
  const [online, setOnline] = useState(false)
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    const check = () => fetch('/api/status').then(r => r.json()).then(d => setOnline(d.online)).catch(() => {})
    check()
    const id = setInterval(check, 10000)
    return () => clearInterval(id)
  }, [])

  return (
    <nav>
      <div className="nav-brand">
        <span className="dot" style={{ background: online ? 'var(--green)' : 'var(--red)', boxShadow: online ? '0 0 8px rgba(35,165,89,0.5)' : 'none' }} />
        TORO
      </div>
      <div className="nav-right">
        <div className="nav-links">
          <NavLink to="/admin" end>Overview</NavLink>
          <NavLink to="/admin/logs">Logs</NavLink>
          <NavLink to="/admin/stored">Stored</NavLink>
          <NavLink to="/admin/settings">Settings</NavLink>
          <NavLink to="/music">Music</NavLink>
        </div>
        {mounted && (
          <button
            className="theme-toggle"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            aria-label={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {resolvedTheme === 'dark' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
              </svg>
            )}
          </button>
        )}
      </div>
    </nav>
  )
}
