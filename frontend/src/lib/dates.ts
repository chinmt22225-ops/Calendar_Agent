function partsInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
}

export function dateKeyInTimeZone(date = new Date(), timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const parts = partsInTimeZone(date, timeZone)
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function zonedInputValue(value: Date | string, timeZone: string) {
  const parts = partsInTimeZone(typeof value === 'string' ? new Date(value) : value, timeZone)
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

export function localInputValue(value: Date | string) {
  const date = typeof value === 'string' ? new Date(value) : value
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

export function zonedInputToIso(value: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value)
  if (!match) throw new Error('Ngày giờ không hợp lệ.')
  const [, year, month, day, hour, minute] = match
  const wallClockUtc = Date.UTC(+year, +month - 1, +day, +hour, +minute)
  let candidate = new Date(wallClockUtc)
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = partsInTimeZone(candidate, timeZone)
    const actualAsUtc = Date.UTC(+actual.year, +actual.month - 1, +actual.day, +actual.hour, +actual.minute, +actual.second)
    const difference = wallClockUtc - actualAsUtc
    if (difference === 0) break
    candidate = new Date(candidate.getTime() + difference)
  }
  return candidate.toISOString()
}

export function floatingDateToIso(value: Date, timeZone: string) {
  return zonedInputToIso(localInputValue(value), timeZone)
}
