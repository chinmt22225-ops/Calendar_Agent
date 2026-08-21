import type { DateSelectArg, EventClickArg, EventContentArg, EventDropArg, EventInput } from '@fullcalendar/core'
import viLocale from '@fullcalendar/core/locales/vi'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin, { type EventResizeDoneArg } from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'
import FullCalendar from '@fullcalendar/react'
import rrulePlugin from '@fullcalendar/rrule'
import timeGridPlugin from '@fullcalendar/timegrid'
import { CalendarPlus, ChevronLeft, ChevronRight, LoaderCircle, Menu, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useCalendar } from '../../context/CalendarContext'
import { useProfile } from '../../context/ProfileContext'
import { useToast } from '../../context/ToastContext'
import { dateKeyInTimeZone, floatingDateToIso, localInputValue, zonedInputValue } from '../../lib/dates'
import type { CalendarEvent, EventDraft } from '../../types/calendar'
import { CalendarSidebar } from './CalendarSidebar'
import { EventModal } from './EventModal'
import { TrashPanel } from './TrashPanel'

type ViewName = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay' | 'listWeek'
const views: { value: ViewName; label: string }[] = [
  { value: 'timeGridDay', label: 'Ngày' }, { value: 'timeGridWeek', label: 'Tuần' },
  { value: 'dayGridMonth', label: 'Tháng' }, { value: 'listWeek', label: 'Lịch biểu' },
]

function calendarInput(event: CalendarEvent, timeZone: string): EventInput {
  const common: EventInput = {
    id: event.id, groupId: event.recurrence_rule ? event.id : undefined, title: event.title,
    backgroundColor: event.color, borderColor: event.color, allDay: event.all_day,
    extendedProps: { source: event },
  }
  const start = event.all_day ? (event.all_day_start || event.start_time.slice(0, 10)) : zonedInputValue(event.start_time, timeZone)
  const end = event.all_day ? (event.all_day_end || event.end_time.slice(0, 10)) : zonedInputValue(event.end_time, timeZone)
  if (!event.recurrence_rule || !event.recurrence_end) return { ...common, start, end }
  const duration = new Date(event.end_time).getTime() - new Date(event.start_time).getTime()
  return {
    ...common,
    rrule: {
      freq: event.recurrence_rule,
      dtstart: start,
      until: event.all_day ? event.recurrence_end : `${event.recurrence_end}T23:59:59`,
    },
    duration,
  } as EventInput
}

