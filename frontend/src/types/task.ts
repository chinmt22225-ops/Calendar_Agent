export type StudyTask = {
  id: string
  user_id: string
  title: string
  subject: string
  estimated_hours: number
  deadline: string
  priority: 1 | 2 | 3
  status: 'pending' | 'planned' | 'completed'
  created_at: string
  updated_at: string
}

export type StudyTaskDraft = Omit<StudyTask, 'id' | 'user_id' | 'created_at' | 'updated_at'>
