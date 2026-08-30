'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
const emptyTeam = { goals: 0, points: 0 }
const defaultSetup = { opposition: '', oppositionTeamId: '', oppositionCrest: '', competition: '', venue: '', referee: '', date: '', throwIn: '', halfLength: '30', sohSide: 'home' }

function formatDate(value) {
  if (!value) return ''
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('en-IE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  }).format(new Date(year, month - 1, day))
}

export default function Home() {
  const [setup, setSetup] = useState(defaultSetup)
  const [setupComplete, setSetupComplete] = useState(false)
  const [home, setHome] = useState(emptyTeam)
  const [away, setAway] = useState(emptyTeam)
  const [seconds, setSeconds] = useState(0)
  const [extraTimeSeconds, setExtraTimeSeconds] = useState(0)
  const [running, setRunning] = useState(false)
  const [period, setPeriod] = useState('PRE-MATCH')
  const [displayMode, setDisplayMode] = useState(false)
  const [teams, setTeams] = useState([])
const [teamsLoading, setTeamsLoading] = useState(true)
const [teamsError, setTeamsError] = useState('')

const [sohPlayers, setSohPlayers] = useState([])
const [oppositionPlayers, setOppositionPlayers] = useState([])
const [playersLoading, setPlayersLoading] = useState(false)
const [playersError, setPlayersError] = useState('')
const [scorerPicker, setScorerPicker] = useState(null)
const [addingPlayer, setAddingPlayer] = useState(false)
const [newPlayerName, setNewPlayerName] = useState('')
const [newPlayerNumber, setNewPlayerNumber] = useState('')  
const [matchId, setMatchId] = useState(null)
const [existingMatch, setExistingMatch] = useState(null)
const [matchEvents, setMatchEvents] = useState([])
const [showAllEvents, setShowAllEvents] = useState(false)
  
  const intervalRef = useRef(null)

  useEffect(() => {
  async function loadTeams() {
    setTeamsLoading(true)
    setTeamsError('')

    const { data, error } = await supabase
      .from('teams')
      .select('id, name, short_name, crest_url')
      .eq('active', true)
      .neq('id', 1)
      .order('name')

    if (error) {
      console.error('Error loading teams:', error)
      setTeamsError('Could not load teams')
      setTeams([])
    } else {
      setTeams(data || [])
    }

    setTeamsLoading(false)
  }

  loadTeams()
checkForExistingMatch()
}, [])
useEffect(() => {
  async function loadPlayers() {
    if (!setup.oppositionTeamId) {
      setSohPlayers([])
      setOppositionPlayers([])
      return
    }

    setPlayersLoading(true)
    setPlayersError('')

    const { data, error } = await supabase
      .from('players')
      .select('id, team_id, name, jersey_number, position, active')
      .eq('active', true)
      .in('team_id', [1, Number(setup.oppositionTeamId)])
      .order('name')

    if (error) {
      console.error('Error loading players:', error)
      setPlayersError('Could not load players')
      setPlayersLoading(false)
      return
    }

    const players = data ?? []
    
    console.log('PLAYERS FROM SUPABASE:', players)
    console.log('OPPOSITION TEAM ID:', setup.oppositionTeamId)

    setSohPlayers(players.filter(player => Number(player.team_id) === 1))
    setOppositionPlayers(
      players.filter(
        player => Number(player.team_id) === Number(setup.oppositionTeamId)
      )
    )

    setPlayersLoading(false)
  }

  loadPlayers()
}, [setup.oppositionTeamId])

useEffect(() => {
  if (!matchId) {
    setMatchEvents([])
    return
  }

  loadMatchEvents(matchId)
}, [matchId])
  
  useEffect(() => {
    const saved = localStorage.getItem('soh-match-centre-v2-1')
    if (!saved) return
    try {
      const p = JSON.parse(saved)
      setSetup({ ...defaultSetup, ...(p.setup ?? {}) }); setSetupComplete(p.setupComplete ?? false)
      setHome(p.home ?? emptyTeam); setAway(p.away ?? emptyTeam)
      setSeconds(p.seconds ?? 0); setPeriod(p.period ?? 'PRE-MATCH')
    } catch {}
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('soh-match-centre-v2-1', JSON.stringify({ setup, setupComplete, home, away, seconds, period }))
    } catch {
      // A very large uploaded crest can exceed browser storage; the match still works.
    }
  }, [setup, setupComplete, home, away, seconds, period])

  useEffect(() => {
  if (!running) return

  const isExtraTime = period.startsWith('EXTRA TIME')

  const baseSeconds = isExtraTime
    ? extraTimeSeconds
    : seconds

  const startedAt = Date.now()

  const updateClock = () => {
    const elapsed = Math.floor((Date.now() - startedAt) / 1000)

    if (isExtraTime) {
      setExtraTimeSeconds(baseSeconds + elapsed)
    } else {
      setSeconds(baseSeconds + elapsed)
    }
  }

  updateClock()

  intervalRef.current = setInterval(updateClock, 1000)

  return () => clearInterval(intervalRef.current)
}, [running, period])
 useEffect(() => {
  if (!running || !matchId) return

  const isExtraTime = period.startsWith('EXTRA TIME')

  const syncClock = async () => {
    const now = new Date().toISOString()

const update = isExtraTime
  ? {
      extra_time_seconds: extraTimeSeconds,
      extra_time_started_at: now
    }
  : {
      clock_seconds: seconds,
      clock_started_at: now
    }
    const { error } = await supabase
      .from('matches')
      .update(update)
      .eq('id', matchId)

    if (error) {
      console.error('Error syncing match clock:', error)
    }
  }
  if (isExtraTime) {
    if (extraTimeSeconds > 0 && extraTimeSeconds % 10 === 0) {
      syncClock()
    }
  } else {
    if (seconds > 0 && seconds % 10 === 0) {
      syncClock()
    }
  }
}, [seconds, extraTimeSeconds, running, period, matchId])

  const displaySeconds = period.startsWith('EXTRA TIME')
  ? extraTimeSeconds
  : seconds

const clock = useMemo(
  () => `${String(Math.floor(displaySeconds / 60)).padStart(2, '0')}:${String(displaySeconds % 60).padStart(2, '0')}`,
  [displaySeconds]
)
  const total = t => t.goals * 3 + t.points
  const sohIsHome = setup.sohSide === 'home'
  const homeName = sohIsHome ? 'SOH' : (setup.opposition || 'Opposition')
  const awayName = sohIsHome ? (setup.opposition || 'Opposition') : 'SOH'
  const sohCrest = 'https://fmbvqrjkyiuacymhulql.supabase.co/storage/v1/object/public/club-crests/SOH_Logo.png?v=2'
const homeCrest = sohIsHome ? sohCrest : setup.oppositionCrest
const awayCrest = sohIsHome ? setup.oppositionCrest : sohCrest

  function changeScore(side, type, delta) {
  const setter = side === 'home' ? setHome : setAway

  setter(prev => {
    const newValue = Math.max(0, prev[type] + delta)

    if (matchId) {
      const column = `${side}_${type}`

      supabase
        .from('matches')
        .update({ [column]: newValue })
        .eq('id', matchId)
        .then(({ error }) => {
          if (error) {
            console.error('Error updating match score:', error)
          } else {
            console.log('MATCH SCORE UPDATED:', column, newValue)
          }
        })
    }

    return { ...prev, [type]: newValue }
  })
}

  function requestScore(side, type) {
  const isSoh =
    (side === 'home' && setup.sohSide === 'home') ||
    (side === 'away' && setup.sohSide === 'away')

  const players = isSoh ? sohPlayers : oppositionPlayers

  setScorerPicker({
    side,
    type,
    players,
    teamName: side === 'home' ? homeName : awayName
  })
}

  async function addNewPlayer() {
  const name = newPlayerName.trim()

  if (!name || !scorerPicker) return

  const teamId =
    scorerPicker.side === 'home'
      ? (setup.sohSide === 'home' ? 1 : Number(setup.oppositionTeamId))
      : (setup.sohSide === 'away' ? 1 : Number(setup.oppositionTeamId))

  const { data, error } = await supabase
    .from('players')
    .insert({
      name,
      team_id: teamId,
      jersey_number: newPlayerNumber
        ? Number(newPlayerNumber)
        : null
    })
    .select()
    .single()

  if (error) {
    console.error('Error adding player:', error)
    alert('Could not add the player.')
    return
  }

  console.log('NEW PLAYER ADDED:', data)

const { error: eventError } = await supabase
  .from('match_events')
  .insert({
    match_id: matchId,
    team_id: data.team_id,
    player_id: data.id,
    event_type:
      scorerPicker.type === 'goals'
        ? 'goal'
        : scorerPicker.type === 'two_pointer'
          ? 'two_pointer'
          : scorerPicker.type === 'yellow_card'
            ? 'yellow_card'
            : scorerPicker.type === 'red_card'
              ? 'red_card'
              : 'point',
    score_type: 'play',
    match_minute: Math.floor(displaySeconds / 60),
    clock_seconds: displaySeconds
  })

if (eventError) {
  console.error('Error saving new player event:', eventError)
  alert('Player was added, but the match event could not be saved.')
  return
}

    if (
  scorerPicker.type !== 'yellow_card' &&
  scorerPicker.type !== 'red_card'
) {
  changeScore(
    scorerPicker.side,
    scorerPicker.type === 'two_pointer' ? 'points' : scorerPicker.type,
    scorerPicker.type === 'two_pointer' ? 2 : 1
  )
}
    loadMatchEvents(matchId)

if (data.team_id === 1) {
  setSohPlayers(prev => [...prev, data])
} else {
  setOppositionPlayers(prev => [...prev, data])
}

setAddingPlayer(false)
setNewPlayerName('')
setNewPlayerNumber('')
setScorerPicker(null)
}

async function loadMatchEvents(currentMatchId) {
  const { data, error } = await supabase
    .from('match_events')
    .select(`
      id,
      match_id,
      team_id,
      player_id,
      event_type,
      match_minute,
      clock_seconds,
      players (
        name
      )
    `)
    .eq('match_id', currentMatchId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error loading match events:', error)
    return
  }

  setMatchEvents(data || [])
}
  async function removeMatchEvent(event) {
  const eventName =
  event.event_type === 'goal'
    ? 'goal'
    : event.event_type === 'point'
      ? 'point'
      : event.event_type === 'two_pointer'
        ? '2-pointer'
        : event.event_type === 'yellow_card'
          ? 'yellow card'
          : 'red card'

  if (
    !window.confirm(
      `Remove this ${eventName} for ${event.players?.name || 'this player'}?`
    )
  ) {
    return
  }

  const isScoreEvent =
  event.event_type === 'goal' ||
  event.event_type === 'point' ||
  event.event_type === 'two_pointer' 

  const eventSide =
  event.team_id === (setup.sohSide === 'home' ? 1 : Number(setup.oppositionTeamId))
    ? 'home'
    : 'away'  
    
  const { error } = await supabase
    .from('match_events')
    .delete()
    .eq('id', event.id)

  if (error) {
    console.error('Error removing card event:', error)
    alert('Could not remove the card.')
    return
  }
if (isScoreEvent) {
  const scoreType =
    event.event_type === 'goal' ? 'goals' : 'points'

  const scoreAmount =
    event.event_type === 'two_pointer' ? -2 : -1

  changeScore(eventSide, scoreType, scoreAmount)
}
  loadMatchEvents(matchId)
}
  
  async function checkForExistingMatch() {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .eq('active', true)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()

    if (error) {
    console.error('Error checking for existing match:', error)
    return
  }
    console.log('EXISTING ACTIVE MATCH:', data)
setExistingMatch(data)
}
  
  function resumeMatch() {
  if (!existingMatch) return

  const sohSide =
    existingMatch.home_team_id === 1 ? 'home' : 'away'

  const oppositionTeamId =
    sohSide === 'home'
      ? existingMatch.away_team_id
      : existingMatch.home_team_id

  const oppositionTeam = teams.find(
    team => Number(team.id) === Number(oppositionTeamId)
  )

  const periodMap = {
    first_half: 'FIRST HALF',
    half_time: 'HALF TIME',
    second_half: 'SECOND HALF',
    full_time: 'FULL TIME',
    extra_time: 'EXTRA TIME',
    extra_time_half_time: 'ET HALF TIME',
    extra_time_second_half: 'EXTRA TIME 2ND HALF',
    after_extra_time: 'AET'
  }

  const isExtraTime = [
    'extra_time',
    'extra_time_half_time',
    'extra_time_second_half',
    'after_extra_time'
  ].includes(existingMatch.status)

  const startedAt = isExtraTime
    ? existingMatch.extra_time_started_at
    : existingMatch.clock_started_at

  const baseSeconds = isExtraTime
    ? (existingMatch.extra_time_seconds || 0)
    : (existingMatch.clock_seconds || 0)

  let restoredSeconds = baseSeconds

  if (startedAt) {
    const elapsed = Math.max(
      0,
      Math.floor(
        (Date.now() - new Date(startedAt).getTime()) / 1000
      )
    )

    restoredSeconds += elapsed
  }

  setMatchId(existingMatch.id)

  setHome({
    goals: existingMatch.home_goals || 0,
    points: existingMatch.home_points || 0
  })

  setAway({
    goals: existingMatch.away_goals || 0,
    points: existingMatch.away_points || 0
  })

  setSetup(s => ({
    ...s,
    opposition: oppositionTeam?.name || 'Opposition',
    oppositionTeamId,
    oppositionCrest: oppositionTeam?.crest_url || '',
    competition: existingMatch.competition || '',
    venue: existingMatch.venue || '',
    referee: existingMatch.referee || '',
    date: existingMatch.match_date || '',
    throwIn: existingMatch.throw_in?.slice(0, 5) || '',
    halfLength: String(existingMatch.half_length || 30),
    sohSide
  }))

  setPeriod(periodMap[existingMatch.status] || 'PRE-MATCH')

  if (isExtraTime) {
    setExtraTimeSeconds(restoredSeconds)
  } else {
    setSeconds(restoredSeconds)
  }

  setRunning(Boolean(startedAt))
  setDisplayMode(false)
  setSetupComplete(true)
  setExistingMatch(null)
}  
async function resetExistingMatch() {
  if (!existingMatch) return

  if (!window.confirm('Reset this active match and return to match setup?')) {
    return
  }

  const { error } = await supabase
    .from('matches')
    .update({
      active: false,
      clock_started_at: null,
      extra_time_started_at: null
    })
    .eq('id', existingMatch.id)

  if (error) {
    console.error('Error resetting existing match:', error)
    alert('Could not reset the active match.')
    return
  }

  setExistingMatch(null)
}

useEffect(() => {
  if (!existingMatch || teams.length === 0) return

  resumeMatch()
}, [existingMatch, teams])
  
async function startMatch() {
  let currentMatchId = matchId

  if (period === 'PRE-MATCH' && !matchId) {
    if (!setup.date) {
      alert('Please choose a match date before starting the match.')
      return
    }

    if (!setup.throwIn) {
      alert('Please choose a throw-in time before starting the match.')
      return
    }

    const homeTeamId =
      setup.sohSide === 'home' ? 1 : Number(setup.oppositionTeamId)

    const awayTeamId =
      setup.sohSide === 'away' ? 1 : Number(setup.oppositionTeamId)

    // Make sure no previous match is still marked as live
    const { error: deactivateError } = await supabase
      .from('matches')
      .update({ active: false })
      .eq('active', true)

    if (deactivateError) {
      console.error('Error deactivating previous match:', deactivateError)
      alert('Could not clear the previous live match.')
      return
    }

    const { data, error } = await supabase
      .from('matches')
      .insert({
        home_team_id: homeTeamId,
        away_team_id: awayTeamId,
        competition: setup.competition || null,
        venue: setup.venue || null,
        referee: setup.referee || null,
        match_date: setup.date,
        throw_in: setup.throwIn || null,
        half_length: Number(setup.halfLength),
        status: 'first_half',
        active: true,
        home_goals: 0,
        home_points: 0,
        away_goals: 0,
        away_points: 0,
        clock_seconds: 0,
        clock_started_at: new Date().toISOString()
      })
      .select('id')
      .single()

    if (error) {
      console.error('Error creating match:', error)
      alert('Could not create match in database.')
      return
    }

    console.log('MATCH CREATED:', data)

    currentMatchId = data.id
    setMatchId(data.id)
  }

  if (period === 'PRE-MATCH') {
    setPeriod('FIRST HALF')
  }

  // Start/resume the database clock
  if (currentMatchId) {
    const { error } = await supabase
      .from('matches')
      .update({
        clock_started_at: new Date().toISOString()
      })
      .eq('id', currentMatchId)

    if (error) {
      console.error('Error starting match clock:', error)
    }
  }

  // Start the local clock
  setRunning(true)
}
 async function pauseMatch() {
  setRunning(false)

  if (matchId) {
    const { error } = await supabase
      .from('matches')
      .update({
        clock_seconds: seconds,
        clock_started_at: null
      })
      .eq('id', matchId)

    if (error) console.error('Error saving paused match clock:', error)
  }
}
  async function halfTime() {
  setRunning(false)
  setPeriod('HALF TIME')

  if (matchId) {
    const { error } = await supabase
      .from('matches')
 .update({
  status: 'half_time',
  clock_seconds: seconds,
  clock_started_at: null
})
      .eq('id', matchId)

    if (error) console.error('Error updating match status:', error)
  }
}

async function secondHalf() {
  const secondHalfStart = Number(setup.halfLength) * 60

  setSeconds(secondHalfStart)
  setPeriod('SECOND HALF')
  setRunning(true)

 if (matchId) {
    const { error } = await supabase
      .from('matches')
      .update({
        status: 'second_half',
        clock_seconds: secondHalfStart,
        clock_started_at: new Date().toISOString()
      })
      .eq('id', matchId)

    if (error) console.error('Error updating match status:', error)
  }
}

async function fullTime() {
  setRunning(false)
  setPeriod('FULL TIME')

  if (matchId) {
    const { error } = await supabase
      .from('matches')
.update({
  status: 'full_time',
  clock_seconds: seconds,
  clock_started_at: null
})
      .eq('id', matchId)

    if (error) console.error('Error updating match status:', error)
  }
}
  async function startExtraTime() {
  setExtraTimeSeconds(0)
setPeriod('EXTRA TIME')
setRunning(true)

  if (matchId) {
const { data, error } = await supabase
  .from('matches')
  .update({
    status: 'extra_time',
    extra_time_seconds: 0,
    extra_time_started_at: new Date().toISOString()
  })
  .eq('id', matchId)
  .select()
  .single()

console.log('START EXTRA TIME RESULT:', { data, error })

    if (error) {
      console.error('Error starting extra time:', error)
      return
    }
  }

}
  async function extraTimeHalfTime() {
  setRunning(false)
  setPeriod('ET HALF TIME')

  if (matchId) {
    const { error } = await supabase
      .from('matches')
      .update({
        status: 'extra_time_half_time',
        extra_time_seconds: extraTimeSeconds,
        extra_time_started_at: null
      })
      .eq('id', matchId)

    if (error) {
      console.error('Error setting ET half time:', error)
    }
  }
}

async function secondHalfExtraTime() {
  const secondExtraTimeStart = 10 * 60

  setExtraTimeSeconds(secondExtraTimeStart)
  setPeriod('EXTRA TIME 2ND HALF')
  setRunning(true)

  if (matchId) {
    const { error } = await supabase
      .from('matches')
      .update({
        status: 'extra_time_second_half',
        extra_time_seconds: secondExtraTimeStart,
        extra_time_started_at: new Date().toISOString()
      })
      .eq('id', matchId)

    if (error) {
      console.error('Error starting ET second half:', error)
    }
  }
}

async function extraTimeFullTime() {
  setRunning(false)
  setPeriod('AET')

  if (matchId) {
    const { error } = await supabase
      .from('matches')
      .update({
  status: 'after_extra_time',
  extra_time_seconds: extraTimeSeconds,
  extra_time_started_at: null
})
      .eq('id', matchId)

    if (error) {
      console.error('Error ending extra time:', error)
    }
  }
}
  async function publishUpcomingFixture() {
  if (!setup.opposition.trim() || !setup.date || !setup.throwIn) {
    alert('Please enter the opposition, date and throw-in time.')
    return
  }
const { error: deactivateError } = await supabase
  .from('upcoming_fixtures')
  .update({ active: false })
  .eq('active', true)

if (deactivateError) {
  console.error('Error deactivating previous fixture:', deactivateError)
  alert(`Could not update previous fixture: ${deactivateError.message}`)
  return
}
    
  const { error } = await supabase
    .from('upcoming_fixtures')
    .insert({
      opposition: setup.opposition,
      opposition_team_id: setup.oppositionTeamId || null,
      competition: setup.competition || null,
      venue: setup.venue || null,
      referee: setup.referee || null,
      match_date: setup.date,
      throw_in: setup.throwIn,
      soh_side: setup.sohSide,
      opposition_crest: setup.oppositionCrest || null
    })

  if (error) {
    console.error('Error publishing upcoming fixture:', error)
   alert(`Could not publish fixture: ${error.message}`)
    return
  }

  alert('Upcoming fixture published!')
}
  async function resetMatch(){
  if(!window.confirm('Reset this match and return to match setup?')) return

  if (matchId) {
    const { data, error } = await supabase
  .from('matches')
  .update({
  active: false,
  clock_started_at: null
})
  .eq('id', matchId)
  .select()

console.log('RESET MATCH ID:', matchId)
console.log('RESET RESULT:', data, error)

    if (error) {
      console.error('Error resetting match:', error)
      alert(`Could not reset match: ${error.message}`)
      return
    }
  }

  setHome(emptyTeam)
  setAway(emptyTeam)
  setSeconds(0)
  setRunning(false)
  setPeriod('PRE-MATCH')
  setSetupComplete(false)
  setDisplayMode(false)
  setMatchId(null)
}

 if (!setupComplete) return (
  <Setup
    setup={setup}
    setSetup={setSetup}
    teams={teams}
    teamsLoading={teamsLoading}
    teamsError={teamsError}
    existingMatch={existingMatch}
    onResumeMatch={resumeMatch}
    onResetExistingMatch={resetExistingMatch}
    onStart={() => setup.opposition.trim() && setSetupComplete(true)}
    onPublishFixture={publishUpcomingFixture}
  />
)
  return <main className={displayMode ? 'display-page' : ''}>
    <section className="scoreboard-card">
      <div className="topbar">
        <img className="crest-small" src="/soh-crest.png" alt="SOH crest" />
        <div className="match-status"><strong>{period}</strong><span>{setup.competition || 'SOH MATCH CENTRE'}</span></div>
        <div className="clock">{clock}</div>
      </div>
      {(setup.venue || setup.date || setup.throwIn) && <div className="match-meta">{[setup.venue, formatDate(setup.date), setup.throwIn && `${setup.throwIn} throw-in`].filter(Boolean).join(' • ')}</div>}
      <div className="teams">
        <TeamPanel name={homeName} team={home} total={total(home)} crest={homeCrest} />
        <div className="divider">V</div>
        <TeamPanel name={awayName} team={away} total={total(away)} crest={awayCrest} />
      </div>
      {!displayMode && <>
        <div className="admin-grid">
          <ScoreControls
  label={homeName}
  onChange={(t, d) => d > 0 ? requestScore('home', t) : changeScore('home', t, d)}
/>

<ScoreControls
  label={awayName}
  onChange={(t, d) => d > 0 ? requestScore('away', t) : changeScore('away', t, d)}
/>
        </div>

        <div className="match-controls">

  {period === 'PRE-MATCH' && (
    <button onClick={startMatch} className="primary">
      Start Match
    </button>
  )}

  {(period === 'FIRST HALF' || period === 'SECOND HALF' || period === 'EXTRA TIME' || period === 'EXTRA TIME 2ND HALF') && (
    <>
      <button onClick={startMatch} className="primary">
        {running ? 'Running' : 'Resume'}
      </button>

      <button onClick={pauseMatch}>
        Pause
      </button>
    </>
  )}

  {period === 'FIRST HALF' && (
    <button onClick={halfTime}>
      Half Time
    </button>
  )}

  {period === 'HALF TIME' && (
    <button onClick={secondHalf} className="primary">
      Start 2nd Half
    </button>
  )}

  {period === 'SECOND HALF' && (
    <button onClick={fullTime}>
      Full Time
    </button>
  )}

  {period === 'FULL TIME' && (
    <button onClick={startExtraTime} className="primary">
      Start Extra Time
    </button>
  )}

  {period === 'EXTRA TIME' && (
    <button onClick={extraTimeHalfTime}>
      ET Half Time
    </button>
  )}

  {period === 'ET HALF TIME' && (
    <button onClick={secondHalfExtraTime} className="primary">
      Start ET 2nd Half
    </button>
  )}

  {period === 'EXTRA TIME 2ND HALF' && (
    <button onClick={extraTimeFullTime}>
      ET Full Time
    </button>
  )}

  <button onClick={resetMatch} className="danger">
    Reset
  </button>

</div>
{matchEvents.length > 0 && (
  <div className="control-card">
    <h3>Recent Events</h3>

    {matchEvents
      .slice(showAllEvents ? 0 : -4)
      .map(event => (

      <div key={event.id} className="button-row compact">
        <span>
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
            ? 'Goal'
            : event.event_type === 'point'
              ? 'Point'
              : event.event_type === 'two_pointer'
                ? '2PT'
                : event.event_type === 'yellow_card'
                  ? 'Yellow Card'
                  : 'Red Card'}{' '}

          · {event.match_minute}
        </span>

        <button onClick={() => removeMatchEvent(event)}>
          Remove
        </button>
      </div>
        ))}

    {matchEvents.length > 4 && (
      <button
        className="display-toggle"
        onClick={() => setShowAllEvents(v => !v)}
      >
        {showAllEvents ? 'Show Recent Events' : 'View All Events'}
      </button>
    )}
  </div>
)}

</>}

