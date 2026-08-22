import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import 'temporal-polyfill/global'
import { EventModal } from './EventModal'

describe('EventModal recurrence UX', () => {
  it('chooses the first valid monthly recurrence for a month-end event', () => {
    render(<EventModal
      event={null}
      initialRange={{ start: '2026-01-31T09:00', end: '2026-01-31T10:00' }}
      categories={['Học tập']}
      timeZone="Asia/Ho_Chi_Minh"
      onClose={vi.fn()}
      onSave={vi.fn()}
      onDelete={null}
    />)

    fireEvent.change(screen.getByLabelText(/Lặp lại/), { target: { value: 'monthly' } })
    const recurrenceEnd = screen.getByLabelText('Lặp đến ngày') as HTMLInputElement
    expect(recurrenceEnd.value).toBe('2026-03-31')
    expect(recurrenceEnd.min).toBe('2026-03-31')
  })

  it('preserves duration and keeps recurrence valid when the start changes', () => {
    render(<EventModal
      event={null}
      initialRange={{ start: '2026-08-21T09:00', end: '2026-08-21T10:30' }}
      categories={['Học tập']}
      timeZone="Asia/Ho_Chi_Minh"
      onClose={vi.fn()}
      onSave={vi.fn()}
      onDelete={null}
    />)

    fireEvent.change(screen.getByLabelText(/Lặp lại/), { target: { value: 'weekly' } })
    fireEvent.change(screen.getByLabelText(/Bắt đầu/), { target: { value: '2026-10-10T14:00' } })
    expect((screen.getByLabelText(/Kết thúc/) as HTMLInputElement).value).toBe('2026-10-10T15:30')
    expect((screen.getByLabelText('Lặp đến ngày') as HTMLInputElement).value).toBe('2026-11-10')
  })
})
