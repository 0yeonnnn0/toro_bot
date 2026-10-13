import { useEffect, useState } from 'react'
import { DashboardSkeleton } from '../components/Skeleton'
import type { BotStatus } from '../types'

export default function Dashboard() {
  const [status, setStatus] = useState<BotStatus | null>(null)

  useEffect(() => {
    const fetchStatus = () => fetch('/api/status').then(r => r.json()).then(setStatus).catch(() => {})
    fetchStatus()
    const id = setInterval(fetchStatus, 5000)
    return () => clearInterval(id)
  }, [])

  if (!status) return <DashboardSkeleton />

  return (
    <div className="stagger">
      <div className="page-header">
        <h1>Overview</h1>
        <p className="page-desc">멘션 기반 TORO와 파티 음악 상태를 확인합니다</p>
      </div>

      <div className="card-grid stagger">
        <div className="card">
          <div className="card-label">Status</div>
          <div className={`status-indicator ${status.online ? 'online' : 'offline'}`}>
            <span className="dot" />
            {status.online ? 'Online' : 'Offline'}
          </div>
        </div>
        <div className="card">
          <div className="card-label">Uptime</div>
          <div className="card-value">{fmt(status.uptime)}</div>
        </div>
        <div className="card">
          <div className="card-label">Discord Servers</div>
          <div className="card-value">{status.guilds.toLocaleString()}</div>
        </div>
        <div className="card">
          <div className="card-label">Mention Requests</div>
          <div className="card-value">{status.stats.messagesProcessed.toLocaleString()}</div>
        </div>
        <div className="card">
          <div className="card-label">Replies</div>
          <div className="card-value text-accent">{status.stats.repliesSent.toLocaleString()}</div>
        </div>
        <div className="card">
          <div className="card-label">AI Queue</div>
          <div className="card-value">{status.queue.activeCount}/{status.queue.maxConcurrent}</div>
        </div>
      </div>

      <div className="panel section-gap">
        <div className="panel-header"><span className="panel-title">Product Policy</span></div>
        <p>TORO는 멘션받았을 때 Discord의 최근 채널·스레드 메시지만 읽습니다.</p>
        <p className="form-hint">장기 대화 기억, 사용자 프로필, RAG 벡터, 공개 웹 채팅은 사용하지 않습니다.</p>
      </div>
    </div>
  )
}

function fmt(ms: number) {
  const d = Math.floor(ms / 86400000)
  const h = Math.floor((ms % 86400000) / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}