<button
  className="display-toggle"
  onClick={() => setDisplayMode(v => !v)}
>
  {displayMode ? 'Exit Display Mode' : 'Open Display Mode'}
</button>
</section>
  {scorerPicker && (
  <div
  className="scorer-picker"
  style={{
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    background: 'rgba(0, 0, 0, 0.65)',
    padding: '16px'
  }}
>
    <div
  className="scorer-picker-card"
  style={{
    width: '100%',
    maxWidth: '500px',
    maxHeight: '80vh',
    overflowY: 'auto',
    borderRadius: '20px',
    padding: '24px',
    marginBottom: '0'
  }}
>
      <h2>
        {scorerPicker.type === 'goals'
  ? 'Goal Scorer'
  : scorerPicker.type === 'two_pointer'
    ? '2-Point Scorer'
    : scorerPicker.type === 'yellow_card'
      ? 'Yellow Card'
      : scorerPicker.type === 'red_card'
        ? 'Red Card'
        : 'Point Scorer'}
      </h2>

      <p>{scorerPicker.teamName}</p>

      <select
        defaultValue=""
        onChange={async (e) => {
          if (!e.target.value) return
          if (e.target.value === 'add-new-player') {
  setAddingPlayer(true)
  setNewPlayerName('')
  setNewPlayerNumber('')
  return
}

          const player = scorerPicker.players.find(
  p => String(p.id) === String(e.target.value)
)
if (!player) return
          console.log('SCORER:', player)

const { error } = await supabase
  .from('match_events')
  .insert({
    match_id: matchId,
    team_id: player.team_id,
    player_id: player.id,
  event_type:
  scorerPicker.type === 'goals'
    ? 'goal'
    : scorerPicker.type === 'two_pointer'
      ? 'two_pointer'
      : scorerPicker.type === 'yellow_card'
        ? 'yellow_card'
        : scorerPicker.type === 'red_card'
          ? 'red_card'
          : 'point',
score_type: 'play',
   match_minute: Math.floor(displaySeconds / 60),
clock_seconds: displaySeconds
  })

if (error) {
  console.error('Error saving score event:', error)
  alert('Could not save scorer to database.')
  return
}

console.log('SCORE EVENT SAVED')
loadMatchEvents(matchId)
if (
  scorerPicker.type === 'yellow_card' ||
  scorerPicker.type === 'red_card'
) {
  setScorerPicker(null)
  return
}
changeScore(
  scorerPicker.side,
  scorerPicker.type === 'two_pointer' ? 'points' : scorerPicker.type,
  scorerPicker.type === 'two_pointer' ? 2 : 1
)
setScorerPicker(null)
        }}
      >
        <option value="" disabled>Select player</option>

        {scorerPicker.players.map(player => (
          <option key={player.id} value={player.id}>
            {player.jersey_number ? `${player.jersey_number}. ` : ''}
            {player.name}
          </option>
        ))}
<option value="add-new-player">
  ➕ Add New Player
</option>
      </select>

  {addingPlayer && (
  <div>
    <input
      type="text"
      placeholder="Player name"
      value={newPlayerName}
      onChange={(e) => setNewPlayerName(e.target.value)}
    />

    <input
      type="number"
      placeholder="Jersey number (optional)"
      value={newPlayerNumber}
      onChange={(e) => setNewPlayerNumber(e.target.value)}
    />

    <button type="button" onClick={addNewPlayer}>
  Add Player
</button>
  </div>
)}

      <button onClick={() => setScorerPicker(null)}>
        Cancel
      </button>
    </div>
  </div>
)}
  </main>
}
function Setup({setup,setSetup,teams,teamsLoading,teamsError,onStart,onPublishFixture,existingMatch,onResumeMatch,onResetExistingMatch}){
  const update = (key,value) => setSetup(s=>({...s,[key]:value}))
  function uploadCrest(event) {
  const file = event.target.files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) return alert('Please choose an image file.')

  const reader = new FileReader()
  reader.onload = () => {
    update('oppositionCrest', reader.result)
  }
  reader.readAsDataURL(file)
}
  if (existingMatch) {
  return (
    <main className="setup-page">
      <section className="setup-card">

        <div className="setup-brand">
          <img src="/soh-crest.png" alt="SOH crest"/>
          <div>
            <p>SEÁN O'HESLIN'S GAA</p>
            <h1>Match Centre</h1>
          </div>
        </div>

        <div className="setup-heading">
          <span>MATCH IN PROGRESS</span>
          <h2>Active Match Found</h2>
          <p>A match is already running and can be resumed.</p>
        </div>

        <button className="start-setup" onClick={onResumeMatch}>
  Resume Match
</button>

    <button
  className="start-setup"
  onClick={onResetExistingMatch}
  style={{ marginTop: '12px', background: '#8b1e1e' }}
>
  Reset Match
</button>

      </section>
    </main>
  )
}
  return <main className="setup-page"><section className="setup-card">
    <div className="setup-brand"><img src="/soh-crest.png" alt="SOH crest"/><div><p>SEÁN O'HESLIN'S GAA</p><h1>Match Centre</h1></div></div>
    <div className="setup-heading"><span>NEW MATCH</span><h2>Match Setup</h2><p>Enter the match details before throw-in.</p></div>
    <div className="team-setup-row">
     <div className="crest-preview-card soh-crest-card"><span>SOH</span><img src="https://fmbvqrjkyiuacymhulql.supabase.co/storage/v1/object/public/club-crests/SOH_Logo.png?v=2"/></div>
      <div className="crest-preview-card"><span>{setup.opposition || 'Opposition'}</span>
        {setup.oppositionCrest ? <img src={setup.oppositionCrest} alt="Opposition crest"/> : <div className="crest-placeholder">?</div>}
        <label className="upload-button">Upload Crest<input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadCrest}/></label>
        {setup.oppositionCrest && <button className="remove-crest" onClick={()=>update('oppositionCrest','')}>Remove</button>}
        <small>Transparent PNG works best.</small>
      </div>
    </div>
    <div className="form-grid">
      <label className="field">
  <span>Opposition *</span>
  <select
    autoFocus
    value={setup.opposition}
