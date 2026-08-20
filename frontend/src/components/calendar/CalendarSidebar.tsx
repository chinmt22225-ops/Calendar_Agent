import { Check, Plus, Trash2 } from 'lucide-react'
import { MiniCalendar } from './MiniCalendar'
import { TaskPanel } from './TaskPanel'

export function CalendarSidebar({ categories, categoryColors, visible, selectedDate, onDateChange, onToggle, onCreate, onOpenTrash }: {
  categories: string[]
  categoryColors: Record<string, string>
  visible: Set<string>
  selectedDate: string
  onDateChange: (date: string) => void
  onToggle: (category: string) => void
  onCreate: () => void
  onOpenTrash: () => void
}) {
  return (
    <aside className="calendar-sidebar">
      <button className="create-event" onClick={onCreate}><Plus size={20} /> Tạo mới</button>
      <MiniCalendar selectedDate={selectedDate} onSelect={onDateChange} />
      <section className="calendar-filters">
        <div><h3>Lịch của tôi</h3><button onClick={() => categories.forEach((item) => !visible.has(item) && onToggle(item))}>Hiện tất cả</button></div>
        {categories.length === 0 && <small>Chưa có danh mục.</small>}
        {categories.map((category) => (
          <label key={category}>
            <input type="checkbox" checked={visible.has(category)} onChange={() => onToggle(category)} />
            <span className="filter-check" style={{ background: categoryColors[category] }}>{visible.has(category) && <Check size={12} />}</span>
            <span>{category}</span>
          </label>
        ))}
      </section>
      <TaskPanel />
      <button className="trash-link" onClick={onOpenTrash}><Trash2 size={15} /> Thùng rác</button>
      <div className="ai-filter-note"><span>✦</span><p><strong>Do AI xếp</strong><br />Sự kiện có ký hiệu ✦ được trợ lý tự động lên lịch.</p></div>
    </aside>
  )
}
