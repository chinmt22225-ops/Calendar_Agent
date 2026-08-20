import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { LoginView } from './components/auth/LoginView'
import { ChatView } from './components/chat/ChatView'
import { Navbar } from './components/Navbar'
import { useAuth } from './context/AuthContext'
import { CalendarProvider } from './context/CalendarContext'
import { ProfileProvider } from './context/ProfileContext'

const CalendarView = lazy(() => import('./components/calendar/CalendarView').then((module) => ({ default: module.CalendarView })))

function LoadingScreen() { return <main className="loading-screen"><span className="brand-mark large">✦</span><p>Đang mở lịch của bạn...</p></main> }

function AuthenticatedApp() {
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => { document.title = location.pathname.startsWith('/calendar') ? 'Lịch của tôi · Planora' : 'Trợ lý AI · Planora' }, [location.pathname])
  return <CalendarProvider><ProfileProvider><div className="app-shell"><Navbar /><Routes>
    <Route path="/chat" element={<ChatView onViewCalendar={() => navigate('/calendar')} />} />
    <Route path="/calendar" element={<Suspense fallback={<LoadingScreen />}><CalendarView /></Suspense>} />
    <Route path="*" element={<Navigate to="/chat" replace />} />
  </Routes></div></ProfileProvider></CalendarProvider>
}

export default function App() {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <LoginView />
  return <AuthenticatedApp />
}
