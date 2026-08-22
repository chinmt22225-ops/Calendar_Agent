import type { Session, User } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

type AuthContextValue = {
  session: Session | null
  user: User | null
  loading: boolean
  configured: boolean
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)
const returnPathKey = 'planora:oauth-return-path'

function safeReturnPath(value: string | null) {
  return value === '/calendar' || value === '/chat' ? value : '/chat'
}

function completeOAuthNavigation(nextSession: Session | null) {
  if (!nextSession) return
  const hasAuthFragment = /(?:^|[&#])(access_token|refresh_token|expires_at|provider_token)=/.test(window.location.hash)
  const hasAuthQuery = new URLSearchParams(window.location.search).has('code')
  const storedPath = window.sessionStorage.getItem(returnPathKey)
  if (!hasAuthFragment && !hasAuthQuery && !storedPath) return
  window.sessionStorage.removeItem(returnPathKey)
  const target = safeReturnPath(storedPath)
  window.history.replaceState({}, document.title, target)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      completeOAuthNavigation(data.session)
      setSession(data.session)
      setLoading(false)
    }).catch(() => { if (active) { setSession(null); setLoading(false) } })
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      completeOAuthNavigation(nextSession)
      setSession(nextSession)
      setLoading(false)
    })
    return () => { active = false; data.subscription.unsubscribe() }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      configured: isSupabaseConfigured,
      signInWithGoogle: async () => {
        window.sessionStorage.setItem(returnPathKey, safeReturnPath(window.location.pathname))
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: window.location.origin },
        })
        if (error) throw error
      },
      signOut: async () => {
        const { error } = await supabase.auth.signOut()
        if (error) throw error
      },
    }),
    [loading, session],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
