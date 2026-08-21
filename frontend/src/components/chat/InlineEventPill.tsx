import { ArrowRight, CheckCircle2, Clock3, Sparkles } from 'lucide-react'
import type { CalendarAction } from '../../types/chat'

export function InlineEventPill({ action, onViewCalendar }: { action: CalendarAction; onViewCalendar: () => void }) {
  const isTask = action.type.startsWith('task')
  const isFound = action.type === 'found' || action.type === 'tasks_found'
  const Icon = isFound ? Clock3 : action.type === 'created' || action.type === 'task_created' ? Sparkles : CheckCircle2
  return (
    <button className="event-pill" onClick={onViewCalendar}>
      <Icon size={16} />
      <span>{action.label}</span>
      {!isFound && <><em>{isTask ? 'Mở Tasks' : 'Xem trên lịch'}</em><ArrowRight size={14} /></>}
    </button>
  )
}
