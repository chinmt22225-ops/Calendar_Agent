import { AlertTriangle, Check, ChevronDown, ChevronRight, Circle, Clock3, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as tasksApi from '../../api/tasks'
import { Dialog } from '../common/Dialog'
import { useProfile } from '../../context/ProfileContext'
import { useToast } from '../../context/ToastContext'
import { dateKeyInTimeZone } from '../../lib/dates'
import type { StudyTask, StudyTaskDraft } from '../../types/task'

const emptyDraft = (timeZone: string): StudyTaskDraft => ({ title: '', subject: 'Học tập', estimated_hours: 1, deadline: dateKeyInTimeZone(new Date(), timeZone), priority: 2, status: 'pending' })

export function TaskPanel() {
  const notify = useToast()
  const { profile } = useProfile()
  const timeZone = profile?.timezone || 'Asia/Ho_Chi_Minh'
  const [tasks, setTasks] = useState<StudyTask[]>([])
  const [expanded, setExpanded] = useState(true)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [editing, setEditing] = useState<StudyTask | 'new' | null>(null)
  const [draft, setDraft] = useState<StudyTaskDraft>(() => emptyDraft(timeZone))
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<StudyTask | null>(null)
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set())
  const loadSequence = useRef(0)
  const load = useCallback(async () => {
    const sequence = ++loadSequence.current
    setLoading(true); setLoadError('')
    try { const nextTasks = await tasksApi.fetchTasks(); if (sequence === loadSequence.current) setTasks(nextTasks) }
    catch (reason) { if (sequence === loadSequence.current) setLoadError(reason instanceof Error ? reason.message : 'Không thể tải công việc.') }
    finally { if (sequence === loadSequence.current) setLoading(false) }
  }, [])
  useEffect(() => {
    const reloadFromAgent = () => void load()
    void load()
    window.addEventListener('planora:tasks-changed', reloadFromAgent)
    return () => window.removeEventListener('planora:tasks-changed', reloadFromAgent)
  }, [load])

  const ordered = useMemo(() => [...tasks].sort((a, b) => {
    if (a.status === 'completed' && b.status !== 'completed') return 1
    if (a.status !== 'completed' && b.status === 'completed') return -1
    if (a.priority !== b.priority) return a.priority - b.priority
    return a.deadline.localeCompare(b.deadline)
  }), [tasks])
  const pendingCount = tasks.filter((task) => task.status !== 'completed').length

  const openCreate = () => { setDraft(emptyDraft(timeZone)); setFormError(''); setEditing('new'); setExpanded(true) }
  const openEdit = (task: StudyTask) => {
    setDraft({ title: task.title, subject: task.subject, estimated_hours: task.estimated_hours, deadline: task.deadline, priority: task.priority, status: task.status })
    setFormError(''); setEditing(task); setExpanded(true)
  }
  const save = async () => {
    const cleanTitle = draft.title.trim(); const cleanSubject = draft.subject.trim()
    if (!cleanTitle) { setFormError('Vui lòng nhập tên công việc.'); return }
    if (!cleanSubject) { setFormError('Vui lòng nhập môn học hoặc danh mục.'); return }
    if (draft.estimated_hours <= 0 || draft.estimated_hours > 500) { setFormError('Thời lượng phải lớn hơn 0 và không vượt quá 500 giờ.'); return }
    if (!draft.deadline) { setFormError('Vui lòng chọn hạn hoàn thành.'); return }
    setBusy(true); setFormError('')
    try {
      const payload = { ...draft, title: cleanTitle, subject: cleanSubject }
      if (editing === 'new') {
        const created = await tasksApi.createTask(payload)
        setTasks((items) => [...items, created])
        notify('Đã tạo công việc.', 'success')
      } else if (editing) {
        const updated = await tasksApi.updateTask(editing.id, payload)
        setTasks((items) => items.map((item) => item.id === editing.id ? updated : item))
        notify('Đã lưu thay đổi.', 'success')
      }
      setEditing(null)
    } catch (reason) { setFormError(reason instanceof Error ? reason.message : 'Không thể lưu công việc.') }
    finally { setBusy(false) }
  }
  const toggle = async (task: StudyTask) => {
    if (updatingIds.has(task.id)) return
    setUpdatingIds((ids) => new Set(ids).add(task.id))
    try { const updated = await tasksApi.updateTask(task.id, { status: task.status === 'completed' ? 'pending' : 'completed' }); setTasks((items) => items.map((item) => item.id === task.id ? updated : item)); notify(updated.status === 'completed' ? 'Đã hoàn thành công việc.' : 'Đã mở lại công việc.', 'success') }
    catch (reason) { notify(reason instanceof Error ? reason.message : 'Không thể cập nhật công việc.') }
    finally { setUpdatingIds((ids) => { const next = new Set(ids); next.delete(task.id); return next }) }
  }
  const remove = async () => {
    if (!deleteTarget) return
    setBusy(true)
    try { await tasksApi.deleteTask(deleteTarget.id); setTasks((items) => items.filter((item) => item.id !== deleteTarget.id)); notify('Đã xóa công việc.', 'success'); setDeleteTarget(null) }
    catch (reason) { notify(reason instanceof Error ? reason.message : 'Không thể xóa công việc.') }
    finally { setBusy(false) }
  }

  const today = dateKeyInTimeZone(new Date(), timeZone)
  return (
    <section className="task-panel">
      <div className="sidebar-section-title"><button className="section-toggle" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<span><strong>Công việc</strong>{pendingCount > 0 && <em>{pendingCount}</em>}</span></button><button onClick={openCreate} aria-label="Thêm công việc" title="Thêm công việc"><Plus size={15} /></button></div>
      {expanded && <>
        {editing && <form className="task-form" onSubmit={(event) => { event.preventDefault(); void save() }}>
          <div className="task-form-heading"><strong>{editing === 'new' ? 'Thêm công việc' : 'Chỉnh sửa công việc'}</strong><button type="button" onClick={() => setEditing(null)}>Hủy</button></div>
          <label><span>Tên công việc</span><input autoFocus maxLength={180} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
          <label><span>Môn học</span><input maxLength={80} value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} /></label>
          <div className="task-form-row"><label><span>Thời lượng</span><input type="number" min="0.25" max="500" step="0.25" value={draft.estimated_hours} onChange={(e) => setDraft({ ...draft, estimated_hours: Number(e.target.value) })} /></label><label><span>Ưu tiên</span><select value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) as StudyTaskDraft['priority'] })}><option value="1">Cao</option><option value="2">Vừa</option><option value="3">Thấp</option></select></label></div>
          <label><span>Hạn hoàn thành</span><input type="date" value={draft.deadline} onChange={(e) => setDraft({ ...draft, deadline: e.target.value })} /></label>
          {editing !== 'new' && <label><span>Trạng thái</span><select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as StudyTaskDraft['status'] })}><option value="pending">Chưa xếp lịch</option><option value="planned">Đã xếp lịch</option><option value="completed">Đã hoàn thành</option></select></label>}
          {formError && <p className="form-error" role="alert">{formError}</p>}
          <button className="task-save" disabled={busy} type="submit">{busy ? 'Đang lưu…' : editing === 'new' ? 'Tạo công việc' : 'Lưu thay đổi'}</button>
        </form>}
        {loading ? <div className="task-skeleton" aria-label="Đang tải công việc"><i /><i /><i /></div> : loadError ? <div className="task-error"><AlertTriangle size={17} /><strong>Không thể tải công việc</strong><small>{loadError}</small><button onClick={() => void load()}><RotateCcw size={13} /> Thử lại</button></div> : ordered.length === 0 ? <div className="task-empty"><Check size={18} /><strong>Chưa có công việc</strong><small>Thêm công việc để theo dõi tiến độ học tập.</small><button onClick={openCreate}><Plus size={13} /> Thêm công việc</button></div> : (
          <div className={`task-list-container ${ordered.length > 4 ? 'has-scroll' : ''}`}>
            <div className="task-list">
              {ordered.map((task) => {
                const overdue = task.status !== 'completed' && task.deadline < today
                return <article key={task.id} className={`${task.status === 'completed' ? 'completed' : ''} ${overdue ? 'overdue' : ''}`}>
                  <button className="task-check" disabled={updatingIds.has(task.id)} aria-label={task.status === 'completed' ? 'Mở lại công việc' : 'Đánh dấu hoàn thành'} onClick={() => void toggle(task)}>{updatingIds.has(task.id) ? <RotateCcw className="spin" size={13} /> : task.status === 'completed' ? <Check size={13} /> : <Circle size={13} />}</button>
                  <div><strong>{task.title}</strong><small><span>{task.subject}</span><span><Clock3 size={10} /> {task.estimated_hours} giờ</span></small><small className="task-deadline">{overdue && <AlertTriangle size={10} />} {overdue ? 'Quá hạn · ' : ''}{new Date(`${task.deadline}T12:00`).toLocaleDateString('vi-VN')} · <em className={`priority priority-${task.priority}`}>{task.priority === 1 ? 'Cao' : task.priority === 2 ? 'Vừa' : 'Thấp'}</em></small></div>
                  <span className="task-actions"><button disabled={updatingIds.has(task.id)} aria-label="Chỉnh sửa công việc" title="Chỉnh sửa" onClick={() => openEdit(task)}><Pencil size={12} /></button><button disabled={updatingIds.has(task.id)} aria-label="Xóa công việc" title="Xóa" onClick={() => setDeleteTarget(task)}><Trash2 size={12} /></button></span>
                </article>
              })}
            </div>
          </div>
        )}
      </>}
      <Dialog open={Boolean(deleteTarget)} title="Xóa công việc?" description={deleteTarget ? `Công việc “${deleteTarget.title}” sẽ bị xóa khỏi danh sách.` : undefined} destructive confirmLabel="Xóa công việc" busy={busy} onClose={() => !busy && setDeleteTarget(null)} onConfirm={remove} />
    </section>
  )
}
