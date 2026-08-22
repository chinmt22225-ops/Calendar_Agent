import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as eventsApi from '../api/events'
import type { CalendarEvent, EventDraft } from '../types/calendar'
import { useAuth } from './AuthContext'
import { useToast } from './ToastContext'

type FocusTarget = {
  eventId: string
  date?: string
  timestamp: number
}

type CalendarContextValue = {
  events: CalendarEvent[]
  loading: boolean
  error: string | null
  categories: string[]
  categoryColors: Record<string, string>
  focusTarget: FocusTarget | null
  focusEvent: (eventId: string, date?: string | Date) => void
  clearFocus: () => void
  refresh: () => Promise<void>
  create: (event: EventDraft) => Promise<CalendarEvent>
  update: (id: string, changes: Partial<EventDraft>) => Promise<CalendarEvent>
  remove: (id: string) => Promise<void>
}

const CalendarContext = createContext<CalendarContextValue | null>(null)

export function CalendarProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const notify = useToast()
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null)
  const refreshSequence = useRef(0)

  const focusEvent = useCallback((eventId: string, date?: string | Date) => {
    let dateStr: string | undefined = undefined
    if (date) {
      if (typeof date === 'string') {
        dateStr = date.slice(0, 10)
      } else if (date instanceof Date) {
        dateStr = date.toISOString().slice(0, 10)
      }
    }
    setFocusTarget({ eventId, date: dateStr, timestamp: Date.now() })
  }, [])

  const clearFocus = useCallback(() => {
    setFocusTarget(null)
  }, [])

  const refresh = useCallback(async () => {
    if (!user) return
    const sequence = ++refreshSequence.current
    setLoading(true)
    setError(null)
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Quá thời gian tải lịch (15 giây). Vui lòng kiểm tra mạng và thử lại.')), 15000)
      )
      const nextEvents = await Promise.race([eventsApi.fetchEvents(), timeoutPromise])
      if (sequence === refreshSequence.current) setEvents(nextEvents)
    }
    catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Không thể tải lịch. Vui lòng thử lại.'
      if (sequence === refreshSequence.current) { setError(message); notify(message) }
    } finally {
      if (sequence === refreshSequence.current) setLoading(false)
    }
  }, [notify, user])

  useEffect(() => { void refresh() }, [refresh])

  const value = useMemo<CalendarContextValue>(() => ({
    events,
    loading,
    error,
    categories: [...new Set(events.map((event) => event.category))],
    categoryColors: Object.fromEntries(events.map((event) => [event.category, event.color])),
    focusTarget,
    focusEvent,
    clearFocus,
    refresh,
    create: async (draft) => {
      const created = await eventsApi.createEvent(draft)
      setEvents((current) => [...current, created])
      return created
    },
    update: async (id, changes) => {
      const updated = await eventsApi.updateEvent(id, changes)
      setEvents((current) => current.map((event) => event.id === id ? updated : event))
      return updated
    },
    remove: async (id) => {
      await eventsApi.deleteEvent(id)
      setEvents((current) => current.filter((event) => event.id !== id))
    },
  }), [clearFocus, error, events, focusEvent, focusTarget, loading, refresh])

  return <CalendarContext.Provider value={value}>{children}</CalendarContext.Provider>
}

export function useCalendar() {
  const context = useContext(CalendarContext)
  if (!context) throw new Error('useCalendar must be used inside CalendarProvider')
  return context
}
