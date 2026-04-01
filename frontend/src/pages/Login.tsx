import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Toaster } from '../components/ui/sonner'

export default function Login() {
  const [password, setPassword] = useState('')
  const [shaking, setShaking] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (res.ok) {
      navigate('/admin')
    } else {
      toast.error('Wrong password')
      setPassword('')
      setShaking(true)
      setTimeout(() => setShaking(false), 500)
    }
  }

  return (
    <>
      <nav>
        <div className="nav-brand">
          <span className="dot" style={{ background: 'var(--accent)' }} />
          TORO
        </div>
      </nav>
      <main>
        <div className="login-wrap" style={{ padding: '0 var(--space-4)' }}>
          <div
            className="login-box"
            style={{
              animation: shaking ? 'shake 0.4s ease-in-out' : 'fade-up 0.5s ease-out',
            }}
          >
            <div className="cat-emoticon">=^0w0^=</div>
            <div className="brand">TORO</div>
            <form onSubmit={handleSubmit}>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Password"
                autoFocus
              />
              <button className="btn btn-primary" style={{ width: '100%', marginTop: '0.25rem' }}>
                Enter
              </button>
            </form>
          </div>
        </div>
      </main>
      <Toaster position="top-right" />
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          75% { transform: translateX(8px); }
        }
        .cat-emoticon {
          font-family: var(--font-mono);
          font-size: 2.8rem;
          font-weight: 700;
          color: var(--accent);
          margin-bottom: 0.5rem;
          letter-spacing: 0.02em;
          cursor: default;
          transition: transform 0.2s ease;
        }
        .cat-emoticon:hover {
          transform: scale(1.1) rotate(-3deg);
        }
      `}</style>
    </>
  )
}
