import { Bell, Bot, CalendarDays, ChevronRight, LogOut, Moon, Settings, Sun } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { RRule } from 'rrule'
import { useAuth } from '../context/AuthContext'
import { useCalendar } from '../context/CalendarContext'
import { useProfile } from '../context/ProfileContext'
import { useTheme } from '../context/ThemeContext'
import { Dialog } from './common/Dialog'
import { SettingsModal } from './SettingsModal'

export type AppView = 'chat' | 'calendar'

export function Navbar() {
  const { user, signOut } = useAuth()
  const { events } = useCalendar()
  const { profile } = useProfile()
  const { theme, toggleTheme } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [signOutOpen, setSignOutOpen] = useState(false)
  const view: AppView = location.pathname.startsWith('/calendar') ? 'calendar' : 'chat'
  const avatar = user?.user_metadata?.avatar_url
  const upcoming = useMemo(() => {
    const start = new Date(); const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
    return events.flatMap((event) => {
      if (event.status !== 'scheduled') return []
      if (!event.recurrence_rule || !event.recurrence_end) {
        const eventStart = new Date(event.start_time)
        return eventStart >= start && eventStart <= end ? [{ id: event.id, title: event.title, start: eventStart, color: event.color }] : []
      }
      const freq = { daily: RRule.DAILY, weekly: RRule.WEEKLY, monthly: RRule.MONTHLY }[event.recurrence_rule]
      return new RRule({ freq, dtstart: new Date(event.start_time), until: new Date(`${event.recurrence_end}T23:59:59`) }).between(start, end, true).map((occurrence, index) => ({ id: `${event.id}-${index}`, title: event.title, start: occurrence, color: event.color }))
    }).sort((a, b) => a.start.getTime() - b.start.getTime()).slice(0, 6)
  }, [events])

  const displayName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Người dùng'

  return <>
    <header className="navbar">
      <button className="brand" onClick={() => navigate('/calendar')} aria-label="Mở Lịch Planora"><span className="brand-mark"><CalendarDays size={19} /></span><span>Planora</span></button>
      <nav className="view-switch" aria-label="Chuyển trang">
        <button className={view === 'chat' ? 'active' : ''} aria-current={view === 'chat' ? 'page' : undefined} onClick={() => navigate('/chat')}><Bot size={16} /> Trợ lý AI</button>
        <button className={view === 'calendar' ? 'active' : ''} aria-current={view === 'calendar' ? 'page' : undefined} onClick={() => navigate('/calendar')}><CalendarDays size={16} /> Lịch</button>
      </nav>
      <div className="account-menu">
        <div className="popover-anchor">
          <button className="icon-button badge-button" aria-label={`${upcoming.length} sự kiện trong 24 giờ tới`} aria-expanded={notificationsOpen} onClick={() => { setNotificationsOpen((value) => !value); setAccountOpen(false) }} title="Sự kiện sắp tới"><Bell size={17} />{upcoming.length > 0 && <span>{upcoming.length > 9 ? '9+' : upcoming.length}</span>}</button>
          {notificationsOpen && <section className="header-popover notifications-popover"><header><div><strong>Sắp tới</strong><small>Trong 24 giờ tới</small></div><span>{upcoming.length}</span></header>{upcoming.length === 0 ? <div className="popover-empty"><Bell size={22} /><p>Chưa có sự kiện sắp tới.</p></div> : <div className="upcoming-list">{upcoming.map((item) => <button key={item.id} onClick={() => { setNotificationsOpen(false); navigate('/calendar') }}><span className="event-dot" style={{ backgroundColor: item.color }} /><span><strong>{item.title}</strong><small>{item.start.toLocaleString('vi-VN', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: profile?.timezone })}</small></span><ChevronRight size={14} /></button>)}</div>}<button className="popover-footer" onClick={() => { setNotificationsOpen(false); navigate('/calendar') }}>Mở Lịch <ChevronRight size={14} /></button></section>}
        </div>
        <button className="icon-button" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'} title={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button>
        <div className="popover-anchor">
          <button className="account-settings" onClick={() => { setAccountOpen((value) => !value); setNotificationsOpen(false) }} aria-label="Mở menu tài khoản" aria-expanded={accountOpen}>{avatar ? <img src={avatar} alt="Ảnh đại diện" /> : <span className="avatar-fallback">{user?.email?.[0]?.toUpperCase()}</span>}<span className="account-name">{displayName}</span></button>
          {accountOpen && <section className="header-popover account-popover"><div className="account-summary">{avatar ? <img src={avatar} alt="" /> : <span className="avatar-fallback">{user?.email?.[0]?.toUpperCase()}</span>}<span><strong>{displayName}</strong><small>{user?.email}</small></span></div><button onClick={() => { setAccountOpen(false); setSettingsOpen(true) }}><Settings size={16} /> Cài đặt</button><button className="logout-menu-item" onClick={() => { setAccountOpen(false); setSignOutOpen(true) }}><LogOut size={16} /> Đăng xuất</button></section>}
        </div>
      </div>
    </header>
    {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    <Dialog open={signOutOpen} title="Đăng xuất khỏi Planora?" description="Bạn có thể đăng nhập lại bất cứ lúc nào bằng tài khoản Google." confirmLabel="Đăng xuất" destructive onClose={() => setSignOutOpen(false)} onConfirm={async () => { await signOut(); setSignOutOpen(false) }} />
  </>
}
