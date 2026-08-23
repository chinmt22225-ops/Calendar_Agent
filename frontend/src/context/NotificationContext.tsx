import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react'
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

export interface NotificationSettings {
  enabled: boolean
  soundEnabled: boolean
  leadTimeMinutes: number
}

interface NotificationContextType {
  enabled: boolean
  soundEnabled: boolean
  leadTimeMinutes: number
  permission: NotificationPermission
  toggleEnabled: () => Promise<boolean>
  setEnabled: (enabled: boolean) => void
  setSoundEnabled: (soundEnabled: boolean) => void
  setLeadTimeMinutes: (minutes: number) => void
  requestBrowserPermission: () => Promise<boolean>
}

const NotificationContext = createContext<NotificationContextType>({
  enabled: true,
  soundEnabled: true,
  leadTimeMinutes: 15,
  permission: 'default',
  toggleEnabled: async () => true,
  setEnabled: () => undefined,
  setSoundEnabled: () => undefined,
  setLeadTimeMinutes: () => undefined,
  requestBrowserPermission: async () => false,
})

// Gentle notification chime (Web Audio API synthesized without external assets)
function playNotificationChime() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    const ctx = new AudioContextClass()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(587.33, ctx.currentTime) // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.14) // A5
    gain.gain.setValueAtTime(0.12, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.38)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.4)
  } catch {}
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { events, focusEvent } = useCalendar()
  const { profile } = useProfile()
  const navigate = useSmoothNavigate()

  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  )

  const [enabled, setEnabledState] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('planora_notifications_enabled')
      return stored !== null ? stored === 'true' : true
    } catch {
      return true
    }
  })

  const [soundEnabled, setSoundEnabledState] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('planora_sound_enabled')
      return stored !== null ? stored === 'true' : true
    } catch {
      return true
    }
  })

  const [leadTimeMinutes, setLeadTimeMinutesState] = useState<number>(() => {
    try {
      const stored = localStorage.getItem('planora_lead_time_minutes')
      return stored ? Math.max(1, parseInt(stored, 10)) : 15
    } catch {
      return 15
    }
  })

  const setEnabled = useCallback((value: boolean) => {
    setEnabledState(value)
    try {
      localStorage.setItem('planora_notifications_enabled', String(value))
    } catch {}
  }, [])

  const setSoundEnabled = useCallback((value: boolean) => {
    setSoundEnabledState(value)
    try {
      localStorage.setItem('planora_sound_enabled', String(value))
    } catch {}
  }, [])

  const setLeadTimeMinutes = useCallback((minutes: number) => {
    setLeadTimeMinutesState(minutes)
    try {
      localStorage.setItem('planora_lead_time_minutes', String(minutes))
    } catch {}
  }, [])

  const notifiedKeysRef = useRef<Set<string>>(new Set())
  const swRegRef = useRef<ServiceWorkerRegistration | null>(null)

  // Register background Service Worker for OS / Desktop notifications (Google Calendar style)
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          swRegRef.current = reg
        })
        .catch(() => {})

      const handleSwMessage = (event: MessageEvent) => {
        if (event.data?.type === 'PLANORA_NOTIFICATION_CLICK') {
          if (event.data.eventId) {
            focusEvent(event.data.eventId, event.data.startTime)
          }
          navigate('/calendar')
        }
      }

      navigator.serviceWorker.addEventListener('message', handleSwMessage)
      return () => {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage)
      }
    }
  }, [focusEvent, navigate])

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

  const toggleEnabled = useCallback(async (): Promise<boolean> => {
    if (!enabled) {
      // User is turning notifications ON
      if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
        const granted = await requestBrowserPermission()
        if (!granted) {
          return false
        }
      }
      setEnabled(true)
      return true
    } else {
      // User is turning notifications OFF
      setEnabled(false)
      return false
    }
  }, [enabled, requestBrowserPermission, setEnabled])

  const triggerDesktopNotification = useCallback(
    (alert: ReminderAlert) => {
      if (!enabled) return

      // 1. Play gentle audio chime if sound is enabled
      if (soundEnabled) {
        playNotificationChime()
      }

      // 2. Native Desktop / OS Notification (shows even if user is on another browser tab or app)
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
          const title = `⏰ Planora: ${alert.title}`
          const options: NotificationOptions = {
            body: `Môn/Sự kiện: ${alert.category} - ${minutesText}`,
            icon: '/favicon.svg',
            badge: '/favicon.svg',
            tag: alert.id,
            requireInteraction: true, // Keeps notification visible in OS Action Center
            data: {
              eventId: alert.eventId,
              startTime: alert.startTime.toISOString(),
              url: '/calendar',
            },
          }

          if (swRegRef.current && 'showNotification' in swRegRef.current) {
            swRegRef.current.showNotification(title, options).catch(() => {
              new Notification(title, options)
            })
          } else {
            const notif = new Notification(title, options)
            notif.onclick = () => {
              window.focus()
              focusEvent(alert.eventId, alert.startTime)
              navigate('/calendar')
            }
          }
        } catch {}
      }
    },
    [enabled, focusEvent, navigate, soundEnabled]
  )

  // Periodic Reminder Checker (runs every 30 seconds while tab is open and enabled)
  useEffect(() => {
    if (!enabled) return

    const timeZone = profile?.timezone || 'Asia/Ho_Chi_Minh'

    const checkUpcoming = () => {
      const now = new Date()
      // Look ahead for events occurring in the next window
      const lookAheadEnd = new Date(now.getTime() + (leadTimeMinutes + 5) * 60 * 1000)

      for (const event of events) {
        if (event.status !== 'scheduled' || event.deleted_at) continue

        const occurrences = eventOccurrencesBetween(event, now, lookAheadEnd, timeZone)
        for (const occ of occurrences) {
          const diffMs = occ.getTime() - now.getTime()
          const diffMinutes = Math.round(diffMs / (60 * 1000))
          const notifyKey = `${event.id}_${occ.toISOString().slice(0, 16)}`

          // Trigger reminder if event is within lead time and has not been notified yet
          if (diffMinutes >= 0 && diffMinutes <= leadTimeMinutes && !notifiedKeysRef.current.has(notifyKey)) {
            notifiedKeysRef.current.add(notifyKey)
            saveNotifiedKeys()

            triggerDesktopNotification({
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
  }, [enabled, events, leadTimeMinutes, profile?.timezone, saveNotifiedKeys, triggerDesktopNotification])

  return (
    <NotificationContext.Provider
      value={{
        enabled,
        soundEnabled,
        leadTimeMinutes,
        permission,
        toggleEnabled,
        setEnabled,
        setSoundEnabled,
        setLeadTimeMinutes,
        requestBrowserPermission,
      }}
    >
      {children}
    </NotificationContext.Provider>
  )
}

export const useNotification = () => useContext(NotificationContext)
