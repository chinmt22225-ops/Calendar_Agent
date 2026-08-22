import { AlertTriangle, CalendarClock, ClipboardList, Clock3, Image, LoaderCircle, ShieldCheck, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ChatRequestError, deleteConversation, fetchConversation, fetchConversations, renameConversation, streamMessage } from '../../api/chat'
import { useCalendar } from '../../context/CalendarContext'
import { useToast } from '../../context/ToastContext'
import type { CalendarAction, ChatImageAttachment, ChatMessage, Conversation } from '../../types/chat'
import { Dialog } from '../common/Dialog'
import { ChatInput } from './ChatInput'
import { ChatSidebar } from './ChatSidebar'
import { MessageList } from './MessageList'

const prompts = [
  { icon: CalendarClock, text: 'Lập lịch ôn thi cuối kỳ trong 2 tuần tới' },
  { icon: Clock3, text: 'Tìm 2 tiếng rảnh tối nay để học bài' },
  { icon: Sparkles, text: 'Dời lịch học chiều nay sang sáng mai' },
  { icon: ClipboardList, text: 'Dán thời khóa biểu vào đây để tự động điền vào lịch' },
]

type PendingRequest = { content: string; images: ChatImageAttachment[] }

function releasePreviews(messages: ChatMessage[]) {
  messages.forEach((message) => message.metadata?.image_previews?.forEach((preview) => {
    if (preview.startsWith('blob:')) URL.revokeObjectURL(preview)
  }))
}

