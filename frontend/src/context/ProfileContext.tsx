import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as profileApi from '../api/profile'
import type { ProfileUpdate, UserProfile } from '../types/profile'
import { useAuth } from './AuthContext'
import { useToast } from './ToastContext'

type ProfileContextValue = {
  profile: UserProfile | null
  loading: boolean
  saveProfile: (changes: ProfileUpdate) => Promise<UserProfile>
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const notify = useToast()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try { setProfile(await profileApi.fetchProfile()) }
    catch (error) { notify(error instanceof Error ? error.message : 'Không thể tải cài đặt hồ sơ.') }
    finally { setLoading(false) }
  }, [notify, user])
  useEffect(() => { void load() }, [load])
  const value = useMemo(() => ({
    profile,
    loading,
    saveProfile: async (changes: ProfileUpdate) => {
      const updated = await profileApi.updateProfile(changes)
      setProfile(updated)
      return updated
    },
  }), [loading, profile])
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfile() {
  const value = useContext(ProfileContext)
  if (!value) throw new Error('useProfile must be used inside ProfileProvider')
  return value
}
