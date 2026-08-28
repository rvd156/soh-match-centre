'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function LiveMatchPage() {
  const [match, setMatch] = useState(null)
  const [homeTeam, setHomeTeam] = useState(null)
  const [awayTeam, setAwayTeam] = useState(null)
  const [loading, setLoading] = useState(true)
  const [liveSeconds, setLiveSeconds] = useState(0)
  const [upcomingFixture, setUpcomingFixture] = useState(null)
  const [matchEvents, setMatchEvents] = useState([])
  const [showGoalCelebration, setShowGoalCelebration] = useState(false)

async function loadMatchEvents(matchId) {
  if (!matchId) {
    setMatchEvents([])
    return
  }

  const { data, error } = await supabase
    .from('match_events')
    .select(`
      *,
      players (
        id,
        name,
        jersey_number
      )
    `)
    .eq('match_id', matchId)
    .in('event_type', ['goal', 'point', 'two_pointer', 'yellow_card', 'red_card'])
    .order('clock_seconds', { ascending: true })

  if (error) {
    console.error('Error loading match events:', error)
    return
  }

  setMatchEvents(data || [])
}
  
  async function loadUpcomingFixture() {
  const { data, error } = await supabase
  .from('upcoming_fixtures')
  .select('*')
  .eq('active', true)
  .order('match_date', { ascending: true })
  .order('throw_in', { ascending: true })
  .limit(1)
  .maybeSingle()

  if (error) {
    console.error('Error loading upcoming fixture:', error)
    return
  }

  console.log('UPCOMING FIXTURE:', data)
  setUpcomingFixture(data)
}
  
  async function loadLatestMatch() {
    const { data: matchData, error: matchError } = await supabase
  .from('matches')
  .select('*')
  .eq('active', true)
  .order('id', { ascending: false })
  .limit(1)
  .maybeSingle()

    if (matchError) {
      console.error('Error loading live match:', matchError)
      setLoading(false)
      return
    }

    if (!matchData) {
  setMatch(null)
  setHomeTeam(null)
  setAwayTeam(null)
  setMatchEvents([])
  setLoading(false)
  return
}
    
    const { data: teams, error: teamsError } = await supabase
      .from('teams')
      .select('*')
      .in('id', [matchData.home_team_id, matchData.away_team_id])

    if (teamsError) {
      console.error('Error loading teams:', teamsError)
      setLoading(false)
      return
    }

    setMatch(matchData)
setHomeTeam(teams.find(team => team.id === matchData.home_team_id))
setAwayTeam(teams.find(team => team.id === matchData.away_team_id))
loadMatchEvents(matchData.id)
setLoading(false)
  }

  useEffect(() => {
  loadLatestMatch()
  loadUpcomingFixture()
}, [])
  useEffect(() => {
  const channel = supabase
    .channel('upcoming-fixture-changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'upcoming_fixtures'
      },
      payload => {
  loadUpcomingFixture()
}
    )
.subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}, [])
  useEffect(() => {
  if (match?.id) return

  const checkForMatch = setInterval(() => {
    loadLatestMatch()
  }, 5000)

  return () => clearInterval(checkForMatch)
}, [match?.id])
  useEffect(() => {
  if (!match?.id) return

  const channel = supabase
    .channel(`live-match-${match.id}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'matches',
        filter: `id=eq.${match.id}`
      },
      payload => {
  console.log('LIVE MATCH UPDATE:', payload.new)

  if (payload.new.active === false) {
    setMatch(null)
    setHomeTeam(null)
    setAwayTeam(null)
    loadUpcomingFixture()
    return
  }

  setMatch(payload.new)
}
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}, [match?.id])
  useEffect(() => {
  if (!match?.id) return

  const eventsChannel = supabase
    .channel(`match-events-${match.id}`)
    .on(
      'postgres_changes',
      {
  event: '*',
  schema: 'public',
  table: 'match_events'
},
      (payload) => {
  loadMatchEvents(match.id)

  if (
    payload.eventType === 'INSERT' &&
    payload.new?.event_type === 'goal'
  ) {
    setShowGoalCelebration(true)

    setTimeout(() => {
      setShowGoalCelebration(false)
    }, 3000)
  }
}
    )
    .subscribe(status => {
  console.log('MATCH EVENTS REALTIME:', status)
})

  return () => {
    supabase.removeChannel(eventsChannel)
  }
}, [match?.id])
  useEffect(() => {
  if (!match) return

 const updateLiveClock = () => {
  const isExtraTime = [
  'extra_time',
  'extra_time_half_time',
  'extra_time_second_half',
  'after_extra_time'
].includes(match.status)

  const baseSeconds = isExtraTime
    ? (match.extra_time_seconds || 0)
    : (match.clock_seconds || 0)

  const clockStartedAt = isExtraTime
    ? match.extra_time_started_at
    : match.clock_started_at

  if (!clockStartedAt) {
    setLiveSeconds(baseSeconds)
    return
  }

  const startedAt = new Date(clockStartedAt).getTime()

  const elapsed = Math.max(
    0,
    Math.floor((Date.now() - startedAt) / 1000)
  )

  setLiveSeconds(baseSeconds + elapsed)
}
  updateLiveClock()

  const interval = setInterval(updateLiveClock, 1000)

  return () => clearInterval(interval)
}, [
  match?.status,
  match?.clock_seconds,
  match?.clock_started_at,
  match?.extra_time_seconds,
  match?.extra_time_started_at
])

  function formatClock(seconds = 0) {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

function formatStatus(status = '') {
  const labels = {
    first_half: 'FIRST HALF',
    half_time: 'HALF TIME',
    second_half: 'SECOND HALF',
    full_time: 'FULL TIME',
    extra_time: 'EXTRA TIME - 1ST HALF',
    extra_time_half_time: 'ET HALF TIME',
    extra_time_second_half: 'EXTRA TIME - 2ND HALF',
    after_extra_time: 'AET'
  }

  return labels[status] || status.replaceAll('_', ' ').toUpperCase()
}

  if (loading) {
    return (
      <main style={styles.page}>
        <div style={styles.message}>Loading Match Centre...</div>
      </main>
    )
  }

  if (!match) {
  return (
    <main style={styles.page}>
      <div style={styles.container}>

        <header style={styles.header}>
          <img
            src="/soh-crest.png"
            alt="SOH crest"
            style={styles.mainCrest}
          />

          <div>
            <div style={styles.club}>SEÁN O'HESLIN'S</div>
            <h1 style={styles.title}>MATCH CENTRE</h1>
          </div>
        </header>

      {upcomingFixture ? (
  <>
    <div style={styles.upcomingBar}>
      UPCOMING FIXTURE
    </div>


{upcomingFixture.competition && (
  <div style={styles.upcomingCompetition}>
    {upcomingFixture.competition}
  </div>
)}

<div style={styles.upcomingTeams}>
      
  <div style={styles.upcomingTeam}>
    <img
      src={
        upcomingFixture.soh_side === 'home'
          ? 'https://fmbvqrjkyiuacymhulql.supabase.co/storage/v1/object/public/club-crests/SOH_Logo.png?v=2'
          : upcomingFixture.opposition_crest
      }
      alt="Home team crest"
      style={styles.upcomingCrest}
    />

    <div style={styles.upcomingTeamName}>
      {upcomingFixture.soh_side === 'home'
        ? 'Ballinamore SOH'
        : upcomingFixture.opposition}
    </div>
  </div>

  <div style={styles.upcomingVs}>VS</div>

  <div style={styles.upcomingTeam}>
    <img
      src={
        upcomingFixture.soh_side === 'away'
          ? 'https://fmbvqrjkyiuacymhulql.supabase.co/storage/v1/object/public/club-crests/SOH_Logo.png?v=2'
          : upcomingFixture.opposition_crest
      }
      alt="Away team crest"
      style={styles.upcomingCrest}
    />

    <div style={styles.upcomingTeamName}>
      {upcomingFixture.soh_side === 'away'
        ? 'Ballinamore SOH'
        : upcomingFixture.opposition}
    </div>
  </div>

</div>
<div style={styles.upcomingDetails}>
  <div style={styles.upcomingDate}>
    {new Date(`${upcomingFixture.match_date}T12:00:00`).toLocaleDateString('en-IE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })}
  </div>

  <div style={styles.upcomingTime}>
    Throw-in: {upcomingFixture.throw_in?.slice(0, 5)}
  </div>
    {upcomingFixture.venue && (
  <div style={styles.upcomingMeta}>
    📍 {upcomingFixture.venue}
  </div>
)}

{upcomingFixture.referee && (
  <div style={styles.upcomingMeta}>
    Referee: {upcomingFixture.referee}
  </div>
)}
</div>
</>
) : (
  <div style={styles.message}>No match available.</div>
)}

      </div>
    </main>
  )
}

  const homeTotal = match.home_goals * 3 + match.home_points
  const awayTotal = match.away_goals * 3 + match.away_points

const scoringEventTypes = ['goal', 'point', 'two_pointer']

const homeEvents = matchEvents.filter(
  event =>
    event.team_id === match.home_team_id &&
    scoringEventTypes.includes(event.event_type)
)

const awayEvents = matchEvents.filter(
  event =>
    event.team_id === match.away_team_id &&
    scoringEventTypes.includes(event.event_type)
)

const matchFinished =
  match.status === 'full_time' ||
  match.status === 'after_extra_time'

const sohIsHome = match.home_team_id === 1

const sohWon =
  matchFinished &&
  (
    (sohIsHome && homeTotal > awayTotal) ||
    (!sohIsHome && awayTotal > homeTotal)
  )

  return (
    <main style={styles.page}>
    <style>{`
  @keyframes livePulse {
    0% {
      transform: scale(1);
      opacity: 1;
      box-shadow: 0 0 0 0 rgba(255, 59, 48, 0.7);
    }
    70% {
      transform: scale(1.15);
      opacity: 0.8;
      box-shadow: 0 0 0 8px rgba(255, 59, 48, 0);
    }
    100% {
      transform: scale(1);
      opacity: 1;
      box-shadow: 0 0 0 0 rgba(255, 59, 48, 0);
    }
  }

  .live-pulse {
    animation: livePulse 1.5s infinite;
  }
`}</style>
      <div style={styles.container}>

        <header style={styles.header}>
          <img
            src="/soh-crest.png"
            alt="SOH crest"
            style={styles.mainCrest}
          />

          <div>
            <div style={styles.club}>SEÁN O'HESLIN'S</div>
            <h1 style={styles.title}>MATCH CENTRE</h1>
          </div>
        </header>

        <div style={styles.liveBar}>
         <span className="live-pulse" style={styles.liveDot}></span>
          {match.status === 'full_time'
  ? 'FULL TIME'
  : match.status === 'after_extra_time'
    ? 'FULL TIME - AET'
    : 'LIVE'}
        </div>

        <div style={styles.matchInfo}>
          {match.competition && (
            <div style={styles.competition}>{match.competition}</div>
          )}

          <div style={styles.status}>
            {formatStatus(match.status)}
          </div>

          <div style={styles.clock}>
            {formatClock(liveSeconds)}
          </div>
        </div>

        <section style={styles.scoreboard}>

          <div style={styles.team}>
            {homeTeam?.crest_url && (
              <img
                src={homeTeam.crest_url}
                alt=""
                style={styles.crest}
              />
            )}

            <div style={styles.teamName}>
              {homeTeam?.name || 'Home'}
            </div>

            <div style={styles.score}>
              {match.home_goals}-{String(match.home_points).padStart(2, '0')}
            </div>

            <div style={styles.points}>
              {homeTotal} pts
            </div>
          </div>

          <div style={styles.versus}>V</div>

          <div style={styles.team}>
            {awayTeam?.crest_url && (
              <img
                src={awayTeam.crest_url}
                alt=""
                style={styles.crest}
              />
            )}

            <div style={styles.teamName}>
              {awayTeam?.name || 'Away'}
            </div>

            <div style={styles.score}>
              {match.away_goals}-{String(match.away_points).padStart(2, '0')}
            </div>

            <div style={styles.points}>
              {awayTotal} pts
            </div>
          </div>

        </section>
{showGoalCelebration && (
  <>
    <style>{`
      @keyframes goalFlash {
        0%, 100% {
          opacity: 1;
          transform: scale(1);
        }
        50% {
          opacity: 0.25;
          transform: scale(1.08);
        }
      }
    `}</style>

    <div style={styles.goalCelebration}>
      <div
        style={{
          ...styles.goalCelebrationText,
          animation: 'goalFlash 0.7s ease-in-out infinite'
        }}
      >
        🥅 GOOOOOOOOAL! 🥅
      </div>
    </div>
  </>
)}
{sohWon && (
  <div style={styles.winBanner}>
    BALLINAMORE SOH WIN
  </div>
)}

{matchEvents.length > 0 && (
  <section style={styles.scorers}>
    <div style={styles.scorerColumn}>
      <div style={styles.scorersTeamName}>
  {homeTeam?.name || 'Home'}
</div>

      <div style={styles.scorersTitle}>SCORERS</div>

      {homeEvents.map(event => (
        <div key={event.id} style={styles.scorerRow}>
          {event.players?.name || 'Unknown Player'}
          {' '}
          {event.event_type === 'goal'
            ? '1-00'
            : event.event_type === 'two_pointer'
              ? '2PT'
              : '0-01'}
          {' · '}
          {event.match_minute}'
        </div>
      ))}
    </div>

    <div style={styles.scorerColumn}>
      <div style={styles.scorersTeamName}>
        {awayTeam?.name || 'Away'}
      </div>

      <div style={styles.scorersTitle}>SCORERS</div>

      {awayEvents.map(event => (
        <div key={event.id} style={styles.scorerRow}>
          {event.players?.name || 'Unknown Player'}
          {' '}
          {event.event_type === 'goal'
            ? '1-00'
            : event.event_type === 'two_pointer'
              ? '2PT'
              : '0-01'}
          {' · '}
          {event.match_minute}'
        </div>
      ))}
    </div>
  </section>
)}
  {matchEvents.some(event =>
  event.event_type === 'yellow_card' ||
  event.event_type === 'red_card'
) && (
  <section style={styles.scorersSection}>
    <div style={{ width: '100%' }}>
      <div style={styles.scorersTitle}>MATCH EVENTS</div>

      {matchEvents
       .filter(event =>
  event.event_type === 'goal' ||
  event.event_type === 'point' ||
  event.event_type === 'two_pointer' ||
  event.event_type === 'yellow_card' ||
  event.event_type === 'red_card'
)
        .map(event => (
          <div key={event.id} style={styles.scorerRow}>
  {event.match_minute}'{' '}

  {event.event_type === 'goal'
    ? '🥅'
    : event.event_type === 'point'
      ? '⚪'
      : event.event_type === 'two_pointer'
        ? '🟧'
        : event.event_type === 'yellow_card'
          ? '🟨'
          : '🟥'}{' '}

  {event.players?.name || 'Unknown Player'} ·{' '}

  {event.event_type === 'goal'
   ? <span style={styles.goalEvent}>GOAL</span>
    : event.event_type === 'point'
      ? 'Point'
      : event.event_type === 'two_pointer'
        ? '2PT'
        : event.event_type === 'yellow_card'
          ? 'Yellow Card'
          : 'Red Card'}
</div>
        ))}
    </div>
  </section>
)}
        <footer style={styles.footer}>
          {match.venue && <span>{match.venue}</span>}
          {match.match_date && <span>{match.match_date}</span>}
        </footer>

      </div>
    </main>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#071a12',
    color: '#ffffff',
    fontFamily: 'Arial, sans-serif',
    padding: '24px 16px'
  },

  container: {
    width: '100%',
    maxWidth: '900px',
    margin: '0 auto'
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    marginBottom: '28px'
  },

  mainCrest: {
    width: '72px',
    height: '72px',
    objectFit: 'contain'
  },

  club: {
    color: '#f4c430',
    fontWeight: '800',
    letterSpacing: '2px',
    fontSize: '14px'
  },

  title: {
    margin: '3px 0 0',
    fontSize: '28px',
    fontWeight: '900'
  },

  liveBar: {
    width: 'fit-content',
    margin: '0 auto 24px',
    padding: '8px 16px',
    borderRadius: '999px',
    background: '#123524',
    color: '#f4c430',
    fontWeight: '900',
    letterSpacing: '1px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },

  upcomingBar: {
  width: 'fit-content',
  margin: '0 auto 24px',
  padding: '8px 18px',
  borderRadius: '999px',
  background: '#123524',
  color: '#f4c430',
  fontWeight: '900',
  letterSpacing: '1.5px',
  fontSize: '13px'
},

  upcomingCompetition: {
  textAlign: 'center',
  color: '#ffffff',
  fontSize: '20px',
  fontWeight: '800',
  marginBottom: '20px',
  letterSpacing: '0.5px'
},
  
  upcomingTeams: {
  display: 'grid',
  gridTemplateColumns: '1fr auto 1fr',
  alignItems: 'center',
  gap: '20px',
  background: '#0d2419',
  border: '1px solid #1c4932',
  borderRadius: '24px',
  padding: '36px 20px',
  marginBottom: '24px'
},

upcomingTeam: {
  textAlign: 'center',
  minWidth: 0
},

upcomingCrest: {
  width: '110px',
  height: '110px',
  objectFit: 'contain',
  marginBottom: '16px'
},

upcomingTeamName: {
  fontSize: 'clamp(18px, 4vw, 28px)',
  fontWeight: '800',
  minHeight: '60px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
},

upcomingVs: {
  color: '#f4c430',
  fontWeight: '900',
  fontSize: '22px',
  letterSpacing: '1px'
},

  upcomingDetails: {
  textAlign: 'center',
  marginTop: '24px'
},

upcomingDate: {
  color: '#ffffff',
  fontSize: '22px',
  fontWeight: '800',
  marginBottom: '8px'
},

upcomingTime: {
  color: '#f4c430',
  fontSize: '18px',
  fontWeight: '800'
},

  upcomingMeta: {
  color: '#aebdb4',
  fontSize: '16px',
  fontWeight: '600',
  marginTop: '10px'
},
  
  liveDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#ff3b30'
  },

  matchInfo: {
    textAlign: 'center',
    marginBottom: '32px'
  },

  competition: {
    color: '#f4c430',
    fontWeight: '700',
    marginBottom: '8px'
  },

  status: {
    fontSize: '18px',
    fontWeight: '800',
    letterSpacing: '2px',
    opacity: 0.8
  },

  clock: {
    fontSize: '42px',
    fontWeight: '900',
    marginTop: '5px'
  },

  scoreboard: {
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr',
    alignItems: 'center',
    gap: '16px',
    background: '#0d2419',
    border: '1px solid #1c4932',
    borderRadius: '24px',
    padding: '36px 20px'
  },

  team: {
    textAlign: 'center',
    minWidth: 0
  },

  crest: {
    width: '85px',
    height: '85px',
    objectFit: 'contain',
    marginBottom: '14px'
  },

  teamName: {
    fontSize: 'clamp(18px, 4vw, 28px)',
    fontWeight: '800',
    minHeight: '60px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },

  score: {
    fontSize: 'clamp(44px, 11vw, 86px)',
    lineHeight: 1,
    fontWeight: '900',
    marginTop: '16px',
    whiteSpace: 'nowrap'
  },

  points: {
    marginTop: '10px',
    color: '#f4c430',
    fontWeight: '800'
  },

  versus: {
    color: '#f4c430',
    fontWeight: '900',
    fontSize: '20px'
  },

  winBanner: {
  margin: '24px auto 0',
  width: 'fit-content',
  padding: '12px 24px',
  borderRadius: '999px',
  background: '#f4c430',
  color: '#071a12',
  fontSize: '20px',
  fontWeight: '900',
  letterSpacing: '1px',
  textAlign: 'center'
},

 scorers: {
  marginTop: '24px',
  background: '#0d2419',
  border: '1px solid #1c4932',
  borderRadius: '18px',
  padding: '20px',
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '24px'
},

scorerColumn: {
  minWidth: 0,
  textAlign: 'center'
},

scorersTeamName: {
  fontSize: '16px',
  fontWeight: '800',
  marginBottom: '4px'
},

scorersTitle: {
  color: '#f4c430',
  fontSize: '14px',
  fontWeight: '900',
  letterSpacing: '1.5px',
  marginBottom: '14px',
  textAlign: 'center'
},

scorerRow: {
  padding: '10px 0',
  borderBottom: '1px solid #1c4932',
  textAlign: 'center',
  fontSize: '16px',
  fontWeight: '600'
},

goalEvent: {
  fontSize: '20px',
  fontWeight: '900',
  letterSpacing: '2px'
},

  goalCelebration: {
  position: 'fixed',
  inset: 0,
  zIndex: 9999,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0, 0, 0, 0.88)'
},

goalCelebrationText: {
  fontSize: 'clamp(32px, 8vw, 140px)',
  fontWeight: '900',
  letterSpacing: '2px',
  textAlign: 'center',
  padding: '20px',
  maxWidth: '100%',
  boxSizing: 'border-box'
  whiteSpace: 'nowrap'
},

  footer: {
    marginTop: '24px',
    display: 'flex',
    justifyContent: 'center',
    gap: '20px',
    flexWrap: 'wrap',
    color: '#aebdb4',
    fontSize: '14px'
  },

  message: {
    textAlign: 'center',
    paddingTop: '100px',
    color: '#f4c430',
    fontSize: '20px',
    fontWeight: '700'
  }
}
