import {
  Bell,
  Calendar,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Copy,
  LoaderCircle,
  Pencil,
  Pipette,
  Repeat2,
  Share2,
  Sparkles,
  Tag,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { localInputValue, zonedInputToIso, zonedInputValue } from '../../lib/dates'
import { nextRecurrenceDate, validRecurrenceEnd } from '../../lib/recurrence'
import type { CalendarEvent, EventDraft } from '../../types/calendar'
import { useToast } from '../../context/ToastContext'
import { Dialog } from '../common/Dialog'
import { useModalA11y } from '../common/useModalA11y'

const EVENT_COLOR_PRESETS = [
  { name: 'Hồng đỏ', value: '#d93662' },
  { name: 'Tím Indigo', value: '#5656d8' },
  { name: 'Xanh mòng két', value: '#0f8f83' },
  { name: 'Cam san hô', value: '#df5a27' },
  { name: 'Tím hoa cà', value: '#7c3aed' },
  { name: 'Xanh lá', value: '#07845d' },
]

const defaultDraft = (timeZone: string): EventDraft => {
  const start = new Date()
  start.setMinutes(0, 0, 0)
  start.setHours(start.getHours() + 1)
  const end = new Date(start)
  end.setHours(end.getHours() + 1)
  return {
    title: '',
    description: '',
    start_time: zonedInputValue(start, timeZone),
    end_time: zonedInputValue(end, timeZone),
    color: '#d93662',
    category: 'Học tập',
    status: 'scheduled',
    is_ai_generated: false,
    all_day: false,
    all_day_start: null,
    all_day_end: null,
    recurrence_rule: null,
    recurrence_end: null,
    deleted_at: null,
  }
}

function toLocalDate(value: string, subtractDay = false) {
  const key = value.slice(0, 10)
  if (!subtractDay) return key
  const date = new Date(`${key}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

function formatVietnameseDate(isoString: string, timeZone?: string) {
  const date = new Date(isoString)
  return date.toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone,
  })
}

function formatVietnameseTime(isoString: string, timeZone?: string) {
  const date = new Date(isoString)
  return date.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  })
}

function StudentStudyBanner() {
  return (
    <div className="event-study-banner" aria-hidden="true">
      <svg viewBox="0 0 460 140" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
        <rect width="460" height="140" fill="#9ec5e8" />
        {/* Lined notebook */}
        <g opacity="0.88">
          <rect x="-20" y="20" width="160" height="140" rx="10" transform="rotate(-18 -20 20)" fill="#ffffff" stroke="#e0e8f0" strokeWidth="2" />
          <line x1="-10" y1="40" x2="110" y2="0" stroke="#bfdbfe" strokeWidth="1.5" />
          <line x1="-5" y1="55" x2="115" y2="15" stroke="#bfdbfe" strokeWidth="1.5" />
          <line x1="0" y1="70" x2="120" y2="30" stroke="#bfdbfe" strokeWidth="1.5" />
          <line x1="5" y1="85" x2="125" y2="45" stroke="#bfdbfe" strokeWidth="1.5" />
          <line x1="10" y1="100" x2="130" y2="60" stroke="#bfdbfe" strokeWidth="1.5" />
          <line x1="15" y1="115" x2="135" y2="75" stroke="#bfdbfe" strokeWidth="1.5" />
        </g>
        {/* Sticky note with star */}
        <g transform="translate(25, 42) rotate(-6)">
          <rect width="46" height="46" rx="4" fill="#fef08a" />
          <path d="M23 15L25.5 20L31 20.8L27 24.7L28 30.2L23 27.5L18 30.2L19 24.7L15 20.8L20.5 20L23 15Z" fill="#eab308" />
        </g>
        {/* Pink sticky note */}
        <g transform="translate(18, 90) rotate(4)">
          <rect width="40" height="40" rx="4" fill="#fbcfe8" />
          <line x1="8" y1="12" x2="32" y2="12" stroke="#f472b6" strokeWidth="2" strokeLinecap="round" />
          <line x1="8" y1="20" x2="26" y2="20" stroke="#f472b6" strokeWidth="2" strokeLinecap="round" />
        </g>
        {/* Red / orange pen */}
        <g transform="translate(75, 38) rotate(-12)">
          <rect x="0" y="0" width="12" height="92" rx="3" fill="#ea580c" />
          <rect x="2" y="-6" width="8" height="8" rx="2" fill="#475569" />
          <path d="M0 92L6 104L12 92Z" fill="#fed7aa" />
          <path d="M4 100L6 104L8 100Z" fill="#1e293b" />
          <rect x="3" y="10" width="6" height="4" rx="1" fill="#fed7aa" />
        </g>
        {/* Yellow pencil */}
        <g transform="translate(100, 50) rotate(-24)">
          <rect x="0" y="0" width="10" height="85" rx="2" fill="#facc15" />
          <rect x="0" y="-8" width="10" height="10" rx="2" fill="#fb7185" />
          <path d="M0 85L5 98L10 85Z" fill="#fed7aa" />
          <path d="M3 93L5 98L7 93Z" fill="#1e293b" />
        </g>
        {/* Blue Textbook */}
        <g transform="translate(130, 18) rotate(-8)">
          <rect width="118" height="145" rx="8" fill="#3b82f6" stroke="#2563eb" strokeWidth="2" />
          <rect x="0" y="0" width="18" height="145" rx="4" fill="#1d4ed8" />
          <rect x="30" y="28" width="64" height="22" rx="5" fill="#dbeafe" />
          <line x1="40" y1="35" x2="82" y2="35" stroke="#93c5fd" strokeWidth="2" strokeLinecap="round" />
          <line x1="40" y1="42" x2="74" y2="42" stroke="#93c5fd" strokeWidth="2" strokeLinecap="round" />
        </g>
        {/* Highlighters */}
        <g transform="translate(230, 8) rotate(28)">
          <rect width="18" height="54" rx="4" fill="#4ade80" />
          <rect x="3" y="-10" width="12" height="12" rx="2" fill="#15803d" />
        </g>
        <g transform="translate(245, 58) rotate(16)">
          <rect width="16" height="48" rx="4" fill="#ec4899" />
          <rect x="2" y="-8" width="12" height="10" rx="2" fill="#9d174d" />
        </g>
      </svg>
    </div>
  )
}

export function EventModal({
  event,
  initialRange,
  categories,
  timeZone,
  ownerName = 'Lịch học',
  onClose,
  onSave,
  onDelete,
}: {
  event: CalendarEvent | null
  initialRange: { start: string; end: string; allDay?: boolean } | null
  categories: string[]
  timeZone: string
  ownerName?: string
  onClose: () => void
  onSave: (draft: EventDraft) => Promise<void>
  onDelete: (() => Promise<void>) | null
}) {
  const notify = useToast()

  const [mode, setMode] = useState<'view' | 'edit'>(() => (event ? 'view' : 'edit'))
  const [draft, setDraft] = useState<EventDraft>(() => defaultDraft(timeZone))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [recurrenceConfirm, setRecurrenceConfirm] = useState<EventDraft | null>(null)
  const titleId = useId()
  const descriptionId = useId()
  const modalActive = !deleteOpen && !recurrenceConfirm
  const modalRef = useModalA11y(modalActive, onClose, saving)

  const displayName = ownerName || 'Lịch học'

  useEffect(() => {
    if (event) {
      setDraft({
        title: event.title,
        description: event.description,
        start_time: event.all_day
          ? event.all_day_start || toLocalDate(event.start_time)
          : zonedInputValue(event.start_time, timeZone),
        end_time: event.all_day
          ? event.all_day_end
            ? toLocalDate(event.all_day_end, true)
            : toLocalDate(event.end_time, true)
          : zonedInputValue(event.end_time, timeZone),
        color: event.color || '#d93662',
        category: event.category,
        status: event.status,
        is_ai_generated: event.is_ai_generated,
        all_day: event.all_day,
        all_day_start: event.all_day_start,
        all_day_end: event.all_day_end,
        recurrence_rule: event.recurrence_rule,
        recurrence_end: event.recurrence_end,
        deleted_at: null,
      })
      setMode('view')
    } else if (initialRange) {
      const base = defaultDraft(timeZone)
      setDraft({
        ...base,
        all_day: Boolean(initialRange.allDay),
        start_time: initialRange.allDay
          ? initialRange.start.slice(0, 10)
          : localInputValue(initialRange.start),
        end_time: initialRange.allDay
          ? toLocalDate(initialRange.end, true)
          : localInputValue(initialRange.end),
      })
      setMode('edit')
    } else {
      setDraft(defaultDraft(timeZone))
      setMode('edit')
    }
  }, [event, initialRange, timeZone])

  const toggleAllDay = (checked: boolean) => {
    if (checked) {
      setDraft({
        ...draft,
        all_day: true,
        all_day_start: draft.start_time.slice(0, 10),
        all_day_end: null,
        start_time: draft.start_time.slice(0, 10),
        end_time: draft.end_time.slice(0, 10),
      })
    } else {
      setDraft({
        ...draft,
        all_day: false,
        all_day_start: null,
        all_day_end: null,
        start_time: `${draft.start_time.slice(0, 10)}T08:00`,
        end_time: `${draft.end_time.slice(0, 10)}T09:00`,
      })
    }
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
        endTime =
          Temporal.PlainDateTime.compare(oldEnd, oldStart) > 0
            ? Temporal.PlainDateTime.from(value).add(duration).toString({ smallestUnit: 'minute' })
            : Temporal.PlainDateTime.from(value).add({ hours: 1 }).toString({ smallestUnit: 'minute' })
      }
    } catch {
      /* Native inputs keep values valid */
    }
    const recurrenceEnd = draft.recurrence_rule
      ? validRecurrenceEnd(value, draft.recurrence_rule, draft.recurrence_end)
      : null
    setDraft({ ...draft, start_time: value, end_time: endTime, recurrence_end: recurrenceEnd })
  }

  const persist = async (payload: EventDraft) => {
    setSaving(true)
    setError('')
    try {
      await onSave(payload)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể lưu sự kiện.')
    } finally {
      setSaving(false)
      setRecurrenceConfirm(null)
    }
  }

  const save = async () => {
    if (!draft.title.trim()) {
      setError('Vui lòng nhập tên sự kiện.')
      return
    }
    if (!draft.all_day && draft.end_time <= draft.start_time) {
      setError('Thời gian kết thúc phải sau thời gian bắt đầu.')
      return
    }
    if (draft.all_day && draft.end_time < draft.start_time) {
      setError('Ngày kết thúc không thể trước ngày bắt đầu.')
      return
    }
    if (
      draft.recurrence_rule &&
      (!draft.recurrence_end ||
        draft.recurrence_end < nextRecurrenceDate(draft.start_time, draft.recurrence_rule))
    ) {
      setError('Ngày kết thúc phải bao gồm ít nhất một lần lặp lại.')
      return
    }
    let startTime: string
    let endTime: string
    if (draft.all_day) {
      const start = new Date(`${draft.start_time.slice(0, 10)}T00:00:00Z`)
      const end = new Date(`${draft.end_time.slice(0, 10)}T00:00:00Z`)
      end.setUTCDate(end.getUTCDate() + 1)
      startTime = start.toISOString()
      endTime = end.toISOString()
    } else {
      startTime = zonedInputToIso(draft.start_time, timeZone)
      endTime = zonedInputToIso(draft.end_time, timeZone)
    }
    const payload: EventDraft = {
      ...draft,
      title: draft.title.trim(),
      category: draft.category.trim(),
      start_time: startTime,
      end_time: endTime,
      all_day_start: draft.all_day ? draft.start_time.slice(0, 10) : null,
      all_day_end: draft.all_day ? endTime.slice(0, 10) : null,
      recurrence_end: draft.recurrence_rule ? draft.recurrence_end : null,
    }
    if (event?.recurrence_rule) {
      setRecurrenceConfirm(payload)
      return
    }
    await persist(payload)
  }

  const copyEventDetails = async () => {
    if (!event) return
    const timeText = event.all_day
      ? 'Cả ngày'
      : `${formatVietnameseTime(event.start_time, timeZone)} – ${formatVietnameseTime(event.end_time, timeZone)}`
    const dateText = formatVietnameseDate(event.start_time, timeZone)
    const text = `📅 ${event.title}\n⏰ ${dateText} · ${timeText}\n🏷️ Danh mục: ${event.category}${event.description ? `\n📝 Ghi chú: ${event.description}` : ''}`
    try {
      await navigator.clipboard.writeText(text)
      notify('Đã sao chép thông tin lịch học vào bộ nhớ tạm.', 'success')
    } catch {
      notify('Không thể sao chép thông tin.')
    }
  }

  const inputType = draft.all_day ? 'date' : 'datetime-local'

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && modalActive && !saving && onClose()}
    >
      {/* MODE 1: QUICK VIEW POPOVER (GOOGLE CALENDAR STYLE) */}
      {mode === 'view' && event && (
        <section
          ref={modalRef}
          className="event-quick-view-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          tabIndex={-1}
        >
          <div className="event-banner-wrap">
            <StudentStudyBanner />
            <div className="event-banner-actions">
              <button
                type="button"
                className="banner-action-btn"
                onClick={() => setMode('edit')}
                title="Chỉnh sửa sự kiện"
                aria-label="Chỉnh sửa sự kiện"
              >
                <Pencil size={17} />
              </button>
              {onDelete && (
                <button
                  type="button"
                  className="banner-action-btn danger"
                  onClick={() => setDeleteOpen(true)}
                  title="Xóa sự kiện"
                  aria-label="Xóa sự kiện"
                >
                  <Trash2 size={17} />
                </button>
              )}
              <button
                type="button"
                className="banner-action-btn"
                onClick={() => void copyEventDetails()}
                title="Sao chép thông tin"
                aria-label="Sao chép thông tin"
              >
                <Share2 size={17} />
              </button>
              <button
                type="button"
                className="banner-action-btn close"
                onClick={onClose}
                title="Đóng"
                aria-label="Đóng"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="event-view-content">
            <div className="event-view-header">
              <span
                className="event-color-dot"
                style={{ backgroundColor: event.color || '#d93662' }}
              />
              <div className="event-view-title-wrap">
                <h2 id={titleId} className="event-view-title">
                  {event.title}
                </h2>
                <div className="event-view-time">
                  <span>{formatVietnameseDate(event.start_time, timeZone)}</span>
                  <span>·</span>
                  <span>
                    {event.all_day
                      ? 'Cả ngày'
                      : `${formatVietnameseTime(event.start_time, timeZone)} – ${formatVietnameseTime(event.end_time, timeZone)}`}
                  </span>
                </div>
                {event.recurrence_rule && (
                  <p className="event-view-recurrence">
                    <Repeat2 size={13} />
                    Lặp lại {event.recurrence_rule === 'daily' ? 'hằng ngày' : event.recurrence_rule === 'weekly' ? 'hằng tuần' : 'hằng tháng'}
                    {event.recurrence_end && ` cho tới ${new Date(`${event.recurrence_end}T12:00:00`).toLocaleDateString('vi-VN')}`}
                  </p>
                )}
              </div>
            </div>

            <div className="event-view-details">
              <div className="event-view-row">
                <Bell size={16} />
                <span>30 phút trước</span>
              </div>
              <div className="event-view-row">
                <CalendarDays size={16} />
                <span>
                  <strong>{displayName}</strong> · {event.category}
                </span>
              </div>
              {event.is_ai_generated && (
                <div className="event-view-row ai-row">
                  <Sparkles size={16} />
                  <span>
                    <strong>Do Planora xếp</strong> · Tạo từ Trợ lý AI
                  </span>
                </div>
              )}
              {event.description && (
                <div className="event-view-description">
                  <p id={descriptionId}>{event.description}</p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* MODE 2: FULL RICH EDITOR MODAL (GOOGLE CALENDAR STYLE) */}
      {(mode === 'edit' || !event) && (
        <section
          ref={modalRef}
          className="event-modal event-rich-editor"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          tabIndex={-1}
        >
          <header className="rich-editor-header">
            <button
              type="button"
              className="editor-close-btn"
              disabled={saving}
              onClick={event ? () => setMode('view') : onClose}
              title={event ? 'Quay lại' : 'Đóng'}
              aria-label={event ? 'Quay lại' : 'Đóng'}
            >
              <X size={19} />
            </button>
            <input
              id={titleId}
              autoFocus
              maxLength={180}
              className="rich-title-input"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="Thêm tiêu đề môn học, sự kiện..."
            />
            <button
              className="primary-button save-top-btn"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? (
                <>
                  <LoaderCircle className="spin" size={14} /> Đang lưu…
                </>
              ) : (
                'Lưu'
              )}
            </button>
          </header>

          <div className="modal-body rich-editor-body">
            {draft.is_ai_generated && (
              <div className="ai-created">
                <Sparkles size={15} />
                <span>
                  <strong>Do Planora sắp xếp</strong> Sự kiện này được tạo từ yêu cầu trong Trợ lý AI.
                </span>
              </div>
            )}

            {/* Time bar */}
            <div className="editor-time-bar">
              <div className="time-chips-group">
                <input
                  type={inputType}
                  aria-label="Bắt đầu"
                  value={draft.start_time}
                  onChange={(e) => changeStart(e.target.value)}
                  className="time-chip-input"
                />
                <span className="time-separator">tới</span>
                <input
                  type={inputType}
                  aria-label="Kết thúc"
                  min={draft.start_time}
                  value={draft.end_time}
                  onChange={(e) => setDraft({ ...draft, end_time: e.target.value })}
                  className="time-chip-input"
                />
              </div>
              <span className="timezone-badge">{timeZone}</span>
            </div>

            <div className="editor-flags-row">
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={draft.all_day}
                  onChange={(e) => toggleAllDay(e.target.checked)}
                />
                <span>Cả ngày</span>
              </label>

              <div className="recurrence-picker">
                <Repeat2 size={14} />
                <select
                  aria-label="Lặp lại"
                  value={draft.recurrence_rule || ''}
                  onChange={(e) => {
                    const rule = (e.target.value || null) as EventDraft['recurrence_rule']
                    setDraft({
                      ...draft,
                      recurrence_rule: rule,
                      recurrence_end: rule
                        ? validRecurrenceEnd(draft.start_time, rule, draft.recurrence_end)
                        : null,
                    })
                  }}
                >
                  <option value="">Không lặp</option>
                  <option value="daily">Hằng ngày</option>
                  <option value="weekly">Hằng tuần</option>
                  <option value="monthly">Hằng tháng</option>
                </select>
                {draft.recurrence_rule && (
                  <input
                    type="date"
                    aria-label="Lặp đến ngày"
                    min={nextRecurrenceDate(draft.start_time, draft.recurrence_rule)}
                    value={draft.recurrence_end || ''}
                    onChange={(e) => setDraft({ ...draft, recurrence_end: e.target.value })}
                    title="Lặp đến ngày"
                  />
                )}
              </div>
            </div>

            {/* Color & Category */}
            <div className="field-row">
              <div className="field">
                <span>Màu sắc</span>
                <div className="color-preset-group">
                  {EVENT_COLOR_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      className={`color-preset-btn ${draft.color.toLowerCase() === preset.value.toLowerCase() ? 'active' : ''}`}
                      style={{ backgroundColor: preset.value }}
                      onClick={() => setDraft({ ...draft, color: preset.value })}
                      title={preset.name}
                      aria-label={preset.name}
                    >
                      {draft.color.toLowerCase() === preset.value.toLowerCase() && <Check size={14} />}
                    </button>
                  ))}
                  <label
                    className="custom-color-picker-wrap"
                    title="Chọn màu tùy chỉnh"
                    aria-label="Chọn màu tùy chỉnh"
                  >
                    <Pipette size={14} />
                    <input
                      type="color"
                      value={draft.color}
                      onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                    />
                  </label>
                </div>
              </div>

              <label className="field">
                <span>Danh mục</span>
                <input
                  list="event-categories"
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                  placeholder="Học tập, Thi cử, Deadline..."
                />
                <datalist id="event-categories">
                  {categories.map((category) => (
                    <option key={category} value={category} />
                  ))}
                </datalist>
              </label>
            </div>

            {/* Reminder & Status */}
            <div className="field-row">
              <label className="field">
                <span><Bell size={13} /> Thông báo</span>
                <select defaultValue="30">
                  <option value="15">15 phút trước</option>
                  <option value="30">30 phút trước</option>
                  <option value="60">1 giờ trước</option>
                  <option value="1440">1 ngày trước</option>
                </select>
              </label>

              {event && (
                <label className="field">
                  <span>Trạng thái</span>
                  <select
                    value={draft.status}
                    onChange={(e) =>
                      setDraft({ ...draft, status: e.target.value as EventDraft['status'] })
                    }
                  >
                    <option value="scheduled">Đã lên lịch</option>
                    <option value="completed">Đã hoàn thành</option>
                    <option value="cancelled">Đã hủy</option>
                  </select>
                </label>
              )}
            </div>

            {/* Description */}
            <label className="field">
              <span>Ghi chú & Tài liệu môn học</span>
              <textarea
                rows={4}
                value={draft.description || ''}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="Thêm phòng học, link Meet/Zoom, tài liệu ôn thi, mục tiêu buổi học..."
              />
            </label>

            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </div>

          <footer>
            {onDelete ? (
              <button
                className="delete-button"
                disabled={saving}
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 size={16} /> Chuyển vào Thùng rác
              </button>
            ) : (
              <span />
            )}
            <div>
              <button
                className="secondary-button"
                disabled={saving}
                onClick={event ? () => setMode('view') : onClose}
              >
                Hủy
              </button>
              <button className="primary-button" disabled={saving} onClick={() => void save()}>
                {saving ? (
                  <>
                    <LoaderCircle className="spin" size={14} /> Đang lưu…
                  </>
                ) : event ? (
                  'Lưu thay đổi'
                ) : (
                  'Tạo sự kiện'
                )}
              </button>
            </div>
          </footer>
        </section>
      )}

      <Dialog
        open={deleteOpen}
        title={
          event?.recurrence_rule
            ? 'Chuyển toàn bộ chuỗi vào Thùng rác?'
            : 'Chuyển sự kiện vào Thùng rác?'
        }
        description={
          event
            ? event.recurrence_rule
              ? `Mọi lần lặp của “${event.title}” sẽ được chuyển vào Thùng rác và có thể khôi phục sau.`
              : `Sự kiện “${event.title}” sẽ được chuyển vào Thùng rác và có thể khôi phục sau.`
            : undefined
        }
        destructive
        confirmLabel="Chuyển vào Thùng rác"
        busy={saving}
        onClose={() => setDeleteOpen(false)}
        onConfirm={async () => {
          if (!onDelete) return
          setSaving(true)
          try {
            await onDelete()
            setDeleteOpen(false)
          } catch (reason) {
            setError(
              reason instanceof Error
                ? reason.message
                : 'Không thể chuyển sự kiện vào Thùng rác.'
            )
            setDeleteOpen(false)
          } finally {
            setSaving(false)
          }
        }}
      />

      <Dialog
        open={Boolean(recurrenceConfirm)}
        title="Chỉnh sửa sự kiện lặp lại"
        description="Planora hiện áp dụng thay đổi cho toàn bộ chuỗi. Chỉnh sửa riêng một lần lặp chưa được hỗ trợ."
        confirmLabel="Chỉnh sửa toàn bộ chuỗi"
        busy={saving}
        onClose={() => setRecurrenceConfirm(null)}
        onConfirm={() => (recurrenceConfirm ? persist(recurrenceConfirm) : undefined)}
      />
    </div>
  )
}
