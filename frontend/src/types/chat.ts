export type CalendarAction = {
  type: 'created' | 'updated' | 'deleted' | 'found'
  label: string
  event_ids: string[]
}

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  metadata?: { actions?: CalendarAction[] }
  created_at?: string
}

export type Conversation = {
  id: string
  title: string
  updated_at: string
}

