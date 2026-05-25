import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { Toaster } from './components/ui/sonner'
import Nav from './components/Nav'
import Dashboard from './pages/Dashboard'
import Logs from './pages/Logs'
import Settings from './pages/Settings'
import Login from './pages/Login'
import Chat from './pages/Chat'
import Music from './pages/Music'
import Stored from './pages/Stored'
import Rag from './pages/Rag'

function AdminLayout({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    fetch('/api/status')
      .then(res => {
        if (res.status === 401) setAuthed(false)
        else { setAuthed(true); return res.json() }
      })
      .catch(() => setAuthed(false))
  }, [])

  if (authed === null) return null
  if (!authed) return <Navigate to="/admin/login" replace />

  return (
    <>
      <Nav />
      <main>{children}</main>
    </>
  )
}

function App() {
  const location = useLocation()
  const isChat = location.pathname.startsWith('/chat')

  return (
    <>
      <Routes>
        {/* Public pages */}
        <Route path="/chat" element={<Chat />} />
        <Route path="/music" element={<Music />} />

        {/* Admin login */}
        <Route path="/admin/login" element={<Login />} />

        {/* Admin pages */}
        <Route path="/admin" element={<AdminLayout><Dashboard /></AdminLayout>} />
        <Route path="/admin/logs" element={<AdminLayout><Logs /></AdminLayout>} />
        <Route path="/admin/stored" element={<AdminLayout><Stored /></AdminLayout>} />
        <Route path="/admin/rag" element={<AdminLayout><Rag /></AdminLayout>} />
        <Route path="/admin/settings" element={<AdminLayout><Settings /></AdminLayout>} />

        {/* Redirects */}
        <Route path="/" element={<Navigate to="/chat" replace />} />
        <Route path="*" element={<Navigate to="/chat" replace />} />
      </Routes>
      {!isChat && <Toaster position="top-right" />}
    </>
  )
}

export default App
