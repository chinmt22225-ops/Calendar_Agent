import {
  createViewDay,
  createViewMonthAgenda,
  createViewMonthGrid,
  createViewWeek,
  type CalendarEvent as ScheduleXEvent,
} from '@schedule-x/calendar'
import { createCalendarControlsPlugin } from '@schedule-x/calendar-controls'
import { createDragAndDropPlugin } from '@schedule-x/drag-and-drop'
import { createEventRecurrencePlugin, createEventsServicePlugin } from '@schedule-x/event-recurrence'
import { ScheduleXCalendar, useCalendarApp } from '@schedule-x/react'
import { createResizePlugin } from '@schedule-x/resize'
import '@schedule-x/theme-default/dist/index.css'
import { CalendarPlus, LoaderCircle, Menu, RefreshCw, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useCalendar } from '../../context/CalendarContext'
import { useProfile } from '../../context/ProfileContext'
import { useTheme } from '../../context/ThemeContext'
import { useToast } from '../../context/ToastContext'
import { useSmoothNavigate } from '../../hooks/useSmoothNavigate'
import { dateKeyInTimeZone } from '../../lib/dates'
import {
  initialRangeFromDate,
  initialRangeFromDateTime,
  scheduleXInteractionToDraft,
  toScheduleXEvent,
  type PlanoraScheduleXEvent,
} from '../../lib/scheduleXAdapter'
import type { CalendarEvent, EventDraft } from '../../types/calendar'
import { CalendarSidebar } from './CalendarSidebar'
import { EventModal } from './EventModal'
import { TrashPanel } from './TrashPanel'

const planoraCalendars = {
  rose: { colorName: 'rose', lightColors: { main: '#d93662', container: '#ffe4ec', onContainer: '#7d1738' }, darkColors: { main: '#f47298', container: '#4b2230', onContainer: '#ffdce6' } },
  indigo: { colorName: 'indigo', lightColors: { main: '#5656d8', container: '#e7e7ff', onContainer: '#292878' }, darkColors: { main: '#9798ff', container: '#30305f', onContainer: '#eeeeff' } },
  teal: { colorName: 'teal', lightColors: { main: '#0f8f83', container: '#d9f4ef', onContainer: '#145c55' }, darkColors: { main: '#63d2c6', container: '#163f3c', onContainer: '#d8fffa' } },
  coral: { colorName: 'coral', lightColors: { main: '#df5a27', container: '#ffeadf', onContainer: '#7f3418' }, darkColors: { main: '#ff9d76', container: '#512d20', onContainer: '#ffe8df' } },
  purple: { colorName: 'purple', lightColors: { main: '#7c3aed', container: '#eee6ff', onContainer: '#4b208f' }, darkColors: { main: '#bd9aff', container: '#3d2b59', onContainer: '#f2eaff' } },
  green: { colorName: 'green', lightColors: { main: '#07845d', container: '#dcf5e9', onContainer: '#145b43' }, darkColors: { main: '#67d6aa', container: '#1c4134', onContainer: '#ddfff1' } },
}

const vietnameseTranslations = {
  viVN: {
    Date: 'Ngày',
    'MM/DD/YYYY': 'DD/MM/YYYY',
    'Next month': 'Tháng sau',
    'Previous month': 'Tháng trước',
    'Choose Date': 'Chọn ngày',
    Today: 'Hôm nay',
    Month: 'Tháng',
    Week: 'Tuần',
    Day: 'Ngày',
    List: 'Danh sách',
    'Select View': 'Chọn chế độ xem',
    View: 'Chế độ xem',
    '+ {{n}} events': '+ {{n}} sự kiện',
    '+ 1 event': '+ 1 sự kiện',
    'No events': 'Không có sự kiện',
    'Next period': 'Khoảng thời gian sau',
    'Previous period': 'Khoảng thời gian trước',
    to: 'đến',
    'Full day- and multiple day events': 'Sự kiện cả ngày và nhiều ngày',
    'Link to {{n}} more events on {{date}}': 'Xem thêm {{n}} sự kiện vào {{date}}',
    'Link to 1 more event on {{date}}': 'Xem thêm 1 sự kiện vào {{date}}',
    CW: 'Tuần {{week}}',
    Time: 'Thời gian',
    AM: 'SA',
    PM: 'CH',
    Cancel: 'Hủy',
    OK: 'Xong',
    'Select time': 'Chọn giờ',
  },
}

function EventContent({ calendarEvent, compact = false }: { calendarEvent: PlanoraScheduleXEvent; compact?: boolean }) {
  const source = calendarEvent.source
  const recurrenceLabel = source?.recurrence_rule === 'daily'
    ? 'Hằng ngày'
    : source?.recurrence_rule === 'weekly'
      ? 'Hằng tuần'
      : source?.recurrence_rule === 'monthly'
        ? 'Hằng tháng'
        : ''
  const style = { '--planora-event-color': source?.color || '#d93662' } as CSSProperties
  return <div className={`sx-planora-event ${compact ? 'compact' : ''}`} style={style} title={source?.description || source?.title}>
    <strong>{source?.is_ai_generated && <Sparkles size={11} aria-label="Do Planora sắp xếp" />}{calendarEvent.title}</strong>
    {!compact && <span>{source?.category}{recurrenceLabel ? ` · ${recurrenceLabel}` : ''}</span>}
  </div>
}

