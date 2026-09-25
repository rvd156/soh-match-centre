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

const scoringTypes = ['goal', 'point', 'two_pointer']

function longestScorelessSpell(events, team, match, milestones = []) {
  if (!match || !['full_time', 'after_extra_time'].includes(match.status)) return null

  const halfLengthSeconds = Number(match.half_length || 30) * 60
  const extraHalfLengthSeconds = 10 * 60
  const statusTimes = new Map(
    milestones.map(item => [item.status, Date.parse(item.created_at)])
  )
  const secondHalfStartedAt = statusTimes.get('second_half') || Infinity
  const extraTimeStartedAt = statusTimes.get('extra_time') || Infinity
  const extraSecondHalfStartedAt = statusTimes.get('extra_time_second_half') || Infinity
  const scoringEvents = events.filter(event => scoringTypes.includes(event.event_type))

  function phaseFor(event) {
    const createdAt = Date.parse(event.created_at)
    if (createdAt >= extraSecondHalfStartedAt) return 'extra_second'
    if (createdAt >= extraTimeStartedAt) return 'extra_first'
    if (createdAt >= secondHalfStartedAt) return 'second'
    return 'first'
  }

  const firstHalfScoreTimes = scoringEvents
    .filter(event => phaseFor(event) === 'first')
    .map(event => Number(event.clock_seconds) || 0)
  const extraFirstHalfScoreTimes = scoringEvents
    .filter(event => phaseFor(event) === 'extra_first')
    .map(event => Number(event.clock_seconds) || 0)
  const firstHalfDuration = Math.max(halfLengthSeconds, ...firstHalfScoreTimes)
  const regularEnd = firstHalfDuration + Math.max(
    0,
    Number(match.clock_seconds || halfLengthSeconds) - halfLengthSeconds
  )
  const extraFirstHalfDuration = Math.max(extraHalfLengthSeconds, ...extraFirstHalfScoreTimes)
  const matchEnd = match.status === 'after_extra_time'
    ? regularEnd + extraFirstHalfDuration + Math.max(
      0,
      Number(match.extra_time_seconds || extraHalfLengthSeconds) - extraHalfLengthSeconds
    )
    : regularEnd

  const teamScoreTimes = scoringEvents
    .filter(event => String(event.team_id) === String(team.id))
    .map(event => {
      const clock = Number(event.clock_seconds) || 0
      const phase = phaseFor(event)
      if (phase === 'second') {
        return firstHalfDuration + Math.max(0, clock - halfLengthSeconds)
      }
      if (phase === 'extra_first') return regularEnd + clock
      if (phase === 'extra_second') {
        return regularEnd + extraFirstHalfDuration + Math.max(0, clock - extraHalfLengthSeconds)
      }
      return clock
    })
    .filter(time => time >= 0 && time <= matchEnd)
    .sort((a, b) => a - b)

  const boundaries = [0, ...teamScoreTimes, matchEnd]
  let longestSeconds = 0
  for (let index = 1; index < boundaries.length; index += 1) {
    longestSeconds = Math.max(longestSeconds, boundaries[index] - boundaries[index - 1])
  }

  return Math.max(0, Math.floor(longestSeconds / 60))
}

export default function MatchStats({ events = [], home, away, match = null, milestones = [] }) {
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
  const homeScoreless = longestScorelessSpell(events, home, match, milestones)
  const awayScoreless = longestScorelessSpell(events, away, match, milestones)
  if (homeScoreless !== null && awayScoreless !== null) {
    values.push({
      label: 'Longest scoreless spell',
      home: `${homeScoreless} min`,
      away: `${awayScoreless} min`
    })
  }
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
