import type { CalendarEvent as ScheduleXEvent } from '@schedule-x/calendar'
import type { CalendarEvent, EventDraft } from '../types/calendar'

export type PlanoraScheduleXEvent = ScheduleXEvent & {
  sourceId: string
  source: CalendarEvent
  rrule?: string
}

const paletteIds = ['rose', 'indigo', 'teal', 'coral', 'purple', 'green'] as const

function hash(value: string) {
  return [...value].reduce((total, character) => ((total * 31) + character.charCodeAt(0)) >>> 0, 0)
}

export function calendarIdFor(event: CalendarEvent) {
  return paletteIds[hash(`${event.category}:${event.color}`) % paletteIds.length]
}

export function recurrenceRule(event: CalendarEvent) {
  if (!event.recurrence_rule || !event.recurrence_end) return undefined
  const until = event.recurrence_end.replaceAll('-', '')
  return `FREQ=${event.recurrence_rule.toUpperCase()};INTERVAL=1;UNTIL=${until}T235959`
}

export function toScheduleXEvent(event: CalendarEvent, timeZone: string): PlanoraScheduleXEvent {
  const start = event.all_day
    ? Temporal.PlainDate.from(event.all_day_start || event.start_time.slice(0, 10))
    : Temporal.Instant.from(event.start_time).toZonedDateTimeISO(timeZone)
  const end = event.all_day
    ? Temporal.PlainDate.from(event.all_day_end || event.end_time.slice(0, 10))
    : Temporal.Instant.from(event.end_time).toZonedDateTimeISO(timeZone)

  return {
    id: event.id,
    sourceId: event.id,
    source: event,
    title: event.title,
    description: event.description || undefined,
    start,
    end,
    calendarId: calendarIdFor(event),
    rrule: recurrenceRule(event),
    _options: {
      additionalClasses: [
        `planora-event--${event.status}`,
        event.is_ai_generated ? 'planora-event--ai' : '',
      ].filter(Boolean),
    },
  }
}

function daysBetween(oldDate: Temporal.PlainDate, newDate: Temporal.PlainDate) {
  return oldDate.until(newDate).days
}

function shiftDate(value: string, days: number) {
  return Temporal.PlainDate.from(value).add({ days }).toString()
}

/**
 * Convert a Schedule-X drag/resize into an update for the persisted source event.
 * Recurrence copies share the source id, so their visual delta must be applied to
 * the series' original start/end instead of persisting the copy's occurrence date.
 */
export function scheduleXInteractionToDraft(
  source: CalendarEvent,
  oldEvent: ScheduleXEvent,
  newEvent: ScheduleXEvent,
): Partial<EventDraft> {
  const allDay = isPlainDate(oldEvent.start) && isPlainDate(newEvent.start)

  if (allDay) {
    const oldStart = oldEvent.start as Temporal.PlainDate
    const oldEnd = oldEvent.end as Temporal.PlainDate
    const newStart = newEvent.start as Temporal.PlainDate
    const newEnd = newEvent.end as Temporal.PlainDate
    const startShift = daysBetween(oldStart, newStart)
    const endShift = daysBetween(oldEnd, newEnd)
    const sourceStart = source.all_day_start || source.start_time.slice(0, 10)
    const sourceEnd = source.all_day_end || source.end_time.slice(0, 10)
    const shiftedStart = shiftDate(sourceStart, startShift)
    const shiftedEnd = shiftDate(sourceEnd, endShift)

    return {
      all_day: true,
      start_time: `${shiftedStart}T00:00:00.000Z`,
      end_time: `${shiftedEnd}T00:00:00.000Z`,
      all_day_start: shiftedStart,
      all_day_end: shiftedEnd,
      recurrence_end: source.recurrence_end
        ? shiftDate(source.recurrence_end, startShift)
        : null,
    }
  }

  const oldStart = oldEvent.start as Temporal.ZonedDateTime
  const oldEnd = oldEvent.end as Temporal.ZonedDateTime
  const newStart = newEvent.start as Temporal.ZonedDateTime
  const newEnd = newEvent.end as Temporal.ZonedDateTime
  const startShiftMs = newStart.epochMilliseconds - oldStart.epochMilliseconds
  const endShiftMs = newEnd.epochMilliseconds - oldEnd.epochMilliseconds
  const shiftedStart = Temporal.Instant.fromEpochMilliseconds(
    Temporal.Instant.from(source.start_time).epochMilliseconds + startShiftMs,
  )
  const shiftedEnd = Temporal.Instant.fromEpochMilliseconds(
    Temporal.Instant.from(source.end_time).epochMilliseconds + endShiftMs,
  )
  const recurrenceDayShift = daysBetween(oldStart.toPlainDate(), newStart.toPlainDate())

  return {
    all_day: false,
    start_time: shiftedStart.toString(),
    end_time: shiftedEnd.toString(),
    all_day_start: null,
    all_day_end: null,
    recurrence_end: source.recurrence_end
      ? shiftDate(source.recurrence_end, recurrenceDayShift)
      : null,
  }
}

function isPlainDate(value: Temporal.PlainDate | Temporal.ZonedDateTime): value is Temporal.PlainDate {
  return value instanceof Temporal.PlainDate
}

export function scheduleXChangeToDraft(event: ScheduleXEvent): Partial<EventDraft> {
  const allDay = isPlainDate(event.start)
  if (allDay) {
    const start = event.start.toString()
    const end = event.end.toString()
    return {
      all_day: true,
      start_time: `${start}T00:00:00.000Z`,
      end_time: `${end}T00:00:00.000Z`,
      all_day_start: start,
      all_day_end: end,
    }
  }
  const start = event.start as Temporal.ZonedDateTime
  const end = event.end as Temporal.ZonedDateTime
  return {
    all_day: false,
    start_time: start.toInstant().toString(),
    end_time: end.toInstant().toString(),
    all_day_start: null,
    all_day_end: null,
  }
}

export function initialRangeFromDate(date: Temporal.PlainDate) {
  return {
    start: date.toString(),
    end: date.add({ days: 1 }).toString(),
    allDay: true,
  }
}

export function initialRangeFromDateTime(dateTime: Temporal.ZonedDateTime) {
  return {
    start: dateTime.toPlainDateTime().toString({ smallestUnit: 'minute' }),
    end: dateTime.add({ hours: 1 }).toPlainDateTime().toString({ smallestUnit: 'minute' }),
    allDay: false,
  }
}
