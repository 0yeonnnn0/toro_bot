import { useEffect, useState } from 'react'
import { toast } from 'sonner'

const MODEL_OPTIONS: Record<string, { value: string; label: string }[]> = {
  codex: [{ value: 'codex-cli-default', label: 'Codex CLI Default' }],
  google: [
    { value: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  ],
  openai: [
    { value: 'gpt-5', label: 'GPT-5' },
    { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
  ],
  anthropic: [
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
  ],
}

export default function Settings() {
  const [provider, setProvider] = useState('codex')
  const [model, setModel] = useState('codex-cli-default')
  const [imageRecognition, setImageRecognition] = useState(true)
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
  const [editingKeys, setEditingKeys] = useState<Record<string, string>>({})

  useEffect(() => {
    fetch('/api/config').then(r => r.json()).then(d => {
      setProvider(d.aiProvider || 'codex')
      setModel(d.model || 'codex-cli-default')
      setImageRecognition(d.imageRecognition ?? true)
    }).catch(() => toast.error('설정 로드 실패'))
    fetch('/api/keys').then(r => r.json()).then(setApiKeys).catch(() => {})
  }, [])

  const saveModel = async () => {
    const res = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aiProvider: provider, model, imageRecognition }),
    })
    if (res.ok) toast.success('AI 설정 저장 완료')
    else toast.error('저장 실패')
  }

  const saveKeys = async () => {
    const updates = Object.fromEntries(Object.entries(editingKeys).filter(([, value]) => value))
    if (Object.keys(updates).length === 0) return toast('변경된 키가 없습니다')
    const res = await fetch('/api/keys', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (!res.ok) return toast.error('저장 실패')
    toast.success('키 저장 완료')
    setEditingKeys({})
    setApiKeys(await fetch('/api/keys').then(r => r.json()))
  }

  const models = MODEL_OPTIONS[provider] || []

  return (
    <div className="stagger">
      <div className="page-header">
        <h1>Settings</h1>
        <p className="page-desc">TORO의 모델과 운영 키만 관리합니다</p>
      </div>

      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">AI Model</span>
          <button className="btn btn-primary" onClick={saveModel}>Save</button>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <select value={provider} onChange={e => {
            setProvider(e.target.value)
            setModel(MODEL_OPTIONS[e.target.value]?.[0]?.value || '')
          }} className="model-select" style={{ flex: '1 1 160px' }}>
            <option value="codex">Codex CLI</option>
            <option value="google">Google Gemini</option>
            <option value="openai">OpenAI API</option>
            <option value="anthropic">Anthropic</option>
          </select>
          <select value={model} onChange={e => setModel(e.target.value)} className="model-select" style={{ flex: '2 1 220px' }}>
            {models.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
          <input type="checkbox" checked={imageRecognition} onChange={e => setImageRecognition(e.target.checked)} />
          멘션에 첨부된 이미지 인식
        </label>
      </div>

      <div className="panel">
        <div className="panel-header"><span className="panel-title">Fixed Product Policy</span></div>
        <div className="model-info-grid">
          <div className="model-info-item"><span className="model-info-label">Reply</span><span className="model-info-value">멘션 전용</span><span className="model-info-badge fixed">고정</span></div>
          <div className="model-info-item"><span className="model-info-label">Memory</span><span className="model-info-value">최근 Discord 대화만 요청 시 조회</span><span className="model-info-badge fixed">일회성</span></div>
          <div className="model-info-item"><span className="model-info-label">Persona</span><span className="model-info-value">TORO 단일 말투</span><span className="model-info-badge fixed">고정</span></div>
        </div>
        <p className="form-hint">프리셋, 오늘의 NPC, RAG, 사용자 프로필, 공개 웹 채팅은 비활성화되어 있습니다.</p>
      </div>

      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">API Keys</span>
          <button className="btn btn-primary" onClick={saveKeys}>Save</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {[
            ['googleApiKey', 'Google API Key'],
            ['openaiApiKey', 'OpenAI API Key'],
            ['anthropicApiKey', 'Anthropic API Key'],
            ['dashboardSecret', 'Dashboard Password'],
          ].map(([key, label]) => (
            <div key={key}>
              <div className="card-label" style={{ marginBottom: 'var(--space-2)' }}>{label}</div>
              <input type="password"
                value={editingKeys[key] !== undefined ? editingKeys[key] : apiKeys[key] || ''}
                onChange={e => setEditingKeys(prev => ({ ...prev, [key]: e.target.value }))}
                onFocus={() => { if (editingKeys[key] === undefined) setEditingKeys(prev => ({ ...prev, [key]: '' })) }}
                placeholder={apiKeys[key] ? `현재: ${apiKeys[key]}` : '설정되지 않음'}
                autoComplete="off" style={{ width: '100%', fontFamily: 'var(--mono)' }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
