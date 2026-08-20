export type CalendarEvent = {
  id: string
  user_id?: string
  title: string
  description?: string | null
  start_time: string
  end_time: string
  color: string
  category: string
  status: 'scheduled' | 'completed' | 'cancelled'
  is_ai_generated: boolean
  all_day: boolean
  recurrence_rule?: 'daily' | 'weekly' | 'monthly' | null
  recurrence_end?: string | null
  deleted_at?: string | null
  created_at?: string
  updated_at?: string
}

export type EventDraft = Omit<CalendarEvent, 'id' | 'user_id' | 'created_at' | 'updated_at'>
