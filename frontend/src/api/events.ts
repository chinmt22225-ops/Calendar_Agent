import { api } from './client'
import type { CalendarEvent, EventDraft } from '../types/calendar'

export async function fetchEvents(start?: string, end?: string) {
  const { data } = await api.get<CalendarEvent[]>('/events', { params: { start, end } })
  return data
}

export async function createEvent(event: EventDraft) {
  const { data } = await api.post<CalendarEvent>('/events', event)
  return data
}

export async function updateEvent(id: string, changes: Partial<EventDraft>) {
  const { data } = await api.patch<CalendarEvent>(`/events/${id}`, changes)
  return data
}

export async function deleteEvent(id: string) {
  await api.delete(`/events/${id}`)
}

