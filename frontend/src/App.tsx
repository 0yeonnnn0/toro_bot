import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Toaster } from './components/ui/sonner'
import Nav from './components/Nav'
import Dashboard from './pages/Dashboard'
import Logs from './pages/Logs'
import Settings from './pages/Settings'
import Login from './pages/Login'
import Music from './pages/Music'

function AdminLayout({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    fetch('/api/status').then(response => setAuthed(response.status !== 401)).catch(() => setAuthed(false))
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
  return (
    <>
      <Routes>
        <Route path="/music" element={<Music />} />
        <Route path="/admin/login" element={<Login />} />
        <Route path="/admin" element={<AdminLayout><Dashboard /></AdminLayout>} />
        <Route path="/admin/logs" element={<AdminLayout><Logs /></AdminLayout>} />
        <Route path="/admin/settings" element={<AdminLayout><Settings /></AdminLayout>} />
        <Route path="/admin/music" element={<AdminLayout><Music editable /></AdminLayout>} />
        <Route path="/" element={<Navigate to="/music" replace />} />
        <Route path="*" element={<Navigate to="/music" replace />} />
      </Routes>
      <Toaster position="top-right" />
    </>
  )
}

export default App
