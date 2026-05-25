import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { useAuth } from './AuthContext'

const AppContext = createContext(null)

function batKey(uid)  { return 'quizzicle_battery_' + (uid || 'guest') }
function histKey(uid) { return 'quizzicle_problems_' + (uid || 'guest') }
function clamp(v)     { return Math.max(0, Math.min(100, v)) }

function readBattery(uid) {
  const v = parseFloat(localStorage.getItem(batKey(uid)))
  return isNaN(v) ? 100 : +clamp(v).toFixed(1)
}

function readHistory(uid) {
  try { return JSON.parse(localStorage.getItem(histKey(uid))) || [] }
  catch { return [] }
}

export function AppProvider({ children }) {
  const { user } = useAuth()
  const userId = user?.id || 'guest'

  const [battery, _setBattery] = useState(() => readBattery(userId))
  const [history, _setHistory] = useState(() => readHistory(userId))

  // Reload from localStorage when the logged-in user changes
  useEffect(() => {
    _setBattery(readBattery(userId))
    _setHistory(readHistory(userId))
  }, [userId])

  const _saveBattery = useCallback((v) => {
    const c = +clamp(v).toFixed(1)
    localStorage.setItem(batKey(userId), c)
    _setBattery(c)
    return c
  }, [userId])

  const deplete  = useCallback(() => _saveBattery(battery - (5 + Math.random() * 2)), [battery, _saveBattery])
  const recharge = useCallback(() => _saveBattery(battery + (10 + Math.random() * 3)), [battery, _saveBattery])

  const pushProblem = useCallback((problem) => {
    _setHistory(prev => {
      const next = [{ problem, ts: Date.now() }, ...prev].slice(0, 30)
      localStorage.setItem(histKey(userId), JSON.stringify(next))
      return next
    })
  }, [userId])

  const clearHistory = useCallback(() => {
    localStorage.removeItem(histKey(userId))
    _setHistory([])
  }, [userId])

  return (
    <AppContext.Provider value={{ battery, history, deplete, recharge, pushProblem, clearHistory }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  return useContext(AppContext)
}
