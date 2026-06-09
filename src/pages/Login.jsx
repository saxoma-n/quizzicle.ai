import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const { user, loginWithPassword, register, loginWithGoogle } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [tab, setTab]         = useState('signin')
  const [email, setEmail]     = useState('')
  const [password, setPass]   = useState('')
  const [username, setUser]   = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const [googleClientId, setGoogleClientId] = useState(null)
  const googleBtnRef = useRef(null)
  const gisReady     = useRef(false)

  // Redirect if already logged in — validate next to prevent open redirect
  useEffect(() => {
    if (!user) return
    const raw = searchParams.get('next') || '/'
    const safe = (raw === '/' || /^\/[^/]/.test(raw)) ? raw : '/'
    navigate(safe, { replace: true })
  }, [user, navigate, searchParams])

  // Fetch Google Client ID once
  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(d => setGoogleClientId(d.googleClientId || ''))
      .catch(() => setGoogleClientId(''))
  }, [])

  const handleCredentialResponse = useCallback(async (response) => {
    await loginWithGoogle({ credential: response.credential })
  }, [loginWithGoogle])

  // Init GIS once client ID and button container are ready
  useEffect(() => {
    if (!googleClientId || gisReady.current) return

    const init = () => {
      gisReady.current = true
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleCredentialResponse,
        auto_select: false,
      })
      if (googleBtnRef.current) {
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: 'outline', size: 'large', shape: 'pill', width: 280, text: 'continue_with',
        })
        window.google.accounts.id.prompt()
      }
    }

    if (window.google?.accounts?.id) {
      init()
    } else {
      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.onload = init
      document.head.appendChild(script)
    }
  }, [googleClientId, handleCredentialResponse])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    let result
    if (tab === 'signin') {
      result = await loginWithPassword(email, password)
    } else {
      result = await register(email, username, password)
    }
    setLoading(false)
    if (result?.error) setError(result.error)
  }

  const switchTab = (t) => { setTab(t); setError('') }

  return (
    <div className="login-page">
      <div className="login-card">
        <Link to="/" className="login-logo">quizzicle<span>.ai</span></Link>
        <p className="login-tagline">AI Math Problem Extractor</p>

        <div className="tabs">
          <button className={`tab${tab === 'signin' ? ' active' : ''}`} onClick={() => switchTab('signin')}>Sign in</button>
          <button className={`tab${tab === 'register' ? ' active' : ''}`} onClick={() => switchTab('register')}>Create account</button>
        </div>

        <form className="form-body" onSubmit={handleSubmit} noValidate>
          {tab === 'register' && (
            <div className="field">
              <label htmlFor="reg-username">Username</label>
              <input id="reg-username" type="text" autoComplete="username" value={username} onChange={e => setUser(e.target.value)} required />
              <span className="hint">2–30 characters</span>
            </div>
          )}
          <div className="field">
            <label htmlFor="login-email">Email</label>
            <input id="login-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="login-password">Password</label>
            <input id="login-password" type="password" autoComplete={tab === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={e => setPass(e.target.value)} required />
            {tab === 'register' && <span className="hint">At least 8 characters</span>}
          </div>
          {error && <div className="form-error">{error}</div>}
          <button type="submit" className="login-submit-btn" disabled={loading}>
            {loading ? (tab === 'signin' ? 'Signing in…' : 'Creating account…') : (tab === 'signin' ? 'Sign In →' : 'Create Account →')}
          </button>
        </form>

        <div className="or-divider">or</div>

        <div className="google-area">
          {googleClientId === null && <p className="google-loading">Loading Google Sign-In…</p>}
          {googleClientId === '' && null}
          <div ref={googleBtnRef} id="g_id_signin_login" />
        </div>
      </div>

      <footer className="login-footer">&copy; 2026 quizzicle.ai</footer>
    </div>
  )
}