onChange={e => {
  const team = teams.find(t => t.name === e.target.value)

  setSetup(s => ({
    ...s,
    opposition: e.target.value,
    oppositionTeamId: team ? team.id : '',
    oppositionCrest: team?.crest_url || ''
  }))
}}
    disabled={teamsLoading}
  >
    <option value="">
      {teamsLoading ? 'Loading teams...' : 'Select opposition'}
    </option>
    {teams.map(team => (
      <option key={team.id} value={team.name}>
        {team.name}
      </option>
    ))}
  </select>
  {teamsError && <small>{teamsError}</small>}
</label>
      <label className="field"><span>Competition</span><input placeholder="e.g. Senior Championship" value={setup.competition} onChange={e=>update('competition',e.target.value)}/></label>
      <label className="field full"><span>Venue</span><input placeholder="e.g. Pairc Sheáin Uí Eislin" value={setup.venue} onChange={e=>update('venue',e.target.value)}/></label>
    <label className="field full">
  <span>Referee</span>
  <input
    placeholder="Optional"
    value={setup.referee}
    onChange={e=>update('referee',e.target.value)}
  />
</label>  
    <label className="field"><span>Date</span><input type="date" value={setup.date} onChange={e=>update('date',e.target.value)}/>{setup.date && <small className="date-preview">{formatDate(setup.date)}</small>}</label>
      <label className="field"><span>Throw-in</span><input type="time" value={setup.throwIn} onChange={e=>update('throwIn',e.target.value)}/></label>
      <label className="field"><span>Half Length</span><select value={setup.halfLength} onChange={e=>update('halfLength',e.target.value)}><option value="30">30 minutes</option><option value="35">35 minutes</option><option value="20">20 minutes</option></select></label>
      <div className="field"><span>SOH Playing</span><div className="side-picker"><button className={setup.sohSide==='home'?'selected':''} onClick={()=>update('sohSide','home')}>Home</button><button className={setup.sohSide==='away'?'selected':''} onClick={()=>update('sohSide','away')}>Away</button></div></div>
    </div>
    <button
  className="start-setup"
  disabled={!setup.opposition.trim() || !setup.date || !setup.throwIn}
  onClick={onPublishFixture}
