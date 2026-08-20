import type { CalendarAction, ChatMessage, Conversation } from '../types/chat'
import { api, getAccessToken } from './client'

export async function fetchConversations() {
  const { data } = await api.get<Conversation[]>('/chat/conversations')
  return data
}

export async function fetchConversation(id: string) {
  const { data } = await api.get<ChatMessage[]>(`/chat/conversations/${id}`)
  return data
}

export async function renameConversation(id: string, title: string) {
  const { data } = await api.patch<Conversation>(`/chat/conversations/${id}`, { title })
  return data
}

export async function deleteConversation(id: string) {
  await api.delete(`/chat/conversations/${id}`)
}

export async function streamMessage(
  message: string,
  conversationId: string | null,
  handlers: {
    onStart: (conversationId: string) => void
    onToken: (token: string) => void
    onActions: (actions: CalendarAction[]) => void
  },
) {
  const token = await getAccessToken()
  const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000/api'}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message, conversation_id: conversationId }),
  })
  if (!response.ok || !response.body) {
    const detail = await response.json().catch(() => ({ detail: 'Không thể kết nối với trợ lý AI.' }))
    throw new Error(detail.detail || 'Không thể kết nối với trợ lý AI.')
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() || ''
    for (const chunk of chunks) {
      if (!chunk.startsWith('data: ')) continue
      const payload = JSON.parse(chunk.slice(6))
      if (payload.type === 'start') handlers.onStart(payload.conversation_id)
      if (payload.type === 'token') handlers.onToken(payload.content)
      if (payload.type === 'actions') handlers.onActions(payload.actions)
      if (payload.type === 'error') throw new Error(payload.detail || 'Trợ lý AI gặp lỗi.')
    }
  }
}
