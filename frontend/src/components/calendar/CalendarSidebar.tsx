import { CalendarDays, Check, Plus } from 'lucide-react'

const palette = ['#2563eb', '#7c3aed', '#0f9f6e', '#ea580c', '#db2777', '#0891b2']

export function CalendarSidebar({ categories, visible, selectedDate, onDateChange, onToggle, onCreate }: {
  categories: string[]
  visible: Set<string>
  selectedDate: string
  onDateChange: (date: string) => void
  onToggle: (category: string) => void
  onCreate: () => void
}) {
  const fallback = categories.length ? categories : ['Toán', 'Lập trình', 'Ôn thi', 'Do AI xếp']
  return (
    <aside className="calendar-sidebar">
      <button className="create-event" onClick={onCreate}><Plus size={20} /> Tạo mới</button>
      <section className="mini-calendar">
        <h3><CalendarDays size={16} /> Chọn ngày</h3>
        <input type="date" value={selectedDate} onChange={(event) => onDateChange(event.target.value)} />
      </section>
      <section className="calendar-filters">
        <div><h3>Lịch của tôi</h3><button onClick={() => fallback.forEach((item) => !visible.has(item) && onToggle(item))}>Hiện tất cả</button></div>
        {fallback.map((category, index) => (
          <label key={category}>
            <input type="checkbox" checked={visible.has(category)} onChange={() => onToggle(category)} />
            <span className="filter-check" style={{ background: palette[index % palette.length] }}>{visible.has(category) && <Check size={12} />}</span>
            <span>{category}</span>
          </label>
        ))}
      </section>
      <div className="ai-filter-note"><span>✦</span><p><strong>Do AI xếp</strong><br />Các buổi học được trợ lý tự động lên lịch.</p></div>
    </aside>
  )
}

