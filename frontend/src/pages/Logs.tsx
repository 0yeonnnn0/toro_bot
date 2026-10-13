import { useEffect, useState } from 'react'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../components/ui/table'
import type { LogEntry, EventEntry, ErrorEntry } from '../types'

export default function Logs() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [events, setEvents] = useState<EventEntry[]>([])
  const [errors, setErrors] = useState<ErrorEntry[]>([])
  const [tab, setTab] = useState<'requests' | 'events' | 'errors'>('requests')
  const [logDate, setLogDate] = useState(new Date().toISOString().slice(0, 10))
  const [logDates, setLogDates] = useState<string[]>([])

  useEffect(() => {
    fetch('/api/log-dates').then(r => r.json()).then(setLogDates).catch(() => {})
  }, [])

  useEffect(() => {
    const fetchData = () => {
      fetch(`/api/logs?date=${logDate}`).then(r => r.json()).then(data => setLogs(data.reverse())).catch(() => {})
      fetch('/api/events').then(r => r.json()).then(setEvents).catch(() => {})
      fetch('/api/errors').then(r => r.json()).then(setErrors).catch(() => {})
    }
    fetchData()
    const id = setInterval(fetchData, 5000)
    return () => clearInterval(id)
  }, [logDate])

  return (
    <div className="stagger">
      <div className="page-header">
        <h1>Logs</h1>
        <p className="page-desc">대화 원문 없이 요청 결과와 운영 이벤트만 확인합니다</p>
      </div>

      <div className="log-controls">
        <div className="nav-links" style={{ gap: 2 }}>
          {(['requests', 'events', 'errors'] as const).map(value => (
            <a key={value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)} style={{ cursor: 'pointer' }}>
              {value === 'requests' ? 'Requests' : value === 'events' ? 'Events' : 'Errors'}
            </a>
          ))}
        </div>
      </div>

      {tab === 'requests' && (
        <>
          <div className="log-controls">
            <select value={logDate} onChange={e => setLogDate(e.target.value)}>
              {logDates.length > 0 ? logDates.map(date => <option key={date} value={date}>{date}</option>) : <option value={logDate}>{logDate}</option>}
            </select>
            <span className="hint mono">{logs.length} requests</span>
          </div>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Time</TableHead><TableHead>Server</TableHead><TableHead>Channel</TableHead>
              <TableHead>Result</TableHead><TableHead>Speed</TableHead><TableHead>Model</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {logs.length === 0 ? <EmptyRow columns={6} /> : logs.map((log, index) => (
                <TableRow key={index} className={log.error ? 'row-error' : 'row-replied'}>
                  <TableCell className="mono">{new Date(log.timestamp).toLocaleTimeString('ko-KR')}</TableCell>
                  <TableCell>{log.guild || '—'}</TableCell>
                  <TableCell>#{log.channel}</TableCell>
                  <TableCell>{log.error ? `실패: ${log.error}` : log.botReplied ? '응답 완료' : '응답 없음'}</TableCell>
                  <TableCell className="mono" style={{ color: getSpeedColor(log.responseTime) }}>{log.responseTime ? `${(log.responseTime / 1000).toFixed(1)}s` : '—'}</TableCell>
                  <TableCell className="mono">{log.model || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}

      {tab === 'events' && (
        <Table><TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Type</TableHead><TableHead>Detail</TableHead></TableRow></TableHeader>
          <TableBody>{events.length === 0 ? <EmptyRow columns={3} /> : events.map((event, index) => (
            <TableRow key={index}><TableCell className="mono">{new Date(event.timestamp).toLocaleString('ko-KR')}</TableCell><TableCell>{event.type}</TableCell><TableCell>{event.detail}</TableCell></TableRow>
          ))}</TableBody></Table>
      )}

      {tab === 'errors' && (
        <Table><TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Type</TableHead><TableHead>Message</TableHead><TableHead>Context</TableHead></TableRow></TableHeader>
          <TableBody>{errors.length === 0 ? <EmptyRow columns={4} /> : errors.map((error, index) => (
            <TableRow key={index} className="row-error"><TableCell className="mono">{new Date(error.timestamp).toLocaleString('ko-KR')}</TableCell><TableCell>{error.type}</TableCell><TableCell>{error.message}</TableCell><TableCell>{error.detail}</TableCell></TableRow>
          ))}</TableBody></Table>
      )}
    </div>
  )
}

function EmptyRow({ columns }: { columns: number }) {
  return <TableRow><TableCell colSpan={columns} style={{ textAlign: 'center', padding: 'var(--space-10)', color: 'var(--text-tertiary)' }}>로그가 없습니다</TableCell></TableRow>
}

function getSpeedColor(ms: number | null) {
  if (!ms) return 'var(--text-tertiary)'
  if (ms < 2000) return 'var(--green)'
  if (ms < 5000) return 'var(--amber)'
  return 'var(--red)'
}
