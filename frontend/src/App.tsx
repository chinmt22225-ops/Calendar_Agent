import { lazy, Suspense, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { LoginView } from './components/auth/LoginView'
import { ChatView } from './components/chat/ChatView'
import { Navbar } from './components/Navbar'
import { useAuth } from './context/AuthContext'
import { CalendarProvider } from './context/CalendarContext'
import { ProfileProvider } from './context/ProfileContext'
import { useSmoothNavigate } from './hooks/useSmoothNavigate'

const loadCalendarView = () => import('./components/calendar/CalendarView').then((module) => ({ default: module.CalendarView }))
const CalendarView = lazy(loadCalendarView)

function LoadingScreen() { return <main className="loading-screen"><span className="brand-mark large">✦</span><p>Đang mở lịch của bạn...</p></main> }

function AuthenticatedApp() {
  const location = useLocation()
  const navigate = useSmoothNavigate()
  const isCalendar = location.pathname.startsWith('/calendar')

  useEffect(() => {
    document.title = isCalendar ? 'Lịch của tôi · Planora' : 'Trợ lý AI · Planora'
  }, [isCalendar])

  useEffect(() => {
    void loadCalendarView()
  }, [])

  return (
    <CalendarProvider>
      <ProfileProvider>
        <div className="app-shell">
          <Navbar />
          <div className="app-view-content" style={{ height: 'calc(100vh - 72px)', overflow: 'hidden' }}>
            <div
              style={{
                display: isCalendar ? 'none' : 'block',
                height: '100%',
                width: '100%',
              }}
            >
              <ChatView onViewCalendar={() => navigate('/calendar')} />
            </div>
            <div
              style={{
                display: isCalendar ? 'block' : 'none',
                height: '100%',
                width: '100%',
              }}
            >
              <Suspense fallback={<LoadingScreen />}>
                <CalendarView />
              </Suspense>
            </div>
          </div>
        </div>
      </ProfileProvider>
    </CalendarProvider>
  )
}

export default function App() {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <LoginView />
  return <AuthenticatedApp />
}
