import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Link } from 'react-router-dom'

type Props = {
  displayName?: string
  avatarUrl?: string | null
  onLogout?: () => void
}

export default function AccountNav({ displayName, avatarUrl, onLogout }: Props) {
  const { resolvedTheme, setTheme } = useTheme()
  const dark = resolvedTheme === 'dark'

  return (
    <nav className="account-nav">
      <Link className="nav-brand" to="/teams">
        <span className="dot account-brand-dot" />
        TORO
      </Link>
      <div className="nav-right">
        {displayName && (
          <div className="account-user">
            {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{displayName.slice(0, 1)}</span>}
            <strong>{displayName}</strong>
          </div>
        )}
        {onLogout && <button className="btn btn-ghost account-logout" onClick={onLogout}>로그아웃</button>}
        <button
          className="theme-toggle"
          onClick={() => setTheme(dark ? 'light' : 'dark')}
          aria-label={dark ? '라이트 모드로 전환' : '다크 모드로 전환'}
        >
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </nav>
  )
}
