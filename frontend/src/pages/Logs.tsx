import { useState, useEffect } from 'react'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../components/ui/table'
import type { LogEntry, EventEntry, ErrorEntry, ChatLogEntry } from '../types'

export default function Logs() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [events, setEvents] = useState<EventEntry[]>([])
  const [errors, setErrors] = useState<ErrorEntry[]>([])
  const [chatLogs, setChatLogs] = useState<ChatLogEntry[]>([])
  const [filter, setFilter] = useState('')
  const [tab, setTab] = useState('messages')
  const [page, setPage] = useState(0)
  const [perPage, setPerPage] = useState(20)
  const [logDate, setLogDate] = useState(new Date().toISOString().slice(0, 10))
  const [logDates, setLogDates] = useState<string[]>([])

  const fetchData = () => {
    fetch(`/api/logs?date=${logDate}`).then(r => r.json()).then(data => setLogs(data.reverse())).catch(() => {})
    fetch('/api/events').then(r => r.json()).then(setEvents).catch(() => {})
    fetch('/api/errors').then(r => r.json()).then(setErrors).catch(() => {})
    fetch('/api/chat-logs?limit=200').then(r => r.json()).then(setChatLogs).catch(() => {})
  }

  useEffect(() => {
    fetch('/api/log-dates').then(r => r.json()).then(setLogDates).catch(() => {})
  }, [])

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 5000)
    return () => clearInterval(id)
  }, [logDate])

  const channels = [...new Set(logs.map(l => l.channel))]
  const filtered = filter ? logs.filter(l => l.channel === filter) : logs

  // Pagination helper
  function paginate<T>(items: T[]): { paged: T[]; total: number; totalPages: number } {
    const total = items.length
    const totalPages = Math.max(1, Math.ceil(total / perPage))
    const paged = items.slice(page * perPage, (page + 1) * perPage)
    return { paged, total, totalPages }
  }

  const PaginationBar = ({ total, totalPages }: { total: number; totalPages: number }) => (
    <div className="log-controls pagination-bar" style={{ justifyContent: 'space-between', marginTop: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <span className="hint mono">{total}개 중 {page * perPage + 1}–{Math.min((page + 1) * perPage, total)}</span>
        <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(0) }}
          className="model-select">
          <option value={20}>20개</option>
          <option value={30}>30개</option>
          <option value={40}>40개</option>
        </select>
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <button className="btn btn-ghost"
          disabled={page === 0} onClick={() => setPage(p => p - 1)}>← 이전</button>
        <span className="hint mono" style={{ display: 'flex', alignItems: 'center' }}>{page + 1} / {totalPages}</span>
        <button className="btn btn-ghost"
          disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>다음 →</button>
      </div>
    </div>
  )

  return (
    <div className="stagger">
      <div className="page-header">
        <h1>Logs</h1>
        <p className="page-desc">메시지, 이벤트, 에러 로그 — 5초 간격 갱신</p>
      </div>

      {/* Tab Switcher */}
      <div className="log-controls">
        <div className="nav-links" style={{ gap: '2px' }}>
          {['messages', 'web-chat', 'events', 'errors'].map(t => (
            <a key={t} className={tab === t ? 'active' : ''} onClick={() => { setTab(t); setPage(0) }}
              style={{ cursor: 'pointer' }}>
              {t === 'messages' ? 'Messages' :
               t === 'web-chat' ? 'Web Chat' :
               t === 'events' ? 'Events' :
               'Errors'}
              <span className="mono" style={{ marginLeft: 6, fontSize: '0.7rem', opacity: 0.5 }}>
                {t === 'messages' ? logs.length : t === 'web-chat' ? chatLogs.length : t === 'events' ? events.length : errors.length}
              </span>
            </a>
          ))}
        </div>
      </div>

      {/* Messages Tab */}
      {tab === 'messages' && (
        <>
          <div className="log-controls" style={{ flexWrap: 'wrap' }}>
            <select value={logDate} onChange={e => { setLogDate(e.target.value); setPage(0) }}>
              {logDates.length > 0 ? logDates.map(d => (
                <option key={d} value={d}>{d}</option>
              )) : (
                <option value={logDate}>{logDate}</option>
              )}
            </select>
            <select value={filter} onChange={e => setFilter(e.target.value)}>
              <option value="">All Channels</option>
              {channels.map(ch => <option key={ch} value={ch}>#{ch}</option>)}
            </select>
            <span className="hint mono">{filtered.length}개</span>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead style={{ minWidth: 80 }}>Time</TableHead>
                <TableHead style={{ minWidth: 100 }}>Server</TableHead>
                <TableHead style={{ minWidth: 100 }}>Channel</TableHead>
                <TableHead style={{ minWidth: 90 }}>Author</TableHead>
                <TableHead style={{ minWidth: 300 }}>Message</TableHead>
                <TableHead style={{ minWidth: 60 }}>Trigger</TableHead>
                <TableHead style={{ minWidth: 50 }}>RAG</TableHead>
                <TableHead style={{ minWidth: 55 }}>Speed</TableHead>
                <TableHead style={{ minWidth: 100 }}>Model</TableHead>
                <TableHead style={{ minWidth: 400 }}>Bot Reply</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} style={{ textAlign: 'center', padding: 'var(--space-10)', color: 'var(--text-tertiary)' }}>
                    로그가 없습니다
                  </TableCell>
                </TableRow>
              ) : paginate(filtered).paged.map((log, i) => (
                <TableRow
                  key={i}
                  className={log.error ? 'row-error' : log.botReplied ? 'row-replied' : ''}
                >
                  <TableCell className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                    {new Date(log.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </TableCell>
                  <TableCell style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>{log.guild || '—'}</TableCell>
                  <TableCell style={{ color: 'var(--text-tertiary)' }}>#{log.channel}</TableCell>
                  <TableCell style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{log.author}</TableCell>
                  <TableCell className="wrap" style={{ color: 'var(--text-primary)' }}>{log.content}</TableCell>
                  <TableCell>
                    {log.triggerReason && (
                      <span className={`log-badge ${log.triggerReason}`}>
                        {log.triggerReason === 'mention' ? '@' : '%'}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="mono" style={{ fontSize: '0.73rem', color: log.ragHits > 0 ? 'var(--accent)' : 'var(--text-tertiary)' }}>
                    {log.ragHits > 0 ? `${log.ragHits}` : '—'}
                  </TableCell>
                  <TableCell className="mono" style={{ fontSize: '0.73rem', color: getSpeedColor(log.responseTime) }}>
                    {log.responseTime ? `${(log.responseTime / 1000).toFixed(1)}s` : '—'}
                  </TableCell>
                  <TableCell className="mono" style={{ fontSize: '0.7rem', color: log.model ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>
                    {log.model || '—'}
                  </TableCell>
                  <TableCell className="wrap" style={{ color: log.error ? 'var(--red)' : log.botReply === '<SKIP>' ? 'var(--text-tertiary)' : log.botReply ? 'var(--accent)' : 'var(--text-tertiary)', fontSize: '0.83rem', fontStyle: log.botReply === '<SKIP>' ? 'italic' : 'normal' }}>
                    {log.error ? `[${log.error}]` : log.botReply || '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {filtered.length > perPage && <PaginationBar total={filtered.length} totalPages={paginate(filtered).totalPages} />}
        </>
      )}

      {/* Web Chat Tab */}
      {tab === 'web-chat' && (
        <>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead style={{ minWidth: 80 }}>Time</TableHead>
              <TableHead style={{ minWidth: 90 }}>Character</TableHead>
              <TableHead style={{ minWidth: 90 }}>Nickname</TableHead>
              <TableHead style={{ minWidth: 250 }}>User Message</TableHead>
              <TableHead style={{ minWidth: 100 }}>Model</TableHead>
              <TableHead style={{ minWidth: 400 }}>Bot Reply</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {chatLogs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} style={{ textAlign: 'center', padding: 'var(--space-10)', color: 'var(--text-tertiary)' }}>
                  웹 채팅 로그가 없습니다
                </TableCell>
              </TableRow>
            ) : paginate(chatLogs).paged.map((log) => (
              <TableRow key={log.id} className="row-replied">
                <TableCell className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                  {new Date(log.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </TableCell>
                <TableCell>
                  <span className="log-badge mention">{log.characterName}</span>
                </TableCell>
                <TableCell style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{log.nickname}</TableCell>
                <TableCell className="wrap" style={{ color: 'var(--text-primary)' }}>{log.userMessage}</TableCell>
                <TableCell className="mono" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{log.model || '—'}</TableCell>
                <TableCell className="wrap" style={{ color: 'var(--accent)', fontSize: '0.83rem' }}>{log.botReply}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {chatLogs.length > perPage && <PaginationBar total={chatLogs.length} totalPages={paginate(chatLogs).totalPages} />}
        </>
      )}

      {/* Events Tab */}
      {tab === 'events' && (
        <>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead style={{ width: 170 }}>Time</TableHead>
              <TableHead style={{ width: 150 }}>Type</TableHead>
              <TableHead>Detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} style={{ textAlign: 'center', padding: 'var(--space-10)', color: 'var(--text-tertiary)' }}>
                  이벤트가 없습니다
                </TableCell>
              </TableRow>
            ) : paginate(events).paged.map((ev, i) => (
              <TableRow key={i}>
                <TableCell className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                  {new Date(ev.timestamp).toLocaleString('ko-KR')}
                </TableCell>
                <TableCell>
                  <span className={`log-badge ${ev.type}`}>{ev.type.replace(/_/g, ' ')}</span>
                </TableCell>
                <TableCell style={{ color: 'var(--text-primary)' }}>{ev.detail}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {events.length > perPage && <PaginationBar total={events.length} totalPages={paginate(events).totalPages} />}
        </>
      )}

      {/* Errors Tab */}
      {tab === 'errors' && (
        <>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead style={{ width: 170 }}>Time</TableHead>
              <TableHead style={{ width: 130 }}>Type</TableHead>
              <TableHead>Message</TableHead>
              <TableHead style={{ width: 200 }}>Context</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {errors.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} style={{ textAlign: 'center', padding: 'var(--space-10)', color: 'var(--text-tertiary)' }}>
                  에러가 없습니다
                </TableCell>
              </TableRow>
            ) : paginate(errors).paged.map((err, i) => (
              <TableRow key={i} className="row-error">
                <TableCell className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                  {new Date(err.timestamp).toLocaleString('ko-KR')}
                </TableCell>
                <TableCell>
                  <span className="log-badge rate_limit">{err.type.replace(/_/g, ' ')}</span>
                </TableCell>
                <TableCell className="wrap" style={{ color: 'var(--red)', fontSize: '0.8rem' }}>{err.message}</TableCell>
                <TableCell style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>{err.detail}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {errors.length > perPage && <PaginationBar total={errors.length} totalPages={paginate(errors).totalPages} />}
        </>
      )}
    </div>
  )
}

function getSpeedColor(ms: number | null) {
  if (!ms) return 'var(--text-tertiary)'
  if (ms < 2000) return 'var(--green)'
  if (ms < 5000) return 'var(--amber)'
  return 'var(--red)'
}
