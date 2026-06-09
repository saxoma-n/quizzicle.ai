import { createContext, useContext, useState, useCallback, useEffect } from 'react'

const AuthContext = createContext(null)
const USER_KEY = 'quizzicle_user'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem(USER_KEY)) } catch { return null }
  })

  // Verify session on mount — if server says no session, clear local state
  useEffect(() => {
    const stored = localStorage.getItem(USER_KEY)
    if (!stored) return
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => { if (!r.ok) { localStorage.removeItem(USER_KEY); setUser(null) } })
      .catch(() => {})
  }, [])

  const _save = useCallback((u) => {
    if (u) {
      localStorage.setItem(USER_KEY, JSON.stringify(u))
    } else {
      localStorage.removeItem(USER_KEY)
    }
    setUser(u)
  }, [])

  const loginWithPassword = useCallback(async (email, password) => {
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const d = await r.json()
      if (!r.ok) return { error: d.error }
      _save(d.user)
      return {}
    } catch { return { error: 'Network error. Please try again.' } }
  }, [_save])

  const register = useCallback(async (email, username, password) => {
    try {
      const r = await fetch('/api/auth/register', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, username, password }),
      })
      const d = await r.json()
      if (!r.ok) return { error: d.error }
      _save(d.user)
      return {}
    } catch { return { error: 'Network error. Please try again.' } }
  }, [_save])

  const updateUsername = useCallback(async (username) => {
    try {
      const r = await fetch('/api/auth/update-username', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      })
      const d = await r.json()
      if (!r.ok) return { error: d.error }
      const updated = { ...user, name: d.user.name }
      _save(updated)
      return { user: updated }
    } catch { return { error: 'Network error. Please try again.' } }
  }, [_save, user])

  const loginWithGoogle = useCallback(async ({ credential }) => {
    try {
      const r = await fetch('/api/auth/google', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential }),
      })
      if (!r.ok) return
      const d = await r.json()
      _save(d.user)
    } catch {}
  }, [_save])

  const signOut = useCallback(async () => {
    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }) } catch {}
    try { window.google?.accounts?.id?.disableAutoSelect() } catch {}
    _save(null)
  }, [_save])

  return (
    <AuthContext.Provider value={{ user, loginWithPassword, register, updateUsername, loginWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
