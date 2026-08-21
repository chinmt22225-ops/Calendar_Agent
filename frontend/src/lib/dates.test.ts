import { describe, expect, it } from 'vitest'
import { dateKeyInTimeZone, zonedInputToIso, zonedInputValue } from './dates'

describe('calendar timezone helpers', () => {
  it('keeps the profile date independent from the device timezone', () => {
    const instant = new Date('2026-08-20T18:30:00.000Z')
    expect(dateKeyInTimeZone(instant, 'Asia/Ho_Chi_Minh')).toBe('2026-08-21')
    expect(dateKeyInTimeZone(instant, 'America/Los_Angeles')).toBe('2026-08-20')
  })

  it('round-trips a Vietnamese wall-clock time to UTC', () => {
    const iso = zonedInputToIso('2026-08-21T09:15', 'Asia/Ho_Chi_Minh')
    expect(iso).toBe('2026-08-21T02:15:00.000Z')
    expect(zonedInputValue(iso, 'Asia/Ho_Chi_Minh')).toBe('2026-08-21T09:15')
  })

  it('uses the correct offset on both sides of a DST transition', () => {
    expect(zonedInputToIso('2026-03-07T09:00', 'America/New_York')).toBe('2026-03-07T14:00:00.000Z')
    expect(zonedInputToIso('2026-03-09T09:00', 'America/New_York')).toBe('2026-03-09T13:00:00.000Z')
  })

  it('rejects malformed date-time input', () => {
    expect(() => zonedInputToIso('21/08/2026 09:00', 'Asia/Ho_Chi_Minh')).toThrow('Ngày giờ không hợp lệ.')
  })
})
