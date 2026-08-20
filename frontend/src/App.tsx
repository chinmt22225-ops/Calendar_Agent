import { lazy, Suspense, useState } from 'react'
import { ChatView } from './components/chat/ChatView'
import { LoginView } from './components/auth/LoginView'
import { Navbar, type AppView } from './components/Navbar'
import { useAuth } from './context/AuthContext'
import { CalendarProvider } from './context/CalendarContext'

const CalendarView = lazy(() => import('./components/calendar/CalendarView').then((module) => ({ default: module.CalendarView })))

function LoadingScreen() {
  return <main className="loading-screen"><span className="brand-mark large">✦</span><p>Đang mở lịch của bạn...</p></main>
}

export default function App() {
  const { user, loading } = useAuth()
  const [view, setView] = useState<AppView>('chat')
  if (loading) return <LoadingScreen />
  if (!user) return <LoginView />
  return (
    <CalendarProvider>
      <div className="app-shell">
        <Navbar view={view} onChange={setView} />
        {view === 'chat' ? <ChatView onViewCalendar={() => setView('calendar')} /> : (
          <Suspense fallback={<LoadingScreen />}><CalendarView /></Suspense>
        )}
      </div>
    </CalendarProvider>
  )
}
