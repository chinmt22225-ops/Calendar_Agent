import { CalendarClock, Clock3, Repeat2, Sparkles, Trash2, X } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { localInputValue, zonedInputToIso, zonedInputValue } from '../../lib/dates'
import { nextRecurrenceDate, validRecurrenceEnd } from '../../lib/recurrence'
import type { CalendarEvent, EventDraft } from '../../types/calendar'
import { Dialog } from '../common/Dialog'
import { useModalA11y } from '../common/useModalA11y'

const defaultDraft = (timeZone: string): EventDraft => {
  const start = new Date(); start.setMinutes(0, 0, 0); start.setHours(start.getHours() + 1)
  const end = new Date(start); end.setHours(end.getHours() + 1)
  return { title: '', description: '', start_time: zonedInputValue(start, timeZone), end_time: zonedInputValue(end, timeZone), color: '#3b55b2', category: 'Học tập', status: 'scheduled', is_ai_generated: false, all_day: false, all_day_start: null, all_day_end: null, recurrence_rule: null, recurrence_end: null, deleted_at: null }
}

function toLocalDate(value: string, subtractDay = false) {
  const key = value.slice(0, 10)
  if (!subtractDay) return key
  const date = new Date(`${key}T12:00:00Z`); date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}
export function EventModal({ event, initialRange, categories, timeZone, onClose, onSave, onDelete }: {
  event: CalendarEvent | null
  initialRange: { start: string; end: string; allDay?: boolean } | null
  categories: string[]
  timeZone: string
  onClose: () => void
  onSave: (draft: EventDraft) => Promise<void>
  onDelete: (() => Promise<void>) | null
}) {
  const [draft, setDraft] = useState<EventDraft>(() => defaultDraft(timeZone))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [recurrenceConfirm, setRecurrenceConfirm] = useState<EventDraft | null>(null)
  const titleId = useId()
  const descriptionId = useId()
  const modalActive = !deleteOpen && !recurrenceConfirm
  const modalRef = useModalA11y(modalActive, onClose, saving)
  useEffect(() => {
    if (event) setDraft({
      title: event.title, description: event.description,
      start_time: event.all_day ? (event.all_day_start || toLocalDate(event.start_time)) : zonedInputValue(event.start_time, timeZone),
      end_time: event.all_day ? (event.all_day_end ? toLocalDate(event.all_day_end, true) : toLocalDate(event.end_time, true)) : zonedInputValue(event.end_time, timeZone),
      color: event.color, category: event.category, status: event.status,
      is_ai_generated: event.is_ai_generated, all_day: event.all_day,
      all_day_start: event.all_day_start, all_day_end: event.all_day_end,
      recurrence_rule: event.recurrence_rule, recurrence_end: event.recurrence_end, deleted_at: null,
    })
    else if (initialRange) {
      const base = defaultDraft(timeZone)
      setDraft({ ...base, all_day: Boolean(initialRange.allDay), start_time: initialRange.allDay ? initialRange.start.slice(0, 10) : localInputValue(initialRange.start), end_time: initialRange.allDay ? toLocalDate(initialRange.end, true) : localInputValue(initialRange.end) })
    } else setDraft(defaultDraft(timeZone))
  }, [event, initialRange, timeZone])

  const toggleAllDay = (checked: boolean) => {
    if (checked) setDraft({ ...draft, all_day: true, all_day_start: draft.start_time.slice(0, 10), all_day_end: null, start_time: draft.start_time.slice(0, 10), end_time: draft.end_time.slice(0, 10) })
    else setDraft({ ...draft, all_day: false, all_day_start: null, all_day_end: null, start_time: `${draft.start_time.slice(0, 10)}T08:00`, end_time: `${draft.end_time.slice(0, 10)}T09:00` })
  }
  const changeStart = (value: string) => {
    let endTime = draft.end_time
    try {
      if (draft.all_day) {
        const oldStart = Temporal.PlainDate.from(draft.start_time)
        const oldEnd = Temporal.PlainDate.from(draft.end_time)
        const daySpan = Math.max(0, oldStart.until(oldEnd).days)
        endTime = Temporal.PlainDate.from(value).add({ days: daySpan }).toString()
      } else {
        const oldStart = Temporal.PlainDateTime.from(draft.start_time)
        const oldEnd = Temporal.PlainDateTime.from(draft.end_time)
        const duration = oldStart.until(oldEnd)
        endTime = Temporal.PlainDateTime.compare(oldEnd, oldStart) > 0
          ? Temporal.PlainDateTime.from(value).add(duration).toString({ smallestUnit: 'minute' })
          : Temporal.PlainDateTime.from(value).add({ hours: 1 }).toString({ smallestUnit: 'minute' })
      }
    } catch { /* Native inputs keep these values valid; retain the current end as a safe fallback. */ }
    const recurrenceEnd = draft.recurrence_rule
      ? validRecurrenceEnd(value, draft.recurrence_rule, draft.recurrence_end)
      : null
    setDraft({ ...draft, start_time: value, end_time: endTime, recurrence_end: recurrenceEnd })
  }
  const persist = async (payload: EventDraft) => {
    setSaving(true); setError('')
    try { await onSave(payload) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể lưu sự kiện.') }
    finally { setSaving(false); setRecurrenceConfirm(null) }
  }
  const save = async () => {
    if (!draft.title.trim()) { setError('Vui lòng nhập tên sự kiện.'); return }
    if (!draft.all_day && draft.end_time <= draft.start_time) { setError('Thời gian kết thúc phải sau thời gian bắt đầu.'); return }
    if (draft.all_day && draft.end_time < draft.start_time) { setError('Ngày kết thúc không thể trước ngày bắt đầu.'); return }
    if (draft.recurrence_rule && (!draft.recurrence_end || draft.recurrence_end < nextRecurrenceDate(draft.start_time, draft.recurrence_rule))) { setError('Ngày kết thúc phải bao gồm ít nhất một lần lặp lại.'); return }
    let startTime: string; let endTime: string
    if (draft.all_day) {
      const start = new Date(`${draft.start_time.slice(0, 10)}T00:00:00Z`)
      const end = new Date(`${draft.end_time.slice(0, 10)}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + 1)
      startTime = start.toISOString(); endTime = end.toISOString()
    } else { startTime = zonedInputToIso(draft.start_time, timeZone); endTime = zonedInputToIso(draft.end_time, timeZone) }
    const payload = { ...draft, title: draft.title.trim(), category: draft.category.trim(), start_time: startTime, end_time: endTime, all_day_start: draft.all_day ? draft.start_time.slice(0, 10) : null, all_day_end: draft.all_day ? endTime.slice(0, 10) : null, recurrence_end: draft.recurrence_rule ? draft.recurrence_end : null }
    if (event?.recurrence_rule) { setRecurrenceConfirm(payload); return }
    await persist(payload)
  }

  const inputType = draft.all_day ? 'date' : 'datetime-local'
  const modalDescription = event?.is_ai_generated ? 'Do Planora sắp xếp · Bạn vẫn có thể chỉnh sửa' : 'Thêm vào lịch học của bạn'
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && modalActive && !saving && onClose()}>
      <section ref={modalRef} className="event-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1}>
        <header><div><span className="modal-icon"><CalendarClock size={20} /></span><div><h2 id={titleId}>{event ? 'Chỉnh sửa sự kiện' : 'Tạo sự kiện mới'}</h2><p id={descriptionId}>{modalDescription}</p></div></div><button aria-label="Đóng" title="Đóng" disabled={saving} onClick={onClose}><X size={19} /></button></header>
        <div className="modal-body">
          {event?.is_ai_generated && <div className="ai-created"><Sparkles size={15} /><span><strong>Do Planora sắp xếp</strong> Sự kiện này được tạo từ yêu cầu trong Trợ lý AI.</span></div>}
          <label className="field"><span>Tên sự kiện</span><input autoFocus maxLength={180} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Ví dụ: Ôn tập Giải tích" /></label>
          <label className="inline-check"><input type="checkbox" checked={draft.all_day} onChange={(e) => toggleAllDay(e.target.checked)} /> Sự kiện cả ngày</label>
          <div className="field-row">
            <label className="field"><span><Clock3 size={14} /> {draft.all_day ? 'Từ ngày' : 'Bắt đầu'}</span><input type={inputType} value={draft.start_time} onChange={(e) => changeStart(e.target.value)} /></label>
            <label className="field"><span><Clock3 size={14} /> {draft.all_day ? 'Đến hết ngày' : 'Kết thúc'}</span><input type={inputType} min={draft.start_time} value={draft.end_time} onChange={(e) => setDraft({ ...draft, end_time: e.target.value })} /></label>
          </div>
          <div className="field-row compact">
            <label className="field"><span>Danh mục</span><input list="event-categories" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} /><datalist id="event-categories">{categories.map((category) => <option key={category} value={category} />)}</datalist></label>
            <label className="field color-field"><span>Màu sắc</span><input type="color" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} /></label>
          </div>
          <div className="field-row recurrence-row">
            <label className="field"><span><Repeat2 size={14} /> Lặp lại</span><select value={draft.recurrence_rule || ''} onChange={(e) => { const rule = (e.target.value || null) as EventDraft['recurrence_rule']; setDraft({ ...draft, recurrence_rule: rule, recurrence_end: rule ? validRecurrenceEnd(draft.start_time, rule, draft.recurrence_end) : null }) }}><option value="">Không lặp</option><option value="daily">Hằng ngày</option><option value="weekly">Hằng tuần</option><option value="monthly">Hằng tháng</option></select></label>
            {draft.recurrence_rule && <label className="field"><span>Lặp đến ngày</span><input type="date" min={nextRecurrenceDate(draft.start_time, draft.recurrence_rule)} value={draft.recurrence_end || ''} onChange={(e) => setDraft({ ...draft, recurrence_end: e.target.value })} /></label>}
          </div>
          {draft.recurrence_rule && draft.recurrence_end && <p className="recurrence-summary"><Repeat2 size={13} /> Lặp lại {draft.recurrence_rule === 'daily' ? 'hằng ngày' : draft.recurrence_rule === 'weekly' ? 'hằng tuần' : 'hằng tháng'} đến hết ngày {new Date(`${draft.recurrence_end}T12:00:00`).toLocaleDateString('vi-VN')}. Lần tiếp theo: {new Date(`${nextRecurrenceDate(draft.start_time, draft.recurrence_rule)}T12:00:00`).toLocaleDateString('vi-VN')}.</p>}
          <label className="field"><span>Ghi chú</span><textarea rows={3} value={draft.description || ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Mục tiêu, tài liệu cần chuẩn bị..." /></label>
          {event && <label className="field"><span>Trạng thái</span><select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as EventDraft['status'] })}><option value="scheduled">Đã lên lịch</option><option value="completed">Đã hoàn thành</option><option value="cancelled">Đã hủy</option></select></label>}
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
        <footer>{onDelete ? <button className="delete-button" disabled={saving} onClick={() => setDeleteOpen(true)}><Trash2 size={16} /> Chuyển vào Thùng rác</button> : <span />}<div><button className="secondary-button" disabled={saving} onClick={onClose}>Hủy</button><button className="primary-button" disabled={saving} onClick={() => void save()}>{saving ? 'Đang lưu…' : event ? 'Lưu thay đổi' : 'Tạo sự kiện'}</button></div></footer>
      </section>
      <Dialog open={deleteOpen} title={event?.recurrence_rule ? 'Chuyển toàn bộ chuỗi vào Thùng rác?' : 'Chuyển sự kiện vào Thùng rác?'} description={event ? event.recurrence_rule ? `Mọi lần lặp của “${event.title}” sẽ được chuyển vào Thùng rác và có thể khôi phục sau.` : `Sự kiện “${event.title}” sẽ được chuyển vào Thùng rác và có thể khôi phục sau.` : undefined} destructive confirmLabel="Chuyển vào Thùng rác" busy={saving} onClose={() => setDeleteOpen(false)} onConfirm={async () => { if (!onDelete) return; setSaving(true); try { await onDelete(); setDeleteOpen(false) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể chuyển sự kiện vào Thùng rác.'); setDeleteOpen(false) } finally { setSaving(false) } }} />
      <Dialog open={Boolean(recurrenceConfirm)} title="Chỉnh sửa sự kiện lặp lại" description="Planora hiện áp dụng thay đổi cho toàn bộ chuỗi. Chỉnh sửa riêng một lần lặp chưa được hỗ trợ." confirmLabel="Chỉnh sửa toàn bộ chuỗi" busy={saving} onClose={() => setRecurrenceConfirm(null)} onConfirm={() => recurrenceConfirm ? persist(recurrenceConfirm) : undefined} />
    </div>
  )
}
