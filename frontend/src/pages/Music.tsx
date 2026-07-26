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

interface QueueTrack {
  title: string
  url: string
  duration: string
  thumbnail: string
  requestedBy: string
}

interface ActiveQueueSummary {
  guildId: string
  guildName: string
  current: QueueTrack | null
  trackCount: number
  autoplay: boolean
  autoplayGenre: string | null
}

interface MusicQueueDetail {
  guildId: string
  guildName: string
  nowPlaying: QueueTrack | null
  tracks: QueueTrack[]
  autoplay: { enabled: boolean; genre: string | null }
}

function youtubeThumbnailUrl(url: string): string {
  try {
    const u = new URL(url)
    const id = u.hostname === 'youtu.be' ? u.pathname.slice(1) : u.searchParams.get('v')
    return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : ''
  } catch {
    return ''
  }
}

function trackThumbnail(track: { thumbnail?: string; url: string }): string {
  const thumbnail = track.thumbnail?.trim()
  return thumbnail && thumbnail.toUpperCase() !== 'NA' ? thumbnail : youtubeThumbnailUrl(track.url)
}

export default function Music({ editable = false }: { editable?: boolean }) {
  const [logs, setLogs] = useState<MusicLogEntry[]>([])
  const [stats, setStats] = useState<MusicStats | null>(null)
  const [tab, setTab] = useState<'playlist' | 'history' | 'stats'>(editable ? 'playlist' : 'history')
  const [page, setPage] = useState(0)
  const [queues, setQueues] = useState<ActiveQueueSummary[]>([])
  const [selectedGuildId, setSelectedGuildId] = useState<string>('')
  const [queueDetail, setQueueDetail] = useState<MusicQueueDetail | null>(null)
  const [playlistStatus, setPlaylistStatus] = useState('')
  const [addQuery, setAddQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const perPage = 20

  const fetchQueueDetail = (guildId: string) => {
    if (!guildId) {
      setQueueDetail(null)
      return
    }
    fetch(`/api/music/queues/${guildId}`)
      .then(r => r.ok ? r.json() : null)
      .then(setQueueDetail)
      .catch(() => setQueueDetail(null))
  }

  const fetchData = () => {
    fetch('/api/music-logs?limit=500').then(r => r.json()).then(setLogs).catch(() => {})
    fetch('/api/music-logs/stats').then(r => r.json()).then(setStats).catch(() => {})
    if (editable) {
      fetch('/api/music/queues')
        .then(r => r.ok ? r.json() : [])
        .then((items: ActiveQueueSummary[]) => {
          setQueues(items)
          setSelectedGuildId(current => {
            const next = current && items.some(q => q.guildId === current) ? current : (items[0]?.guildId || '')
            fetchQueueDetail(next)
            return next
          })
        })
        .catch(() => setQueues([]))
    }
  }

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 10000)
    return () => clearInterval(id)
  }, [])

  const refreshSelectedQueue = () => fetchQueueDetail(selectedGuildId)

  const updatePlaylist = async (action: () => Promise<Response>, successMessage: string) => {
    if (!selectedGuildId) return
    setBusy(true)
    setPlaylistStatus('처리 중...')
    try {
      const res = await action()
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '요청 실패')
      if (data.tracks && queueDetail) {
        setQueueDetail({ ...queueDetail, tracks: data.tracks, nowPlaying: data.tracks[0] || null, autoplay: data.autoplay || queueDetail.autoplay })
      }
      setPlaylistStatus(successMessage)
      fetchData()
    } catch (err) {
      setPlaylistStatus((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const addTrack = async () => {
    const query = addQuery.trim()
    if (!query) return
    await updatePlaylist(() => fetch(`/api/music/queues/${selectedGuildId}/tracks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    }), '곡을 추가했어요')
    setAddQuery('')
  }

  const moveQueuedTrack = (from: number, to: number) => updatePlaylist(() => fetch(`/api/music/queues/${selectedGuildId}/tracks/move`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to }),
  }), '순서를 바꿨어요')

  const removeQueuedTrack = (index: number) => updatePlaylist(() => fetch(`/api/music/queues/${selectedGuildId}/tracks/${index}`, { method: 'DELETE' }), '곡을 제거했어요')

  const setAutoplayMode = (genre: string) => updatePlaylist(() => fetch(`/api/music/queues/${selectedGuildId}/autoplay`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ genre }),
  }), '자동 추천 설정을 바꿨어요')

  const totalPages = Math.max(1, Math.ceil(logs.length / perPage))
  const paged = logs.slice(page * perPage, (page + 1) * perPage)

  const content = (
    <div className="stagger">
      <div className="page-header">
        <h1>Music</h1>
        <p className="page-desc">현재 재생 중인 큐와 재생 기록을 관리합니다 — 10초 간격 갱신</p>
      </div>

      <div className="card-grid stagger" style={{ marginBottom: 'var(--space-8)' }}>
        <div className="card">
          <div className="card-label">Total Plays</div>
          <div className="card-value text-accent">{stats?.totalPlays.toLocaleString() || '—'}</div>
        </div>
        <div className="card">
          <div className="card-label">History</div>
          <div className="card-value">{logs.length.toLocaleString()}</div>
        </div>
        {editable && (
          <div className="card">
            <div className="card-label">Active Queues</div>
            <div className="card-value">{queues.length.toLocaleString()}</div>
          </div>
        )}
      </div>

      <div className="log-controls">
        <div className="nav-links" style={{ gap: '2px' }}>
          {editable && (
            <a className={tab === 'playlist' ? 'active' : ''} onClick={() => { setTab('playlist'); setPage(0); refreshSelectedQueue() }} style={{ cursor: 'pointer' }}>
              Playlist
              <span className="mono" style={{ marginLeft: 6, fontSize: '0.7rem', opacity: 0.5 }}>
                {queueDetail?.tracks.length || queues[0]?.trackCount || 0}
              </span>
            </a>
          )}
          <a className={tab === 'history' ? 'active' : ''} onClick={() => { setTab('history'); setPage(0) }} style={{ cursor: 'pointer' }}>
            History
            <span className="mono" style={{ marginLeft: 6, fontSize: '0.7rem', opacity: 0.5 }}>{logs.length}</span>
          </a>
          <a className={tab === 'stats' ? 'active' : ''} onClick={() => { setTab('stats'); setPage(0) }} style={{ cursor: 'pointer' }}>
            Stats
            <span className="mono" style={{ marginLeft: 6, fontSize: '0.7rem', opacity: 0.5 }}>{stats?.totalPlays || 0}</span>
          </a>
        </div>
      </div>

      {editable && tab === 'playlist' && (
        <div className="panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">Current Playlist</div>
              <p className="hint">디스코드 음악 큐를 기존 어드민 패널 안에서 조작합니다.</p>
            </div>
            <span className="panel-badge">{queueDetail?.autoplay.enabled ? `AUTO ${queueDetail.autoplay.genre || 'ARTIST'}` : 'AUTO OFF'}</span>
          </div>

          {queues.length === 0 ? (
            <div className="empty">지금 재생 중인 음악 큐가 없습니다. 디스코드에서 먼저 /play로 음악을 틀어주세요.</div>
          ) : (
            <>
              <div className="log-controls" style={{ flexWrap: 'wrap' }}>
                <select value={selectedGuildId} aria-label="서버 선택" onChange={(e) => { setSelectedGuildId(e.target.value); fetchQueueDetail(e.target.value) }}>
                  {queues.map(q => <option key={q.guildId} value={q.guildId}>{q.guildName} · {q.trackCount}곡</option>)}
                </select>
                <input
                  type="text"
                  value={addQuery}
                  onChange={(e) => setAddQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addTrack() }}
                  placeholder="검색어 또는 YouTube URL 추가"
                  aria-label="플레이리스트에 추가할 노래"
                  style={{ maxWidth: 420 }}
                />
                <button className="btn btn-primary" disabled={busy || !addQuery.trim()} onClick={addTrack}>추가</button>
                <button className="btn btn-ghost" disabled={busy} onClick={refreshSelectedQueue}>새로고침</button>
              </div>

              <div className="log-controls" style={{ flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
                <span className="hint">자동 추천</span>
                {[
                  ['artist', '현재 곡 기반'],
                  ['kpop', 'K-Pop'],
                  ['rnb', 'R&B'],
                  ['lofi', 'Lofi'],
                  ['off', '끄기'],
                ].map(([genre, label]) => (
                  <button key={genre} className="btn btn-ghost" disabled={busy} onClick={() => setAutoplayMode(genre)}>{label}</button>
                ))}
              </div>

              <div className="hint" role="status" style={{ minHeight: 22, marginBottom: 'var(--space-4)' }}>{playlistStatus}</div>

              {!queueDetail ? (
                <div className="empty">플레이리스트를 불러오는 중입니다.</div>
              ) : queueDetail.tracks.length === 0 ? (
                <div className="empty">큐가 비어있습니다.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead style={{ width: 70 }}>Order</TableHead>
                      <TableHead style={{ width: 72 }}>Image</TableHead>
                      <TableHead>Track</TableHead>
                      <TableHead style={{ width: 90 }}>Duration</TableHead>
                      <TableHead style={{ width: 120 }}>Requested</TableHead>
                      <TableHead style={{ width: 180 }}>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {queueDetail.tracks.map((track, index) => (
                      <TableRow key={`${track.url}-${index}`} className={index === 0 ? 'row-replied' : ''}>
                        <TableCell className="mono" style={{ color: index === 0 ? 'var(--accent)' : 'var(--text-tertiary)' }}>{index === 0 ? 'NOW' : index}</TableCell>
                        <TableCell>{renderThumb(track)}</TableCell>
                        <TableCell>
                          <a href={track.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-primary)', fontWeight: 600, textDecoration: 'none' }}>{track.title}</a>
                        </TableCell>
                        <TableCell className="mono">{track.duration}</TableCell>
                        <TableCell>{track.requestedBy}</TableCell>
                        <TableCell>
                          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                            <button className="btn btn-ghost" disabled={busy || index <= 1} onClick={() => moveQueuedTrack(index, index - 1)}>위</button>
                            <button className="btn btn-ghost" disabled={busy || index === 0 || index >= queueDetail.tracks.length - 1} onClick={() => moveQueuedTrack(index, index + 1)}>아래</button>
                            <button className="btn btn-ghost" disabled={busy || index === 0} onClick={() => removeQueuedTrack(index)}>삭제</button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'history' && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead style={{ width: 90 }}>Time</TableHead>
                <TableHead style={{ width: 72 }}>Image</TableHead>
                <TableHead>Track</TableHead>
                <TableHead style={{ width: 90 }}>Duration</TableHead>
                <TableHead style={{ width: 140 }}>Requested</TableHead>
                <TableHead style={{ width: 110 }}>Played</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} style={{ textAlign: 'center', padding: 'var(--space-10)', color: 'var(--text-tertiary)' }}>
                    재생 기록이 없습니다
                  </TableCell>
                </TableRow>
              ) : paged.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                    {new Date(log.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                  </TableCell>
                  <TableCell>{renderThumb(log)}</TableCell>
                  <TableCell>
                    <a href={log.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-primary)', fontWeight: 600, textDecoration: 'none' }}>{log.title}</a>
                    {log.artist && <div className="hint">{log.artist}</div>}
                  </TableCell>
                  <TableCell className="mono">{log.duration}</TableCell>
                  <TableCell>
                    <span className={`log-badge ${log.requestedBy.startsWith('Autoplay') ? 'event' : 'mention'}`}>
                      {log.requestedBy.startsWith('Autoplay') ? 'Auto' : log.requestedBy}
                    </span>
                  </TableCell>
                  <TableCell className="hint">{formatTime(log.timestamp)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {logs.length > perPage && (
            <div className="log-controls pagination-bar" style={{ justifyContent: 'space-between', marginTop: 'var(--space-4)' }}>
              <span className="hint mono">{logs.length}개 중 {page * perPage + 1}–{Math.min((page + 1) * perPage, logs.length)}</span>
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
        <div className="section-gap" style={{ marginTop: 0 }}>
          <div className="card-grid stagger" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
            <div className="panel">
              <div className="panel-header">
                <div className="panel-title">Top Tracks</div>
                <span className="panel-badge">{stats.topTracks.length}</span>
              </div>
              {stats.topTracks.length === 0 ? <div className="empty">데이터가 없습니다</div> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead style={{ width: 56 }}>#</TableHead>
                      <TableHead>Track</TableHead>
                      <TableHead style={{ width: 80 }}>Count</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.topTracks.slice(0, 10).map((t, i) => (
                      <TableRow key={`${t.title}-${i}`}>
                        <TableCell><span className={`rank-num ${i === 0 ? 'top-1' : i === 1 ? 'top-2' : i === 2 ? 'top-3' : 'default'}`}>{i + 1}</span></TableCell>
                        <TableCell style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{t.title}{t.artist && <div className="hint">{t.artist}</div>}</TableCell>
                        <TableCell className="mono text-accent">{t.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            <div className="panel">
              <div className="panel-header">
                <div className="panel-title">Top Users</div>
                <span className="panel-badge">{stats.topUsers.length}</span>
              </div>
              {stats.topUsers.length === 0 ? <div className="empty">데이터가 없습니다</div> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead style={{ width: 56 }}>#</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead style={{ width: 80 }}>Count</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.topUsers.map((u, i) => (
                      <TableRow key={`${u.name}-${i}`}>
                        <TableCell><span className={`rank-num ${i === 0 ? 'top-1' : i === 1 ? 'top-2' : i === 2 ? 'top-3' : 'default'}`}>{i + 1}</span></TableCell>
                        <TableCell style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{u.name}</TableCell>
                        <TableCell className="mono text-accent">{u.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )

  return editable ? content : <main>{content}</main>
}

function renderThumb(track: { thumbnail?: string; url: string }) {
  const src = trackThumbnail(track)
  if (!src) return <span className="rank-num default">—</span>
  return <img src={src} alt="" style={{ width: 44, height: 44, borderRadius: 'var(--radius-sm)', objectFit: 'cover', display: 'block' }} />
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (mins < 1) return '방금'
  if (mins < 60) return `${mins}분 전`
  if (hours < 24) return `${hours}시간 전`
  if (days < 7) return `${days}일 전`
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}
