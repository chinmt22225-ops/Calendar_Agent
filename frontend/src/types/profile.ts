export type UserProfile = {
  id: string
  display_name: string | null
  timezone: string
  day_start: string
  day_end: string
  pomodoro_minutes: number
  created_at: string
  updated_at: string
}

export type ProfileUpdate = Partial<Pick<UserProfile, 'display_name' | 'timezone' | 'day_start' | 'day_end' | 'pomodoro_minutes'>>
