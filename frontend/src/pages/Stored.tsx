import { useEffect, useState } from 'react'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../components/ui/table'
import type { StoredConversation, StoredMemo } from '../types'

export default function Stored() {
  const [memos, setMemos] = useState<StoredMemo[]>([])
  const [conversations, setConversations] = useState<StoredConversation[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = () => {
    setLoading(true)
    Promise.all([
      fetch('/api/stored/memos?limit=100').then(r => r.json()),
      fetch('/api/stored/conversations?limit=50').then(r => r.json()),
    ]).then(([memoData, conversationData]) => {
      setMemos(memoData)
      setConversations(conversationData)
    }).catch(() => {
      setMemos([])
      setConversations([])
    }).finally(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, [])

  return (
    <div className="stagger">
      <div className="page-header">
        <h1>Stored Data</h1>
        <p className="page-desc">팀별로 저장된 메모와 대화 히스토리를 확인합니다</p>
      </div>

      <div className="section-gap">
        <div className="section-title-row">
          <h2>Saved Memos</h2>
          <button className="btn-secondary" onClick={fetchData}>Refresh</button>
        </div>
        {loading ? <div className="empty">불러오는 중...</div> : memos.length === 0 ? <div className="empty">저장된 메모가 없습니다</div> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead style={{ width: 160 }}>Team</TableHead>
                <TableHead>Content</TableHead>
                <TableHead style={{ width: 180 }}>Author</TableHead>
                <TableHead style={{ width: 180 }}>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {memos.map(memo => (
                <TableRow key={memo.id}>
                  <TableCell>{memo.team.name}</TableCell>
                  <TableCell style={{ whiteSpace: 'pre-wrap' }}>{memo.content}</TableCell>
                  <TableCell className="mono">{memo.authorDiscordUserId}</TableCell>
                  <TableCell className="mono">{formatDate(memo.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="section-gap">
        <h2>Conversation History</h2>
        {loading ? <div className="empty">불러오는 중...</div> : conversations.length === 0 ? <div className="empty">저장된 대화가 없습니다</div> : (
          <div className="stored-conversation-list">
            {conversations.map(conversation => (
              <div className="card" key={conversation.id}>
                <div className="card-label">{conversation.team.name} · #{conversation.channelId}</div>
                <div className="mono" style={{ color: 'var(--text-muted)', marginBottom: 12 }}>{formatDate(conversation.updatedAt)}</div>
                <div className="stored-message-list">
                  {conversation.messages.map(message => (
                    <div className="stored-message" key={message.id}>
                      <span className="mono">{message.role}</span>
                      <strong>{message.displayName || message.discordUserId || 'unknown'}</strong>
                      <span>{message.content}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
}
