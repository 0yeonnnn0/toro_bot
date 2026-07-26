import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

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
  const navigate = useNavigate()
  const perPage = 12

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
      if (data.tracks && queueDetail) setQueueDetail({ ...queueDetail, tracks: data.tracks, nowPlaying: data.tracks[0] || null, autoplay: data.autoplay || queueDetail.autoplay })
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

  return (
    <>
      <style>{`
        .music-page {
          --music-bg: #f7f8fa;
          --music-surface: #ffffff;
          --music-surface-muted: #f2f4f6;
          --music-text: #191f28;
          --music-text-secondary: #4e5968;
          --music-text-tertiary: #8b95a1;
          --music-border: #e5e8eb;
          --music-blue: #3182f6;
          --music-blue-weak: #e8f3ff;
          --music-red: #f04452;
          --music-red-weak: #fff0f1;
          --music-green: #00a661;
          --music-shadow: 0 1px 2px rgba(0, 0, 0, 0.04), 0 12px 28px rgba(0, 0, 0, 0.06);

          min-height: 100vh;
          background: var(--music-bg);
          color: var(--music-text);
          padding: 0 24px 64px;
          font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Pretendard", "Segoe UI", sans-serif;
        }

        .music-header {
          max-width: 1080px;
          margin: 0 auto;
          padding: 56px 0 28px;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 24px;
        }
        .music-header h1 {
          margin: 0;
          font-size: clamp(2rem, 4vw, 3rem);
          line-height: 1.08;
          letter-spacing: -0.04em;
          font-weight: 800;
          color: var(--music-text);
        }
        .music-header p {
          margin: 12px 0 0;
          color: var(--music-text-secondary);
          font-size: 1rem;
          line-height: 1.6;
          letter-spacing: -0.01em;
        }
        .music-nav {
          max-width: 1080px;
          margin: 0 auto 20px;
          display: inline-flex;
          padding: 4px;
          gap: 2px;
          border: 1px solid var(--music-border);
          border-radius: 14px;
          background: var(--music-surface);
        }
        .music-nav button {
          min-height: 42px;
          padding: 0 16px;
          border: 0;
          border-radius: 10px;
          background: transparent;
          color: var(--music-text-secondary);
          font-size: 0.95rem;
          font-weight: 700;
          letter-spacing: -0.01em;
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
        }
        .music-nav button:hover { background: var(--music-surface-muted); }
        .music-nav button.active-history,
        .music-nav button.active-stats {
          background: var(--music-blue);
          color: #ffffff;
          box-shadow: 0 6px 14px rgba(49, 130, 246, 0.22);
        }
        .music-nav button.inactive { color: var(--music-text-secondary); }
        .music-nav button .tab-count {
          margin-left: 6px;
          opacity: 0.72;
          font-size: 0.82rem;
          font-weight: 700;
        }

        .music-chat-link {
          position: fixed;
          right: 24px;
          bottom: 24px;
          z-index: 20;
          min-width: 112px;
          height: 48px;
          padding: 0 18px;
          border-radius: 999px;
          background: var(--music-text);
          color: #ffffff;
          box-shadow: 0 12px 28px rgba(25, 31, 40, 0.22);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 0.95rem;
          font-weight: 800;
          letter-spacing: -0.01em;
          cursor: pointer;
          transition: transform 0.15s ease, background 0.15s ease;
        }
        .music-chat-link::before { content: 'Chat'; }
        .music-chat-link:hover { transform: translateY(-2px); background: #333d4b; }

        .music-list,
        .playlist-panel,
        .music-stats,
        .music-total-banner {
          max-width: 1080px;
          margin-left: auto;
          margin-right: auto;
        }

        .music-list {
          display: grid;
          gap: 10px;
        }
        .music-card {
          display: grid;
          grid-template-columns: 56px minmax(0, 1fr) auto auto;
          align-items: center;
          gap: 16px;
          padding: 14px 18px;
          background: var(--music-surface);
          border: 1px solid var(--music-border);
          border-radius: 18px;
          text-decoration: none;
          color: inherit;
          transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
        }
        .music-card:hover {
          border-color: #d1d6db;
          box-shadow: var(--music-shadow);
          transform: translateY(-1px);
        }
        .music-card-thumb,
        .music-card-no-thumb {
          width: 56px;
          height: 56px;
          border-radius: 14px;
          object-fit: cover;
          flex-shrink: 0;
          background: linear-gradient(135deg, #eef2f7, #dfe5ec);
        }
        .music-card-no-thumb {
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--music-text-tertiary);
          font-size: 0;
        }
        .music-card-no-thumb::before {
          content: '';
          width: 18px;
          height: 18px;
          border-radius: 50%;
          border: 5px solid #b0b8c1;
          box-sizing: border-box;
        }
        .music-card-info { min-width: 0; }
        .music-card-title,
        .playlist-title,
        .stats-name {
          font-size: 1rem;
          font-weight: 750;
          line-height: 1.35;
          letter-spacing: -0.02em;
          color: var(--music-text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .music-card-sub,
        .playlist-meta,
        .stats-artist {
          margin-top: 4px;
          color: var(--music-text-tertiary);
          font-size: 0.86rem;
          line-height: 1.4;
        }
        .music-card-sub {
          display: flex;
          gap: 10px;
          align-items: center;
        }
        .music-card-badge {
          padding: 6px 10px;
          border-radius: 999px;
          font-size: 0.78rem;
          font-weight: 750;
          background: var(--music-blue-weak);
          color: var(--music-blue);
          white-space: nowrap;
        }
        .music-card-badge.auto {
          background: var(--music-surface-muted);
          color: var(--music-text-tertiary);
        }
        .music-card-time {
          color: var(--music-text-tertiary);
          font-size: 0.84rem;
          white-space: nowrap;
        }

        .music-pagination {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 12px;
          margin-top: 24px;
        }
        .music-pagination button,
        .playlist-toolbar button,
        .playlist-actions button,
        .playlist-autoplay button {
          min-height: 38px;
          border: 0;
          border-radius: 10px;
          padding: 0 14px;
          background: var(--music-surface-muted);
          color: var(--music-text-secondary);
          font-size: 0.9rem;
          font-weight: 750;
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;
        }
        .music-pagination button:hover:not(:disabled),
        .playlist-toolbar button:hover:not(:disabled),
        .playlist-actions button:hover:not(:disabled),
        .playlist-autoplay button:hover:not(:disabled) {
          background: #e5e8eb;
          transform: translateY(-1px);
        }
        .music-pagination button:disabled,
        .playlist-toolbar button:disabled,
        .playlist-actions button:disabled,
        .playlist-autoplay button:disabled {
          opacity: 0.38;
          cursor: default;
          transform: none;
        }
        .music-pagination .page-info {
          color: var(--music-text-tertiary);
          font-size: 0.9rem;
          font-weight: 700;
        }

        .music-total-banner {
          background: var(--music-surface);
          border: 1px solid var(--music-border);
          border-radius: 22px;
          padding: 24px 28px;
          margin-bottom: 16px;
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 16px;
        }
        .music-total-banner .number {
          font-size: 2.4rem;
          line-height: 1;
          letter-spacing: -0.04em;
          font-weight: 850;
          color: var(--music-blue);
        }
        .music-total-banner .label {
          color: var(--music-text-secondary);
          font-size: 1rem;
          font-weight: 650;
        }
        .music-stats {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 16px;
        }
        .stats-card {
          background: var(--music-surface);
          border: 1px solid var(--music-border);
          border-radius: 22px;
          padding: 20px;
        }
        .stats-card h3 {
          margin: 0 0 14px;
          color: var(--music-text);
          font-size: 1.05rem;
          font-weight: 800;
          letter-spacing: -0.02em;
        }
        .stats-row {
          display: grid;
          grid-template-columns: 36px minmax(0, 1fr) auto;
          align-items: center;
          gap: 12px;
          min-height: 44px;
          border-top: 1px solid var(--music-border);
        }
        .stats-row:first-of-type { border-top: 0; }
        .stats-rank {
          color: var(--music-text-tertiary);
          font-size: 0.9rem;
          font-weight: 800;
          text-align: center;
        }
        .stats-rank.number { font-size: 0.9rem; }
        .stats-count {
          min-width: 34px;
          padding: 5px 9px;
          border-radius: 999px;
          background: var(--music-blue-weak);
          color: var(--music-blue);
          text-align: center;
          font-size: 0.84rem;
          font-weight: 800;
        }
        .stats-empty {
          margin: 0;
          padding: 28px 12px;
          color: var(--music-text-tertiary);
          text-align: center;
          font-size: 0.94rem;
        }

        .music-empty,
        .playlist-empty-small {
          background: var(--music-surface);
          border: 1px solid var(--music-border);
          border-radius: 22px;
          padding: 42px 20px;
          color: var(--music-text-tertiary);
          text-align: center;
          font-size: 0.98rem;
          line-height: 1.6;
        }
        .music-empty .icon { display: none; }
        .music-empty p { margin: 0; }

        .playlist-panel {
          background: var(--music-surface);
          border: 1px solid var(--music-border);
          border-radius: 24px;
          padding: 20px;
          box-shadow: 0 1px 1px rgba(0,0,0,0.02);
        }
        .playlist-toolbar {
          display: grid;
          grid-template-columns: minmax(180px, 260px) minmax(220px, 1fr) auto auto;
          gap: 10px;
          align-items: center;
          margin-bottom: 14px;
        }
        .playlist-toolbar select,
        .playlist-toolbar input {
          min-height: 44px;
          border: 1px solid var(--music-border);
          border-radius: 12px;
          padding: 0 14px;
          background: var(--music-surface);
          color: var(--music-text);
          font-size: 0.95rem;
          outline: none;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .playlist-toolbar select:focus,
        .playlist-toolbar input:focus {
          border-color: var(--music-blue);
          box-shadow: 0 0 0 3px rgba(49, 130, 246, 0.12);
        }
        .playlist-toolbar button:first-of-type {
          background: var(--music-blue);
          color: white;
        }
        .playlist-toolbar button:first-of-type:hover:not(:disabled) { background: #1b64da; }
        .playlist-autoplay {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          padding: 12px;
          margin-bottom: 12px;
          border-radius: 16px;
          background: var(--music-surface-muted);
        }
        .playlist-autoplay span {
          margin-right: 4px;
          color: var(--music-text-secondary);
          font-size: 0.9rem;
          font-weight: 750;
        }
        .playlist-status {
          min-height: 22px;
          margin: 6px 0 10px;
          color: var(--music-text-tertiary);
          font-size: 0.9rem;
        }
        .playlist-track {
          display: grid;
          grid-template-columns: 48px 56px minmax(0, 1fr) auto;
          align-items: center;
          gap: 14px;
          padding: 14px 0;
          border-top: 1px solid var(--music-border);
        }
        .playlist-track:first-of-type { border-top: 0; }
        .playlist-track.current {
          margin: 0 -8px;
          padding-left: 8px;
          padding-right: 8px;
          border-radius: 16px;
          background: var(--music-blue-weak);
          border-top-color: transparent;
        }
        .playlist-index {
          color: var(--music-text-tertiary);
          font-size: 0.8rem;
          font-weight: 850;
          text-align: center;
        }
        .playlist-track.current .playlist-index { color: var(--music-blue); }
        .playlist-info { min-width: 0; }
        .playlist-actions {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .playlist-actions button.remove {
          background: var(--music-red-weak);
          color: var(--music-red);
        }
        .playlist-actions button.remove:hover:not(:disabled) { background: #ffe1e4; }

        .music-note { display: none; }

        @media (max-width: 760px) {
          .music-page { padding: 0 16px 76px; }
          .music-header {
            padding-top: 36px;
            display: block;
          }
          .music-nav {
            width: 100%;
            display: flex;
            overflow-x: auto;
            justify-content: flex-start;
          }
          .music-nav button { white-space: nowrap; }
          .playlist-toolbar { grid-template-columns: 1fr; }
          .music-card {
            grid-template-columns: 48px minmax(0, 1fr) auto;
            gap: 12px;
            padding: 12px;
          }
          .music-card-thumb,
          .music-card-no-thumb { width: 48px; height: 48px; border-radius: 12px; }
          .music-card-time { display: none; }
          .music-card-badge { font-size: 0.72rem; padding: 5px 8px; }
          .playlist-track {
            grid-template-columns: 36px 48px minmax(0, 1fr);
          }
          .playlist-actions {
            grid-column: 2 / -1;
            justify-content: flex-start;
          }
          .music-stats { grid-template-columns: 1fr; }
          .music-total-banner { display: block; }
          .music-total-banner .label { margin-top: 8px; }
        }
      `}</style>

      <div className="music-page">
        {/* Header */}
        <div className="music-header">
          <div>
            <h1>TORO Music</h1>
            <p>현재 재생 중인 큐와 재생 기록을 한 곳에서 관리합니다.</p>
          </div>
        </div>

        {/* Tab Nav */}
        <div className="music-nav">
          {editable && (
            <button
              className={tab === 'playlist' ? 'active-history' : 'inactive'}
              onClick={() => { setTab('playlist'); setPage(0); refreshSelectedQueue() }}
            >
              현재 플레이리스트 <span className="tab-count">{queueDetail?.tracks.length || queues[0]?.trackCount || 0}</span>
            </button>
          )}
          <button
            className={tab === 'history' ? 'active-history' : 'inactive'}
            onClick={() => { setTab('history'); setPage(0) }}
          >
            재생 기록 <span className="tab-count">{logs.length}</span>
          </button>
          <button
            className={tab === 'stats' ? 'active-stats' : 'inactive'}
            onClick={() => { setTab('stats'); setPage(0) }}
          >
            통계 <span className="tab-count">{stats?.totalPlays || 0}</span>
          </button>
        </div>

        {/* Playlist Tab */}
        {editable && tab === 'playlist' && (
          <div className="playlist-panel">
            {queues.length === 0 ? (
              <div className="playlist-empty-small">지금 재생 중인 음악 큐가 없어요. 디스코드에서 먼저 `/play`로 음악을 틀어줘요.</div>
            ) : (
              <>
                <div className="playlist-toolbar">
                  <select
                    value={selectedGuildId}
                    aria-label="서버 선택"
                    onChange={(e) => { setSelectedGuildId(e.target.value); fetchQueueDetail(e.target.value) }}
                  >
                    {queues.map(q => (
                      <option key={q.guildId} value={q.guildId}>{q.guildName} · {q.trackCount}곡</option>
                    ))}
                  </select>
                  <input
                    value={addQuery}
                    onChange={(e) => setAddQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addTrack() }}
                    placeholder="검색어 또는 YouTube URL 추가"
                    aria-label="플레이리스트에 추가할 노래"
                  />
                  <button disabled={busy || !addQuery.trim()} onClick={addTrack}>추가</button>
                  <button disabled={busy} onClick={refreshSelectedQueue}>새로고침</button>
                </div>

                <div className="playlist-autoplay">
                  <span>자동 추천: {queueDetail?.autoplay.enabled ? (queueDetail.autoplay.genre || '현재 곡 기반') : '꺼짐'}</span>
                  <button disabled={busy} onClick={() => setAutoplayMode('artist')}>현재 곡 기반</button>
                  <button disabled={busy} onClick={() => setAutoplayMode('kpop')}>K-Pop</button>
                  <button disabled={busy} onClick={() => setAutoplayMode('rnb')}>R&B</button>
                  <button disabled={busy} onClick={() => setAutoplayMode('lofi')}>Lofi</button>
                  <button disabled={busy} onClick={() => setAutoplayMode('off')}>끄기</button>
                </div>

                <div className="playlist-status" role="status">{playlistStatus}</div>

                {!queueDetail ? (
                  <div className="playlist-empty-small">플레이리스트를 불러오는 중이에요.</div>
                ) : queueDetail.tracks.length === 0 ? (
                  <div className="playlist-empty-small">큐가 비어있어요.</div>
                ) : queueDetail.tracks.map((track, index) => (
                  <div key={`${track.url}-${index}`} className={`playlist-track ${index === 0 ? 'current' : ''}`}>
                    <div className="playlist-index">{index === 0 ? 'NOW' : index}</div>
                    {trackThumbnail(track) ? (
                      <img src={trackThumbnail(track)} alt="" className="music-card-thumb" />
                    ) : (
                      <div className="music-card-no-thumb" />
                    )}
                    <div className="playlist-info">
                      <div className="playlist-title">{track.title}</div>
                      <div className="playlist-meta">{track.duration} · {track.requestedBy}</div>
                    </div>
                    <div className="playlist-actions">
                      <button disabled={busy || index <= 1} onClick={() => moveQueuedTrack(index, index - 1)}>위</button>
                      <button disabled={busy || index === 0 || index >= queueDetail.tracks.length - 1} onClick={() => moveQueuedTrack(index, index + 1)}>아래</button>
                      <button className="remove" disabled={busy || index === 0} onClick={() => removeQueuedTrack(index)}>삭제</button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* History Tab */}
        {tab === 'history' && (
          <div className="music-list">
            {paged.length === 0 ? (
              <div className="music-empty">
                <p>아직 재생 기록이 없습니다. 디스코드에서 음악을 재생하면 이곳에 기록됩니다.</p>
              </div>
            ) : paged.map((log, i) => (
              <a
                key={log.id}
                href={log.url}
                target="_blank"
                rel="noopener noreferrer"
                className="music-card"
              >
                {trackThumbnail(log) ? (
                  <img src={trackThumbnail(log)} alt="" className="music-card-thumb" />
                ) : (
                  <div className="music-card-no-thumb" />
                )}
                <div className="music-card-info">
                  <div className="music-card-title">{log.title}</div>
                  <div className="music-card-sub">
                    {log.artist && <span>{log.artist}</span>}
                    <span>{log.duration}</span>
                  </div>
                </div>
                <span className={`music-card-badge ${log.requestedBy.startsWith('Autoplay') ? 'auto' : 'user'}`}>
                  {log.requestedBy.startsWith('Autoplay') ? 'Auto' : log.requestedBy}
                </span>
                <span className="music-card-time">{formatTime(log.timestamp)}</span>
              </a>
            ))}

            {logs.length > perPage && (
              <div className="music-pagination">
                <button disabled={page === 0} onClick={() => setPage(p => p - 1)}>이전</button>
                <span className="page-info">{page + 1} / {totalPages}</span>
                <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>다음</button>
              </div>
            )}
          </div>
        )}

        {/* Stats Tab */}
        {tab === 'stats' && stats && (
          <>
            <div className="music-total-banner">
              <div className="number">{stats.totalPlays}</div>
              <div className="label">누적 재생</div>
            </div>

            <div className="music-stats">
              <div className="stats-card tracks">
                <h3>인기 곡</h3>
                {stats.topTracks.length === 0 ? (
                  <p className="stats-empty">데이터가 없습니다.</p>
                ) : stats.topTracks.slice(0, 10).map((t, i) => (
                  <div key={i} className="stats-row">
                    <span className={`stats-rank ${i >= 3 ? 'number' : ''}`}>
                      {i + 1}
                    </span>
                    <div className="stats-name">
                      {t.title}
                      {t.artist && <div className="stats-artist">{t.artist}</div>}
                    </div>
                    <span className="stats-count">{t.count}</span>
                  </div>
                ))}
              </div>

              <div className="stats-card users">
                <h3>상위 요청자</h3>
                {stats.topUsers.length === 0 ? (
                  <p className="stats-empty">데이터가 없습니다.</p>
                ) : stats.topUsers.map((u, i) => (
                  <div key={i} className="stats-row">
                    <span className={`stats-rank ${i >= 3 ? 'number' : ''}`}>
                      {i + 1}
                    </span>
                    <span className="stats-name">{u.name}</span>
                    <span className="stats-count">{u.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Chat FAB */}
        <div className="music-chat-link" onClick={() => navigate('/chat')} title="채팅하러 가기">
        </div>
      </div>
    </>
  )
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
