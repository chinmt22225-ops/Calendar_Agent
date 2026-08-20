import { ArrowRight, CheckCircle2, Clock3, Sparkles } from 'lucide-react'
import type { CalendarAction } from '../../types/chat'

export function InlineEventPill({ action, onViewCalendar }: { action: CalendarAction; onViewCalendar: () => void }) {
  const Icon = action.type === 'found' ? Clock3 : action.type === 'created' ? Sparkles : CheckCircle2
  return (
    <button className="event-pill" onClick={onViewCalendar}>
      <Icon size={16} />
      <span>{action.label}</span>
      {action.type !== 'found' && <><em>Xem trên lịch</em><ArrowRight size={14} /></>}
    </button>
  )
}

