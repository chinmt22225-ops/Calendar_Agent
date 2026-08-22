import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./client', () => ({
  api: {},
  getAccessToken: vi.fn().mockResolvedValue('test-token'),
}))

import { ChatRequestError, streamMessage } from './chat'

function streamResponse(events: object[]) {
  const encoder = new TextEncoder()
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')))
      controller.close()
    },
  })
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

describe('AI Assistant SSE client', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('accepts a complete tool-backed response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse([
      { type: 'start', conversation_id: 'conversation-1' },
      { type: 'heartbeat' },
      { type: 'token', content: 'Đã tạo lịch.' },
      { type: 'actions', actions: [{ type: 'created', label: 'Đã thêm 2 sự kiện', event_ids: ['a', 'b'] }] },
      { type: 'done' },
    ])))
    const received = { start: '', text: '', actions: 0, done: false }
    await streamMessage('Tạo lịch', null, [], crypto.randomUUID(), {
      onStart: (id) => { received.start = id },
      onToken: (token) => { received.text += token },
      onActions: (actions) => { received.actions = actions.length },
      onDone: () => { received.done = true },
    })
    expect(received).toEqual({ start: 'conversation-1', text: 'Đã tạo lịch.', actions: 1, done: true })
  })

  it('rejects a stream that closes before done', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse([
      { type: 'start', conversation_id: 'conversation-1' },
      { type: 'token', content: 'Phản hồi dở dang' },
    ])))
    await expect(streamMessage('Tạo lịch', null, [], crypto.randomUUID(), {
      onStart: () => undefined,
      onToken: () => undefined,
      onActions: () => undefined,
    })).rejects.toThrow('Kết nối đã đóng trước khi Trợ lý AI hoàn tất phản hồi.')
  })

  it('surfaces the backend AI error instead of reporting false success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse([
      { type: 'start', conversation_id: 'conversation-1' },
      { type: 'error', detail: 'Gemini trả về phản hồi rỗng.' },
    ])))
    await expect(streamMessage('Tạo lịch', null, [], crypto.randomUUID(), {
      onStart: () => undefined,
      onToken: () => undefined,
      onActions: () => undefined,
    })).rejects.toThrow('Gemini trả về phản hồi rỗng.')
  })

  it('marks the daily Gemini quota as non-retryable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse([
      { type: 'start', conversation_id: 'conversation-1' },
      {
        type: 'error',
        status: 429,
        code: 'gemini_daily_quota',
        detail: 'Đã hết hạn mức Gemini miễn phí trong ngày.',
      },
    ])))

    const error = await streamMessage('Đọc ảnh', null, [], crypto.randomUUID(), {
      onStart: () => undefined,
      onToken: () => undefined,
      onActions: () => undefined,
    }).catch((reason) => reason)

    expect(error).toBeInstanceOf(ChatRequestError)
    expect(error.retryable).toBe(false)
    expect(error.code).toBe('gemini_daily_quota')
  })
})
