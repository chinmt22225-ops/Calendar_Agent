import { Check, Circle, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import * as tasksApi from '../../api/tasks'
import { useToast } from '../../context/ToastContext'
import type { StudyTask, StudyTaskDraft } from '../../types/task'

const emptyDraft = (): StudyTaskDraft => ({ title: '', subject: 'Học tập', estimated_hours: 1, deadline: new Date().toISOString().slice(0, 10), priority: 2, status: 'pending' })

export function TaskPanel() {
  const notify = useToast()
  const [tasks, setTasks] = useState<StudyTask[]>([])
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<StudyTaskDraft>(emptyDraft())
  const load = async () => { try { setTasks(await tasksApi.fetchTasks()) } catch (e) { notify(e instanceof Error ? e.message : 'Không thể tải Tasks.') } }
  useEffect(() => { void load() }, [])
  const create = async () => {
    if (!draft.title.trim()) return
    try { const task = await tasksApi.createTask(draft); setTasks((items) => [...items, task].sort((a, b) => a.deadline.localeCompare(b.deadline))); setDraft(emptyDraft()); setAdding(false) }
    catch (e) { notify(e instanceof Error ? e.message : 'Không thể tạo Task.') }
  }
  const toggle = async (task: StudyTask) => {
    try { const updated = await tasksApi.updateTask(task.id, { status: task.status === 'completed' ? 'pending' : 'completed' }); setTasks((items) => items.map((item) => item.id === task.id ? updated : item)) }
    catch (e) { notify(e instanceof Error ? e.message : 'Không thể cập nhật Task.') }
  }
  const remove = async (id: string) => { try { await tasksApi.deleteTask(id); setTasks((items) => items.filter((item) => item.id !== id)) } catch (e) { notify(e instanceof Error ? e.message : 'Không thể xóa Task.') } }
  return (
    <section className="task-panel">
      <div className="sidebar-section-title"><h3>Tasks</h3><button onClick={() => setAdding((value) => !value)} title="Thêm Task"><Plus size={15} /></button></div>
      {adding && <div className="task-form"><input autoFocus placeholder="Tên nhiệm vụ" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /><input placeholder="Môn học" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} /><div><input type="date" value={draft.deadline} onChange={(e) => setDraft({ ...draft, deadline: e.target.value })} /><button onClick={() => void create()}><Check size={14} /></button></div></div>}
      <div className="task-list">{tasks.length === 0 && <small>Chưa có nhiệm vụ học tập.</small>}{tasks.slice(0, 8).map((task) => <div key={task.id} className={task.status === 'completed' ? 'completed' : ''}><button className="task-check" onClick={() => void toggle(task)}>{task.status === 'completed' ? <Check size={13} /> : <Circle size={13} />}</button><span><strong>{task.title}</strong><small>{task.subject} · {new Date(`${task.deadline}T12:00`).toLocaleDateString('vi-VN')}</small></span><button className="task-delete" onClick={() => void remove(task.id)}><Trash2 size={13} /></button></div>)}</div>
    </section>
  )
}
