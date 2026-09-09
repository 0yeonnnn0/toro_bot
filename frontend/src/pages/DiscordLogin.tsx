import { LogIn, Server, ShieldCheck } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import AccountNav from '../components/AccountNav'

const errorMessages: Record<string, string> = {
  oauth_unavailable: 'Discord 로그인이 아직 설정되지 않았어. 잠시 후 다시 시도해줘.',
  invalid_state: '로그인 요청이 만료됐어. 다시 시작해줘.',
  oauth_failed: 'Discord 로그인에 실패했어. 잠시 후 다시 시도해줘.',
}

export default function DiscordLogin() {
  const [params] = useSearchParams()
  const error = params.get('error')

  return (
    <>
      <AccountNav />
      <main className="account-main account-login-main">
        <section className="panel account-login-panel">
          <div className="account-login-icon"><LogIn size={24} /></div>
          <p className="account-eyebrow">TORO TEAM</p>
          <h1>팀 관리는 웹에서</h1>
          <p className="account-lead">
            Discord로 로그인하면 관리 중인 서버의 TORO 팀과 멤버 상태를 한곳에서 확인할 수 있어.
          </p>

          {error && <div className="account-error" role="alert">{errorMessages[error] || '로그인 중 문제가 발생했어.'}</div>}

          <a className="btn btn-primary account-discord-button" href="/api/auth/discord">
            <LogIn size={17} />
            Discord로 계속하기
          </a>

          <div className="account-login-notes">
            <div><ShieldCheck size={17} /><span>서버 관리 권한이 있는 서버만 표시해.</span></div>
            <div><Server size={17} /><span>Discord 서버 하나가 TORO 팀 하나로 연결돼.</span></div>
          </div>
        </section>
      </main>
    </>
  )
}
