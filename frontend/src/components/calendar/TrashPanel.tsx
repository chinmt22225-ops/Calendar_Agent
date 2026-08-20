import { RotateCcw, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import * as eventsApi from '../../api/events'
import { useCalendar } from '../../context/CalendarContext'
import { useToast } from '../../context/ToastContext'
import type { CalendarEvent } from '../../types/calendar'

export function TrashPanel({ onClose }: { onClose: () => void }) {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const { refresh } = useCalendar()
  const notify = useToast()
  const load = async () => { setLoading(true); try { setEvents(await eventsApi.fetchTrash()) } catch (e) { notify(e instanceof Error ? e.message : 'Không thể mở Thùng rác.') } finally { setLoading(false) } }
  useEffect(() => { void load() }, [])
  const restore = async (id: string) => { try { await eventsApi.restoreEvent(id); setEvents((items) => items.filter((item) => item.id !== id)); await refresh(); notify('Đã khôi phục sự kiện.', 'success') } catch (e) { notify(e instanceof Error ? e.message : 'Không thể khôi phục sự kiện.') } }
  const remove = async (id: string) => { if (!window.confirm('Xóa vĩnh viễn sự kiện này? Thao tác không thể hoàn tác.')) return; try { await eventsApi.permanentlyDeleteEvent(id); setEvents((items) => items.filter((item) => item.id !== id)) } catch (e) { notify(e instanceof Error ? e.message : 'Không thể xóa vĩnh viễn.') } }
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><section className="trash-modal"><header><div><span className="modal-icon"><Trash2 size={20} /></span><div><h2>Thùng rác</h2><p>Khôi phục hoặc xóa vĩnh viễn sự kiện</p></div></div><button onClick={onClose}><X size={19} /></button></header><div className="trash-list">{loading && <p>Đang tải...</p>}{!loading && events.length === 0 && <p className="empty-trash">Thùng rác đang trống.</p>}{events.map((event) => <article key={event.id}><span style={{ background: event.color }} /><div><strong>{event.title}</strong><small>{new Date(event.start_time).toLocaleString('vi-VN')}</small></div><button title="Khôi phục" onClick={() => void restore(event.id)}><RotateCcw size={16} /></button><button className="danger" title="Xóa vĩnh viễn" onClick={() => void remove(event.id)}><Trash2 size={16} /></button></article>)}</div></section></div>
}
