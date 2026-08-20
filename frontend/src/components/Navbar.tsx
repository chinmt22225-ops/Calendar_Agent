import { Bell, Bot, CalendarDays, Moon, Settings, Sun } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { RRule } from 'rrule'
import { useAuth } from '../context/AuthContext'
import { useCalendar } from '../context/CalendarContext'
import { useTheme } from '../context/ThemeContext'
import { SettingsModal } from './SettingsModal'

export type AppView = 'chat' | 'calendar'

export function Navbar() {
  const { user } = useAuth()
  const { events } = useCalendar()
  const { theme, toggleTheme } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const view: AppView = location.pathname.startsWith('/calendar') ? 'calendar' : 'chat'
  const avatar = user?.user_metadata?.avatar_url
  const upcoming = useMemo(() => {
    const start = new Date(); const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
    return events.reduce((count, event) => {
      if (event.status !== 'scheduled') return count
      if (!event.recurrence_rule || !event.recurrence_end) {
        const eventStart = new Date(event.start_time)
        return count + (eventStart >= start && eventStart <= end ? 1 : 0)
      }
      const freq = { daily: RRule.DAILY, weekly: RRule.WEEKLY, monthly: RRule.MONTHLY }[event.recurrence_rule]
      return count + new RRule({ freq, dtstart: new Date(event.start_time), until: new Date(`${event.recurrence_end}T23:59:59`) }).between(start, end, true).length
    }, 0)
  }, [events])

  return <>
    <header className="navbar">
      <div className="brand"><span className="brand-mark"><CalendarDays size={19} /></span><span>Planora</span></div>
      <nav className="view-switch" aria-label="Chuyển trang">
        <button className={view === 'chat' ? 'active' : ''} onClick={() => navigate('/chat')}><Bot size={16} /> AI Assistant</button>
        <button className={view === 'calendar' ? 'active' : ''} onClick={() => navigate('/calendar')}><CalendarDays size={16} /> Calendar</button>
      </nav>
      <div className="account-menu">
        <button className="icon-button badge-button" onClick={() => navigate('/calendar')} title={`${upcoming} sự kiện trong 24 giờ tới`}><Bell size={17} />{upcoming > 0 && <span>{upcoming > 9 ? '9+' : upcoming}</span>}</button>
        <button className="icon-button" onClick={toggleTheme} title={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button>
        <button className="account-settings" onClick={() => setSettingsOpen(true)} title="Mở cài đặt">{avatar ? <img src={avatar} alt="Ảnh đại diện" /> : <span className="avatar-fallback">{user?.email?.[0]?.toUpperCase()}</span>}<Settings size={15} /></button>
      </div>
    </header>
    {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
  </>
}