function ScheduleCalendar({ events, selectedDate, timeZone, dayStart, dayEnd, theme, onSelectedDate, onOpenEvent, onCreateAt, onInteraction }: {
  events: PlanoraScheduleXEvent[]
  selectedDate: string
  timeZone: string
  dayStart: string
  dayEnd: string
  theme: 'light' | 'dark'
  onSelectedDate: (date: string) => void
  onOpenEvent: (id: string) => void
  onCreateAt: (range: { start: string; end: string; allDay?: boolean }) => void
  onInteraction: (oldEvent: ScheduleXEvent, newEvent: ScheduleXEvent) => Promise<boolean>
}) {
  const recurrence = useMemo(() => createEventRecurrencePlugin(), [])
  const eventsService = useMemo(() => createEventsServicePlugin(), [])
  const calendarControls = useMemo(() => createCalendarControlsPlugin(), [])
  // 15-minute snapping matches Google Calendar standard for clean, responsive dragging
  const dragAndDrop = useMemo(() => createDragAndDropPlugin(15), [])
  const resize = useMemo(() => createResizePlugin(15), [])
  const callbacksRef = useRef({ onSelectedDate, onOpenEvent, onCreateAt, onInteraction })
  callbacksRef.current = { onSelectedDate, onOpenEvent, onCreateAt, onInteraction }
  const calendar = useCalendarApp({
    locale: 'vi-VN',
    translations: vietnameseTranslations,
    timezone: timeZone,
    selectedDate: Temporal.PlainDate.from(selectedDate),
    defaultView: 'week',
    firstDayOfWeek: 1,
    isResponsive: true,
    isDark: theme === 'dark',
    dayBoundaries: { start: dayStart.slice(0, 5), end: dayEnd.slice(0, 5) },
    weekOptions: {
      gridHeight: 1180,
      nDays: 7,
      eventWidth: 94,
      gridStep: 30,
      eventOverlap: true,
      timeAxisFormatOptions: { hour: '2-digit', minute: '2-digit' },
    },
    monthGridOptions: { nEventsPerDay: 4 },
    views: [createViewDay(), createViewWeek(), createViewMonthGrid(), createViewMonthAgenda()],
    events,
    calendars: planoraCalendars,
    callbacks: {
      onSelectedDateUpdate: (date) => callbacksRef.current.onSelectedDate(date.toString()),
      onEventClick: (event) => callbacksRef.current.onOpenEvent(String((event as PlanoraScheduleXEvent).sourceId || event.id).split('__')[0]),
      onClickDate: (date) => callbacksRef.current.onCreateAt(initialRangeFromDate(date)),
      onClickDateTime: (dateTime) => callbacksRef.current.onCreateAt(initialRangeFromDateTime(dateTime)),
      onBeforeEventUpdateAsync: async (oldEvent, newEvent) => callbacksRef.current.onInteraction(oldEvent, newEvent),
    },
    plugins: [recurrence, eventsService, calendarControls, dragAndDrop, resize],
  })

  useEffect(() => { calendar?.events.set(events) }, [calendar, events])
  useEffect(() => { calendar?.setTheme(theme) }, [calendar, theme])
  useEffect(() => {
    const nextDate = Temporal.PlainDate.from(selectedDate)
    if (!calendarControls.getDate().equals(nextDate)) calendarControls.setDate(nextDate)
  }, [calendarControls, selectedDate])

  return <ScheduleXCalendar calendarApp={calendar} customComponents={{
    timeGridEvent: EventContent,
    dateGridEvent: (props) => <EventContent {...props} compact />,
    monthGridEvent: (props) => <EventContent {...props} compact />,
    monthAgendaEvent: EventContent,
  }} />
}

