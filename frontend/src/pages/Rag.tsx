import { useEffect, useState } from 'react'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../components/ui/table'
import type { RagStats, RagVector, SearchResult } from '../types'

export default function Rag() {
  const [stats, setStats] = useState<RagStats | null>(null)
  const [vectors, setVectors] = useState<RagVector[]>([])
  const [query, setQuery] = useState('토로 기억 테스트')
  const [results, setResults] = useState<SearchResult[]>([])
  const [testResult, setTestResult] = useState<string>('')
  const [loading, setLoading] = useState(true)

  const fetchData = () => {
    setLoading(true)
    Promise.all([
      fetch('/api/rag-stats').then(r => r.json()),
      fetch('/api/rag/vectors?limit=100').then(r => r.json()),
    ]).then(([statsData, vectorData]) => {
      setStats(statsData)
      setVectors(vectorData)
    }).catch(() => {
      setStats(null)
      setVectors([])
    }).finally(() => setLoading(false))
  }

  const runSearch = () => {
    fetch('/api/rag/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query }),
    }).then(r => r.json()).then(data => setResults(Array.isArray(data) ? data : [])).catch(() => setResults([]))
  }

  const runTest = () => {
    setTestResult('테스트 중...')
    fetch('/api/rag/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query }),
    }).then(r => r.json()).then(data => {
      if (data.ok) setTestResult(`OK · vector length ${data.vectorLength} · search hits ${(data.results || []).length}`)
      else setTestResult(`FAIL · ${data.error || 'unknown error'}`)
    }).catch(err => setTestResult(`FAIL · ${err.message}`))
  }

  useEffect(() => { fetchData() }, [])

  const teamEntries = Object.entries(stats?.teams || {})

  return (
    <div className="stagger">
      <div className="page-header">
        <h1>RAG Memory</h1>
        <p className="page-desc">팀별 장기 기억 벡터가 저장/검색되는지 확인합니다</p>
      </div>

      <div className="card-grid stagger">
        <div className="card"><div className="card-label">Status</div><div className={`status-indicator ${stats?.enabled ? 'online' : 'offline'}`}><span className="dot" />{stats?.enabled ? 'Enabled' : 'Disabled'}</div></div>
        <div className="card"><div className="card-label">Provider</div><div className="card-value">{stats?.provider || '-'}</div></div>
        <div className="card"><div className="card-label">Model</div><div className="mono">{stats?.model || '-'}</div></div>
        <div className="card"><div className="card-label">Vectors</div><div className="card-value text-accent">{stats?.vectorCount ?? 0}</div></div>
      </div>

      <div className="section-gap">
        <div className="section-title-row"><h2>Health Check</h2><button className="btn-secondary" onClick={fetchData}>Refresh</button></div>
        <div className="card">
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="검색/테스트 문장" style={{ flex: 1, minWidth: 260 }} />
            <button className="btn-primary" onClick={runTest}>Embedding Test</button>
            <button className="btn-secondary" onClick={runSearch}>Search</button>
          </div>
          {testResult && <div className="mono" style={{ marginTop: 12 }}>{testResult}</div>}
        </div>
      </div>

      <div className="section-gap">
        <h2>Team Buckets</h2>
        {teamEntries.length === 0 ? <div className="empty">팀별 저장량이 없습니다</div> : (
          <Table><TableHeader><TableRow><TableHead>Team ID</TableHead><TableHead style={{ width: 120 }}>Vectors</TableHead></TableRow></TableHeader><TableBody>
            {teamEntries.map(([teamId, count]) => <TableRow key={teamId}><TableCell className="mono">{teamId}</TableCell><TableCell className="mono">{count}</TableCell></TableRow>)}
          </TableBody></Table>
        )}
      </div>

      <div className="section-gap">
        <h2>Search Results</h2>
        {results.length === 0 ? <div className="empty">검색 결과가 없습니다</div> : <div className="stored-conversation-list">{results.map(r => <div className="card" key={r.id}><div className="card-label">{r.teamId || 'global'} · {r.channel} · {Math.round(r.score * 100)}%</div><div style={{ whiteSpace: 'pre-wrap' }}>{r.text}</div></div>)}</div>}
      </div>

      <div className="section-gap">
        <h2>Recent Vectors</h2>
        {loading ? <div className="empty">불러오는 중...</div> : vectors.length === 0 ? <div className="empty">저장된 RAG 벡터가 없습니다</div> : (
          <Table><TableHeader><TableRow><TableHead style={{ width: 180 }}>Team</TableHead><TableHead style={{ width: 160 }}>Channel</TableHead><TableHead>Text</TableHead><TableHead style={{ width: 90 }}>Hits</TableHead><TableHead style={{ width: 180 }}>Created</TableHead></TableRow></TableHeader><TableBody>
            {vectors.map(v => <TableRow key={v.id}><TableCell className="mono">{v.teamId || 'global'}</TableCell><TableCell>{v.channel}</TableCell><TableCell style={{ whiteSpace: 'pre-wrap' }}>{v.text.slice(0, 240)}</TableCell><TableCell className="mono">{v.hits}</TableCell><TableCell className="mono">{new Date(v.timestamp).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</TableCell></TableRow>)}
          </TableBody></Table>
        )}
      </div>
    </div>
  )
}
