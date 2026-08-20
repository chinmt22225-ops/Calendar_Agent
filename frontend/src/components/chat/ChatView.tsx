import { CalendarClock, ClipboardList, Clock3, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { fetchConversation, fetchConversations, streamMessage } from '../../api/chat'
import { useCalendar } from '../../context/CalendarContext'
import type { CalendarAction, ChatMessage, Conversation } from '../../types/chat'
import { ChatInput } from './ChatInput'
import { ChatSidebar } from './ChatSidebar'
import { MessageList } from './MessageList'

const prompts = [
  { icon: CalendarClock, text: 'Lập lịch ôn thi cuối kỳ trong 2 tuần tới' },
  { icon: Clock3, text: 'Tìm 2 tiếng rảnh tối nay để học bài' },
  { icon: Sparkles, text: 'Dời lịch học chiều nay sang sáng mai' },
  { icon: ClipboardList, text: 'Dán thời khóa biểu vào đây để tự động điền vào lịch' },
]

export function ChatView({ onViewCalendar }: { onViewCalendar: () => void }) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const [suggestion, setSuggestion] = useState('')
  const { refresh } = useCalendar()
  const endRef = useRef<HTMLDivElement>(null)

  const loadConversations = async () => {
    try { setConversations(await fetchConversations()) } catch { setConversations([]) }
  }
  useEffect(() => { void loadConversations() }, [])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const newChat = () => { setConversationId(null); setMessages([]); setSuggestion('') }
  const selectConversation = async (id: string) => {
    setConversationId(id)
    try { setMessages(await fetchConversation(id)) } catch { setMessages([]) }
  }
  const send = async (content: string) => {
    if (streaming) return
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', content }
    const assistantId = crypto.randomUUID()
    setMessages((current) => [...current, userMessage, { id: assistantId, role: 'assistant', content: '' }])
    setStreaming(true)
    try {
      await streamMessage(content, conversationId, {
        onStart: setConversationId,
        onToken: (token) => setMessages((current) => current.map((item) => item.id === assistantId ? { ...item, content: item.content + token } : item)),
        onActions: (actions: CalendarAction[]) => setMessages((current) => current.map((item) => item.id === assistantId ? { ...item, metadata: { actions } } : item)),
      })
      await Promise.all([loadConversations(), refresh()])
    } catch (reason) {
      const content = reason instanceof Error ? reason.message : 'Đã có lỗi xảy ra. Vui lòng thử lại.'
      setMessages((current) => current.map((item) => item.id === assistantId ? { ...item, content } : item))
    } finally { setStreaming(false) }
  }

  return (
    <div className="chat-shell">
      <ChatSidebar open={sidebarOpen} conversations={conversations} activeId={conversationId}
        onToggle={() => setSidebarOpen((value) => !value)} onNew={newChat} onSelect={(id) => void selectConversation(id)} />
      <section className="chat-main">
        <div className="chat-scroll">
          {messages.length === 0 ? (
            <div className="empty-chat">
              <span className="hero-spark"><Sparkles size={25} /></span>
              <h1>Xin chào! Hôm nay bạn muốn<br />sắp xếp lịch học gì?</h1>
              <p>Mình có thể tìm giờ trống, lên kế hoạch ôn tập hoặc điều chỉnh lịch giúp bạn.</p>
              <div className="prompt-grid">
                {prompts.map(({ icon: Icon, text }) => <button key={text} onClick={() => setSuggestion(text)}><Icon size={18} /><span>{text}</span></button>)}
              </div>
            </div>
          ) : <MessageList messages={messages} streaming={streaming} onViewCalendar={onViewCalendar} />}
          <div ref={endRef} />
        </div>
        <ChatInput initialValue={suggestion} disabled={streaming} onSend={send} />
      </section>
    </div>
  )
}