export function ChatView({ onViewCalendar }: { onViewCalendar: () => void }) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [conversationsLoading, setConversationsLoading] = useState(true)
  const [conversationsError, setConversationsError] = useState('')
  const [conversationLoading, setConversationLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const [lastRequest, setLastRequest] = useState<PendingRequest | null>(null)
  const [renameTarget, setRenameTarget] = useState<Conversation | null>(null)
  const [renameTitle, setRenameTitle] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null)
  const [dialogBusy, setDialogBusy] = useState(false)
  const { refresh } = useCalendar()
  const notify = useToast()
  const endRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<ChatMessage[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const generationRef = useRef(0)
  const conversationLoadRef = useRef(0)

  const loadConversations = async () => {
    setConversationsLoading(true); setConversationsError('')
    try { setConversations(await fetchConversations()) }
    catch (reason) { setConversationsError(reason instanceof Error ? reason.message : 'Không thể tải lịch sử trò chuyện.') }
    finally { setConversationsLoading(false) }
  }

  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { void loadConversations(); return () => { abortRef.current?.abort(); releasePreviews(messagesRef.current) } }, [])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: streaming ? 'auto' : 'smooth' }) }, [messages, streaming])

  const newChat = () => {
    generationRef.current += 1
    conversationLoadRef.current += 1
    if (streaming) abortRef.current?.abort()
    abortRef.current = null; setStreaming(false)
    releasePreviews(messagesRef.current)
    setConversationId(null); setMessages([]); setLastRequest(null)
  }
  const selectConversation = async (id: string) => {
    generationRef.current += 1
    const loadId = ++conversationLoadRef.current
    if (streaming) abortRef.current?.abort()
    abortRef.current = null; setStreaming(false)
    releasePreviews(messagesRef.current)
    setConversationId(id); setConversationLoading(true)
    try { const loaded = await fetchConversation(id); if (loadId === conversationLoadRef.current) { setMessages(loaded); setLastRequest(null) } }
    catch (reason) { if (loadId === conversationLoadRef.current) { notify(reason instanceof Error ? reason.message : 'Không thể tải cuộc trò chuyện.'); setMessages([]) } }
    finally { if (loadId === conversationLoadRef.current) setConversationLoading(false) }
  }
  const openRename = (conversation: Conversation) => { setRenameTarget(conversation); setRenameTitle(conversation.title) }
  const saveRename = async () => {
    if (!renameTarget) return
    const title = renameTitle.trim()
    if (!title) return
    setDialogBusy(true)
    try { await renameConversation(renameTarget.id, title); await loadConversations(); setRenameTarget(null); notify('Đã đổi tên cuộc trò chuyện.', 'success') }
    catch (reason) { notify(reason instanceof Error ? reason.message : 'Không thể đổi tên cuộc trò chuyện.') }
    finally { setDialogBusy(false) }
  }
  const removeConversation = async () => {
    if (!deleteTarget) return
    setDialogBusy(true)
    try { await deleteConversation(deleteTarget.id); if (conversationId === deleteTarget.id) newChat(); await loadConversations(); setDeleteTarget(null); notify('Đã xóa cuộc trò chuyện.', 'success') }
    catch (reason) { notify(reason instanceof Error ? reason.message : 'Không thể xóa cuộc trò chuyện.') }
    finally { setDialogBusy(false) }
  }

  const runRequest = async (content: string, images: ChatImageAttachment[], appendUser: boolean) => {
    if (streaming) return
    const generation = ++generationRef.current
    const existingConversationId = conversationId
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(), role: 'user',
      content: content || `[Đã gửi ${images.length} ảnh]`,
      metadata: images.length ? { image_count: images.length, image_previews: images.map((image) => image.preview) } : undefined,
    }
    const assistantId = crypto.randomUUID()
    setMessages((current) => appendUser
      ? [...current, userMessage, { id: assistantId, role: 'assistant', content: '' }]
      : [...current.filter((item) => !item.metadata?.error), { id: assistantId, role: 'assistant', content: '' }])
    if (appendUser) setLastRequest({ content, images })
    setStreaming(true)
    const controller = new AbortController()
    abortRef.current = controller
    let started = false
    let tokenBuffer = ''
    let frame: number | null = null
    const flush = () => {
      if (!tokenBuffer || generation !== generationRef.current) return
      const chunk = tokenBuffer; tokenBuffer = ''
      setMessages((current) => current.map((item) => item.id === assistantId ? { ...item, content: item.content + chunk } : item))
    }
    const scheduleToken = (token: string) => {
      tokenBuffer += token
      if (frame !== null) return
      frame = window.requestAnimationFrame(() => { frame = null; flush() })
    }
    try {
      await streamMessage(content, conversationId, images.map(({ mime_type, data }) => ({ mime_type, data })), crypto.randomUUID(), {
        onStart: (id) => { if (generation !== generationRef.current) return; started = true; setConversationId(id) },
        onToken: scheduleToken,
        onActions: (actions: CalendarAction[]) => {
          if (generation !== generationRef.current) return
          if (frame !== null) { window.cancelAnimationFrame(frame); frame = null }
          flush()
          setMessages((current) => current.map((item) => item.id === assistantId ? { ...item, metadata: { ...item.metadata, actions } } : item))
          if (actions.some((action) => action.type.startsWith('task_'))) {
            window.dispatchEvent(new Event('planora:tasks-changed'))
          }
        },
      }, controller.signal)
      if (generation !== generationRef.current) return
      if (frame !== null) { window.cancelAnimationFrame(frame); frame = null }
      flush()
      await Promise.all([loadConversations(), refresh()])
      setLastRequest(null)
    } catch (reason) {
      if (generation !== generationRef.current) return
      if (frame !== null) { window.cancelAnimationFrame(frame); frame = null }
      flush()
      if (reason instanceof DOMException && reason.name === 'AbortError') {
        setMessages((current) => current.map((item) => item.id === assistantId ? { ...item, content: item.content ? `${item.content}\n\n_Đã dừng phản hồi._` : 'Đã dừng phản hồi.' } : item))
        setLastRequest(null)
        void loadConversations(); void refresh()
      } else {
        if (!started && !existingConversationId) setConversationId(null)
        const message = reason instanceof Error ? reason.message : 'Đã có lỗi xảy ra. Vui lòng thử lại.'
        const requestError = reason instanceof ChatRequestError ? reason : null
        if (requestError && !requestError.retryable) setLastRequest(null)
        setMessages((current) => current.map((item) => item.id === assistantId ? {
          ...item,
          content: item.content ? `${item.content}\n\n${message}` : message,
          metadata: {
            ...item.metadata,
            error: true,
            error_code: requestError?.code,
            retryable: requestError?.retryable ?? true,
            retry_after: requestError?.retryAfter,
          },
        } : item))
      }
    } finally {
      if (generation === generationRef.current) {
        abortRef.current = null
        setStreaming(false)
      }
    }
  }

  const send = (content: string, images: ChatImageAttachment[] = []) => void runRequest(content, images, true)
  const retry = () => { if (lastRequest) void runRequest(lastRequest.content, lastRequest.images, false) }
  const activeConversation = conversations.find((conversation) => conversation.id === conversationId)

  return (
    <div className="chat-shell">
      <ChatSidebar open={sidebarOpen} conversations={conversations} activeId={conversationId} loading={conversationsLoading} error={conversationsError}
        onToggle={() => setSidebarOpen((value) => !value)} onNew={newChat} onSelect={(id) => void selectConversation(id)} onRename={openRename} onDelete={setDeleteTarget} onRetry={() => void loadConversations()} />
      <section className="chat-main">
        <header className="chat-workspace-header">
          <span><h1>{activeConversation?.title || 'Trợ lý học tập Planora'}</h1><small><Sparkles size={12} /> Calendar & Tasks Agent</small></span>
          <div className="chat-capabilities"><span><Image size={13} /> Đọc ảnh</span><span><ShieldCheck size={13} /> Kiểm tra xung đột</span>{streaming && <em><i /> Đang xử lý</em>}</div>
        </header>
        <div className="chat-scroll">
          {conversationLoading ? <div className="conversation-loading"><LoaderCircle className="spin" size={22} /><p>Đang mở cuộc trò chuyện…</p></div> : messages.length === 0 ? (
            <div className="empty-chat">
              <span className="hero-spark"><Sparkles size={25} /></span>
              <h1>Xin chào! Hôm nay bạn muốn<br />sắp xếp lịch học gì?</h1>
              <p>Mình có thể tìm giờ trống, lên kế hoạch ôn tập hoặc điều chỉnh lịch giúp bạn.</p>
              <div className="prompt-grid">
                {prompts.map(({ icon: Icon, text }) => <button key={text} disabled={streaming} onClick={() => send(text)}><Icon size={18} /><span>{text}</span></button>)}
              </div>
            </div>
          ) : <MessageList messages={messages} streaming={streaming} onViewCalendar={onViewCalendar} onRetry={retry} />}
          <div ref={endRef} />
        </div>
        {conversationsError && conversations.length === 0 && <div className="offline-hint"><AlertTriangle size={14} /> Lịch sử đang tạm thời không khả dụng; bạn vẫn có thể bắt đầu cuộc trò chuyện mới.</div>}
        <ChatInput disabled={conversationLoading || streaming} streaming={streaming} onStop={() => abortRef.current?.abort()} onSend={send} />
      </section>
      <Dialog open={Boolean(renameTarget)} title="Đổi tên cuộc trò chuyện" description="Đặt tên ngắn gọn để dễ tìm lại trong lịch sử." confirmLabel="Lưu" busy={dialogBusy} onClose={() => !dialogBusy && setRenameTarget(null)} onConfirm={saveRename}>
        <label className="field"><span>Tên cuộc trò chuyện</span><input autoFocus maxLength={100} value={renameTitle} onChange={(event) => setRenameTitle(event.target.value)} /></label>
      </Dialog>
      <Dialog open={Boolean(deleteTarget)} title="Xóa cuộc trò chuyện?" description={deleteTarget ? `Cuộc trò chuyện “${deleteTarget.title}” và toàn bộ tin nhắn sẽ bị xóa.` : undefined} confirmLabel="Xóa cuộc trò chuyện" destructive busy={dialogBusy} onClose={() => !dialogBusy && setDeleteTarget(null)} onConfirm={removeConversation} />
    </div>
  )
}
