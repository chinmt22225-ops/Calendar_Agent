import type { CalendarAction, ChatImagePayload, ChatMessage, ChatModelInfo, Conversation } from '../types/chat'
import { api, getAccessToken } from './client'
import { supabase } from '../lib/supabase'

export class ChatRequestError extends Error {
  status: number
  code?: string
  retryAfter?: number
  retryable: boolean

  constructor(detail: string, options: { status?: number; code?: string; retryAfter?: string | number } = {}) {
    const status = options.status ?? 502
    const parsedRetryAfter = options.retryAfter === undefined ? undefined : Number(options.retryAfter)
    const retryAfter = Number.isFinite(parsedRetryAfter) && parsedRetryAfter! > 0 ? parsedRetryAfter : undefined
    const retryable = options.code !== 'gemini_daily_quota' && (status === 429 || status >= 500)
    const suffix = status === 429 && retryable && retryAfter ? ` Vui lòng thử lại sau ${retryAfter} giây.` : ''
    super(`${detail}${suffix}`)
    this.name = 'ChatRequestError'
    this.status = status
    this.code = options.code
    this.retryAfter = retryAfter
    this.retryable = retryable
  }
}

export async function fetchChatModels() {
  const { data } = await api.get<ChatModelInfo[]>('/chat/models')
  return data
}

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
    onActions: (actions: CalendarAction[], metadata?: { model_used?: string; model_name?: string }) => void
    onDone?: (metadata?: { model_used?: string; model_name?: string }) => void
  },
  signal?: AbortSignal,
  model: string = 'auto',
) {
  const requestBody = JSON.stringify({
    message,
    conversation_id: conversationId,
    operation_id: operationId,
    images,
    model,
  })
  const apiBase =
    import.meta.env.VITE_API_URL ||
    (import.meta.env.PROD
      ? 'https://planora-317k.onrender.com/api'
      : 'http://localhost:8000/api')
  const request = (token: string) => fetch(`${apiBase}/chat/stream`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: requestBody, signal,
  })
  let response = await request(await getAccessToken())
  if (response.status === 401) {
    const refreshed = await supabase.auth.refreshSession()
    if (refreshed.data.session?.access_token) response = await request(refreshed.data.session.access_token)
  }
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => ({ detail: 'Không thể kết nối với trợ lý AI.' })) as { detail?: string; code?: string; retry_after?: string | number }
    throw new ChatRequestError(payload.detail || 'Không thể kết nối với trợ lý AI.', {
      status: response.status,
      code: payload.code || response.headers.get('X-Planora-Error-Code') || undefined,
      retryAfter: payload.retry_after || response.headers.get('Retry-After') || undefined,
    })
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
      catch { throw new ChatRequestError('Phản hồi từ Trợ lý AI không đúng định dạng.') }
      if (payload.type === 'start') handlers.onStart(payload.conversation_id)
      if (payload.type === 'token') handlers.onToken(payload.content)
      if (payload.type === 'actions') handlers.onActions(payload.actions, {
        model_used: payload.model_used,
        model_name: payload.model_name,
      })
      if (payload.type === 'done') {
        completed = true
        handlers.onDone?.({
          model_used: payload.model_used,
          model_name: payload.model_name,
        })
      }
      if (payload.type === 'error') throw new ChatRequestError(payload.detail || 'Trợ lý AI gặp lỗi.', {
        status: payload.status,
        code: payload.code,
        retryAfter: payload.retry_after,
      })
    }
  }
  if (!completed) throw new ChatRequestError('Kết nối đã đóng trước khi Trợ lý AI hoàn tất phản hồi.')
}
