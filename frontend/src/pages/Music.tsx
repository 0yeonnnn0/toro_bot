import { useState, useEffect } from 'react'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../components/ui/table'

interface MusicLogEntry {
  id: string
  title: string
  artist: string | null
  url: string
  duration: string
  thumbnail: string
  requestedBy: string
  timestamp: number
}

interface MusicStats {
  totalPlays: number
  topTracks: { title: string; artist: string | null; count: number }[]
  topUsers: { name: string; count: number }[]
}

export default function Music() {
  const [logs, setLogs] = useState<MusicLogEntry[]>([])
  const [stats, setStats] = useState<MusicStats | null>(null)
  const [tab, setTab] = useState<'history' | 'stats'>('history')
  const [page, setPage] = useState(0)
  const perPage = 20

  const fetchData = () => {
    fetch('/api/music-logs?limit=500').then(r => r.json()).then(setLogs).catch(() => {})
    fetch('/api/music-logs/stats').then(r => r.json()).then(setStats).catch(() => {})
  }

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 10000)
    return () => clearInterval(id)
  }, [])

  const totalPages = Math.max(1, Math.ceil(logs.length / perPage))
  const paged = logs.slice(page * perPage, (page + 1) * perPage)

  return (
    <div className="stagger" style={{ maxWidth: 900, margin: '0 auto', padding: 'var(--space-6)' }}>
      <div className="page-header">
        <h1>Music</h1>
        <p className="page-desc">재생 기록 및 통계</p>
      </div>

      <div className="log-controls">
        <div className="nav-links" style={{ gap: '2px' }}>
          {(['history', 'stats'] as const).map(t => (
            <a key={t} className={tab === t ? 'active' : ''} onClick={() => { setTab(t); setPage(0) }}
              style={{ cursor: 'pointer' }}>
              {t === 'history' ? 'History' : 'Stats'}
              <span className="mono" style={{ marginLeft: 6, fontSize: '0.7rem', opacity: 0.5 }}>
                {t === 'history' ? logs.length : stats?.totalPlays || 0}
              </span>
            </a>
          ))}
        </div>
      </div>

      {tab === 'history' && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead style={{ width: 50 }}></TableHead>
                <TableHead>Title</TableHead>
                <TableHead style={{ minWidth: 80 }}>Duration</TableHead>
                <TableHead style={{ minWidth: 90 }}>Requested By</TableHead>
                <TableHead style={{ minWidth: 100 }}>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} style={{ textAlign: 'center', padding: 'var(--space-10)', color: 'var(--text-tertiary)' }}>
                    재생 기록이 없습니다
                  </TableCell>
                </TableRow>
              ) : paged.map(log => (
                <TableRow key={log.id}>
                  <TableCell>
                    {log.thumbnail && (
                      <img src={log.thumbnail} alt="" style={{ width: 40, height: 30, objectFit: 'cover', borderRadius: 4 }} />
                    )}
                  </TableCell>
                  <TableCell>
                    <a href={log.url} target="_blank" rel="noopener noreferrer"
                      style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 500 }}>
                      {log.title}
                    </a>
                    {log.artist && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: 2 }}>
                        {log.artist}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                    {log.duration}
                  </TableCell>
                  <TableCell style={{ fontSize: '0.85rem', color: log.requestedBy.startsWith('Autoplay') ? 'var(--text-tertiary)' : 'var(--accent)' }}>
                    {log.requestedBy}
                  </TableCell>
                  <TableCell className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                    {formatTime(log.timestamp)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {logs.length > perPage && (
            <div className="log-controls pagination-bar" style={{ justifyContent: 'space-between', marginTop: 'var(--space-4)' }}>
              <span className="hint mono">{logs.length}곡 중 {page * perPage + 1}–{Math.min((page + 1) * perPage, logs.length)}</span>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <button className="btn btn-ghost" disabled={page === 0} onClick={() => setPage(p => p - 1)}>← 이전</button>
                <span className="hint mono" style={{ display: 'flex', alignItems: 'center' }}>{page + 1} / {totalPages}</span>
                <button className="btn btn-ghost" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>다음 →</button>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'stats' && stats && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
          {/* Top Tracks */}
          <div className="card">
            <h3 style={{ marginBottom: 'var(--space-4)', fontSize: '0.95rem' }}>Top Tracks</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead style={{ width: 30 }}>#</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead style={{ width: 50 }}>Plays</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.topTracks.map((t, i) => (
                  <TableRow key={i}>
                    <TableCell className="mono" style={{ color: 'var(--text-tertiary)' }}>{i + 1}</TableCell>
                    <TableCell>
                      <span style={{ fontWeight: 500 }}>{t.title}</span>
                      {t.artist && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{t.artist}</div>
                      )}
                    </TableCell>
                    <TableCell className="mono" style={{ color: 'var(--accent)', fontWeight: 600 }}>{t.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Top Users */}
          <div className="card">
            <h3 style={{ marginBottom: 'var(--space-4)', fontSize: '0.95rem' }}>Top Listeners</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead style={{ width: 30 }}>#</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead style={{ width: 50 }}>Plays</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.topUsers.map((u, i) => (
                  <TableRow key={i}>
                    <TableCell className="mono" style={{ color: 'var(--text-tertiary)' }}>{i + 1}</TableCell>
                    <TableCell style={{ fontWeight: 500 }}>{u.name}</TableCell>
                    <TableCell className="mono" style={{ color: 'var(--accent)', fontWeight: 600 }}>{u.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) {
    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}
