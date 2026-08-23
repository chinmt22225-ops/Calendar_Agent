import { CalendarPlus, Check, PanelLeftClose, PanelLeftOpen, Plus, Sparkles, Trash2, X } from 'lucide-react'
import { MiniCalendar } from './MiniCalendar'
import { TaskPanel } from './TaskPanel'

export function CalendarSidebar({ categories, categoryColors, visible, selectedDate, collapsed, mobileOpen, onDateChange, onToggle, onCreate, onOpenTrash, onToggleCollapsed, onCloseMobile, onAiPlan }: {
  categories: string[]
  categoryColors: Record<string, string>
  visible: Set<string>
  selectedDate: string
  collapsed: boolean
  mobileOpen: boolean
  onDateChange: (date: string) => void
  onToggle: (category: string) => void
  onCreate: () => void
  onOpenTrash: () => void
  onToggleCollapsed: () => void
  onCloseMobile: () => void
  onAiPlan?: () => void
}) {
  return (
    <aside className={`calendar-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
      <div className="calendar-sidebar-head"><button className="sidebar-collapse" aria-label={collapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'} title={collapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'} onClick={onToggleCollapsed}>{collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button><button className="mobile-sidebar-close" aria-label="Đóng thanh bên" onClick={onCloseMobile}><X size={18} /></button></div>
      {collapsed ? <div className="calendar-sidebar-rail"><button aria-label="Tạo sự kiện" title="Tạo sự kiện" onClick={onCreate}><CalendarPlus size={19} /></button>{onAiPlan && <button aria-label="Lập kế hoạch AI" title="Lập kế hoạch AI" onClick={onAiPlan}><Sparkles size={18} /></button>}<button aria-label="Mở Thùng rác" title="Thùng rác" onClick={onOpenTrash}><Trash2 size={18} /></button></div> : <>
      <div className="sidebar-action-buttons">
        <button className="create-event" onClick={onCreate}><Plus size={18} /> Tạo sự kiện</button>
        {onAiPlan && <button className="ai-plan-sidebar-btn" onClick={onAiPlan}><Sparkles size={16} /> Lập kế hoạch AI</button>}
      </div>
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
      <div className="ai-filter-note"><span>✦</span><p><strong>Do Planora xếp</strong><br />Sự kiện có ký hiệu ✦ được tạo từ Trợ lý AI.</p></div>
      </>}
    </aside>
  )
}
