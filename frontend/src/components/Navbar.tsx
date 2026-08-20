import { Bot, CalendarDays, LogOut } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export type AppView = 'chat' | 'calendar'

export function Navbar({ view, onChange }: { view: AppView; onChange: (view: AppView) => void }) {
  const { user, signOut } = useAuth()
  const avatar = user?.user_metadata?.avatar_url

  return (
    <header className="navbar">
      <div className="brand">
        <span className="brand-mark"><CalendarDays size={19} /></span>
        <span>Planora</span>
      </div>
      <nav className="view-switch" aria-label="Chuyển trang">
        <button className={view === 'chat' ? 'active' : ''} onClick={() => onChange('chat')}>
          <Bot size={16} /> AI Assistant
        </button>
        <button className={view === 'calendar' ? 'active' : ''} onClick={() => onChange('calendar')}>
          <CalendarDays size={16} /> Calendar
        </button>
      </nav>
      <div className="account-menu">
        {avatar ? <img src={avatar} alt="Ảnh đại diện" /> : <span className="avatar-fallback">{user?.email?.[0]?.toUpperCase()}</span>}
        <button className="icon-button" onClick={() => void signOut()} title="Đăng xuất"><LogOut size={17} /></button>
      </div>
    </header>
  )
}

