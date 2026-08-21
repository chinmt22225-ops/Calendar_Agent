import type { CalendarAction, ChatImagePayload, ChatMessage, Conversation } from '../types/chat'
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
  images: ChatImagePayload[],
  operationId: string,
  handlers: {
    onStart: (conversationId: string) => void
    onToken: (token: string) => void
    onActions: (actions: CalendarAction[]) => void
    onDone?: () => void
  },
  signal?: AbortSignal,
) {
  const token = await getAccessToken()
  const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000/api'}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message, conversation_id: conversationId, operation_id: operationId, images }),
    signal,
  })
  if (!response.ok || !response.body) {
    const detail = await response.json().catch(() => ({ detail: 'Không thể kết nối với trợ lý AI.' }))
    const retryAfter = response.headers.get('Retry-After')
    const suffix = response.status === 429 && retryAfter ? ` Vui lòng thử lại sau ${retryAfter} giây.` : ''
    throw new Error(`${detail.detail || 'Không thể kết nối với trợ lý AI.'}${suffix}`)
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let completed = false
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() || ''
    for (const chunk of chunks) {
      if (!chunk.startsWith('data: ')) continue
      let payload
      try { payload = JSON.parse(chunk.slice(6)) }
      catch { throw new Error('Phản hồi từ Trợ lý AI không đúng định dạng.') }
      if (payload.type === 'start') handlers.onStart(payload.conversation_id)
      if (payload.type === 'token') handlers.onToken(payload.content)
      if (payload.type === 'actions') handlers.onActions(payload.actions)
      if (payload.type === 'done') { completed = true; handlers.onDone?.() }
      if (payload.type === 'error') throw new Error(payload.detail || 'Trợ lý AI gặp lỗi.')
    }
  }
  if (!completed) throw new Error('Kết nối đã đóng trước khi Trợ lý AI hoàn tất phản hồi.')
}
