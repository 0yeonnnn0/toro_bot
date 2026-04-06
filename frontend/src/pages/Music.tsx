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

const MEDAL = ['🥇', '🥈', '🥉']
const COLORS = ['#FF6B9D', '#C084FC', '#60D9FA', '#34D399', '#FBBF24', '#FB923C', '#F87171']

export default function Music() {
  const [logs, setLogs] = useState<MusicLogEntry[]>([])
  const [stats, setStats] = useState<MusicStats | null>(null)
  const [tab, setTab] = useState<'history' | 'stats'>('history')
  const [page, setPage] = useState(0)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const navigate = useNavigate()
  const perPage = 12

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
    <>
      <style>{`
        @keyframes music-float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          33% { transform: translateY(-6px) rotate(1deg); }
          66% { transform: translateY(-3px) rotate(-1deg); }
        }
        @keyframes music-pop-in {
          0% { opacity: 0; transform: scale(0.8) translateY(12px); }
          60% { transform: scale(1.03) translateY(-2px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes music-wiggle {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-3deg); }
          75% { transform: rotate(3deg); }
        }
        @keyframes music-bounce-in {
          0% { opacity: 0; transform: scale(0.3); }
          50% { transform: scale(1.08); }
          70% { transform: scale(0.95); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes note-float {
          0% { opacity: 0; transform: translateY(0) rotate(0deg) scale(0.5); }
          20% { opacity: 1; }
          100% { opacity: 0; transform: translateY(-60px) rotate(25deg) scale(1.2); }
        }
        @keyframes bar-dance {
          0%, 100% { height: 12px; }
          50% { height: var(--bar-h, 28px); }
        }
        @keyframes gradient-shift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        .music-page {
          --joy-pink: #FF6B9D;
          --joy-purple: #C084FC;
          --joy-blue: #60D9FA;
          --joy-green: #34D399;
          --joy-yellow: #FBBF24;
          --joy-orange: #FB923C;
          --joy-bg: #FFF8F0;
          --joy-card: #FFFFFF;
          --joy-text: #2D1B4E;
          --joy-text-soft: #8B7BA3;
          --joy-border: rgba(192, 132, 252, 0.2);
          --joy-font: 'Gaegu', cursive;
          --joy-font-title: 'Bagel Fat One', cursive;

          min-height: 100vh;
          background: var(--joy-bg);
          background-image:
            radial-gradient(circle at 15% 20%, rgba(255, 107, 157, 0.08) 0%, transparent 50%),
            radial-gradient(circle at 85% 30%, rgba(96, 217, 250, 0.08) 0%, transparent 50%),
            radial-gradient(circle at 50% 80%, rgba(192, 132, 252, 0.06) 0%, transparent 50%);
          font-family: var(--joy-font);
          color: var(--joy-text);
          padding: 0 20px 60px;
          overflow-x: hidden;
        }

        .music-header {
          text-align: center;
          padding: 48px 0 32px;
          position: relative;
          animation: music-pop-in 0.6s ease-out;
        }
        .music-header h1 {
          font-family: var(--joy-font-title);
          font-size: 3.2rem;
          background: linear-gradient(135deg, var(--joy-pink), var(--joy-purple), var(--joy-blue));
          background-size: 200% 200%;
          animation: gradient-shift 4s ease infinite;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin: 0;
          letter-spacing: -1px;
          filter: drop-shadow(0 2px 8px rgba(192, 132, 252, 0.3));
        }
        .music-header p {
          font-size: 1.15rem;
          color: var(--joy-text-soft);
          margin: 8px 0 0;
          font-weight: 400;
        }

        .music-dancing-bars {
          display: flex;
          gap: 4px;
          justify-content: center;
          margin-top: 16px;
          height: 32px;
          align-items: flex-end;
        }
        .music-dancing-bars span {
          width: 6px;
          border-radius: 3px;
          animation: bar-dance 0.8s ease-in-out infinite;
        }

        .music-nav {
          display: flex;
          justify-content: center;
          gap: 10px;
          margin-bottom: 28px;
          animation: music-pop-in 0.6s ease-out 0.1s both;
        }
        .music-nav button {
          font-family: var(--joy-font);
          font-size: 1.2rem;
          font-weight: 700;
          padding: 10px 28px;
          border-radius: 50px;
          border: 3px solid transparent;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
          position: relative;
          overflow: hidden;
        }
        .music-nav button:hover {
          transform: scale(1.05) translateY(-2px);
        }
        .music-nav button:active {
          transform: scale(0.97);
        }
        .music-nav button.active-history {
          background: linear-gradient(135deg, var(--joy-pink), var(--joy-purple));
          color: white;
          border-color: rgba(255,255,255,0.3);
          box-shadow: 0 4px 20px rgba(255, 107, 157, 0.35);
        }
        .music-nav button.active-stats {
          background: linear-gradient(135deg, var(--joy-blue), var(--joy-green));
          color: white;
          border-color: rgba(255,255,255,0.3);
          box-shadow: 0 4px 20px rgba(96, 217, 250, 0.35);
        }
        .music-nav button.inactive {
          background: white;
          color: var(--joy-text-soft);
          border-color: var(--joy-border);
          box-shadow: 0 2px 8px rgba(0,0,0,0.04);
        }
        .music-nav button .tab-count {
          font-size: 0.75rem;
          opacity: 0.7;
          margin-left: 6px;
        }

        .music-chat-link {
          position: fixed;
          bottom: 24px;
          right: 24px;
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background: linear-gradient(135deg, var(--joy-yellow), var(--joy-orange));
          border: 3px solid white;
          box-shadow: 0 4px 24px rgba(251, 146, 60, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.6rem;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          z-index: 100;
          animation: music-bounce-in 0.5s ease-out 0.8s both;
        }
        .music-chat-link:hover {
          transform: scale(1.15) rotate(-8deg);
          box-shadow: 0 6px 32px rgba(251, 146, 60, 0.5);
        }
        .music-chat-link:active {
          transform: scale(0.9);
        }

        /* ── History Cards ── */
        .music-list {
          max-width: 720px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .music-card {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 12px 16px;
          background: var(--joy-card);
          border-radius: 20px;
          border: 2.5px solid var(--joy-border);
          cursor: pointer;
          text-decoration: none;
          color: inherit;
          transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
          animation: music-pop-in 0.4s ease-out both;
          position: relative;
          overflow: hidden;
        }
        .music-card::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 18px;
          background: linear-gradient(135deg, rgba(255,107,157,0.05), rgba(96,217,250,0.05));
          opacity: 0;
          transition: opacity 0.3s;
        }
        .music-card:hover::before { opacity: 1; }
        .music-card:hover {
          transform: translateY(-3px) scale(1.01);
          border-color: var(--joy-purple);
          box-shadow: 0 8px 30px rgba(192, 132, 252, 0.15);
        }
        .music-card:active {
          transform: scale(0.98);
        }
        .music-card-thumb {
          width: 52px;
          height: 52px;
          border-radius: 14px;
          object-fit: cover;
          flex-shrink: 0;
          border: 2px solid rgba(192, 132, 252, 0.15);
        }
        .music-card-no-thumb {
          width: 52px;
          height: 52px;
          border-radius: 14px;
          flex-shrink: 0;
          background: linear-gradient(135deg, var(--joy-purple), var(--joy-pink));
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.4rem;
        }
        .music-card-info {
          flex: 1;
          min-width: 0;
          position: relative;
          z-index: 1;
        }
        .music-card-title {
          font-size: 1.05rem;
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          color: var(--joy-text);
        }
        .music-card-sub {
          font-size: 0.85rem;
          color: var(--joy-text-soft);
          margin-top: 2px;
          display: flex;
          gap: 10px;
          align-items: center;
        }
        .music-card-badge {
          font-size: 0.75rem;
          padding: 2px 10px;
          border-radius: 20px;
          font-weight: 700;
          flex-shrink: 0;
          position: relative;
          z-index: 1;
        }
        .music-card-badge.user {
          background: linear-gradient(135deg, rgba(192, 132, 252, 0.15), rgba(255, 107, 157, 0.15));
          color: #9333EA;
        }
        .music-card-badge.auto {
          background: rgba(139, 123, 163, 0.1);
          color: var(--joy-text-soft);
        }
        .music-card-time {
          font-size: 0.78rem;
          color: var(--joy-text-soft);
          opacity: 0.7;
          flex-shrink: 0;
          position: relative;
          z-index: 1;
        }

        /* ── Pagination ── */
        .music-pagination {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 12px;
          margin-top: 24px;
          animation: music-pop-in 0.4s ease-out 0.3s both;
        }
        .music-pagination button {
          font-family: var(--joy-font);
          font-size: 1.1rem;
          font-weight: 700;
          padding: 8px 20px;
          border-radius: 50px;
          border: 2.5px solid var(--joy-border);
          background: white;
          color: var(--joy-text);
          cursor: pointer;
          transition: all 0.2s;
        }
        .music-pagination button:hover:not(:disabled) {
          border-color: var(--joy-purple);
          background: rgba(192, 132, 252, 0.05);
          transform: scale(1.05);
        }
        .music-pagination button:disabled {
          opacity: 0.3;
          cursor: default;
        }
        .music-pagination .page-info {
          font-size: 1rem;
          font-weight: 700;
          color: var(--joy-text-soft);
        }

        /* ── Stats ── */
        .music-stats {
          max-width: 720px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          animation: music-pop-in 0.5s ease-out;
        }
        @media (max-width: 600px) {
          .music-stats { grid-template-columns: 1fr; }
        }
        .stats-card {
          background: var(--joy-card);
          border-radius: 24px;
          border: 2.5px solid var(--joy-border);
          padding: 24px;
          transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .stats-card:hover {
          transform: translateY(-4px);
        }
        .stats-card h3 {
          font-family: var(--joy-font-title);
          font-size: 1.3rem;
          margin: 0 0 16px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .stats-card.tracks h3 { color: var(--joy-pink); }
        .stats-card.users h3 { color: var(--joy-blue); }

        .stats-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 0;
          border-bottom: 1.5px dashed rgba(192, 132, 252, 0.12);
          animation: music-pop-in 0.3s ease-out both;
        }
        .stats-row:last-child { border-bottom: none; }
        .stats-rank {
          font-size: 1.3rem;
          width: 32px;
          text-align: center;
          flex-shrink: 0;
        }
        .stats-rank.number {
          font-family: var(--joy-font-title);
          font-size: 1rem;
          color: var(--joy-text-soft);
        }
        .stats-name {
          flex: 1;
          font-weight: 700;
          font-size: 0.95rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .stats-artist {
          font-size: 0.75rem;
          color: var(--joy-text-soft);
          font-weight: 400;
        }
        .stats-count {
          font-family: var(--joy-font-title);
          font-size: 1.1rem;
          padding: 2px 12px;
          border-radius: 20px;
          flex-shrink: 0;
        }
        .stats-card.tracks .stats-count {
          background: linear-gradient(135deg, rgba(255,107,157,0.15), rgba(192,132,252,0.15));
          color: var(--joy-pink);
        }
        .stats-card.users .stats-count {
          background: linear-gradient(135deg, rgba(96,217,250,0.15), rgba(52,211,153,0.15));
          color: #0891B2;
        }

        .music-total-banner {
          text-align: center;
          margin-bottom: 20px;
          animation: music-pop-in 0.5s ease-out;
        }
        .music-total-banner .number {
          font-family: var(--joy-font-title);
          font-size: 2.5rem;
          background: linear-gradient(135deg, var(--joy-pink), var(--joy-purple));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .music-total-banner .label {
          font-size: 1rem;
          color: var(--joy-text-soft);
        }

        .music-empty {
          text-align: center;
          padding: 60px 20px;
          animation: music-pop-in 0.5s ease-out;
        }
        .music-empty .icon {
          font-size: 4rem;
          animation: music-float 3s ease-in-out infinite;
        }
        .music-empty p {
          font-size: 1.2rem;
          color: var(--joy-text-soft);
          margin-top: 12px;
        }

        /* ── Notes (floating decorations) ── */
        .music-note {
          position: fixed;
          pointer-events: none;
          font-size: 1.4rem;
          animation: note-float 2.5s ease-out forwards;
          z-index: 50;
        }
      `}</style>

      <div className="music-page">
        {/* Header */}
        <div className="music-header">
          <h1>TORO Jukebox</h1>
          <p>우리가 함께 들은 노래들</p>
          <div className="music-dancing-bars">
            {[0, 1, 2, 3, 4].map(i => (
              <span key={i} style={{
                background: COLORS[i],
                animationDelay: `${i * 0.15}s`,
                ['--bar-h' as any]: `${20 + Math.random() * 16}px`,
              }} />
            ))}
          </div>
        </div>

        {/* Tab Nav */}
        <div className="music-nav">
          <button
            className={tab === 'history' ? 'active-history' : 'inactive'}
            onClick={() => { setTab('history'); setPage(0) }}
          >
            🎵 기록 <span className="tab-count">{logs.length}</span>
          </button>
          <button
            className={tab === 'stats' ? 'active-stats' : 'inactive'}
            onClick={() => { setTab('stats'); setPage(0) }}
          >
            🏆 통계 <span className="tab-count">{stats?.totalPlays || 0}</span>
          </button>
        </div>

        {/* History Tab */}
        {tab === 'history' && (
          <div className="music-list">
            {paged.length === 0 ? (
              <div className="music-empty">
                <div className="icon">🎧</div>
                <p>아직 재생 기록이 없어요!</p>
              </div>
            ) : paged.map((log, i) => (
              <a
                key={log.id}
                href={log.url}
                target="_blank"
                rel="noopener noreferrer"
                className="music-card"
                style={{ animationDelay: `${i * 0.04}s` }}
                onMouseEnter={() => setHoveredId(log.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {log.thumbnail ? (
                  <img src={log.thumbnail} alt="" className="music-card-thumb" />
                ) : (
                  <div className="music-card-no-thumb">🎵</div>
                )}
                <div className="music-card-info">
                  <div className="music-card-title">{log.title}</div>
                  <div className="music-card-sub">
                    {log.artist && <span>{log.artist}</span>}
                    <span>{log.duration}</span>
                  </div>
                </div>
                <span className={`music-card-badge ${log.requestedBy.startsWith('Autoplay') ? 'auto' : 'user'}`}>
                  {log.requestedBy.startsWith('Autoplay') ? '🤖' : log.requestedBy}
                </span>
                <span className="music-card-time">{formatTime(log.timestamp)}</span>
                {hoveredId === log.id && <FloatingNote />}
              </a>
            ))}

            {logs.length > perPage && (
              <div className="music-pagination">
                <button disabled={page === 0} onClick={() => setPage(p => p - 1)}>◁ 이전</button>
                <span className="page-info">{page + 1} / {totalPages}</span>
                <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>다음 ▷</button>
              </div>
            )}
          </div>
        )}

        {/* Stats Tab */}
        {tab === 'stats' && stats && (
          <>
            <div className="music-total-banner">
              <div className="number">{stats.totalPlays}</div>
              <div className="label">곡이 재생되었어요!</div>
            </div>

            <div className="music-stats">
              <div className="stats-card tracks">
                <h3>🎵 인기 곡</h3>
                {stats.topTracks.length === 0 ? (
                  <p style={{ color: 'var(--joy-text-soft)', textAlign: 'center', padding: 20 }}>데이터가 없어요</p>
                ) : stats.topTracks.slice(0, 10).map((t, i) => (
                  <div key={i} className="stats-row" style={{ animationDelay: `${i * 0.05}s` }}>
                    <span className={`stats-rank ${i >= 3 ? 'number' : ''}`}>
                      {i < 3 ? MEDAL[i] : i + 1}
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
                <h3>🎧 음악 대장</h3>
                {stats.topUsers.length === 0 ? (
                  <p style={{ color: 'var(--joy-text-soft)', textAlign: 'center', padding: 20 }}>데이터가 없어요</p>
                ) : stats.topUsers.map((u, i) => (
                  <div key={i} className="stats-row" style={{ animationDelay: `${i * 0.05}s` }}>
                    <span className={`stats-rank ${i >= 3 ? 'number' : ''}`}>
                      {i < 3 ? MEDAL[i] : i + 1}
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
          💬
        </div>
      </div>
    </>
  )
}

function FloatingNote() {
  const notes = ['♪', '♫', '♬', '🎵', '🎶']
  const note = notes[Math.floor(Math.random() * notes.length)]
  const left = 20 + Math.random() * 60

  return (
    <span className="music-note" style={{ left: `${left}%`, top: '20%' }}>
      {note}
    </span>
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
