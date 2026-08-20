import type { ProfileUpdate, UserProfile } from '../types/profile'
import { api } from './client'

export async function fetchProfile() {
  const { data } = await api.get<UserProfile>('/profile')
  return data
}

export async function updateProfile(changes: ProfileUpdate) {
  const { data } = await api.patch<UserProfile>('/profile', changes)
  return data
}
