import { ArchiveRestore, LoaderCircle, RotateCcw, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import * as eventsApi from '../../api/events'
import { Dialog } from '../common/Dialog'
import { useCalendar } from '../../context/CalendarContext'
import { useProfile } from '../../context/ProfileContext'
import { useToast } from '../../context/ToastContext'
import type { CalendarEvent } from '../../types/calendar'

export function TrashPanel({ onClose }: { onClose: () => void }) {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<CalendarEvent | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const { refresh } = useCalendar()
  const { profile } = useProfile()
  const notify = useToast()
  const load = async () => { setLoading(true); setError(''); try { setEvents(await eventsApi.fetchTrash()) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể mở Thùng rác.') } finally { setLoading(false) } }
  useEffect(() => { void load() }, [])
  const restore = async (event: CalendarEvent) => {
    setBusyId(event.id)
    try { await eventsApi.restoreEvent(event.id); setEvents((items) => items.filter((item) => item.id !== event.id)); await refresh(); notify(`Đã khôi phục “${event.title}”.`, 'success') }
    catch (reason) { notify(reason instanceof Error ? reason.message : 'Không thể khôi phục sự kiện.') }
    finally { setBusyId(null) }
  }
  const remove = async () => {
    if (!deleteTarget) return
    setBusyId(deleteTarget.id)
    try { await eventsApi.permanentlyDeleteEvent(deleteTarget.id); setEvents((items) => items.filter((item) => item.id !== deleteTarget.id)); notify('Đã xóa vĩnh viễn sự kiện.', 'success'); setDeleteTarget(null) }
    catch (reason) { notify(reason instanceof Error ? reason.message : 'Không thể xóa vĩnh viễn.') }
    finally { setBusyId(null) }
  }
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="trash-modal" role="dialog" aria-modal="true" aria-label="Thùng rác"><header><div><span className="modal-icon"><Trash2 size={20} /></span><div><h2>Thùng rác</h2><p>Khôi phục hoặc xóa vĩnh viễn sự kiện</p></div></div><button aria-label="Đóng Thùng rác" title="Đóng" onClick={onClose}><X size={19} /></button></header><div className="trash-list">
    {loading && <div className="trash-loading"><LoaderCircle className="spin" size={20} /><p>Đang tải Thùng rác…</p></div>}
    {!loading && error && <div className="trash-error"><Trash2 size={24} /><strong>Không thể tải Thùng rác</strong><small>{error}</small><button onClick={() => void load()}><RotateCcw size={14} /> Thử lại</button></div>}
    {!loading && !error && events.length === 0 && <div className="empty-trash"><ArchiveRestore size={28} /><strong>Thùng rác đang trống</strong><p>Các sự kiện đã xóa sẽ xuất hiện tại đây.</p><button onClick={onClose}>Quay lại Lịch</button></div>}
    {!loading && !error && events.map((event) => <article key={event.id}><span style={{ background: event.color }} /><div><strong>{event.title}</strong><small>{event.all_day ? 'Cả ngày' : new Date(event.start_time).toLocaleString('vi-VN', { timeZone: profile?.timezone })}</small><em>Đã xóa {event.deleted_at ? new Date(event.deleted_at).toLocaleDateString('vi-VN', { timeZone: profile?.timezone }) : ''}</em></div><button disabled={busyId === event.id} aria-label={`Khôi phục ${event.title}`} title="Khôi phục" onClick={() => void restore(event)}>{busyId === event.id ? <LoaderCircle className="spin" size={16} /> : <RotateCcw size={16} />}</button><button disabled={busyId === event.id} className="danger" aria-label={`Xóa vĩnh viễn ${event.title}`} title="Xóa vĩnh viễn" onClick={() => setDeleteTarget(event)}><Trash2 size={16} /></button></article>)}
  </div></section><Dialog open={Boolean(deleteTarget)} title="Xóa vĩnh viễn sự kiện?" description={deleteTarget ? `Sự kiện “${deleteTarget.title}” sẽ bị xóa vĩnh viễn và không thể khôi phục.` : undefined} destructive confirmLabel="Xóa vĩnh viễn" busy={Boolean(busyId)} onClose={() => !busyId && setDeleteTarget(null)} onConfirm={remove} /></div>
}
