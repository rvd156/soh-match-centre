'use client'

function countForTeam(events, team, type) {
  if (type === 'wide' || type === 'free') {
    const prefix = type === 'wide' ? 'Wide for ' : 'Free awarded to '
    return events.filter(event =>
      event.event_type === 'manual_update' &&
      event.notes?.trim() === `${prefix}${team.name}`
    ).length
  }
  return events.filter(event =>
    String(event.team_id) === String(team.id) && event.event_type === type
  ).length
}

export default function MatchStats({ events = [], home, away }) {
  if (!home || !away) return null
  const rows = [
    ['Frees awarded', 'free'],
    ['Wides', 'wide'],
    ['Yellow cards', 'yellow_card'],
    ['Black cards', 'black_card'],
    ['Red cards', 'red_card']
  ]
  const values = rows.map(([label, type]) => ({
    label,
    home: countForTeam(events, home, type),
    away: countForTeam(events, away, type)
  }))
  if (!values.some(row => row.home || row.away)) return null

  return (
    <section style={{ margin: '18px auto', maxWidth: '720px', padding: '16px', border: '1px solid #1c4932', borderRadius: '14px', background: '#0d281c' }}>
      <h2 style={{ margin: '0 0 12px', color: '#f4c430', textAlign: 'center', fontSize: '18px' }}>MATCH STATS</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(65px,1fr) minmax(120px,2fr) minmax(65px,1fr)', gap: '8px', textAlign: 'center', alignItems: 'center' }}>
        <strong>{home.name}</strong><span></span><strong>{away.name}</strong>
        {values.map(row => (
          <div key={row.label} style={{ display: 'contents' }}>
            <strong>{row.home}</strong><span style={{ color: '#b9c7be' }}>{row.label}</span><strong>{row.away}</strong>
          </div>
        ))}
      </div>
    </section>
  )
}
