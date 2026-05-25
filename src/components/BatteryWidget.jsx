export function batColor(l) {
  return l > 60 ? '#22c55e' : l > 30 ? '#f59e0b' : '#ef4444'
}

export default function BatteryWidget({ level }) {
  const c = batColor(level)
  return (
    <div className="bat-widget">
      <div className="bat-outer" style={{ color: c }}>
        <div className="bat-body"><div className="bat-fill" style={{ width: level + '%' }} /></div>
        <div className="bat-nub" />
      </div>
      <span className="bat-pct" style={{ color: c }}>{Math.round(level)}%</span>
    </div>
  )
}
