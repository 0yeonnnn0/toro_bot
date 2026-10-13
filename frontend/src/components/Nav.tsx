import { NavLink } from 'react-router-dom'
import { useEffect, useState } from 'react'
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
          <NavLink to="/admin/settings">Settings</NavLink>
          <NavLink to="/admin/music">Music</NavLink>
        </div>
        {mounted && (
          <button className="theme-toggle" onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme">
            {resolvedTheme === 'dark' ? '☀' : '◐'}
          </button>
        )}
      </div>
    </nav>
  )
}
