import { CalendarClock, CheckCircle2, Clock3, Repeat2, Sparkles, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { CalendarEvent, EventDraft } from '../../types/calendar'

const defaultDraft = (): EventDraft => {
  const start = new Date(); start.setMinutes(0, 0, 0); start.setHours(start.getHours() + 1)
  const end = new Date(start); end.setHours(end.getHours() + 1)
  return { title: '', description: '', start_time: toLocalInput(start), end_time: toLocalInput(end), color: '#2563eb', category: 'Học tập', status: 'scheduled', is_ai_generated: false, all_day: false, recurrence_rule: null, recurrence_end: null, deleted_at: null }
}

function toLocalInput(value: Date | string) {
  const date = typeof value === 'string' ? new Date(value) : value
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}
function toLocalDate(value: string, subtractDay = false) {
  const date = new Date(value); if (subtractDay) date.setDate(date.getDate() - 1)
  return toLocalInput(date).slice(0, 10)
}
function plusMonth(value: string) { const date = new Date(`${value.slice(0, 10)}T12:00:00`); date.setMonth(date.getMonth() + 1); return toLocalInput(date).slice(0, 10) }

export function EventModal({ event, initialRange, categories, onClose, onSave, onDelete }: {
  event: CalendarEvent | null
  initialRange: { start: string; end: string; allDay?: boolean } | null
  categories: string[]
  onClose: () => void
  onSave: (draft: EventDraft) => Promise<void>
  onDelete: (() => Promise<void>) | null
}) {
  const [draft, setDraft] = useState<EventDraft>(defaultDraft())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (event) setDraft({
      title: event.title, description: event.description,
      start_time: event.all_day ? toLocalDate(event.start_time) : toLocalInput(event.start_time),
      end_time: event.all_day ? toLocalDate(event.end_time, true) : toLocalInput(event.end_time),
      color: event.color, category: event.category, status: event.status,
      is_ai_generated: event.is_ai_generated, all_day: event.all_day,
      recurrence_rule: event.recurrence_rule, recurrence_end: event.recurrence_end, deleted_at: null,
    })
    else if (initialRange) {
      const base = defaultDraft()
      setDraft({ ...base, all_day: Boolean(initialRange.allDay), start_time: initialRange.allDay ? initialRange.start.slice(0, 10) : toLocalInput(initialRange.start), end_time: initialRange.allDay ? toLocalDate(initialRange.end, true) : toLocalInput(initialRange.end) })
    } else setDraft(defaultDraft())
  }, [event, initialRange])

  const toggleAllDay = (checked: boolean) => {
    if (checked) setDraft({ ...draft, all_day: true, start_time: draft.start_time.slice(0, 10), end_time: draft.end_time.slice(0, 10) })
    else setDraft({ ...draft, all_day: false, start_time: `${draft.start_time.slice(0, 10)}T08:00`, end_time: `${draft.end_time.slice(0, 10)}T09:00` })
  }
  const save = async () => {
    if (!draft.title.trim()) { setError('Vui lòng nhập tên sự kiện.'); return }
    if (new Date(draft.end_time) < new Date(draft.start_time)) { setError('Thời gian kết thúc không hợp lệ.'); return }
    if (draft.recurrence_rule && (!draft.recurrence_end || draft.recurrence_end < draft.start_time.slice(0, 10))) { setError('Vui lòng chọn ngày kết thúc lặp lại hợp lệ.'); return }
    setSaving(true); setError('')
    try {
      let startTime: string; let endTime: string
      if (draft.all_day) {
        const start = new Date(`${draft.start_time.slice(0, 10)}T00:00:00Z`)
        const end = new Date(`${draft.end_time.slice(0, 10)}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + 1)
        startTime = start.toISOString(); endTime = end.toISOString()
      } else { startTime = new Date(draft.start_time).toISOString(); endTime = new Date(draft.end_time).toISOString() }
      await onSave({ ...draft, start_time: startTime, end_time: endTime, recurrence_end: draft.recurrence_rule ? draft.recurrence_end : null })
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể lưu sự kiện.') }
    finally { setSaving(false) }
  }

  const inputType = draft.all_day ? 'date' : 'datetime-local'
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="event-modal">
        <header><div><span className="modal-icon"><CalendarClock size={20} /></span><div><h2>{event ? 'Chi tiết sự kiện' : 'Tạo sự kiện mới'}</h2><p>{event?.is_ai_generated ? 'Được trợ lý AI sắp xếp' : 'Thêm vào lịch học của bạn'}</p></div></div><button onClick={onClose}><X size={19} /></button></header>
        <div className="modal-body">
          <label className="field"><span>Tên sự kiện</span><input autoFocus value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Ví dụ: Ôn tập Giải tích" /></label>
          <label className="inline-check"><input type="checkbox" checked={draft.all_day} onChange={(e) => toggleAllDay(e.target.checked)} /> Sự kiện cả ngày</label>
          <div className="field-row">
            <label className="field"><span><Clock3 size={14} /> Bắt đầu</span><input type={inputType} value={draft.start_time} onChange={(e) => setDraft({ ...draft, start_time: e.target.value })} /></label>
            <label className="field"><span><Clock3 size={14} /> Kết thúc</span><input type={inputType} value={draft.end_time} onChange={(e) => setDraft({ ...draft, end_time: e.target.value })} /></label>
          </div>
          <div className="field-row compact">
            <label className="field"><span>Danh mục</span><input list="event-categories" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} /><datalist id="event-categories">{categories.map((category) => <option key={category} value={category} />)}</datalist></label>
            <label className="field color-field"><span>Màu sắc</span><input type="color" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} /></label>
          </div>
          <div className="field-row recurrence-row">
            <label className="field"><span><Repeat2 size={14} /> Lặp lại</span><select value={draft.recurrence_rule || ''} onChange={(e) => { const rule = (e.target.value || null) as EventDraft['recurrence_rule']; setDraft({ ...draft, recurrence_rule: rule, recurrence_end: rule ? (draft.recurrence_end || plusMonth(draft.start_time)) : null }) }}><option value="">Không lặp</option><option value="daily">Hằng ngày</option><option value="weekly">Hằng tuần</option><option value="monthly">Hằng tháng</option></select></label>
            {draft.recurrence_rule && <label className="field"><span>Lặp đến ngày</span><input type="date" min={draft.start_time.slice(0, 10)} value={draft.recurrence_end || ''} onChange={(e) => setDraft({ ...draft, recurrence_end: e.target.value })} /></label>}
          </div>
          <label className="field"><span>Ghi chú</span><textarea rows={3} value={draft.description || ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Mục tiêu, tài liệu cần chuẩn bị..." /></label>
          {event && <button className={`complete-toggle ${draft.status === 'completed' ? 'active' : ''}`} onClick={() => setDraft({ ...draft, status: draft.status === 'completed' ? 'scheduled' : 'completed' })}><CheckCircle2 size={16} /> {draft.status === 'completed' ? 'Đã hoàn thành' : 'Đánh dấu đã hoàn thành'}</button>}
          {event?.is_ai_generated && <div className="ai-created"><Sparkles size={15} /> Sự kiện này được tạo bởi AI Calendar Agent.</div>}
          {error && <p className="form-error">{error}</p>}
        </div>
        <footer>{onDelete ? <button className="delete-button" disabled={saving} onClick={() => void onDelete()}><Trash2 size={16} /> Đưa vào Thùng rác</button> : <span />}<div><button className="secondary-button" onClick={onClose}>Hủy</button><button className="primary-button" disabled={saving} onClick={() => void save()}>{saving ? 'Đang lưu...' : 'Lưu sự kiện'}</button></div></footer>
      </section>
    </div>
  )
}
