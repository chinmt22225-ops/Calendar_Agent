import { describe, expect, it } from 'vitest'
import 'temporal-polyfill/global'
import type { CalendarEvent } from '../types/calendar'
import { eventOccurrencesBetween, nextRecurrenceDate, recommendedRecurrenceEnd, validRecurrenceEnd } from './recurrence'

const event: CalendarEvent = {
  id: 'event-1', title: 'Ôn tập', description: null,
  start_time: '2026-03-07T14:00:00Z', end_time: '2026-03-07T15:00:00Z',
  color: '#d93662', category: 'Học tập', status: 'scheduled', is_ai_generated: false,
  all_day: false, all_day_start: null, all_day_end: null,
  recurrence_rule: 'daily', recurrence_end: '2026-03-10', deleted_at: null,
}

describe('recurrence form helpers', () => {
  it('requires at least one real future occurrence', () => {
    expect(nextRecurrenceDate('2026-08-21T09:00', 'daily')).toBe('2026-08-22')
    expect(nextRecurrenceDate('2026-08-21T09:00', 'weekly')).toBe('2026-08-28')
  })

  it('skips months that do not contain the anchor day', () => {
    expect(nextRecurrenceDate('2026-01-31T09:00', 'monthly')).toBe('2026-03-31')
    expect(recommendedRecurrenceEnd('2026-01-31T09:00', 'monthly')).toBe('2026-03-31')
  })

  it('keeps a user-selected end when it still includes a future occurrence', () => {
    expect(validRecurrenceEnd('2026-08-21T09:00', 'weekly', '2026-10-01')).toBe('2026-10-01')
    expect(validRecurrenceEnd('2026-08-21T09:00', 'weekly', '2026-08-22')).toBe('2026-09-21')
  })

  it('keeps the profile wall-clock time across daylight-saving changes', () => {
    const occurrences = eventOccurrencesBetween(
      event,
      new Date('2026-03-07T00:00:00Z'),
      new Date('2026-03-11T00:00:00Z'),
      'America/New_York',
    )
    expect(occurrences.map((date) => date.toISOString())).toEqual([
      '2026-03-07T14:00:00.000Z',
      '2026-03-08T13:00:00.000Z',
      '2026-03-09T13:00:00.000Z',
      '2026-03-10T13:00:00.000Z',
    ])
  })

  it('does not notify for cancelled or deleted events', () => {
    const range = [new Date('2026-03-07T00:00:00Z'), new Date('2026-03-11T00:00:00Z')] as const
    expect(eventOccurrencesBetween({ ...event, status: 'cancelled' }, ...range, 'America/New_York')).toEqual([])
    expect(eventOccurrencesBetween({ ...event, deleted_at: '2026-03-01T00:00:00Z' }, ...range, 'America/New_York')).toEqual([])
  })
})
