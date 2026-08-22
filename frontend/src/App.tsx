import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
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
  useEffect(() => { document.title = location.pathname.startsWith('/calendar') ? 'Lịch của tôi · Planora' : 'Trợ lý AI · Planora' }, [location.pathname])
  useEffect(() => { void loadCalendarView() }, [])
  return <CalendarProvider><ProfileProvider><div className="app-shell"><Navbar /><div className="app-view-content"><Routes>
    <Route path="/chat" element={<ChatView onViewCalendar={() => navigate('/calendar')} />} />
    <Route path="/calendar" element={<Suspense fallback={<LoadingScreen />}><CalendarView /></Suspense>} />
    <Route path="*" element={<Navigate to="/chat" replace />} />
  </Routes></div></div></ProfileProvider></CalendarProvider>
}

export default function App() {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <LoginView />
  return <AuthenticatedApp />
}
