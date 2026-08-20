import viLocale from '@fullcalendar/core/locales/vi'
import type { DateSelectArg, EventClickArg, EventDropArg } from '@fullcalendar/core'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin, { type EventResizeDoneArg } from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import { ChevronLeft, ChevronRight, LoaderCircle } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useCalendar } from '../../context/CalendarContext'
import type { CalendarEvent, EventDraft } from '../../types/calendar'
import { CalendarSidebar } from './CalendarSidebar'
import { EventModal } from './EventModal'

type ViewName = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay' | 'listWeek'

export function CalendarView() {
  const calendarRef = useRef<FullCalendar>(null)
  const { events, loading, categories, create, update, remove } = useCalendar()
  const [title, setTitle] = useState('')
  const [view, setView] = useState<ViewName>('timeGridWeek')
  const [selected, setSelected] = useState<CalendarEvent | null>(null)
  const [initialRange, setInitialRange] = useState<{ start: string; end: string } | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
  const [visible, setVisible] = useState<Set<string>>(new Set())

  useEffect(() => { setVisible((current) => new Set([...current, ...categories])) }, [categories])
  const displayEvents = useMemo(() => events.filter((event) => visible.has(event.category) || categories.length === 0).map((event) => ({ id: event.id, title: event.title, start: event.start_time, end: event.end_time, backgroundColor: event.color, borderColor: event.color, extendedProps: { source: event } })), [categories.length, events, visible])
  const api = () => calendarRef.current?.getApi()
  const changeView = (next: ViewName) => { setView(next); api()?.changeView(next) }
  const editByInteraction = async (info: EventDropArg | EventResizeDoneArg) => {
    try { await update(info.event.id, { start_time: info.event.start!.toISOString(), end_time: (info.event.end || info.event.start!).toISOString() }) } catch { info.revert() }
  }
  const openFromSelect = (info: DateSelectArg) => { setSelected(null); setInitialRange({ start: info.startStr, end: info.endStr }); setModalOpen(true) }
  const openFromEvent = (info: EventClickArg) => { setSelected(info.event.extendedProps.source); setInitialRange(null); setModalOpen(true) }
  const close = () => { setModalOpen(false); setSelected(null); setInitialRange(null) }

  return (
    <div className="calendar-shell">
      <CalendarSidebar categories={categories} visible={visible} selectedDate={selectedDate}
        onDateChange={(date) => { setSelectedDate(date); api()?.gotoDate(date) }}
        onToggle={(category) => setVisible((current) => { const next = new Set(current); next.has(category) ? next.delete(category) : next.add(category); return next })}
        onCreate={() => { setSelected(null); setInitialRange(null); setModalOpen(true) }} />
      <section className="calendar-main">
        <div className="calendar-toolbar">
          <div className="toolbar-navigation"><button className="today-button" onClick={() => api()?.today()}>Hôm nay</button><button onClick={() => api()?.prev()}><ChevronLeft size={19} /></button><button onClick={() => api()?.next()}><ChevronRight size={19} /></button><h1>{title}</h1></div>
          <select value={view} onChange={(e) => changeView(e.target.value as ViewName)}><option value="dayGridMonth">Tháng</option><option value="timeGridWeek">Tuần</option><option value="timeGridDay">Ngày</option><option value="listWeek">Lịch biểu</option></select>
        </div>
        <div className="calendar-grid-wrap">
          {loading && <span className="calendar-loading"><LoaderCircle className="spin" size={20} /> Đang tải lịch...</span>}
          <FullCalendar ref={calendarRef} plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
            locale={viLocale} initialView={view} headerToolbar={false} events={displayEvents} editable selectable selectMirror nowIndicator allDaySlot={false}
            slotMinTime="06:00:00" slotMaxTime="24:00:00" slotDuration="00:30:00" height="100%" dayMaxEvents={3}
            datesSet={(info) => setTitle(info.view.title)} select={openFromSelect} eventClick={openFromEvent}
            eventDrop={(info) => void editByInteraction(info)} eventResize={(info) => void editByInteraction(info)} />
        </div>
      </section>
      {modalOpen && <EventModal event={selected} initialRange={initialRange} onClose={close}
        onSave={async (draft: EventDraft) => { selected ? await update(selected.id, draft) : await create(draft); close() }}
        onDelete={selected ? async () => { await remove(selected.id); close() } : null} />}
    </div>
  )
}

