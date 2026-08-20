import { CalendarClock, Clock3, Sparkles, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { CalendarEvent, EventDraft } from '../../types/calendar'

const defaultDraft = (): EventDraft => {
  const start = new Date(); start.setMinutes(0, 0, 0); start.setHours(start.getHours() + 1)
  const end = new Date(start); end.setHours(end.getHours() + 1)
  return { title: '', description: '', start_time: toLocalInput(start), end_time: toLocalInput(end), color: '#2563eb', category: 'Học tập', status: 'scheduled', is_ai_generated: false, recurrence_rule: null }
}

function toLocalInput(value: Date | string) {
  const date = typeof value === 'string' ? new Date(value) : value
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

export function EventModal({ event, initialRange, onClose, onSave, onDelete }: {
  event: CalendarEvent | null
  initialRange: { start: string; end: string } | null
  onClose: () => void
  onSave: (draft: EventDraft) => Promise<void>
  onDelete: (() => Promise<void>) | null
}) {
  const [draft, setDraft] = useState<EventDraft>(defaultDraft())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (event) setDraft({ title: event.title, description: event.description, start_time: toLocalInput(event.start_time), end_time: toLocalInput(event.end_time), color: event.color, category: event.category, status: event.status, is_ai_generated: event.is_ai_generated, recurrence_rule: event.recurrence_rule })
    else if (initialRange) setDraft({ ...defaultDraft(), start_time: toLocalInput(initialRange.start), end_time: toLocalInput(initialRange.end) })
    else setDraft(defaultDraft())
  }, [event, initialRange])

  const save = async () => {
    if (!draft.title.trim()) { setError('Vui lòng nhập tên sự kiện.'); return }
    if (new Date(draft.end_time) <= new Date(draft.start_time)) { setError('Thời gian kết thúc phải sau thời gian bắt đầu.'); return }
    setSaving(true); setError('')
    try { await onSave({ ...draft, start_time: new Date(draft.start_time).toISOString(), end_time: new Date(draft.end_time).toISOString() }) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể lưu sự kiện.') }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="event-modal">
        <header><div><span className="modal-icon"><CalendarClock size={20} /></span><div><h2>{event ? 'Chi tiết sự kiện' : 'Tạo sự kiện mới'}</h2><p>{event?.is_ai_generated ? 'Được trợ lý AI sắp xếp' : 'Thêm vào lịch học của bạn'}</p></div></div><button onClick={onClose}><X size={19} /></button></header>
        <div className="modal-body">
          <label className="field"><span>Tên sự kiện</span><input autoFocus value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Ví dụ: Ôn tập Giải tích" /></label>
          <div className="field-row">
            <label className="field"><span><Clock3 size={14} /> Bắt đầu</span><input type="datetime-local" value={draft.start_time} onChange={(e) => setDraft({ ...draft, start_time: e.target.value })} /></label>
            <label className="field"><span><Clock3 size={14} /> Kết thúc</span><input type="datetime-local" value={draft.end_time} onChange={(e) => setDraft({ ...draft, end_time: e.target.value })} /></label>
          </div>
          <div className="field-row compact">
            <label className="field"><span>Danh mục</span><input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} /></label>
            <label className="field color-field"><span>Màu sắc</span><input type="color" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} /></label>
          </div>
          <label className="field"><span>Ghi chú</span><textarea rows={3} value={draft.description || ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Mục tiêu, tài liệu cần chuẩn bị..." /></label>
          {event?.is_ai_generated && <div className="ai-created"><Sparkles size={15} /> Sự kiện này được tạo bởi AI Calendar Agent.</div>}
          {error && <p className="form-error">{error}</p>}
        </div>
        <footer>{onDelete ? <button className="delete-button" disabled={saving} onClick={() => void onDelete()}><Trash2 size={16} /> Xóa</button> : <span />}
          <div><button className="secondary-button" onClick={onClose}>Hủy</button><button className="primary-button" disabled={saving} onClick={() => void save()}>{saving ? 'Đang lưu...' : 'Lưu sự kiện'}</button></div></footer>
      </section>
    </div>
  )
}

