import type { DateSelectArg, EventClickArg, EventContentArg, EventDropArg, EventInput } from '@fullcalendar/core'
import viLocale from '@fullcalendar/core/locales/vi'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin, { type EventResizeDoneArg } from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'
import FullCalendar from '@fullcalendar/react'
import rrulePlugin from '@fullcalendar/rrule'
import timeGridPlugin from '@fullcalendar/timegrid'
import { ChevronLeft, ChevronRight, LoaderCircle } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useCalendar } from '../../context/CalendarContext'
import { useProfile } from '../../context/ProfileContext'
import { useToast } from '../../context/ToastContext'
import type { CalendarEvent, EventDraft } from '../../types/calendar'
import { CalendarSidebar } from './CalendarSidebar'
import { EventModal } from './EventModal'
import { TrashPanel } from './TrashPanel'

type ViewName = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay' | 'listWeek'
const views: { value: ViewName; label: string }[] = [
  { value: 'timeGridDay', label: 'Ngày' }, { value: 'timeGridWeek', label: 'Tuần' },
  { value: 'dayGridMonth', label: 'Tháng' }, { value: 'listWeek', label: 'Lịch biểu' },
]

function calendarInput(event: CalendarEvent): EventInput {
  const common: EventInput = {
    id: event.id, groupId: event.recurrence_rule ? event.id : undefined, title: event.title,
    backgroundColor: event.color, borderColor: event.color, allDay: event.all_day,
    extendedProps: { source: event },
  }
  if (!event.recurrence_rule || !event.recurrence_end) return { ...common, start: event.start_time, end: event.end_time }
  const duration = new Date(event.end_time).getTime() - new Date(event.start_time).getTime()
  return {
    ...common,
    rrule: {
      freq: event.recurrence_rule,
      dtstart: event.all_day ? event.start_time.slice(0, 10) : event.start_time,
      until: event.all_day ? event.recurrence_end : `${event.recurrence_end}T23:59:59`,
    },
    duration,
  } as EventInput
}

