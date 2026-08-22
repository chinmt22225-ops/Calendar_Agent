import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as profileApi from '../api/profile'
import type { ProfileUpdate, UserProfile } from '../types/profile'
import { useAuth } from './AuthContext'
import { useToast } from './ToastContext'

type ProfileContextValue = {
  profile: UserProfile | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  saveProfile: (changes: ProfileUpdate) => Promise<UserProfile>
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const notify = useToast()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const loadSequence = useRef(0)
  const load = useCallback(async () => {
    if (!user) { setProfile(null); setError(null); setLoading(false); return }
    const sequence = ++loadSequence.current
    setLoading(true)
    setError(null)
    try {
      const nextProfile = await profileApi.fetchProfile()
      if (sequence === loadSequence.current) setProfile(nextProfile)
    }
    catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Không thể tải cài đặt hồ sơ.'
      if (sequence === loadSequence.current) { setError(message); notify(message) }
    }
    finally { if (sequence === loadSequence.current) setLoading(false) }
  }, [notify, user])
  useEffect(() => { void load() }, [load])
  const value = useMemo(() => ({
    profile,
    loading,
    error,
    refresh: load,
    saveProfile: async (changes: ProfileUpdate) => {
      const updated = await profileApi.updateProfile(changes)
      setProfile(updated)
      setError(null)
      return updated
    },
  }), [error, load, loading, profile])
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfile() {
  const value = useContext(ProfileContext)
  if (!value) throw new Error('useProfile must be used inside ProfileProvider')
  return value
}
