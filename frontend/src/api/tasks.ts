import type { StudyTask, StudyTaskDraft } from '../types/task'
import { api } from './client'

export async function fetchTasks() {
  const { data } = await api.get<StudyTask[]>('/tasks')
  return data
}

export async function createTask(task: StudyTaskDraft) {
  const { data } = await api.post<StudyTask>('/tasks', task)
  return data
}

export async function updateTask(id: string, changes: Partial<StudyTaskDraft>) {
  const { data } = await api.patch<StudyTask>(`/tasks/${id}`, changes)
  return data
}

export async function deleteTask(id: string) {
  await api.delete(`/tasks/${id}`)
}
