import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'

const weekdays = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

function iso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function MiniCalendar({ selectedDate, onSelect }: { selectedDate: string; onSelect: (date: string) => void }) {
  const selected = new Date(`${selectedDate}T12:00:00`)
  const [cursor, setCursor] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1))
  const days = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const mondayOffset = (first.getDay() + 6) % 7
    const start = new Date(first); start.setDate(first.getDate() - mondayOffset)
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start); date.setDate(start.getDate() + index); return date
    })
  }, [cursor])
  const today = iso(new Date())
  return (
    <section className="mini-calendar">
      <header><strong>Tháng {cursor.getMonth() + 1}, {cursor.getFullYear()}</strong><div><button aria-label="Xem tháng trước" title="Tháng trước" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft size={15} /></button><button aria-label="Xem tháng sau" title="Tháng sau" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight size={15} /></button></div></header>
      <div className="mini-weekdays">{weekdays.map((day) => <span key={day}>{day}</span>)}</div>
      <div className="mini-days">{days.map((date) => { const value = iso(date); return <button key={value} className={`${date.getMonth() !== cursor.getMonth() ? 'outside' : ''} ${value === today ? 'today' : ''} ${value === selectedDate ? 'selected' : ''}`} onClick={() => { onSelect(value); setCursor(new Date(date.getFullYear(), date.getMonth(), 1)) }}>{date.getDate()}</button> })}</div>
    </section>
  )
}
