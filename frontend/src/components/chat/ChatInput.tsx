import { ArrowUp, Paperclip } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

export function ChatInput({ initialValue = '', disabled, onSend }: {
  initialValue?: string
  disabled: boolean
  onSend: (value: string) => void
}) {
  const [value, setValue] = useState(initialValue)
  const textarea = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { setValue(initialValue); textarea.current?.focus() }, [initialValue])
  useEffect(() => {
    if (!textarea.current) return
    textarea.current.style.height = 'auto'
    textarea.current.style.height = `${Math.min(textarea.current.scrollHeight, 160)}px`
  }, [value])

  const submit = () => {
    const clean = value.trim()
    if (!clean || disabled) return
    onSend(clean)
    setValue('')
  }
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit() }
  }

  return (
    <div className="input-wrap">
      <div className="chat-input">
        <button className="attach-button" title="Đính kèm"><Paperclip size={19} /></button>
        <textarea ref={textarea} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={onKeyDown}
          placeholder="Nhắn cho trợ lý lịch học..." rows={1} disabled={disabled} />
        <button className="send-button" onClick={submit} disabled={!value.trim() || disabled} title="Gửi"><ArrowUp size={19} /></button>
      </div>
      <small>AI có thể mắc lỗi. Hãy kiểm tra lại thời gian quan trọng.</small>
    </div>
  )
}

