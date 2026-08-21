import { Bot, RotateCcw } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import type { ChatMessage } from '../../types/chat'
import { InlineEventPill } from './InlineEventPill'

export function MessageList({ messages, streaming, onViewCalendar, onRetry }: {
  messages: ChatMessage[]
  streaming: boolean
  onViewCalendar: () => void
  onRetry: () => void
}) {
  return (
    <div className="message-list">
      {messages.map((message, index) => (
        <article key={message.id} className={`message-row ${message.role}`}>
          {message.role === 'assistant' && <span className="assistant-avatar"><Bot size={16} /></span>}
          <div className={`message-content ${message.metadata?.error ? 'message-error' : ''}`}>
            {message.role === 'user' && message.metadata?.image_previews && <div className="sent-image-grid">{message.metadata.image_previews.map((preview, imageIndex) => <img key={`${message.id}-image-${imageIndex}`} src={preview} alt={`Ảnh đính kèm ${imageIndex + 1}`} />)}</div>}
            {message.role === 'assistant'
              ? <div className="markdown"><ReactMarkdown>{message.content || (streaming && index === messages.length - 1 ? 'Đang phản hồi…' : '')}</ReactMarkdown>{streaming && index === messages.length - 1 && <span className="typing-caret" />}</div>
              : <p>{message.content}</p>}
            {message.metadata?.error && index === messages.length - 1 && <button className="retry-message" onClick={onRetry}><RotateCcw size={14} /> Thử lại</button>}
            {message.metadata?.actions?.map((action, actionIndex) => (
              <InlineEventPill key={`${message.id}-${actionIndex}`} action={action} onViewCalendar={onViewCalendar} />
            ))}
          </div>
        </article>
      ))}
    </div>
  )
}
