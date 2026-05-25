import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useApp } from '../contexts/AppContext'
import BatteryWidget from './BatteryWidget'

function avatarColor(id) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h)
  return `hsl(${Math.abs(h) % 360}, 55%, 45%)`
}

function initials(name) {
  const parts = (name || '?').trim().split(/\s+/)
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase()
}

export default function Nav({ links = [] }) {
  const { user, signOut } = useAuth()
  const { battery } = useApp()

  return (
    <nav>
      <Link to="/" className="logo">quizzicle<span>.ai</span></Link>
      <div className="nav-right">
        {links.map(({ to, label, className = 'nav-link' }) => (
          <Link key={to} to={to} className={className}>{label}</Link>
        ))}
        {user ? (
          <div className="nav-user">
            <Link to="/account" className="nav-user-link">
              {user.picture
                ? <img className="nav-avatar" src={user.picture} alt="" referrerPolicy="no-referrer" />
                : <span className="nav-avatar-initials" style={{ background: avatarColor(user.id) }}>{initials(user.name)}</span>
              }
              <span className="nav-username">{user.name.split(' ')[0]}</span>
            </Link>
            <button className="nav-signout" onClick={signOut}>Sign out</button>
          </div>
        ) : (
          <Link to="/login" className="nav-btn">Sign In</Link>
        )}
        <BatteryWidget level={battery} />
      </div>
    </nav>
  )
}
