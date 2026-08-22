import { Bell, Bot, CalendarDays, ChevronRight, LogOut, Moon, Settings, Sparkles, Sun } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCalendar } from '../context/CalendarContext'
import { useNotification } from '../context/NotificationContext'
import { useProfile } from '../context/ProfileContext'
import { useTheme } from '../context/ThemeContext'
import { useToast } from '../context/ToastContext'
import { eventOccurrencesBetween } from '../lib/recurrence'
import { useSmoothNavigate } from '../hooks/useSmoothNavigate'
import { Dialog } from './common/Dialog'
import { SettingsModal } from './SettingsModal'

export type AppView = 'chat' | 'calendar'

export function Navbar() {
  const { user, signOut } = useAuth()
  const { events } = useCalendar()
  const { profile } = useProfile()
  const { theme, toggleTheme } = useTheme()
  const { testNotification, permission, requestBrowserPermission } = useNotification()
  const notify = useToast()
  const location = useLocation()
  const navigate = useSmoothNavigate()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [signOutOpen, setSignOutOpen] = useState(false)
  const [signOutBusy, setSignOutBusy] = useState(false)
  const notificationsRef = useRef<HTMLDivElement>(null)
  const accountRef = useRef<HTMLDivElement>(null)
  const view: AppView = location.pathname.startsWith('/calendar') ? 'calendar' : 'chat'
  const avatar = user?.user_metadata?.avatar_url
  const upcoming = useMemo(() => {
    const start = new Date(); const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
    return events.flatMap((event) => {
      return eventOccurrencesBetween(event, start, end, profile?.timezone || 'Asia/Ho_Chi_Minh')
        .map((occurrence, index) => ({ id: `${event.id}-${occurrence.getTime()}-${index}`, title: event.title, start: occurrence, color: event.color }))
    }).sort((a, b) => a.start.getTime() - b.start.getTime()).slice(0, 6)
  }, [events, profile?.timezone])

  useEffect(() => {
    if (!notificationsOpen && !accountOpen) return
    const closePopovers = (event: PointerEvent) => {
      const target = event.target as Node
      if (!notificationsRef.current?.contains(target)) setNotificationsOpen(false)
      if (!accountRef.current?.contains(target)) setAccountOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setNotificationsOpen(false); setAccountOpen(false) }
    }
    document.addEventListener('pointerdown', closePopovers)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closePopovers)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [accountOpen, notificationsOpen])

  const displayName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Người dùng'

  return <>
    <header className="navbar">
      <button className="brand" onClick={() => navigate('/calendar')} aria-label="Mở Lịch Planora"><span className="brand-mark"><CalendarDays size={19} /></span><span>Planora</span></button>
      <nav
        className="view-switch"
        data-view={view}
        aria-label="Chuyển trang"
        role="tablist"
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault()
            navigate(view === 'chat' ? '/calendar' : '/chat')
          }
        }}
      >
        <button
          role="tab"
          aria-selected={view === 'chat'}
          className={view === 'chat' ? 'active' : ''}
          aria-current={view === 'chat' ? 'page' : undefined}
          onClick={() => navigate('/chat')}
        >
          <Bot size={16} /> Trợ lý AI
        </button>
        <button
          role="tab"
          aria-selected={view === 'calendar'}
          className={view === 'calendar' ? 'active' : ''}
          aria-current={view === 'calendar' ? 'page' : undefined}
          onClick={() => navigate('/calendar')}
        >
          <CalendarDays size={16} /> Lịch
        </button>
      </nav>
      <div className="account-menu">
        <div ref={notificationsRef} className="popover-anchor">
          <button className="icon-button badge-button" aria-label={`${upcoming.length} sự kiện trong 24 giờ tới`} aria-expanded={notificationsOpen} onClick={() => { setNotificationsOpen((value) => !value); setAccountOpen(false) }} title="Sự kiện sắp tới"><Bell size={17} />{upcoming.length > 0 && <span>{upcoming.length > 9 ? '9+' : upcoming.length}</span>}</button>
          {notificationsOpen && <section className="header-popover notifications-popover" aria-label="Sự kiện sắp tới">
            <header>
              <div><strong>Sắp tới</strong><small>Trong 24 giờ tới</small></div>
              <span>{upcoming.length}</span>
            </header>
            <div className="popover-notif-action">
              <span>🔔 Pop-up góc phải:</span>
              <button onClick={() => { testNotification(); notify('Đã gửi thử pop-up nhắc nhở ở góc dưới bên phải!', 'success') }}>
                Thử nghiệm
              </button>
            </div>
            {permission !== 'granted' && (
              <div className="popover-notif-action">
                <span>Thông báo màn hình:</span>
                <button onClick={async () => {
                  const granted = await requestBrowserPermission()
                  notify(granted ? 'Đã bật thông báo màn hình thành công!' : 'Trình duyệt chưa cấp quyền thông báo.')
                }}>
                  Cho phép
                </button>
              </div>
            )}
            {upcoming.length === 0 ? <div className="popover-empty"><Bell size={22} /><p>Chưa có sự kiện sắp tới.</p></div> : <div className="upcoming-list">{upcoming.map((item) => <button key={item.id} onClick={() => { setNotificationsOpen(false); navigate('/calendar') }}><span className="event-dot" style={{ backgroundColor: item.color }} /><span><strong>{item.title}</strong><small>{item.start.toLocaleString('vi-VN', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: profile?.timezone })}</small></span><ChevronRight size={14} /></button>)}</div>}
            <button className="popover-footer" onClick={() => { setNotificationsOpen(false); navigate('/calendar') }}>Mở Lịch <ChevronRight size={14} /></button>
          </section>}
        </div>
        <button className="icon-button" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'} title={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button>
        <div ref={accountRef} className="popover-anchor">
          <button className="account-settings" onClick={() => { setAccountOpen((value) => !value); setNotificationsOpen(false) }} aria-label="Mở menu tài khoản" aria-expanded={accountOpen}>{avatar ? <img src={avatar} alt="Ảnh đại diện" /> : <span className="avatar-fallback">{user?.email?.[0]?.toUpperCase()}</span>}<span className="account-name">{displayName}</span></button>
          {accountOpen && <section className="header-popover account-popover"><div className="account-summary">{avatar ? <img src={avatar} alt="" /> : <span className="avatar-fallback">{user?.email?.[0]?.toUpperCase()}</span>}<span><strong>{displayName}</strong><small>{user?.email}</small></span></div><button onClick={() => { setAccountOpen(false); setSettingsOpen(true) }}><Settings size={16} /> Cài đặt</button><button className="logout-menu-item" onClick={() => { setAccountOpen(false); setSignOutOpen(true) }}><LogOut size={16} /> Đăng xuất</button></section>}
        </div>
      </div>
    </header>
    {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    <Dialog open={signOutOpen} title="Đăng xuất khỏi Planora?" description="Bạn có thể đăng nhập lại bất cứ lúc nào bằng tài khoản Google." confirmLabel="Đăng xuất" destructive busy={signOutBusy} onClose={() => !signOutBusy && setSignOutOpen(false)} onConfirm={async () => { setSignOutBusy(true); try { await signOut(); setSignOutOpen(false) } catch (reason) { notify(reason instanceof Error ? reason.message : 'Không thể đăng xuất.'); setSignOutBusy(false) } }} />
  </>
}
