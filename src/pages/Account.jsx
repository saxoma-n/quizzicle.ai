import { useState } from 'react'
import Nav from '../components/Nav'
import { useAuth } from '../contexts/AuthContext'
import { useApp } from '../contexts/AppContext'
import { batColor } from '../components/BatteryWidget'

function avatarColor(id) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h)
  return `hsl(${Math.abs(h) % 360}, 55%, 45%)`
}

function initials(name) {
  const parts = (name || '?').trim().split(/\s+/)
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase()
}

export default function Account() {
  const { user, updateUsername, signOut } = useAuth()
  const { battery, history } = useApp()

  const [editing, setEditing]   = useState(false)
  const [nameInput, setName]    = useState('')
  const [saving, setSaving]     = useState(false)
  const [editError, setEditErr] = useState('')

  if (!user) return null

  const openEdit   = () => { setName(user.name); setEditErr(''); setEditing(true) }
  const cancelEdit = () => { setEditing(false); setEditErr('') }

  const saveUsername = async () => {
    if (!nameInput.trim()) return
    setSaving(true); setEditErr('')
    const res = await updateUsername(nameInput.trim())
    setSaving(false)
    if (res?.error) { setEditErr(res.error) }
    else { setEditing(false) }
  }

  const batC = batColor(battery)

  return (
    <>
      <Nav links={[
        { to: '/training', label: 'Training' },
        { to: '/analyzer', label: 'Analyzer' },
      ]} />

      <main className="account-main">
        <div className="account-page">

          {/* Profile */}
          <div className="acc-card">
            <div className="acc-card-title">Profile</div>
            <div className="profile-top">
              {user.picture ? (
                <img className="profile-avatar" src={user.picture} alt="" referrerPolicy="no-referrer" />
              ) : (
                <div className="profile-avatar-initials" style={{ background: avatarColor(user.id) }}>
                  {initials(user.name)}
                </div>
              )}
              <div className="profile-info">
                <div className="profile-name">{user.name}</div>
                <div className="profile-email">{user.email}</div>
                <span className="provider-badge">
                  {user.provider === 'google' ? 'Google account' : 'Email account'}
                </span>
              </div>
            </div>

            {editing ? (
              <>
                <div className="edit-row">
                  <label>New username</label>
                  <input
                    className="edit-input"
                    value={nameInput}
                    onChange={e => setName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveUsername(); if (e.key === 'Escape') cancelEdit() }}
                    autoFocus
                    maxLength={30}
                  />
                  <button className="save-btn" onClick={saveUsername} disabled={saving || !nameInput.trim()}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button className="cancel-btn" onClick={cancelEdit}>Cancel</button>
                </div>
                {editError && <div className="edit-error">{editError}</div>}
              </>
            ) : (
              <button className="edit-open-btn" onClick={openEdit}>Change username</button>
            )}
          </div>

          {/* Stats */}
          <div className="acc-card">
            <div className="acc-card-title">Stats</div>
            <div className="stats-row">
              <div className="stat">
                <div className="stat-value" style={{ color: batC }}>{Math.round(battery)}%</div>
                <div className="stat-label">Battery</div>
              </div>
              <div className="stat">
                <div className="stat-value" style={{ color: 'var(--navy)' }}>{history.length}</div>
                <div className="stat-label">Problems Analyzed</div>
              </div>
            </div>
          </div>

          {/* Sign out */}
          <div className="acc-card">
            <div className="acc-card-title">Session</div>
            <button className="signout-btn" onClick={signOut}>Sign Out</button>
          </div>

        </div>
      </main>
    </>
  )
}