>
  Publish Upcoming Fixture
</button>
    <button className="start-setup" disabled={!setup.opposition.trim() || !setup.date || !setup.throwIn} onClick={onStart}>Continue to Scoreboard →</button>
  </section></main>
}

function TeamPanel({name,team,total,crest}){return <div className="team-panel">{crest&&<img className="team-crest" src={crest} alt={`${name} crest`}/>}<h2>{name}</h2><div className="gaa-score">{team.goals}-{String(team.points).padStart(2,'0')}</div><div className="points-total">{total} pts</div></div>}
function ScoreControls({label,onChange}){
  return (
    <div className="control-card">
      <h3>{label}</h3>

      <div className="button-row">
        <button
          className="score-btn goal"
          onClick={() => onChange('goals', 1)}
        >
          + Goal
        </button>

        <button
          className="score-btn point"
          onClick={() => onChange('points', 1)}
        >
          + Point
        </button>

        <button
          className="score-btn point"
          onClick={() => onChange('two_pointer', 1)}
        >
          + 2 PT
        </button>
      </div>

    <div className="button-row compact">
  <button onClick={() => onChange('yellow_card', 1)}>
    🟨 Yellow Card
  </button>

  <button onClick={() => onChange('red_card', 1)}>
    🟥 Red Card
  </button>
</div>
    </div>
  )
}
