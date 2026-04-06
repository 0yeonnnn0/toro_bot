import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Bar, ComposedChart } from 'recharts'
import type { PresetInfo, Preset, RagStats, RagVector, SearchResult, TimelineEntry } from '../types'

interface ChatMessage {
  role: 'user' | 'bot';
  content: string;
}

const MODEL_OPTIONS: Record<string, { value: string; label: string }[]> = {
  google: [
    { value: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite (Preview)' },
    { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { value: 'gemma-3-27b-it', label: 'Gemma 3 27B (Fallback)' },
    { value: 'gemma-3-12b-it', label: 'Gemma 3 12B' },
    { value: 'gemma-3-4b-it', label: 'Gemma 3 4B' },
    { value: 'gemma-3-1b-it', label: 'Gemma 3 1B' },
  ],
  openai: [
    { value: 'gpt-5', label: 'GPT-5' },
    { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
    { value: 'gpt-5-nano', label: 'GPT-5 Nano' },
    { value: 'gpt-4.1', label: 'GPT-4.1' },
    { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
    { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  ],
  anthropic: [
    { value: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
  ],
}

export default function Settings() {
  const [provider, setProvider] = useState('google')
  const [model, setModel] = useState('')
  const [replyMode, setReplyMode] = useState('auto')
  const [judgeInterval, setJudgeInterval] = useState(120)
  const [judgeThreshold, setJudgeThreshold] = useState(5)
  const [judgePrompt, setJudgePrompt] = useState('')
  const [defaultJudgePrompt, setDefaultJudgePrompt] = useState('')
  const [imageRecognition, setImageRecognition] = useState(true)
  const [passiveLogging, setPassiveLogging] = useState(true)
  const [embeddingModel, setEmbeddingModel] = useState('gemini-embedding-001')
  const [webShowNickname, setWebShowNickname] = useState(false)
  const [webSystemPrompt, setWebSystemPrompt] = useState('')
  const [presets, setPresets] = useState<PresetInfo[]>([])
  const [activePresetId, setActivePresetId] = useState('')
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [editingPreset, setEditingPreset] = useState<Preset | null>(null)
  const [ragStats, setRagStats] = useState<RagStats>({ vectorCount: 0, indexCreated: false })
  const [timeline, setTimeline] = useState<TimelineEntry[]>([])
  const [ragView, setRagView] = useState<string | null>(null)
  const [vectors, setVectors] = useState<RagVector[]>([])
  const [ragQuery, setRagQuery] = useState('')
  const [ragResults, setRagResults] = useState<SearchResult[]>([])
  const [ragSearching, setRagSearching] = useState(false)
  const [expandedChannel, setExpandedChannel] = useState<string | null>(null)
  const [uploadStatus, setUploadStatus] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [testMsg, setTestMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'prompt' | 'ai' | 'memory'>('ai')
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
  const [editingKeys, setEditingKeys] = useState<Record<string, string>>({})
  const chatEndRef = useRef<HTMLDivElement>(null)

  const fetchPresets = () => {
    fetch('/api/presets').then(r => r.json()).then(d => {
      setPresets(d.presets)
      setActivePresetId(d.activeId)
    }).catch(() => toast.error('프리셋 로드 실패'))
  }

  useEffect(() => {
    fetch('/api/config').then(r => r.json()).then(d => {
      setProvider(d.aiProvider || 'google')
      setModel(d.model || '')
      setReplyMode(d.replyMode || 'auto')
      setJudgeInterval(d.judgeInterval || 120)
      setJudgeThreshold(d.judgeThreshold || 5)
      setJudgePrompt(d.judgePrompt || '')
      setDefaultJudgePrompt(d.defaultJudgePrompt || '')
      setImageRecognition(d.imageRecognition ?? true)
      setPassiveLogging(d.passiveLogging ?? true)
      setEmbeddingModel(d.embeddingModel || 'gemini-embedding-001')
      setWebShowNickname(d.webShowNickname ?? false)
      setWebSystemPrompt(d.webSystemPrompt || '')
    }).catch(() => toast.error('설정 로드 실패'))
    fetchPresets()
    fetch('/api/rag-stats').then(r => r.json()).then(setRagStats).catch(() => {})
    fetch('/api/rag/timeline').then(r => r.json()).then(setTimeline).catch(() => {})
    fetch('/api/keys').then(r => r.json()).then(setApiKeys).catch(() => {})
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 프리셋 선택하면 프롬프트 로드
  const selectPreset = async (id: string) => {
    try {
      const res = await fetch(`/api/presets/${id}`)
      if (res.ok) setEditingPreset(await res.json())
    } catch { toast.error('프리셋 로드 실패') }
  }

  const activatePreset = async (id: string) => {
    try {
      const res = await fetch(`/api/presets/${id}/activate`, { method: 'PUT' })
      if (res.ok) {
        setActivePresetId(id)
        toast.success(`프리셋 "${presets.find(p => p.id === id)?.name}" 활성화`)
        fetchPresets()
      }
    } catch { toast.error('프리셋 활성화 실패') }
  }

  const togglePresetEnabled = async (id: string, enabled: boolean) => {
    try {
      const res = await fetch(`/api/presets/${id}/toggle`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      if (res.ok) {
        toast.success(enabled ? '프리셋 활성화' : '프리셋 비활성화')
        fetchPresets()
      }
    } catch { toast.error('프리셋 토글 실패') }
  }

  const savePreset = async () => {
    if (!editingPreset) return
    try {
      const res = await fetch(`/api/presets/${editingPreset.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingPreset),
      })
      if (res.ok) { toast.success('프리셋 저장 완료'); fetchPresets() }
      else toast.error('프리셋 저장 실패')
    } catch { toast.error('프리셋 저장 실패') }
  }

  const createPreset = async () => {
    const name = prompt('새 프리셋 이름:')
    if (!name) return
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_')
    try {
      const res = await fetch('/api/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name, description: '', prompt: '', ownerSuffix: '', userSuffix: '' }),
      })
      if (res.ok) {
        toast.success(`프리셋 "${name}" 생성`)
        fetchPresets()
        selectPreset(id)
      }
    } catch { toast.error('프리셋 생성 실패') }
  }

  const deletePreset = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return
    try {
      const res = await fetch(`/api/presets/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('프리셋 삭제됨')
        setEditingPreset(null)
        fetchPresets()
      } else {
        const data = await res.json()
        toast.error(data.error)
      }
    } catch { toast.error('프리셋 삭제 실패') }
  }

  const saveReplyMode = async () => {
    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replyMode, judgeInterval, judgeThreshold, judgePrompt }),
      })
      const labels: Record<string, string> = { auto: '자동', interval: '간격', mute: '음소거' }
      res.ok ? toast.success(`응답 모드: ${labels[replyMode]}`) : toast.error('저장 실패')
    } catch { toast.error('저장 실패') }
  }

  const saveModel = async () => {
    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiProvider: provider, model }),
      })
      res.ok ? toast.success(`모델 변경: ${model}`) : toast.error('저장 실패')
    } catch { toast.error('저장 실패') }
  }

  const sendTest = async () => {
    const msg = testMsg.trim()
    if (!msg || loading) return
    setTestMsg('')
    setMessages(prev => [...prev, { role: 'user', content: msg }])
    setLoading(true)
    try {
      const res = await fetch('/api/test-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'bot', content: data.reply || data.error }])
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'bot', content: 'Error: ' + err.message }])
    }
    setLoading(false)
  }

  // RAG 벡터 로드
  useEffect(() => {
    if (ragView === 'vectors' && vectors.length === 0) {
      fetch('/api/rag/vectors').then(r => r.json()).then(setVectors).catch(() => {})
    }
  }, [ragView])

  const searchRag = async () => {
    if (!ragQuery.trim() || ragSearching) return
    setRagSearching(true)
    try {
      const res = await fetch('/api/rag/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: ragQuery }),
      })
      const data = await res.json()
      setRagResults(data)
      if (data.length === 0) toast('매칭되는 벡터가 없습니다')
    } catch (err: any) {
      toast.error(err.message)
    }
    setRagSearching(false)
  }

  const groupByChannel = (items: RagVector[]): Record<string, RagVector[]> => {
    const groups: Record<string, RagVector[]> = {}
    for (const item of items) {
      const ch = item.channel || 'unknown'
      if (!groups[ch]) groups[ch] = []
      groups[ch].push(item)
    }
    for (const ch in groups) {
      groups[ch].sort((a, b) => b.timestamp - a.timestamp)
    }
    return groups
  }

  const handleRagUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setUploadStatus(`업로드 중... (${files.length}개 파일)`)
    let totalParsed = 0, totalChunks = 0
    for (const file of files) {
      const formData = new FormData()
      formData.append('file', file)
      try {
        const res = await fetch('/api/rag/upload', { method: 'POST', body: formData })
        const data = await res.json()
        if (res.ok) {
          totalParsed += data.parsed
          totalChunks += data.chunks
        } else {
          toast.error(`${file.name}: ${data.error}`)
        }
      } catch (err: any) {
        toast.error(`${file.name}: ${err.message}`)
      }
    }
    setUploadStatus('')
    if (totalChunks > 0) toast.success(`${totalParsed.toLocaleString()}개 청크 → ${totalChunks}개 벡터 저장`)
    fetch('/api/rag-stats').then(r => r.json()).then(setRagStats).catch(() => {})
    e.target.value = ''
  }

  const clearRag = async () => {
    if (!confirm('RAG 데이터를 전부 삭제하시겠습니까?')) return
    try {
      const res = await fetch('/api/rag', { method: 'DELETE' })
      if (res.ok) {
        toast.success('RAG 초기화 완료')
        fetch('/api/rag-stats').then(r => r.json()).then(setRagStats).catch(() => {})
      }
    } catch { toast.error('RAG 초기화 실패') }
  }

  const saveKeys = async () => {
    const updates: Record<string, string> = {}
    for (const [key, value] of Object.entries(editingKeys)) {
      if (value !== undefined && value !== '') updates[key] = value
    }
    if (Object.keys(updates).length === 0) { toast('변경된 키가 없습니다'); return }
    try {
      const res = await fetch('/api/keys', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) })
      if (res.ok) {
        toast.success('API 키 저장 완료')
        const d = await fetch('/api/keys').then(r => r.json())
        setApiKeys(d)
        setEditingKeys({})
      } else toast.error('저장 실패')
    } catch { toast.error('저장 실패') }
  }

  const [testingKey, setTestingKey] = useState<string | null>(null)
  const testApiKey = async (provider: string) => {
    setTestingKey(provider)
    try {
      const res = await fetch('/api/keys/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      })
      const data = await res.json()
      data.ok ? toast.success(`${provider} 키 유효`) : toast.error(data.error || '키 검증 실패')
    } catch { toast.error('키 검증 실패') }
    setTestingKey(null)
  }

  const models = MODEL_OPTIONS[provider] || []

  return (
    <div className="stagger">
      <div className="page-header">
        <h1>Settings</h1>
        <p className="page-desc">봇 설정을 변경하고 실시간으로 테스트합니다</p>
      </div>

      <div className="settings-tabs">
        {([
          { id: 'ai' as const, label: 'AI 설정' },
          { id: 'prompt' as const, label: '프롬프트' },
          { id: 'memory' as const, label: '메모리' },
        ] as const).map(tab => (
          <button key={tab.id}
            className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>

        <div className="settings-main">
        <div className="command-center">
        <div className="stagger">
        {activeTab === 'ai' && (<>
          {/* AI Model */}
          <div className="panel" id="model">
            <div className="panel-header">
              <span className="panel-title">AI Model</span>
              <button className="btn btn-primary" onClick={saveModel}>Save</button>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <select value={provider} onChange={e => {
                setProvider(e.target.value)
                setModel(MODEL_OPTIONS[e.target.value]?.[0]?.value || '')
              }} className="model-select" style={{ minWidth: 0, flex: '1 1 120px' }}>
                <option value="google">Google Gemini</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
              </select>
              <select value={model} onChange={e => setModel(e.target.value)}
                className="model-select" style={{ minWidth: 0, flex: '2 1 180px' }}>
                {models.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>

            <div className="model-info-grid">
              <div className="model-info-item">
                <span className="model-info-label">Chat</span>
                <span className="model-info-value mono">{model}</span>
                <span className="model-info-badge">변경 가능</span>
              </div>
              <div className="model-info-item">
                <span className="model-info-label">Image</span>
                <span className="model-info-value mono">Gemini 2.5 (flash / pro)</span>
                <span className="model-info-badge fixed">/draw</span>
              </div>
              <div className="model-info-item">
                <span className="model-info-label">Embedding</span>
                <select value={embeddingModel} onChange={e => {
                  setEmbeddingModel(e.target.value)
                  fetch('/api/config', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ embeddingModel: e.target.value }),
                  }).then(() => toast.success(`임베딩 모델: ${e.target.value}`)).catch(() => {})
                }} className="model-select" style={{ flex: 1, minWidth: 0 }}>
                  <option value="gemini-embedding-001">gemini-embedding-001</option>
                  <option value="embedding-001">embedding-001</option>
                </select>
              </div>
            </div>

            <div style={{ marginTop: 'var(--space-4)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
                <input type="checkbox" checked={imageRecognition}
                  onChange={e => {
                    setImageRecognition(e.target.checked)
                    fetch('/api/config', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ imageRecognition: e.target.checked }),
                    }).then(() => toast.success(e.target.checked ? '이미지 인식 켜짐' : '이미지 인식 꺼짐')).catch(() => {})
                  }} />
                이미지 인식 (Gemini Vision)
              </label>
              <p className="form-hint">디스코드에 첨부된 이미지를 AI가 인식하여 대화에 반영합니다. Google 모델에서만 동작.</p>
            </div>

            <div style={{ marginTop: 'var(--space-4)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
                <input type="checkbox" checked={passiveLogging}
                  onChange={e => {
                    setPassiveLogging(e.target.checked)
                    fetch('/api/config', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ passiveLogging: e.target.checked }),
                    }).then(() => toast.success(e.target.checked ? '대화 수집 켜짐' : '대화 수집 꺼짐')).catch(() => {})
                  }} />
                대화 수집 (로그 · RAG · 통계)
              </label>
              <p className="form-hint">꺼두면 멘션이 아닌 일반 대화는 로그, RAG 메모리, 키워드 통계에 기록되지 않습니다. 멘션 대화는 항상 기록됩니다.</p>
            </div>
          </div>

          {/* Reply Mode */}
          <div className="panel" id="reply-mode">
            <div className="panel-header">
              <span className="panel-title">Reply Mode</span>
              <button className="btn btn-primary" onClick={saveReplyMode}>Save</button>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-5)', flexWrap: 'wrap' }}>
              {[
                { value: 'auto', label: '자동 (AI 판단)' },
                { value: 'interval', label: '간격 모드' },
                { value: 'mute', label: '음소거' },
              ].map(m => (
                <button
                  key={m.value}
                  className={`btn ${replyMode === m.value ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ flex: '1 1 auto' }}
                  onClick={() => setReplyMode(m.value)}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {replyMode === 'interval' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div>
                  <div className="hint" style={{ marginBottom: 'var(--space-2)' }}>타이머 (초)</div>
                  <div className="slider-row">
                    <input type="range" min="10" max="600" value={judgeInterval}
                      onChange={e => setJudgeInterval(Number(e.target.value))} />
                    <span className="slider-value">{judgeInterval}s</span>
                  </div>
                </div>
                <div>
                  <div className="hint" style={{ marginBottom: 'var(--space-2)' }}>메시지 수</div>
                  <div className="slider-row">
                    <input type="range" min="1" max="50" value={judgeThreshold}
                      onChange={e => setJudgeThreshold(Number(e.target.value))} />
                    <span className="slider-value">{judgeThreshold}개</span>
                  </div>
                </div>
                <p className="form-hint">{judgeInterval}초 또는 {judgeThreshold}개 메시지 중 먼저 도달하면 AI가 판단</p>
              </div>
            )}
            {replyMode === 'auto' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                  <div className="card-label" style={{ marginBottom: 0 }}>AI 판단 프롬프트</div>
                  {judgePrompt && (
                    <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: '0.65rem' }}
                      onClick={() => setJudgePrompt('')}>기본값으로 초기화</button>
                  )}
                </div>
                <textarea rows={14} value={judgePrompt || defaultJudgePrompt}
                  onChange={e => setJudgePrompt(e.target.value)}
                  spellCheck={false}
                  style={{ minHeight: '260px' }} />
                <p className="form-hint">봇이 자동으로 끼어들지 판단하는 프롬프트. 반드시 &lt;SKIP&gt; 응답 조건을 포함해야 함.</p>
              </div>
            )}
            {replyMode === 'mute' && (
              <p className="form-hint">자동 참여 완전 중단 (멘션은 여전히 응답)</p>
            )}
          </div>

          {/* Web Chat Settings */}
          <div className="panel" id="web-chat">
            <div className="panel-header">
              <span className="panel-title">Web Chat</span>
              <button className="btn btn-primary" onClick={async () => {
                const res = await fetch('/api/config', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ webShowNickname, webSystemPrompt }),
                })
                res.ok ? toast.success('웹 채팅 설정 저장') : toast.error('저장 실패')
              }}>Save</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer', fontSize: '0.87rem', color: 'var(--text-primary)' }}>
                <input type="checkbox" checked={webShowNickname} onChange={e => setWebShowNickname(e.target.checked)}
                  style={{ accentColor: 'var(--accent)' }} />
                AI에게 닉네임 포함해서 보내기
              </label>
            </div>
            <div>
              <div className="card-label" style={{ marginBottom: 'var(--space-2)' }}>웹 채팅 추가 프롬프트</div>
              <textarea rows={8} value={webSystemPrompt}
                onChange={e => setWebSystemPrompt(e.target.value)}
                placeholder="웹 채팅에서만 프리셋 뒤에 추가되는 프롬프트 (선택사항)"
                spellCheck={false}
                style={{ minHeight: '150px' }} />
              <p className="form-hint">프리셋 프롬프트 뒤에 추가됨. 웹 채팅 전용 규칙을 넣을 때 사용.</p>
            </div>
          </div>

          {/* API Keys */}
          <div className="panel" id="api-keys">
            <div className="panel-header">
              <span className="panel-title">API Keys</span>
              <button className="btn btn-primary" onClick={saveKeys}>Save</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {[
                { key: 'googleApiKey', label: 'Google API Key', hint: 'Gemini / Gemma 모델에 필요', testProvider: 'google' },
                { key: 'openaiApiKey', label: 'OpenAI API Key', hint: 'GPT 모델에 필요', testProvider: 'openai' },
                { key: 'anthropicApiKey', label: 'Anthropic API Key', hint: 'Claude 모델에 필요', testProvider: 'anthropic' },
                { key: 'dashboardSecret', label: 'Dashboard Password', hint: '대시보드 로그인 비밀번호 (변경 시 새 로그인부터 적용)', testProvider: '' },
              ].map(({ key, label, hint, testProvider }) => (
                <div key={key}>
                  <div className="card-label" style={{ marginBottom: 'var(--space-2)' }}>{label}</div>
                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <input type="text"
                      value={editingKeys[key] !== undefined ? editingKeys[key] : apiKeys[key] || ''}
                      onChange={e => setEditingKeys(prev => ({ ...prev, [key]: e.target.value }))}
                      onFocus={() => { if (editingKeys[key] === undefined) setEditingKeys(prev => ({ ...prev, [key]: '' })) }}
                      placeholder={apiKeys[key] ? `현재: ${apiKeys[key]}` : '설정되지 않음'}
                      spellCheck={false} autoComplete="off"
                      style={{ fontFamily: 'var(--mono)', flex: 1 }} />
                    {testProvider && (
                      <button className="btn btn-ghost" onClick={() => testApiKey(testProvider)}
                        disabled={testingKey === testProvider}
                        style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                        {testingKey === testProvider ? 'Testing...' : 'Test'}
                      </button>
                    )}
                  </div>
                  <p className="form-hint">{hint}</p>
                </div>
              ))}
            </div>
          </div>
        </>)}

          {activeTab === 'memory' && (<>
          {/* RAG Memory */}
          <div className="panel" id="rag">
            <div className="panel-header">
              <span className="panel-title">RAG Memory</span>
              <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                <span className={`panel-badge ${ragStats.indexCreated ? 'green' : ''}`}>
                  {ragStats.indexCreated ? 'Active' : 'Inactive'}
                </span>
                <button className="btn btn-ghost"
                  style={{ padding: '2px 10px', fontSize: '0.73rem' }}
                  onClick={() => { setRagView(ragView === 'vectors' ? null : 'vectors') }}>
                  {ragView === 'vectors' ? 'Close' : 'Browse'}
                </button>
              </div>
            </div>
            <div className="rag-stats">
              <div className="rag-stat-item">
                <div className="card-label">Stored Vectors</div>
                <div className="card-value mono text-accent">{ragStats.vectorCount}</div>
              </div>
              <div className="rag-stat-item">
                <div className="card-label">Upload</div>
                <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                  <input id="rag-upload" type="file" accept=".md,.txt" multiple
                    onChange={handleRagUpload} style={{ display: 'none' }} />
                  <label htmlFor="rag-upload" className="btn btn-ghost"
                    style={{ cursor: 'pointer', fontSize: '0.8rem', padding: '4px 12px' }}>
                    {uploadStatus || '.md / .txt 업로드'}
                  </label>
                </div>
              </div>
            </div>
            <p className="form-hint">Obsidian 노트(.md) 또는 카카오톡 대화(.txt)를 업로드하면 AI가 지식으로 활용합니다.</p>

            {/* Timeline Chart */}
            {timeline.length > 0 && (
              <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: 'var(--space-5)', paddingTop: 'var(--space-5)' }}>
                <div className="card-label" style={{ marginBottom: 'var(--space-4)' }}>Timeline</div>
                <div style={{ width: '100%', height: 180 }}>
                  <ResponsiveContainer>
                    <ComposedChart data={timeline} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                      <defs>
                        <linearGradient id="gradStored" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#5865f2" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#5865f2" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="gradHits" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#22c55e" stopOpacity={0.6} />
                          <stop offset="100%" stopColor="#22c55e" stopOpacity={0.1} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="date"
                        tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }}
                        tickFormatter={d => d.slice(5)}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'var(--bg-card)',
                          border: '1px solid var(--border-default)',
                          borderRadius: 8,
                          fontSize: 12,
                          color: 'var(--text-primary)',
                        }}
                        labelFormatter={d => d}
                        formatter={(value, name) => [value, name === 'stored' ? 'Vectors' : 'Hits']}
                      />
                      <Area
                        type="monotone"
                        dataKey="stored"
                        stroke="#5865f2"
                        strokeWidth={2}
                        fill="url(#gradStored)"
                      />
                      <Bar
                        dataKey="hits"
                        fill="url(#gradHits)"
                        radius={[3, 3, 0, 0]}
                        barSize={8}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-6)', marginTop: 'var(--space-3)' }}>
                  <span className="hint" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 10, height: 3, background: '#5865f2', borderRadius: 2, display: 'inline-block' }} />
                    Vectors stored
                  </span>
                  <span className="hint" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, background: 'rgba(34,197,94,0.5)', borderRadius: 2, display: 'inline-block' }} />
                    Hit count
                  </span>
                </div>
              </div>
            )}

            {/* RAG Search */}
            <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: 'var(--space-5)', paddingTop: 'var(--space-5)' }}>
              <div className="card-label" style={{ marginBottom: 'var(--space-3)' }}>Search Test</div>
              <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                <input type="text" value={ragQuery} onChange={e => setRagQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && searchRag()}
                  placeholder="검색어 입력..." style={{ flex: 1 }} />
                <button className="btn btn-primary" onClick={searchRag}
                  disabled={ragSearching || !ragQuery.trim()}>
                  {ragSearching ? '...' : 'Search'}
                </button>
              </div>
              {ragResults.length > 0 && (
                <div className="rag-search-results">
                  {ragResults.map((r, i) => (
                    <div key={i} className="rag-result-item">
                      <div className="rag-result-header">
                        <span className="mono" style={{ color: 'var(--accent)', fontSize: '0.75rem' }}>
                          {(r.score * 100).toFixed(0)}% match
                        </span>
                        <span className="hint">
                          #{r.channel} · {new Date(r.timestamp).toLocaleDateString('ko-KR')}
                        </span>
                      </div>
                      <div className="rag-result-text">{r.text}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* RAG Vector Browser */}
            {ragView === 'vectors' && (
              <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: 'var(--space-5)', paddingTop: 'var(--space-5)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                  <div className="card-label">Stored Vectors ({vectors.length})</div>
                  <button className="btn btn-ghost" style={{ color: 'var(--red)', fontSize: '0.75rem', padding: '2px 10px' }}
                    onClick={clearRag}>
                    Reset All
                  </button>
                </div>

                {vectors.length === 0 ? (
                  <div className="hint">벡터가 없습니다</div>
                ) : (
                  <div className="rag-vector-list">
                    {/* 채널별 그룹 */}
                    {Object.entries(groupByChannel(vectors)).map(([channel, items]) => (
                      <div key={channel} className="rag-channel-group">
                        <div className="rag-channel-header">
                          <span>#{channel}</span>
                          <span className="mono hint">{items.length} chunks</span>
                        </div>
                        {items.slice(0, expandedChannel === channel ? items.length : 3).map((v, i) => (
                          <div key={i} className="rag-vector-item">
                            <div className="rag-vector-meta">
                              <span className="hint">{new Date(v.timestamp).toLocaleString('ko-KR')}</span>
                              <span className="mono hint">{v.messageCount} msgs</span>
                            </div>
                            <div className="rag-vector-text">{v.text}</div>
                          </div>
                        ))}
                        {items.length > 3 && (
                          <button className="btn btn-ghost"
                            style={{ width: '100%', fontSize: '0.75rem', padding: '4px', marginTop: 'var(--space-2)' }}
                            onClick={() => setExpandedChannel(expandedChannel === channel ? null : channel)}>
                            {expandedChannel === channel ? 'Collapse' : `+${items.length - 3} more`}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          </>)}

          {activeTab === 'prompt' && (<>
          {/* Prompt Presets */}
          <div className="panel" id="presets">
            <div className="panel-header">
              <span className="panel-title">Prompt Presets</span>
              <button className="btn btn-ghost" onClick={createPreset}
                style={{ padding: '4px 12px', fontSize: '0.8rem' }}>
                + New
              </button>
            </div>

            <div className="preset-list">
              {presets.map((p, i) => (
                <div
                  key={p.id}
                  className={`preset-item ${p.id === activePresetId ? 'active' : ''} ${editingPreset?.id === p.id ? 'editing' : ''} ${!p.enabled ? 'disabled' : ''} ${dragIdx === i ? 'dragging' : ''}`}
                  onClick={() => selectPreset(p.id)}
                  draggable
                  onDragStart={() => setDragIdx(i)}
                  onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('drag-over') }}
                  onDragLeave={e => e.currentTarget.classList.remove('drag-over')}
                  onDrop={async e => {
                    e.currentTarget.classList.remove('drag-over')
                    if (dragIdx === null || dragIdx === i) return
                    const reordered = [...presets]
                    const [moved] = reordered.splice(dragIdx, 1)
                    reordered.splice(i, 0, moved)
                    setPresets(reordered)
                    setDragIdx(null)
                    await fetch('/api/presets/reorder', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ ids: reordered.map(p => p.id) }),
                    })
                    toast.success('프리셋 순서 변경')
                  }}
                  onDragEnd={() => setDragIdx(null)}
                >
                  <span className="preset-drag-handle">⠿</span>
                  <div className="preset-info">
                    <span className="preset-name" style={{ opacity: p.enabled ? 1 : 0.4 }}>{p.name}</span>
                    <span className="preset-desc">{p.description}</span>
                  </div>
                  <div className="preset-actions" style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    {p.id === activePresetId ? (
                      <span className="panel-badge green">Active</span>
                    ) : p.enabled ? (
                      <button className="btn btn-ghost"
                        style={{ padding: '2px 10px', fontSize: '0.73rem' }}
                        onClick={(e) => { e.stopPropagation(); activatePreset(p.id); }}>
                        Activate
                      </button>
                    ) : (
                      <span className="panel-badge" style={{ opacity: 0.5 }}>Disabled</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Prompt Editor */}
          {editingPreset && (
            <div className="panel">
              <div className="panel-header">
                <span className="panel-title">
                  Editing: {editingPreset.name}
                </span>
                {editingPreset && (
                  <button className="btn btn-ghost" style={{ padding: '4px 12px', fontSize: '0.75rem', color: 'var(--red)' }}
                    onClick={() => deletePreset(editingPreset.id)}>
                    Delete
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
                <input type="text" value={editingPreset.name}
                  onChange={e => setEditingPreset({ ...editingPreset, name: e.target.value })}
                  placeholder="프리셋 이름" style={{ flex: 1 }} />
                <input type="text" value={editingPreset.description}
                  onChange={e => setEditingPreset({ ...editingPreset, description: e.target.value })}
                  placeholder="설명" style={{ flex: 2 }} />
                <select value={editingPreset.voice || 'kore'}
                  onChange={e => setEditingPreset({ ...editingPreset, voice: e.target.value })}
                  className="model-select" style={{ minWidth: '140px' }}>
                  <option value="kore">Kore (여성, 차분)</option>
                  <option value="aoede">Aoede (여성, 밝음)</option>
                  <option value="leda">Leda (여성, 따뜻)</option>
                  <option value="puck">Puck (남성, 활발)</option>
                  <option value="charon">Charon (남성, 낮음)</option>
                  <option value="fenrir">Fenrir (남성, 부드러움)</option>
                </select>
              </div>

              <div className="card-label" style={{ marginBottom: 'var(--space-2)' }}>System Prompt</div>
              <textarea rows={14} value={editingPreset.prompt}
                onChange={e => setEditingPreset({ ...editingPreset, prompt: e.target.value })}
                spellCheck={false} />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
                <div>
                  <div className="card-label" style={{ marginBottom: 'var(--space-2)' }}>Owner Suffix</div>
                  <textarea rows={4} value={editingPreset.ownerSuffix || ''}
                    onChange={e => setEditingPreset({ ...editingPreset, ownerSuffix: e.target.value })}
                    style={{ minHeight: 'auto' }} spellCheck={false} />
                </div>
                <div>
                  <div className="card-label" style={{ marginBottom: 'var(--space-2)' }}>User Suffix</div>
                  <textarea rows={4} value={editingPreset.userSuffix || ''}
                    onChange={e => setEditingPreset({ ...editingPreset, userSuffix: e.target.value })}
                    style={{ minHeight: 'auto' }} spellCheck={false} />
                </div>
              </div>

              <div className="btn-group">
                <button className="btn btn-primary" onClick={savePreset}>Save Preset</button>
                <button className="btn btn-ghost" onClick={async () => {
                  await savePreset()
                  await activatePreset(editingPreset.id)
                }}>
                  Save & Activate
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ marginLeft: 'auto', color: editingPreset.enabled ? 'var(--red)' : 'var(--green)' }}
                  onClick={async () => {
                    await togglePresetEnabled(editingPreset.id, !editingPreset.enabled)
                    setEditingPreset({ ...editingPreset, enabled: !editingPreset.enabled })
                  }}
                >
                  {editingPreset.enabled ? 'Disable' : 'Enable'}
                </button>
              </div>
              <p className="form-hint">Owner Suffix: 주인에게만 추가되는 프롬프트. User Suffix: 일반 유저에게 추가.</p>
            </div>
          )}
        </>)}
        </div>

      </div>
      </div>

      {/* Floating Live Test Chatbot */}
      <div className={`float-chat ${chatOpen ? 'open' : ''}`}>
        {!chatOpen ? (
          <button className="float-chat-fab" onClick={() => setChatOpen(true)}>
            =^0w0^=
          </button>
        ) : (
          <div className="float-chat-window">
            <div className="float-chat-header" onClick={() => setChatOpen(false)} style={{ cursor: 'pointer' }}>
              <span>Live Test</span>
              <div style={{ display: 'flex', gap: '4px' }}>
                {messages.length > 0 && (
                  <button className="float-chat-header-btn" onClick={e => { e.stopPropagation(); setMessages([]) }}>Clear</button>
                )}
                <button className="float-chat-header-btn" onClick={e => { e.stopPropagation(); setChatOpen(false) }}>✕</button>
              </div>
            </div>
            <div className="float-chat-messages">
              {messages.length === 0 && (
                <div className="empty" style={{ padding: '3rem 0' }}>
                  <div className="empty-icon">=^0w0^=</div>
                  <div>메시지를 보내서 봇 응답을 테스트하세요</div>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`chat-msg ${m.role}`}>{m.content}</div>
              ))}
              {loading && <div className="chat-msg bot loading">typing</div>}
              <div ref={chatEndRef} />
            </div>
            <div className="float-chat-input">
              <input type="text" value={testMsg}
                onChange={e => setTestMsg(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendTest()}
                placeholder="메시지 입력..." disabled={loading} />
              <button className="btn btn-primary" onClick={sendTest}
                disabled={loading || !testMsg.trim()}>Send</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
