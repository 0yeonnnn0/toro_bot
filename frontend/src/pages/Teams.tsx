import { ArchiveRestore, CalendarCheck, ChevronDown, ChevronUp, Server, ShieldCheck, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import AccountNav from '../components/AccountNav'

type SessionUser = { id: string; displayName: string; avatarUrl: string | null }
type TeamSummary = { id: string; name: string; slug: string; memberCount: number; calendarConnected: boolean }
type GuildSummary = { id: string; name: string; icon: string | null; botInstalled: boolean; team: TeamSummary | null }
type LegacyTeam = { id: string; name: string; slug: string; memberCount: number }
type TeamMember = { discordUserId: string; displayName: string; role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'READONLY'; createdAt: string }
type TeamDetail = { id: string; name: string; slug: string; guildId: string; role: TeamMember['role']; members: TeamMember[] }

const roleLabel: Record<TeamMember['role'], string> = {
  OWNER: '소유자',
  ADMIN: '관리자',
  MEMBER: '멤버',
  READONLY: '읽기 전용',
}

export default function Teams() {
  const navigate = useNavigate()
  const [user, setUser] = useState<SessionUser | null>(null)
  const [guilds, setGuilds] = useState<GuildSummary[]>([])
  const [legacyTeams, setLegacyTeams] = useState<LegacyTeam[]>([])
  const [legacyTargets, setLegacyTargets] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [workingGuildId, setWorkingGuildId] = useState<string | null>(null)
  const [expandedGuildId, setExpandedGuildId] = useState<string | null>(null)
  const [details, setDetails] = useState<Record<string, TeamDetail>>({})

  useEffect(() => {
    Promise.all([fetch('/api/auth/session'), fetch('/api/account/guilds')])
      .then(async ([sessionResponse, guildsResponse]) => {
        if (sessionResponse.status === 401 || guildsResponse.status === 401) {
          navigate('/login', { replace: true })
          return
        }
        if (!sessionResponse.ok || !guildsResponse.ok) throw new Error('팀 정보를 불러오지 못했어.')
        const sessionData = await sessionResponse.json()
        const guildData = await guildsResponse.json()
        setUser(sessionData.user)
        setGuilds(guildData.guilds)
        setLegacyTeams(guildData.legacyTeams || [])
      })
      .catch(error => toast.error(error instanceof Error ? error.message : '팀 정보를 불러오지 못했어.'))
      .finally(() => setLoading(false))
  }, [navigate])

  const loadTeam = async (guild: GuildSummary, create: boolean, legacyTeamId?: string) => {
    setWorkingGuildId(guild.id)
    try {
      const response = await fetch(`/api/account/guilds/${guild.id}/team`, {
        method: create ? 'POST' : 'GET',
        headers: legacyTeamId ? { 'content-type': 'application/json' } : undefined,
        body: legacyTeamId ? JSON.stringify({ legacyTeamId }) : undefined,
      })
      if (response.status === 401) {
        navigate('/login', { replace: true })
        return
      }
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '팀 정보를 불러오지 못했어.')
      setDetails(current => ({ ...current, [guild.id]: data.team }))
      setExpandedGuildId(guild.id)
      if (create) {
        if (legacyTeamId) setLegacyTeams(current => current.filter(team => team.id !== legacyTeamId))
        setGuilds(current => current.map(item => item.id === guild.id ? {
          ...item,
          team: {
            id: data.team.id,
            name: data.team.name,
            slug: data.team.slug,
            memberCount: data.team.members.length,
            calendarConnected: false,
          },
        } : item))
        toast.success(legacyTeamId ? '기존 팀 데이터와 Discord 서버를 연결했어.' : 'Discord 서버와 TORO 팀을 연결했어.')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '팀 관리 중 문제가 발생했어.')
    } finally {
      setWorkingGuildId(null)
    }
  }

  const toggleTeam = async (guild: GuildSummary) => {
    if (expandedGuildId === guild.id) {
      setExpandedGuildId(null)
      return
    }
    if (details[guild.id]) {
      setExpandedGuildId(guild.id)
      return
    }
    await loadTeam(guild, !guild.team)
  }

  const logout = async () => {
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' })
      if (!response.ok) throw new Error('로그아웃하지 못했어.')
      navigate('/login', { replace: true })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '로그아웃하지 못했어.')
    }
  }

  return (
    <>
      <AccountNav displayName={user?.displayName} avatarUrl={user?.avatarUrl} onLogout={logout} />
      <main className="account-main">
        <header className="page-header account-page-header">
          <div>
            <p className="account-eyebrow">TEAM WORKSPACE</p>
            <h1>내 TORO 팀</h1>
            <p className="page-desc">Discord 서버를 기준으로 팀과 멤버 상태를 관리해.</p>
          </div>
          <div className="account-policy"><ShieldCheck size={16} /> 서버 관리 권한으로 보호됨</div>
        </header>

        <section className="account-summary-grid">
          <div className="card"><div className="card-label">관리 가능한 서버</div><div className="card-value text-accent">{loading ? '—' : guilds.length}</div></div>
          <div className="card"><div className="card-label">연결된 팀</div><div className="card-value">{loading ? '—' : guilds.filter(guild => guild.team).length}</div></div>
          <div className="card"><div className="card-label">TORO 설치됨</div><div className="card-value text-green">{loading ? '—' : guilds.filter(guild => guild.botInstalled).length}</div></div>
        </section>

        {legacyTeams.length > 0 && (
          <section className="section-gap">
            <div className="panel-header account-list-header">
              <div>
                <h2>LEGACY TEAM DATA</h2>
                <p className="page-desc">기존 DM 팀의 대화·메모·캘린더를 Discord 서버에 그대로 연결해.</p>
              </div>
            </div>
            <div className="account-server-list">
              {legacyTeams.map(team => {
                const targetId = legacyTargets[team.id] || ''
                const target = guilds.find(guild => guild.id === targetId)
                const availableGuilds = guilds.filter(guild => guild.botInstalled && !guild.team)
                return (
                  <article className="panel account-legacy" key={team.id}>
                    <div className="account-legacy-copy">
                      <ArchiveRestore size={20} />
                      <div><strong>{team.name}</strong><span>{team.memberCount}명 · 기존 데이터 보존됨</span></div>
                    </div>
                    <div className="account-legacy-action">
                      <select
                        value={targetId}
                        onChange={event => setLegacyTargets(current => ({ ...current, [team.id]: event.target.value }))}
                        aria-label={`${team.name}을 연결할 Discord 서버`}
                      >
                        <option value="">연결할 서버 선택</option>
                        {availableGuilds.map(guild => <option key={guild.id} value={guild.id}>{guild.name}</option>)}
                      </select>
                      <button className="btn btn-primary" disabled={!target || workingGuildId === targetId} onClick={() => target && loadTeam(target, true, team.id)}>
                        기존 데이터 연결
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        )}

        <section className="section-gap">
          <div className="panel-header account-list-header">
            <div>
              <h2>DISCORD SERVERS</h2>
              <p className="page-desc">팀 초대와 전환 없이 서버별로 자동 분리돼.</p>
            </div>
          </div>

          {loading ? (
            <div className="account-server-list" role="status" aria-live="polite" aria-label="팀 목록 불러오는 중">
              {[0, 1].map(item => <div className="panel account-server-skeleton" key={item} />)}
            </div>
          ) : guilds.length === 0 ? (
            <div className="panel account-empty">
              <Server size={24} />
              <strong>관리 가능한 Discord 서버가 없어</strong>
              <p>서버 관리 권한을 확인한 뒤 다시 로그인해줘.</p>
            </div>
          ) : (
            <div className="account-server-list">
              {guilds.map(guild => {
                const detail = details[guild.id]
                const expanded = expandedGuildId === guild.id
                return (
                  <article className="panel account-server" key={guild.id}>
                    <div className="account-server-row">
                      <div className="account-server-identity">
                        {guild.icon ? <img src={guild.icon} alt="" /> : <span>{guild.name.slice(0, 1)}</span>}
                        <div>
                          <h3>{guild.name}</h3>
                          <div className="account-status-row">
                            <span className={`account-status ${guild.botInstalled ? 'online' : 'offline'}`}>
                              <i /> {guild.botInstalled ? 'TORO 설치됨' : 'TORO 미설치'}
                            </span>
                            {guild.team && <span className="panel-badge green">팀 연결됨</span>}
                          </div>
                        </div>
                      </div>
                      <button
                        className={`btn ${guild.botInstalled ? (guild.team ? 'btn-ghost' : 'btn-primary') : 'btn-ghost'}`}
                        disabled={!guild.botInstalled || workingGuildId === guild.id || (!guild.team && legacyTeams.length > 0)}
                        onClick={() => toggleTeam(guild)}
                        aria-expanded={expanded}
                        aria-controls={`team-detail-${guild.id}`}
                      >
                        {workingGuildId === guild.id ? '확인 중…' : !guild.botInstalled ? '먼저 봇을 추가해줘' : guild.team ? '팀 관리' : legacyTeams.length > 0 ? '기존 팀부터 연결해줘' : '팀 연결'}
                        {guild.botInstalled && guild.team && (expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />)}
                      </button>
                    </div>

                    {expanded && detail && (
                      <div className="account-team-detail" id={`team-detail-${guild.id}`}>
                        <div className="account-detail-grid">
                          <div><Users size={17} /><span>확인된 멤버</span><strong>{detail.members.length}명</strong></div>
                          <div><ShieldCheck size={17} /><span>내 권한</span><strong>{roleLabel[detail.role]}</strong></div>
                          <div><CalendarCheck size={17} /><span>캘린더</span><strong>{guild.team?.calendarConnected ? '연결됨' : '연결 안 됨'}</strong></div>
                        </div>
                        <div className="account-members">
                          <h2>MEMBERS</h2>
                          {detail.members.map(member => (
                            <div className="account-member" key={member.discordUserId}>
                              <span className="account-member-avatar">{member.displayName.slice(0, 1)}</span>
                              <strong>{member.displayName}</strong>
                              <span className="panel-badge">{roleLabel[member.role]}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </main>
    </>
  )
}
