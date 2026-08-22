import type { EventDraft } from '../types/calendar'
import type { CalendarEvent } from '../types/calendar'

export type RecurrenceRule = NonNullable<EventDraft['recurrence_rule']>

function startDate(value: string) {
  return Temporal.PlainDate.from(value.slice(0, 10))
}

export function nextRecurrenceDate(value: string, rule: RecurrenceRule) {
  const start = startDate(value)
  if (rule === 'daily') return start.add({ days: 1 }).toString()
  if (rule === 'weekly') return start.add({ weeks: 1 }).toString()

  let month = start.with({ day: 1 }).add({ months: 1 })
  while (month.daysInMonth < start.day) month = month.add({ months: 1 })
  return month.with({ day: start.day }).toString()
}

export function recommendedRecurrenceEnd(value: string, rule: RecurrenceRule) {
  const oneMonthLater = startDate(value).add({ months: 1 })
  const nextOccurrence = Temporal.PlainDate.from(nextRecurrenceDate(value, rule))
  return (Temporal.PlainDate.compare(oneMonthLater, nextOccurrence) >= 0
    ? oneMonthLater
    : nextOccurrence).toString()
}

export function validRecurrenceEnd(value: string, rule: RecurrenceRule, current: string | null | undefined) {
  const minimum = nextRecurrenceDate(value, rule)
  return current && current >= minimum ? current : recommendedRecurrenceEnd(value, rule)
}

function eventStartInTimeZone(event: CalendarEvent, timeZone: string) {
  if (event.all_day) {
    return Temporal.PlainDate.from(event.all_day_start || event.start_time.slice(0, 10)).toZonedDateTime({
      timeZone,
      plainTime: Temporal.PlainTime.from('00:00'),
    })
  }
  return Temporal.Instant.from(event.start_time).toZonedDateTimeISO(timeZone)
}

function nextZonedOccurrence(
  current: Temporal.ZonedDateTime,
  rule: RecurrenceRule,
  timeZone: string,
  anchorDay: number,
) {
  if (rule === 'daily') return current.add({ days: 1 })
  if (rule === 'weekly') return current.add({ weeks: 1 })
  let month = current.toPlainDate().with({ day: 1 }).add({ months: 1 })
  while (month.daysInMonth < anchorDay) month = month.add({ months: 1 })
  return month.with({ day: anchorDay }).toPlainDateTime(current.toPlainTime()).toZonedDateTime(timeZone)
}

export function eventOccurrencesBetween(event: CalendarEvent, start: Date, end: Date, timeZone: string) {
  if (event.status !== 'scheduled' || event.deleted_at) return []
  let occurrence = eventStartInTimeZone(event, timeZone)
  const startMilliseconds = start.getTime()
  const endMilliseconds = end.getTime()
  const anchorDay = occurrence.day
  const recurrenceEnd = event.recurrence_end ? Temporal.PlainDate.from(event.recurrence_end) : null
  const dates: Date[] = []

  for (let count = 0; count < 2000; count += 1) {
    if (recurrenceEnd && Temporal.PlainDate.compare(occurrence.toPlainDate(), recurrenceEnd) > 0) break
    const occurrenceMilliseconds = occurrence.epochMilliseconds
    if (occurrenceMilliseconds >= startMilliseconds && occurrenceMilliseconds <= endMilliseconds) {
      dates.push(new Date(occurrenceMilliseconds))
    }
    if (occurrenceMilliseconds > endMilliseconds || !event.recurrence_rule || !recurrenceEnd) break
    occurrence = nextZonedOccurrence(occurrence, event.recurrence_rule, timeZone, anchorDay)
  }
  return dates
}
