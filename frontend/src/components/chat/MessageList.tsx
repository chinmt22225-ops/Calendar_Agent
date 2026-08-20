import { Bot } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import type { ChatMessage } from '../../types/chat'
import { InlineEventPill } from './InlineEventPill'

export function MessageList({ messages, streaming, onViewCalendar }: {
  messages: ChatMessage[]
  streaming: boolean
  onViewCalendar: () => void
}) {
  return (
    <div className="message-list">
      {messages.map((message, index) => (
        <article key={message.id} className={`message-row ${message.role}`}>
          {message.role === 'assistant' && <span className="assistant-avatar"><Bot size={16} /></span>}
          <div className="message-content">
            {message.role === 'assistant'
              ? <div className="markdown"><ReactMarkdown>{message.content || (streaming && index === messages.length - 1 ? ' ' : '')}</ReactMarkdown>{streaming && index === messages.length - 1 && <span className="typing-caret" />}</div>
              : <p>{message.content}</p>}
            {message.metadata?.actions?.map((action, actionIndex) => (
              <InlineEventPill key={`${message.id}-${actionIndex}`} action={action} onViewCalendar={onViewCalendar} />
            ))}
          </div>
        </article>
      ))}
    </div>
  )
}

