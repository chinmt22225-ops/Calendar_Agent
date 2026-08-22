import { Bot, Clock3, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { ChatMessage } from '../../types/chat'
import { InlineEventPill } from './InlineEventPill'

function RetryAction({ retryAfter, onRetry }: { retryAfter?: number; onRetry: () => void }) {
  const [seconds, setSeconds] = useState<number>(retryAfter || 0)

  useEffect(() => {
    if (!retryAfter || retryAfter <= 0) return
    setSeconds(retryAfter)
    const interval = setInterval(() => {
      setSeconds((current) => {
        if (current <= 1) {
          clearInterval(interval)
          return 0
        }
        return current - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [retryAfter])

  if (seconds > 0) {
    return (
      <span className="retry-countdown">
        <Clock3 size={13} /> Thử lại sau {seconds}s
      </span>
    )
  }

  return (
    <button className="retry-message" onClick={onRetry}>
      <RotateCcw size={14} /> Thử lại
    </button>
  )
}

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
            {message.metadata?.error && message.metadata.retryable !== false && index === messages.length - 1 && (
              <RetryAction retryAfter={message.metadata.retry_after} onRetry={onRetry} />
            )}
            {message.metadata?.actions?.map((action, actionIndex) => (
              <InlineEventPill key={`${message.id}-${actionIndex}`} action={action} onViewCalendar={onViewCalendar} />
            ))}
          </div>
        </article>
      ))}
    </div>
  )
}
