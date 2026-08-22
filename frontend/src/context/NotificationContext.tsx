import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react'
import { Bell, Calendar, ChevronRight, X, Sparkles, Volume2 } from 'lucide-react'
import { useCalendar } from './CalendarContext'
import { useProfile } from './ProfileContext'
import { eventOccurrencesBetween } from '../lib/recurrence'
import { useSmoothNavigate } from '../hooks/useSmoothNavigate'

export type ReminderAlert = {
  id: string
  eventId: string
  title: string
  category: string
  color: string
  startTime: Date
  minutesUntil: number
  isAiGenerated?: boolean
  description?: string | null
}

interface NotificationContextType {
  alerts: ReminderAlert[]
  dismissAlert: (id: string) => void
  testNotification: () => void
  permission: NotificationPermission
  requestBrowserPermission: () => Promise<boolean>
}

const NotificationContext = createContext<NotificationContextType>({
  alerts: [],
  dismissAlert: () => undefined,
  testNotification: () => undefined,
  permission: 'default',
  requestBrowserPermission: async () => false,
})

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { events, focusEvent } = useCalendar()
  const { profile } = useProfile()
  const navigate = useSmoothNavigate()
  const [alerts, setAlerts] = useState<ReminderAlert[]>([])
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  )
  const notifiedKeysRef = useRef<Set<string>>(new Set())

  // Load previously notified keys from sessionStorage
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('planora_notified_event_keys')
      if (stored) {
        notifiedKeysRef.current = new Set(JSON.parse(stored))
      }
    } catch {}
  }, [])

  const saveNotifiedKeys = useCallback(() => {
    try {
      sessionStorage.setItem(
        'planora_notified_event_keys',
        JSON.stringify(Array.from(notifiedKeysRef.current))
      )
    } catch {}
  }, [])

  const dismissAlert = useCallback((id: string) => {
    setAlerts((current) => current.filter((a) => a.id !== id))
  }, [])

  const requestBrowserPermission = useCallback(async (): Promise<boolean> => {
    if (typeof Notification === 'undefined') return false
    try {
      const res = await Notification.requestPermission()
      setPermission(res)
      return res === 'granted'
    } catch {
      return false
    }
  }, [])

  const showPopup = useCallback((alert: ReminderAlert) => {
    setAlerts((current) => {
      if (current.some((a) => a.id === alert.id)) return current
      return [...current, alert]
    })

    // Also trigger native desktop notification if user is on another tab/app
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        const timeStr = alert.startTime.toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
        })
        const minutesText =
          alert.minutesUntil <= 0
            ? 'đang bắt đầu ngay bây giờ'
            : `sẽ bắt đầu sau ${alert.minutesUntil} phút (${timeStr})`
        
        new Notification(`⏰ Nhắc nhở: ${alert.title}`, {
          body: `Môn/Sự kiện: ${alert.category} - ${minutesText}`,
          icon: '/favicon.svg',
          tag: alert.id,
        })
      } catch {}
    }
  }, [])

  const testNotification = useCallback(() => {
    const targetEvent = events[0]
    const fakeStart = new Date(Date.now() + 10 * 60 * 1000)
    const testAlert: ReminderAlert = {
      id: `test-${Date.now()}`,
      eventId: targetEvent?.id || 'test',
      title: targetEvent?.title || 'Dạy Toán Tiếng Anh (Test thông báo)',
      category: targetEvent?.category || 'Học tập',
      color: targetEvent?.color || '#d93662',
      startTime: fakeStart,
      minutesUntil: 10,
      isAiGenerated: targetEvent?.is_ai_generated ?? true,
      description: 'Lịch kiểm tra tính năng pop-up góc phải',
    }
    showPopup(testAlert)
  }, [events, showPopup])

  // Periodic Reminder Checker (runs every 30 seconds while tab is open)
  useEffect(() => {
    const timeZone = profile?.timezone || 'Asia/Ho_Chi_Minh'

    const checkUpcoming = () => {
      const now = new Date()
      // Look ahead for events occurring in the next 20 minutes
      const lookAheadEnd = new Date(now.getTime() + 20 * 60 * 1000)

      for (const event of events) {
        if (event.status !== 'scheduled' || event.deleted_at) continue

        const occurrences = eventOccurrencesBetween(event, now, lookAheadEnd, timeZone)
        for (const occ of occurrences) {
          const diffMs = occ.getTime() - now.getTime()
          const diffMinutes = Math.round(diffMs / (60 * 1000))
          const notifyKey = `${event.id}_${occ.toISOString().slice(0, 16)}`

          // Trigger reminder if event is within 15 minutes and has not been notified yet
          if (diffMinutes >= 0 && diffMinutes <= 15 && !notifiedKeysRef.current.has(notifyKey)) {
            notifiedKeysRef.current.add(notifyKey)
            saveNotifiedKeys()

            showPopup({
              id: notifyKey,
              eventId: event.id,
              title: event.title,
              category: event.category,
              color: event.color,
              startTime: occ,
              minutesUntil: diffMinutes,
              isAiGenerated: event.is_ai_generated,
              description: event.description,
            })
          }
        }
      }
    }

    // Check immediately on mount or events change
    checkUpcoming()

    const interval = window.setInterval(checkUpcoming, 30_000)
    return () => window.clearInterval(interval)
  }, [events, profile?.timezone, saveNotifiedKeys, showPopup])

  return (
    <NotificationContext.Provider
      value={{
        alerts,
        dismissAlert,
        testNotification,
        permission,
        requestBrowserPermission,
      }}
    >
      {children}

      {/* Pop-up Notification Container at Bottom-Right Corner */}
      <aside className="planora-notification-stack" aria-live="assertive">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className="planora-reminder-card"
            style={{ '--reminder-accent': alert.color } as React.CSSProperties}
          >
            <div className="reminder-header">
              <div className="reminder-badge">
                <Bell className="reminder-bell-icon" size={14} />
                <span>Nhắc nhở sự kiện</span>
              </div>
              <button
                className="reminder-close-btn"
                onClick={() => dismissAlert(alert.id)}
                aria-label="Đóng thông báo"
              >
                <X size={15} />
              </button>
            </div>

            <div className="reminder-body">
              <h4 className="reminder-title">
                {alert.isAiGenerated && (
                  <Sparkles size={13} className="reminder-ai-icon" aria-label="AI sắp xếp" />
                )}
                {alert.title}
              </h4>
              <p className="reminder-time">
                {alert.minutesUntil <= 0 ? (
                  <strong className="time-highlight urgent">Bắt đầu ngay bây giờ!</strong>
                ) : (
                  <>
                    Bắt đầu sau <strong>{alert.minutesUntil} phút</strong> (
                    {alert.startTime.toLocaleTimeString('vi-VN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    )
                  </>
                )}
              </p>
              {alert.category && <span className="reminder-category">{alert.category}</span>}
            </div>

            <div className="reminder-footer">
              <button
                className="reminder-view-btn"
                onClick={() => {
                  dismissAlert(alert.id)
                  focusEvent(alert.eventId, alert.startTime)
                  navigate('/calendar')
                }}
              >
                <Calendar size={14} />
                <span>Xem trên Lịch</span>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        ))}
      </aside>
    </NotificationContext.Provider>
  )
}

export const useNotification = () => useContext(NotificationContext)
