export type CalendarAction = {
  type: 'created' | 'updated' | 'deleted' | 'found' | 'task_created' | 'task_updated' | 'task_deleted' | 'tasks_found'
  label: string
  event_ids: string[]
}

export type ChatModelInfo = {
  id: string
  name: string
  provider: 'google' | 'groq' | 'openai'
  tier: 'top' | 'balanced' | 'speed' | 'safety'
  tier_label: string
  intelligence_score: number
  supports_vision: boolean
  supports_tools: boolean
  description: string
  badge_color: string
}

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  metadata?: {
    actions?: CalendarAction[]
    image_count?: number
    image_previews?: string[]
    error?: boolean
    error_code?: string
    retryable?: boolean
    retry_after?: number
    model_used?: string
    model_name?: string
  }
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
