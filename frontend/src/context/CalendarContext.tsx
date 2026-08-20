import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as eventsApi from '../api/events'
import type { CalendarEvent, EventDraft } from '../types/calendar'
import { useAuth } from './AuthContext'

type CalendarContextValue = {
  events: CalendarEvent[]
  loading: boolean
  categories: string[]
  refresh: () => Promise<void>
  create: (event: EventDraft) => Promise<CalendarEvent>
  update: (id: string, changes: Partial<EventDraft>) => Promise<CalendarEvent>
  remove: (id: string) => Promise<void>
}

const CalendarContext = createContext<CalendarContextValue | null>(null)

export function CalendarProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      setEvents(await eventsApi.fetchEvents())
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { void refresh() }, [refresh])

  const value = useMemo<CalendarContextValue>(() => ({
    events,
    loading,
    categories: [...new Set(events.map((event) => event.category))],
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
  }), [events, loading, refresh])

  return <CalendarContext.Provider value={value}>{children}</CalendarContext.Provider>
}

export function useCalendar() {
  const context = useContext(CalendarContext)
  if (!context) throw new Error('useCalendar must be used inside CalendarProvider')
  return context
}