export function CalendarView() {
  const calendarRef = useRef<FullCalendar>(null)
  const { events, loading, error, categories, categoryColors, create, update, remove, refresh } = useCalendar()
  const { profile } = useProfile()
  const timeZone = profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
  const notify = useToast()
  const [title, setTitle] = useState('')
  const [view, setView] = useState<ViewName>('timeGridWeek')
  const [selected, setSelected] = useState<CalendarEvent | null>(null)
  const [initialRange, setInitialRange] = useState<{ start: string; end: string; allDay?: boolean } | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [trashOpen, setTrashOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState(() => dateKeyInTimeZone(new Date(), timeZone))
  const [visible, setVisible] = useState<Set<string>>(new Set())
  const [interactionLoading, setInteractionLoading] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  useEffect(() => { setVisible((current) => new Set([...current, ...categories])) }, [categories])
  useEffect(() => {
    const today = dateKeyInTimeZone(new Date(), timeZone)
    setSelectedDate(today)
    calendarRef.current?.getApi().gotoDate(today)
  }, [timeZone])
  const displayEvents = useMemo(() => events.filter((event) => visible.has(event.category) || categories.length === 0).map((event) => calendarInput(event, timeZone)), [categories.length, events, timeZone, visible])
  const api = () => calendarRef.current?.getApi()
  const changeView = (next: ViewName) => { setView(next); api()?.changeView(next) }
  const editByInteraction = async (info: EventDropArg | EventResizeDoneArg) => {
    const source = info.event.extendedProps.source as CalendarEvent
    if (source.recurrence_rule) { info.revert(); notify('Hãy mở sự kiện để chỉnh sửa toàn bộ chuỗi lặp lại.'); return }
    setInteractionLoading(true)
    try {
      const start = info.event.start!
      const end = info.event.end || info.event.start!
      await update(info.event.id, {
        start_time: floatingDateToIso(start, timeZone), end_time: floatingDateToIso(end, timeZone), all_day: info.event.allDay,
        all_day_start: info.event.allDay ? localInputValue(start).slice(0, 10) : null,
        all_day_end: info.event.allDay ? localInputValue(end).slice(0, 10) : null,
      })
      notify('Đã cập nhật thời gian sự kiện.', 'success')
    } catch (error) { info.revert(); notify(error instanceof Error ? error.message : 'Không thể cập nhật sự kiện.') }
    finally { setInteractionLoading(false) }
  }
  const openFromSelect = (info: DateSelectArg) => { setSelected(null); setInitialRange({ start: info.startStr, end: info.endStr, allDay: info.allDay }); setModalOpen(true) }
  const openFromEvent = (info: EventClickArg) => { setSelected(info.event.extendedProps.source); setInitialRange(null); setModalOpen(true) }
  const close = () => { setModalOpen(false); setSelected(null); setInitialRange(null) }
  const renderEvent = (info: EventContentArg) => {
    const source = info.event.extendedProps.source as CalendarEvent
    return <div className="rich-event">{info.timeText && <b>{info.timeText}</b>}<span>{source.is_ai_generated && <em title="Do Planora sắp xếp">✦</em>}{info.event.title}{source.recurrence_rule && <i title="Sự kiện lặp lại"> ↻</i>}</span></div>
  }
  const currentLabel = new Date(`${selectedDate}T12:00:00`).toLocaleDateString('vi-VN', { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <div className="calendar-shell">
      <CalendarSidebar categories={categories} categoryColors={categoryColors} visible={visible} selectedDate={selectedDate} collapsed={sidebarCollapsed} mobileOpen={mobileSidebarOpen}
        onDateChange={(date) => { setSelectedDate(date); api()?.gotoDate(date); setMobileSidebarOpen(false) }}
        onToggle={(category) => setVisible((current) => { const next = new Set(current); next.has(category) ? next.delete(category) : next.add(category); return next })}
        onCreate={() => { setSelected(null); setInitialRange(null); setModalOpen(true); setMobileSidebarOpen(false) }} onOpenTrash={() => { setTrashOpen(true); setMobileSidebarOpen(false) }} onToggleCollapsed={() => setSidebarCollapsed((value) => !value)} onCloseMobile={() => setMobileSidebarOpen(false)} />
      {mobileSidebarOpen && <button className="mobile-sidebar-scrim" aria-label="Đóng thanh bên" onClick={() => setMobileSidebarOpen(false)} />}
      <section className="calendar-main">
        <div className="calendar-toolbar">
          <div className="toolbar-navigation"><button className="mobile-calendar-menu" aria-label="Mở thanh bên" title="Mở thanh bên" onClick={() => setMobileSidebarOpen(true)}><Menu size={19} /></button><button className="today-button" onClick={() => { api()?.today(); setSelectedDate(dateKeyInTimeZone(new Date(), timeZone)) }}>Hôm nay</button><button aria-label="Kỳ trước" title="Kỳ trước" onClick={() => api()?.prev()}><ChevronLeft size={19} /></button><button aria-label="Kỳ sau" title="Kỳ sau" onClick={() => api()?.next()}><ChevronRight size={19} /></button><h1>{title}</h1><span className="current-date-chip">{currentLabel}</span><span className="timezone-chip">{timeZone}</span></div>
          <div className="view-tabs">{views.map((item) => <button key={item.value} className={view === item.value ? 'active' : ''} onClick={() => changeView(item.value)}>{item.label}</button>)}</div>
        </div>
        <div className="calendar-grid-wrap">
          {(loading || interactionLoading) && <span className="calendar-loading"><LoaderCircle className="spin" size={20} /> {interactionLoading ? 'Đang cập nhật...' : 'Đang tải lịch...'}</span>}
          {!loading && error && <div className="calendar-state"><RefreshCw size={26} /><h2>Không thể tải lịch</h2><p>{error}</p><button className="primary-button" onClick={() => void refresh()}><RefreshCw size={15} /> Thử lại</button></div>}
          {!loading && !error && events.length === 0 && <div className="calendar-state empty"><CalendarPlus size={28} /><h2>Chưa có sự kiện</h2><p>Tạo sự kiện đầu tiên hoặc nhờ Trợ lý AI sắp xếp lịch học.</p><button className="primary-button" onClick={() => { setSelected(null); setInitialRange(null); setModalOpen(true) }}><CalendarPlus size={15} /> Tạo sự kiện</button></div>}
          <FullCalendar ref={calendarRef} plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin, rrulePlugin]}
            locale={viLocale} timeZone="local" now={zonedInputValue(new Date(), timeZone)} initialView={view} headerToolbar={false} events={displayEvents} editable selectable selectMirror nowIndicator allDaySlot
            slotMinTime={`${(profile?.day_start || '07:00').slice(0, 5)}:00`} slotMaxTime={`${(profile?.day_end || '22:00').slice(0, 5)}:00`} slotDuration="00:30:00" height="100%" dayMaxEvents={3}
            datesSet={(info) => setTitle(info.view.title)} dateClick={(info) => setSelectedDate(info.dateStr.slice(0, 10))} select={openFromSelect} eventClick={openFromEvent}
            eventContent={renderEvent} eventClassNames={(info) => [`event-${(info.event.extendedProps.source as CalendarEvent).status}`]}
            eventDidMount={(info) => { const source = info.event.extendedProps.source as CalendarEvent; info.el.title = `${source.title}\n${source.category}${source.description ? `\n${source.description}` : ''}`; info.el.setAttribute('aria-label', `${source.title}, ${info.timeText || (source.all_day ? 'cả ngày' : '')}`) }}
            eventDrop={(info) => void editByInteraction(info)} eventResize={(info) => void editByInteraction(info)} />
        </div>
      </section>
      {modalOpen && <EventModal event={selected} initialRange={initialRange} categories={categories} timeZone={timeZone} onClose={close}
        onSave={async (draft: EventDraft) => { selected ? await update(selected.id, draft) : await create(draft); close(); notify('Đã lưu sự kiện.', 'success') }}
        onDelete={selected ? async () => { await remove(selected.id); close(); notify('Đã chuyển sự kiện vào Thùng rác.', 'success') } : null} />}
      {trashOpen && <TrashPanel onClose={() => setTrashOpen(false)} />}
    </div>
  )
}