export function CalendarView() {
  const { user } = useAuth()
  const { events, loading, error, categories, categoryColors, create, update, remove, refresh } = useCalendar()
  const { profile, loading: profileLoading, error: profileError, refresh: refreshProfile } = useProfile()
  const { theme } = useTheme()
  const navigate = useSmoothNavigate()
  const timeZone = profile?.timezone || 'Asia/Ho_Chi_Minh'
  const notify = useToast()
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
  }, [timeZone])

  const displayEvents = useMemo(() => events
    .filter((event) => visible.has(event.category) || categories.length === 0)
    .map((event) => toScheduleXEvent(event, timeZone)), [categories.length, events, timeZone, visible])

  const openCreate = (range: { start: string; end: string; allDay?: boolean } | null = null) => {
    setSelected(null); setInitialRange(range); setModalOpen(true); setMobileSidebarOpen(false)
  }
  const close = () => { setModalOpen(false); setSelected(null); setInitialRange(null) }
  const openEvent = (id: string) => {
    const source = events.find((event) => event.id === id)
    if (!source) { notify('Không tìm thấy dữ liệu gốc của sự kiện. Vui lòng tải lại lịch.'); return }
    setSelected(source); setInitialRange(null); setModalOpen(true)
  }
  const updateFromInteraction = async (oldEvent: ScheduleXEvent, changed: ScheduleXEvent) => {
    const source = (changed as PlanoraScheduleXEvent).source || (oldEvent as PlanoraScheduleXEvent).source
    const sourceId = String((changed as PlanoraScheduleXEvent).sourceId || source?.id || changed.id).split('__')[0]
    if (!source) { notify('Không tìm thấy dữ liệu gốc của sự kiện. Vui lòng tải lại lịch.'); return false }
    setInteractionLoading(true)
    try {
      await update(sourceId, scheduleXInteractionToDraft(source, oldEvent, changed))
      notify(source.recurrence_rule ? 'Đã di chuyển toàn bộ chuỗi lặp lại.' : 'Đã cập nhật thời gian sự kiện.', 'success')
      return true
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Không thể cập nhật sự kiện.'
      notify(`${message} Thao tác đã được hoàn tác về vị trí cũ.`)
      return false
    } finally { setInteractionLoading(false) }
  }

  return <div className="calendar-shell planora-calendar-shell">
    <CalendarSidebar categories={categories} categoryColors={categoryColors} visible={visible} selectedDate={selectedDate} collapsed={sidebarCollapsed} mobileOpen={mobileSidebarOpen}
      onDateChange={(date) => { setSelectedDate(date); setMobileSidebarOpen(false) }}
      onToggle={(category) => setVisible((current) => { const next = new Set(current); next.has(category) ? next.delete(category) : next.add(category); return next })}
      onCreate={() => openCreate()} onOpenTrash={() => { setTrashOpen(true); setMobileSidebarOpen(false) }} onToggleCollapsed={() => setSidebarCollapsed((value) => !value)} onCloseMobile={() => setMobileSidebarOpen(false)} />
    {mobileSidebarOpen && <button className="mobile-sidebar-scrim" aria-label="Đóng thanh bên" onClick={() => setMobileSidebarOpen(false)} />}
    <section className="calendar-main">
      <div className="calendar-commandbar">
        <button className="mobile-calendar-menu" aria-label="Mở thanh bên" onClick={() => setMobileSidebarOpen(true)}><Menu size={19} /></button>
        <span><strong>Lịch học của bạn</strong><small>{timeZone}</small></span>
        <button className="ai-plan-button" onClick={() => navigate('/chat')}><Sparkles size={15} /> Lập kế hoạch với AI</button>
      </div>
      <div className="calendar-grid-wrap schedule-x-wrap">
        {(loading || profileLoading || interactionLoading) && <span className="calendar-loading"><LoaderCircle className="spin" size={20} /> {interactionLoading ? 'Đang đồng bộ...' : 'Đang tải lịch...'}</span>}
        {!profileLoading && profileError && <div className="calendar-state"><RefreshCw size={26} /><h2>Không thể tải cài đặt lịch</h2><p>{profileError}</p><button className="primary-button" onClick={() => void refreshProfile()}><RefreshCw size={15} /> Thử lại</button></div>}
        {!profileLoading && !profileError && !loading && error && <div className="calendar-state"><RefreshCw size={26} /><h2>Không thể tải lịch</h2><p>{error}</p><button className="primary-button" onClick={() => void refresh()}><RefreshCw size={15} /> Thử lại</button></div>}
        {!profileLoading && !profileError && !loading && !error && events.length === 0 && <div className="calendar-state empty"><CalendarPlus size={28} /><h2>Chưa có sự kiện</h2><p>Tạo sự kiện đầu tiên hoặc nhờ Trợ lý AI sắp xếp lịch học.</p><button className="primary-button" onClick={() => openCreate()}><CalendarPlus size={15} /> Tạo sự kiện</button></div>}
        {!profileLoading && !profileError && !error && <ScheduleCalendar key={timeZone} events={displayEvents} selectedDate={selectedDate} timeZone={timeZone}
          dayStart={profile?.day_start || '07:00'} dayEnd={profile?.day_end || '22:00'} theme={theme}
          onSelectedDate={setSelectedDate} onOpenEvent={openEvent} onCreateAt={openCreate} onInteraction={updateFromInteraction} />}
      </div>
    </section>
    {modalOpen && <EventModal event={selected} initialRange={initialRange} categories={categories} timeZone={timeZone}
      ownerName={profile?.display_name || user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Lịch học'}
      onClose={close}
      onSave={async (draft: EventDraft) => { selected ? await update(selected.id, draft) : await create(draft); close(); notify('Đã lưu sự kiện.', 'success') }}
      onDelete={selected ? async () => { await remove(selected.id); close(); notify('Đã chuyển sự kiện vào Thùng rác.', 'success') } : null} />}
    {trashOpen && <TrashPanel onClose={() => setTrashOpen(false)} />}
  </div>
}
