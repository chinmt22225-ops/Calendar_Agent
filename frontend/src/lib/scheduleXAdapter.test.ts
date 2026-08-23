import { describe, expect, it } from 'vitest'
import 'temporal-polyfill/global'
import { createCalendar, createViewWeek } from '@schedule-x/calendar'
import { createCalendarControlsPlugin } from '@schedule-x/calendar-controls'
import { createEventRecurrencePlugin, createEventsServicePlugin } from '@schedule-x/event-recurrence'
import type { CalendarEvent } from '../types/calendar'
import { initialRangeFromDate, recurrenceRule, scheduleXChangeToDraft, scheduleXInteractionToDraft, toScheduleXEvent } from './scheduleXAdapter'

const base: CalendarEvent = {
  id: 'event-1', title: 'Ôn tập', description: null,
  start_time: '2026-08-21T06:00:00.000Z', end_time: '2026-08-21T08:00:00.000Z',
  color: '#ea4c78', category: 'Học tập', status: 'scheduled', is_ai_generated: false,
  all_day: false, all_day_start: null, all_day_end: null, recurrence_rule: null, recurrence_end: null,
}

describe('Schedule-X adapter', () => {
  it('converts timed backend events into the profile timezone without changing the instant', () => {
    const converted = toScheduleXEvent(base, 'Asia/Ho_Chi_Minh')
    expect(converted.start.toString()).toContain('2026-08-21T13:00:00+07:00')
    expect(scheduleXChangeToDraft(converted).start_time).toBe('2026-08-21T06:00:00Z')
  })

  it('keeps all-day dates exclusive at the end boundary', () => {
    const converted = toScheduleXEvent({
      ...base, all_day: true, all_day_start: '2026-08-21', all_day_end: '2026-08-23',
      start_time: '2026-08-21T00:00:00.000Z', end_time: '2026-08-23T00:00:00.000Z',
    }, 'Asia/Ho_Chi_Minh')
    expect(converted.start.toString()).toBe('2026-08-21')
    expect(converted.end.toString()).toBe('2026-08-23')
    expect(scheduleXChangeToDraft(converted)).toMatchObject({ all_day: true, all_day_start: '2026-08-21', all_day_end: '2026-08-23' })
  })

  it('creates supported recurrence rules and safe all-day selection ranges', () => {
    expect(recurrenceRule({ ...base, recurrence_rule: 'weekly', recurrence_end: '2026-09-30' })).toBe('FREQ=WEEKLY;INTERVAL=1;UNTIL=20260930T235959')
    expect(initialRangeFromDate(Temporal.PlainDate.from('2026-08-21'))).toEqual({ start: '2026-08-21', end: '2026-08-22', allDay: true })
  })

  it('keeps recurring events draggable and applies an occurrence drag to the whole series', () => {
    const source = { ...base, recurrence_rule: 'weekly' as const, recurrence_end: '2026-09-18' }
    const converted = toScheduleXEvent(source, 'Asia/Ho_Chi_Minh')
    expect(converted._options?.disableDND).toBeUndefined()
    expect(converted._options?.disableResize).toBeUndefined()

    const oldOccurrence = {
      ...converted,
      start: Temporal.ZonedDateTime.from('2026-08-28T13:00:00+07:00[Asia/Ho_Chi_Minh]'),
      end: Temporal.ZonedDateTime.from('2026-08-28T15:00:00+07:00[Asia/Ho_Chi_Minh]'),
    }
    const movedOccurrence = {
      ...oldOccurrence,
      start: Temporal.ZonedDateTime.from('2026-08-29T14:15:00+07:00[Asia/Ho_Chi_Minh]'),
      end: Temporal.ZonedDateTime.from('2026-08-29T16:15:00+07:00[Asia/Ho_Chi_Minh]'),
    }

    expect(scheduleXInteractionToDraft(source, oldOccurrence, movedOccurrence)).toMatchObject({
      start_time: '2026-08-22T07:15:00Z',
      end_time: '2026-08-22T09:15:00Z',
      recurrence_end: '2026-09-19',
    })
  })

  it('moves all-day recurrence series by the dragged occurrence delta', () => {
    const source = {
      ...base,
      all_day: true,
      all_day_start: '2026-08-21',
      all_day_end: '2026-08-22',
      start_time: '2026-08-21T00:00:00.000Z',
      end_time: '2026-08-22T00:00:00.000Z',
      recurrence_rule: 'daily' as const,
      recurrence_end: '2026-08-25',
    }
    const oldOccurrence = {
      ...toScheduleXEvent(source, 'UTC'),
      start: Temporal.PlainDate.from('2026-08-23'),
      end: Temporal.PlainDate.from('2026-08-24'),
    }
    const movedOccurrence = {
      ...oldOccurrence,
      start: Temporal.PlainDate.from('2026-08-25'),
      end: Temporal.PlainDate.from('2026-08-26'),
    }

    expect(scheduleXInteractionToDraft(source, oldOccurrence, movedOccurrence)).toMatchObject({
      all_day_start: '2026-08-23',
      all_day_end: '2026-08-24',
      recurrence_end: '2026-08-27',
    })
  })

  it.each([
    ['daily', '2026-08-23', 3],
    ['weekly', '2026-09-04', 3],
    ['monthly', '2026-10-21', 3],
  ] as const)('expands %s series through Schedule-X', (rule, recurrenceEnd, expectedCount) => {
    const recurrence = createEventRecurrencePlugin()
    const eventsService = createEventsServicePlugin()
    const app = createCalendar({
      views: [createViewWeek()],
      defaultView: 'week',
      selectedDate: Temporal.PlainDate.from('2026-08-21'),
      timezone: 'UTC',
      events: [toScheduleXEvent({ ...base, recurrence_rule: rule, recurrence_end: recurrenceEnd }, 'UTC')],
    }, [recurrence, eventsService])
    const host = document.createElement('div')
    document.body.append(host)
    app.render(host)
    const internal = eventsService as unknown as { $app: { calendarEvents: { list: { value: unknown[] } } } }
    expect(internal.$app.calendarEvents.list.value).toHaveLength(expectedCount)
    app.destroy()
    host.remove()
  })

  it('keeps weekly recurrence visible when the selected date jumps from the mini calendar', () => {
    const recurrence = createEventRecurrencePlugin()
    const eventsService = createEventsServicePlugin()
    const controls = createCalendarControlsPlugin()
    const app = createCalendar({
      views: [createViewWeek()],
      defaultView: 'week',
      selectedDate: Temporal.PlainDate.from('2026-08-21'),
      timezone: 'UTC',
      events: [toScheduleXEvent({ ...base, recurrence_rule: 'weekly', recurrence_end: '2026-09-04' }, 'UTC')],
    }, [recurrence, eventsService, controls])
    const host = document.createElement('div')
    document.body.append(host)
    app.render(host)

    controls.setDate(Temporal.PlainDate.from('2026-08-29'))
    const internal = eventsService as unknown as { $app: { calendarEvents: { list: { value: Array<{ start: Temporal.ZonedDateTime }> } } } }
    expect(internal.$app.calendarEvents.list.value.some((event) => event.start.toPlainDate().toString() === '2026-08-28')).toBe(true)

    app.destroy()
    host.remove()
  })

  it('correctly expands recurring events when set dynamically via app.events.set', () => {
    const recurrence = createEventRecurrencePlugin()
    const eventsService = createEventsServicePlugin()
    const app = createCalendar({
      views: [createViewWeek()],
      defaultView: 'week',
      selectedDate: Temporal.PlainDate.from('2026-09-28'),
      timezone: 'Asia/Ho_Chi_Minh',
      events: [],
    }, [recurrence, eventsService])
    const host = document.createElement('div')
    document.body.append(host)
    app.render(host)

    const recurringEvent: CalendarEvent = {
      id: 'event-study-1',
      title: 'Xác suất thống kê (LT)',
      description: 'cs2:PMT_NĐH4.3',
      start_time: '2026-09-28T00:30:00.000Z',
      end_time: '2026-09-28T04:00:00.000Z',
      color: '#2563eb',
      category: 'Học tập',
      status: 'scheduled',
      is_ai_generated: true,
      all_day: false,
      all_day_start: null,
      all_day_end: null,
      recurrence_rule: 'weekly',
      recurrence_end: '2027-01-17',
    }

    const converted = toScheduleXEvent(recurringEvent, 'Asia/Ho_Chi_Minh')
    eventsService.set([converted])

    const internal = eventsService as unknown as { $app: { calendarEvents: { list: { value: Array<any> } } } }
    expect(internal.$app.calendarEvents.list.value.length).toBeGreaterThan(1)
    app.destroy()
    host.remove()
  })
})

