export type CalendarAction = {
  type: 'created' | 'updated' | 'deleted' | 'found' | 'task_created' | 'task_updated' | 'task_deleted' | 'tasks_found'
  label: string
  event_ids: string[]
}

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  metadata?: { actions?: CalendarAction[]; image_count?: number; image_previews?: string[]; error?: boolean }
  created_at?: string
}

export type ChatImagePayload = {
  mime_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
  data: string
}

export type ChatImageAttachment = ChatImagePayload & {
  id: string
  name: string
  preview: string
}

export type Conversation = {
  id: string
  title: string
  updated_at: string
}