export function CalendarView() {
  const calendarRef = useRef<FullCalendar>(null)
  const { events, loading, categories, categoryColors, create, update, remove } = useCalendar()
  const { profile } = useProfile()
  const notify = useToast()
  const [title, setTitle] = useState('')
  const [view, setView] = useState<ViewName>('timeGridWeek')
  const [selected, setSelected] = useState<CalendarEvent | null>(null)
  const [initialRange, setInitialRange] = useState<{ start: string; end: string; allDay?: boolean } | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [trashOpen, setTrashOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
  const [visible, setVisible] = useState<Set<string>>(new Set())
  const [interactionLoading, setInteractionLoading] = useState(false)

  useEffect(() => { setVisible((current) => new Set([...current, ...categories])) }, [categories])
  const displayEvents = useMemo(() => events.filter((event) => visible.has(event.category) || categories.length === 0).map(calendarInput), [categories.length, events, visible])
  const api = () => calendarRef.current?.getApi()
  const changeView = (next: ViewName) => { setView(next); api()?.changeView(next) }
  const editByInteraction = async (info: EventDropArg | EventResizeDoneArg) => {
    const source = info.event.extendedProps.source as CalendarEvent
    if (source.recurrence_rule) { info.revert(); notify('Hãy mở sự kiện để chỉnh sửa toàn bộ chuỗi lặp lại.'); return }
    setInteractionLoading(true)
    try {
      await update(info.event.id, { start_time: info.event.start!.toISOString(), end_time: (info.event.end || info.event.start!).toISOString(), all_day: info.event.allDay })
      notify('Đã cập nhật thời gian sự kiện.', 'success')
    } catch (error) { info.revert(); notify(error instanceof Error ? error.message : 'Không thể cập nhật sự kiện.') }
    finally { setInteractionLoading(false) }
  }
  const openFromSelect = (info: DateSelectArg) => { setSelected(null); setInitialRange({ start: info.startStr, end: info.endStr, allDay: info.allDay }); setModalOpen(true) }
  const openFromEvent = (info: EventClickArg) => { setSelected(info.event.extendedProps.source); setInitialRange(null); setModalOpen(true) }
  const close = () => { setModalOpen(false); setSelected(null); setInitialRange(null) }
  const renderEvent = (info: EventContentArg) => {
    const source = info.event.extendedProps.source as CalendarEvent
    return <div className="rich-event">{info.timeText && <b>{info.timeText}</b>}<span>{source.is_ai_generated && <em>✦</em>}{info.event.title}</span></div>
  }
  const currentLabel = new Date(`${selectedDate}T12:00:00`).toLocaleDateString('vi-VN', { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <div className="calendar-shell">
      <CalendarSidebar categories={categories} categoryColors={categoryColors} visible={visible} selectedDate={selectedDate}
        onDateChange={(date) => { setSelectedDate(date); api()?.gotoDate(date) }}
        onToggle={(category) => setVisible((current) => { const next = new Set(current); next.has(category) ? next.delete(category) : next.add(category); return next })}
        onCreate={() => { setSelected(null); setInitialRange(null); setModalOpen(true) }} onOpenTrash={() => setTrashOpen(true)} />
      <section className="calendar-main">
        <div className="calendar-toolbar">
          <div className="toolbar-navigation"><button className="today-button" onClick={() => { api()?.today(); setSelectedDate(new Date().toISOString().slice(0, 10)) }}>Hôm nay</button><button onClick={() => api()?.prev()}><ChevronLeft size={19} /></button><button onClick={() => api()?.next()}><ChevronRight size={19} /></button><h1>{title}</h1><span className="current-date-chip">{currentLabel}</span></div>
          <div className="view-tabs">{views.map((item) => <button key={item.value} className={view === item.value ? 'active' : ''} onClick={() => changeView(item.value)}>{item.label}</button>)}</div>
        </div>
        <div className="calendar-grid-wrap">
          {(loading || interactionLoading) && <span className="calendar-loading"><LoaderCircle className="spin" size={20} /> {interactionLoading ? 'Đang cập nhật...' : 'Đang tải lịch...'}</span>}
          <FullCalendar ref={calendarRef} plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin, rrulePlugin]}
            locale={viLocale} initialView={view} headerToolbar={false} events={displayEvents} editable selectable selectMirror nowIndicator allDaySlot
            slotMinTime={`${(profile?.day_start || '07:00').slice(0, 5)}:00`} slotMaxTime={`${(profile?.day_end || '22:00').slice(0, 5)}:00`} slotDuration="00:30:00" height="100%" dayMaxEvents={3}
            datesSet={(info) => setTitle(info.view.title)} dateClick={(info) => setSelectedDate(info.dateStr.slice(0, 10))} select={openFromSelect} eventClick={openFromEvent}
            eventContent={renderEvent} eventClassNames={(info) => [`event-${(info.event.extendedProps.source as CalendarEvent).status}`]}
            eventDidMount={(info) => { const source = info.event.extendedProps.source as CalendarEvent; info.el.title = `${source.title}\n${source.category}${source.description ? `\n${source.description}` : ''}` }}
            eventDrop={(info) => void editByInteraction(info)} eventResize={(info) => void editByInteraction(info)} />
        </div>
      </section>
      {modalOpen && <EventModal event={selected} initialRange={initialRange} categories={categories} onClose={close}
        onSave={async (draft: EventDraft) => { selected ? await update(selected.id, draft) : await create(draft); close(); notify('Đã lưu sự kiện.', 'success') }}
        onDelete={selected ? async () => { await remove(selected.id); close(); notify('Đã chuyển sự kiện vào Thùng rác.', 'success') } : null} />}
      {trashOpen && <TrashPanel onClose={() => setTrashOpen(false)} />}
    </div>
  )
}
