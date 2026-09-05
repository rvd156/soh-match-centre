'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
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
const [manualUpdateOpen, setManualUpdateOpen] = useState(false)
const [manualUpdateText, setManualUpdateText] = useState('')
const [matchSummary, setMatchSummary] = useState('')
const [savingMatchSummary, setSavingMatchSummary] = useState(false)  
const [upcomingFixture, setUpcomingFixture] = useState(null)
const [sendingScoreUpdate, setSendingScoreUpdate] = useState(false)
const [showFloatingScore, setShowFloatingScore] = useState(false)
const [floatingScoreTop, setFloatingScoreTop] = useState(0)
const controllerScoreRef = useRef(null)
  
  const intervalRef = useRef(null)

  useEffect(() => {
  const handlePageShow = () => {
    if (!matchId) {
      setSetupComplete(false)
    }
  }

  window.addEventListener('pageshow', handlePageShow)

  return () => {
    window.removeEventListener('pageshow', handlePageShow)
  }
}, [matchId])

  useEffect(() => {
  const measureControlHeader = () => {
    const header = document.getElementById('control-panel-header')

    if (header) {
      setFloatingScoreTop(header.getBoundingClientRect().bottom)
    }
  }

  measureControlHeader()
  window.addEventListener('resize', measureControlHeader)
  window.addEventListener('pageshow', measureControlHeader)

  return () => {
    window.removeEventListener('resize', measureControlHeader)
    window.removeEventListener('pageshow', measureControlHeader)
  }
}, [])

  useEffect(() => {
  if (!matchId) return

  const channel = supabase
    .channel(`admin-match-${matchId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'matches',
        filter: `id=eq.${matchId}`
      },
      payload => {
        const updatedMatch = payload.new
        if (updatedMatch.active === false) {
  setMatchId(null)
  setRunning(false)
  setPeriod('PRE-MATCH')
  setSetupComplete(false)
  setHome(emptyTeam)
  setAway(emptyTeam)
  return
}

        setHome({
          goals: updatedMatch.home_goals || 0,
          points: updatedMatch.home_points || 0
        })

        setAway({
          goals: updatedMatch.away_goals || 0,
          points: updatedMatch.away_points || 0
        })

        setPeriod(
          updatedMatch.status === 'first_half'
            ? 'FIRST HALF'
            : updatedMatch.status === 'half_time'
              ? 'HALF TIME'
              : updatedMatch.status === 'second_half'
                ? 'SECOND HALF'
                : updatedMatch.status === 'full_time'
                  ? 'FULL TIME'
                  : updatedMatch.status === 'extra_time'
                    ? 'EXTRA TIME'
                    : updatedMatch.status === 'extra_time_half_time'
                      ? 'ET HALF TIME'
                      : updatedMatch.status === 'extra_time_second_half'
                        ? 'EXTRA TIME 2ND HALF'
                        : updatedMatch.status === 'after_extra_time'
                          ? 'AET'
                          : 'PRE-MATCH'
        )
if (updatedMatch.status === 'second_half') {
  setSeconds(updatedMatch.clock_seconds || 0)
}
if (
  updatedMatch.status === 'extra_time' ||
  updatedMatch.status === 'extra_time_second_half'
) {
  let syncedExtraTime = updatedMatch.extra_time_seconds || 0

  if (updatedMatch.extra_time_started_at) {
    const elapsed = Math.max(
      0,
      Math.floor(
        (Date.now() - new Date(updatedMatch.extra_time_started_at).getTime()) / 1000
      )
    )

    syncedExtraTime += elapsed
  }

  setExtraTimeSeconds(syncedExtraTime)
}
       const isExtraTimeStatus = [
  'extra_time',
  'extra_time_half_time',
  'extra_time_second_half',
  'after_extra_time'
].includes(updatedMatch.status)

if (isExtraTimeStatus) {
  setRunning(Boolean(updatedMatch.extra_time_started_at))
} else {
  setRunning(Boolean(updatedMatch.clock_started_at))
}
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}, [matchId])

  useEffect(() => {
  if (!matchId) return

  const eventsChannel = supabase
    .channel(`admin-events-${matchId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'match_events'
      },
      payload => {
        if (
          payload.eventType === 'DELETE' ||
          payload.new?.match_id === matchId ||
          payload.old?.match_id === matchId
        ) {
          loadMatchEvents(matchId)
        }
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(eventsChannel)
  }
}, [matchId])

  useEffect(() => {
  if (teams.length === 0) return

  const channel = supabase
    .channel('admin-new-match')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'matches'
      },
      payload => {
        const newMatch = payload.new

        if (newMatch.active === true) {
          resumeMatch(newMatch)
        }
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}, [teams])

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

async function loadUpcomingFixture() {
  const { data, error } = await supabase
    .from('upcoming_fixtures')
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('Error loading upcoming fixture:', error)
    return
  }

  setUpcomingFixture(data || null)
}
    
  loadTeams()
  loadUpcomingFixture()
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
  const scoreArea = controllerScoreRef.current

  if (!setupComplete || !scoreArea) {
    setShowFloatingScore(false)
    return
  }

  const observer = new IntersectionObserver(
    ([entry]) => {
      setShowFloatingScore(!entry.isIntersecting)
    },
    {
      threshold: 0.01,
      rootMargin: '-106px 0px 0px 0px'
    }
  )

  observer.observe(scoreArea)

  return () => observer.disconnect()
}, [setupComplete, matchId])
  
const isExtraTimePeriod = [
  'EXTRA TIME',
  'ET HALF TIME',
  'EXTRA TIME 2ND HALF',
  'AET'
].includes(period)

const displaySeconds = isExtraTimePeriod
  ? extraTimeSeconds
  : seconds

const clock = useMemo(
  () => `${String(Math.floor(displaySeconds / 60)).padStart(2, '0')}:${String(displaySeconds % 60).padStart(2, '0')}`,
  [displaySeconds]
)
  const total = t => t.goals * 3 + t.points
  const sohIsHome = setup.sohSide === 'home'
  const homeName = sohIsHome ? 'Ballinamore SOH' : (setup.opposition || 'Opposition')
  const awayName = sohIsHome ? (setup.opposition || 'Opposition') : 'Ballinamore SOH'
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
  scoreType: ['goals', 'points', 'two_pointer'].includes(type)
  ? 'play'
  : null,
  players,
  teamName: side === 'home' ? homeName : awayName,
  substitutionStep: type === 'substitution' ? 'off' : null,
  playerOff: null
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
if (scorerPicker.type === 'substitution') {

  if (data.team_id === 1) {
    setSohPlayers(prev => [...prev, data])
  } else {
    setOppositionPlayers(prev => [...prev, data])
  }

  if (scorerPicker.substitutionStep === 'off') {
    setScorerPicker({
      ...scorerPicker,
      players: [...scorerPicker.players, data],
      substitutionStep: 'on',
      playerOff: data
    })

    setAddingPlayer(false)
    setNewPlayerName('')
    setNewPlayerNumber('')
    return
  }

  if (scorerPicker.substitutionStep === 'on') {
    const { error: substitutionError } = await supabase
      .from('match_events')
      .insert({
        match_id: matchId,
        team_id: data.team_id,
        player_id: null,
        player_off_id: scorerPicker.playerOff?.id || null,
        player_on_id: data.id,
        event_type: 'substitution',
        score_type: scorerPicker.scoreType || null,
        match_minute: Math.floor(displaySeconds / 60),
        clock_seconds: displaySeconds
      })

    if (substitutionError) {
      console.error('Error saving substitution:', substitutionError)
      alert('Player was added, but the substitution could not be saved.')
      return
    }

    loadMatchEvents(matchId)

    setAddingPlayer(false)
    setNewPlayerName('')
    setNewPlayerNumber('')
    setScorerPicker(null)
    return
  }
}
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
  : scorerPicker.type === 'black_card'
    ? 'black_card'
    : 'point',
    score_type: scorerPicker.scoreType || null,
    match_minute: Math.floor(displaySeconds / 60),
    clock_seconds: displaySeconds
  })

if (eventError) {
  console.error('Error saving new player event:', eventError)
  alert('Player was added, but the match event could not be saved.')
  return
}

   if (
  scorerPicker.type !== 'black_card' &&
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
  player_off_id,
  player_on_id,
  event_type,
  match_minute,
  clock_seconds,
  notes,
  players!match_events_player_id_fkey (
    name
  ),
  player_off:players!match_events_player_off_id_fkey (
    name
  ),
  player_on:players!match_events_player_on_id_fkey (
    name
  ),
  teams (
    name
  )
    `)
    .eq('match_id', currentMatchId)
    .order('created_at', { ascending: false })

  if (error) {
  console.error('Error loading match events:', error)
  alert(`Match events error: ${error.message}`)
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
        : event.event_type === 'black_card'
  ? 'black card'
  : event.event_type === 'yellow_card'
    ? 'yellow card'
    : event.event_type === 'red_card'
      ? 'red card'
            : event.event_type === 'substitution'
              ? 'substitution'
              : 'event'

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
  console.error('Error removing match event:', error)
  alert('Could not remove the match event.')
  return
}

  setMatchEvents(prev =>
  prev.filter(matchEvent => matchEvent.id !== event.id)
)
    
if (isScoreEvent) {
  const scoreType =
    event.event_type === 'goal' ? 'goals' : 'points'

  const scoreAmount =
    event.event_type === 'two_pointer' ? -2 : -1

  changeScore(eventSide, scoreType, scoreAmount)
}
    
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
  
 function resumeMatch(matchToResume = existingMatch) {
  if (!matchToResume) return

  const sohSide =
    matchToResume.home_team_id === 1 ? 'home' : 'away'

  const oppositionTeamId =
    sohSide === 'home'
      ? matchToResume.away_team_id
      : matchToResume.home_team_id

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
  ].includes(matchToResume.status)

  const startedAt = isExtraTime
    ? matchToResume.extra_time_started_at
    : matchToResume.clock_started_at

  let baseSeconds

if (isExtraTime) {
  baseSeconds = matchToResume.extra_time_seconds || 0
} else if (matchToResume.status === 'second_half') {
  const secondHalfStart = Number(matchToResume.half_length || 30) * 60

  baseSeconds = Math.max(
    matchToResume.clock_seconds || 0,
    secondHalfStart
  )
} else {
  baseSeconds = matchToResume.clock_seconds || 0
}

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

  setMatchId(matchToResume.id)
  setMatchSummary(matchToResume.match_summary || '') 

  setHome({
    goals: matchToResume.home_goals || 0,
    points: matchToResume.home_points || 0
  })

  setAway({
    goals: matchToResume.away_goals || 0,
    points: matchToResume.away_points || 0
  })

  setSetup(s => ({
    ...s,
    opposition: oppositionTeam?.name || 'Opposition',
    oppositionTeamId,
    oppositionCrest: oppositionTeam?.crest_url || '',
    competition: matchToResume.competition || '',
    venue: matchToResume.venue || '',
    referee: matchToResume.referee || '',
    date: matchToResume.match_date || '',
    throwIn: matchToResume.throw_in?.slice(0, 5) || '',
    halfLength: String(matchToResume.half_length || 30),
    sohSide
  }))

  setPeriod(periodMap[matchToResume.status] || 'PRE-MATCH')

  if (isExtraTime) {
    setExtraTimeSeconds(restoredSeconds)
  } else {
    setSeconds(restoredSeconds)
  }

  setRunning(Boolean(startedAt))
setDisplayMode(false)
setSetupComplete(true)
setExistingMatch(null)

loadMatchEvents(matchToResume.id)
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

async function saveMatchSummary() {
  if (!matchId || savingMatchSummary) return

  setSavingMatchSummary(true)

  const { error } = await supabase
    .from('matches')
    .update({
      match_summary: matchSummary.trim() || null
    })
    .eq('id', matchId)

  setSavingMatchSummary(false)

  if (error) {
    console.error('Error saving match summary:', error)
    alert(`Could not save match summary: ${error.message}`)
    return
  }

  alert('Match summary saved.')
}
  
function selectMatchUpdatePreset(text) {
  if (!matchId || period === 'PRE-MATCH') {
    alert('This preset is available after the match begins. You can still type and post a pre-match update below.')
    return
  }

  setManualUpdateText(text)
}  
  
async function ensureMatchRecord() {
  if (matchId) return matchId

  if (!setup.date) {
    alert('Please choose a match date first.')
    return null
  }

  if (!setup.throwIn) {
    alert('Please choose a throw-in time first.')
    return null
  }

  const homeTeamId =
    setup.sohSide === 'home' ? 1 : Number(setup.oppositionTeamId)

  const awayTeamId =
    setup.sohSide === 'away' ? 1 : Number(setup.oppositionTeamId)

  const { error: deactivateError } = await supabase
    .from('matches')
    .update({ active: false })
    .eq('active', true)

  if (deactivateError) {
    console.error('Error deactivating previous match:', deactivateError)
    alert('Could not prepare the new match.')
    return null
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
      status: 'pre_match',
      active: true,
      home_goals: 0,
      home_points: 0,
      away_goals: 0,
      away_points: 0,
      clock_seconds: 0,
      clock_started_at: null
    })
    .select('id')
    .single()

  if (error) {
    console.error('Error creating match:', error)
    alert('Could not prepare the match in the database.')
    return null
  }

  setMatchId(data.id)
  return data.id
}

async function startMatch() {
  let currentMatchId = matchId

  if (period === 'PRE-MATCH' && !currentMatchId) {
    currentMatchId = await ensureMatchRecord()
    if (!currentMatchId) return
  }

  if (period === 'PRE-MATCH') {
    setPeriod('FIRST HALF')
  }

  if (currentMatchId) {
    const isExtraTime = period.startsWith('EXTRA TIME')

    const update =
      period === 'PRE-MATCH'
        ? {
            status: 'first_half',
            clock_seconds: 0,
            clock_started_at: new Date().toISOString()
          }
        : isExtraTime
          ? {
              extra_time_started_at: new Date().toISOString()
            }
          : {
              clock_started_at: new Date().toISOString()
            }

    const { error } = await supabase
      .from('matches')
      .update(update)
      .eq('id', currentMatchId)

    if (error) {
      console.error('Error starting match clock:', error)
      alert('Could not start the match clock.')
      return
    }
  }

  setRunning(true)
}
 async function pauseMatch() {
  setRunning(false)

  if (matchId) {
    const isExtraTime = period.startsWith('EXTRA TIME')

    const update = isExtraTime
      ? {
          extra_time_seconds: extraTimeSeconds,
          extra_time_started_at: null
        }
      : {
          clock_seconds: seconds,
          clock_started_at: null
        }

    const { error } = await supabase
      .from('matches')
      .update(update)
      .eq('id', matchId)

    if (error) {
      console.error('Error saving paused match clock:', error)
    }
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
  const publishResult = window.confirm(
  'Publish this result to Previous Results?\n\nSelect Cancel for a test match or if extra time will follow.'
)
  setRunning(false)
  setPeriod('FULL TIME')

  if (matchId) {
    const { error } = await supabase
      .from('matches')
.update({
  status: 'full_time',
  clock_seconds: seconds,
  clock_started_at: null,
  result_published: publishResult
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
  extra_time_started_at: new Date().toISOString(),
  result_published: false
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
  const publishResult = window.confirm(
  'Publish this final extra-time result to Previous Results?\n\nSelect Cancel if this is a test match.'
)
  setRunning(false)
  setPeriod('AET')

  if (matchId) {
    const { error } = await supabase
      .from('matches')
     .update({
  status: 'after_extra_time',
  extra_time_seconds: extraTimeSeconds,
  extra_time_started_at: null,
  result_published: publishResult
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

async function resetUpcomingFixture() {
  if (!upcomingFixture) return

  const { error } = await supabase
    .from('upcoming_fixtures')
    .update({ active: false })
    .eq('id', upcomingFixture.id)

  if (error) {
    console.error('Error resetting upcoming fixture:', error)
    alert(`Could not reset fixture: ${error.message}`)
    return
  }

  setUpcomingFixture(null)

  alert('Upcoming fixture reset.')
}
async function sendScoreUpdate() {
  if (!matchId || sendingScoreUpdate) return

  const confirmed = window.confirm(
    `Send this score update?\n\n` +
    `${homeName} ${home.goals}-${String(home.points).padStart(2, '0')}\n` +
    `${awayName} ${away.goals}-${String(away.points).padStart(2, '0')}`
  )

  if (!confirmed) return

  setSendingScoreUpdate(true)

  try {
    const { error } = await supabase.rpc('request_score_update', {
      p_match_id: matchId
    })

    if (error) {
      console.error('Score update notification failed:', error)
      alert(`Could not send score update: ${error.message}`)
      return
    }

    alert('Score update sent!')
  } finally {
    setSendingScoreUpdate(false)
  }
}

  function postScoreToX() {
  if (!matchId) {
    alert('Start or resume the match before posting a score update.')
    return
  }

  const minute = Math.floor(displaySeconds / 60)

  const phaseLabels = {
  'FIRST HALF': 'FIRST HALF',
  'HALF TIME': 'HALF-TIME',
  'SECOND HALF': 'SECOND HALF',
  'FULL TIME': 'FULL-TIME',
  'EXTRA TIME': 'EXTRA TIME — FIRST HALF',
  'ET HALF TIME': 'EXTRA-TIME HALF-TIME',
  'EXTRA TIME 2ND HALF': 'EXTRA TIME — SECOND HALF',
  'AET': 'FULL-TIME — AFTER EXTRA TIME'
}

const phaseLabel = phaseLabels[period] || 'SCORE UPDATE'

const heading =
  period === 'HALF TIME' ||
  period === 'FULL TIME' ||
  period === 'ET HALF TIME' ||
  period === 'AET'
    ? phaseLabel
    : `${phaseLabel} | ${minute}'`

  const scoreLabels = {
    goal: 'GOAL',
    point: 'POINT',
    two_pointer: 'TWO-POINTER'
  }

  const latestScore = matchEvents.find(event =>
    event.event_type === 'goal' ||
    event.event_type === 'point' ||
    event.event_type === 'two_pointer'
  )

  let latestScoreLine = null

  if (latestScore) {
    const scorer =
      latestScore.players?.name ||
      latestScore.teams?.name ||
      'Team'

    const scoringTeam =
      latestScore.players?.name && latestScore.teams?.name
        ? latestScore.teams.name
        : null

    latestScoreLine = [
      `${scoreLabels[latestScore.event_type]}: ${scorer}`,
      scoringTeam,
      latestScore.match_minute != null
        ? `${latestScore.match_minute}'`
               : null
    ].filter(Boolean).join(' · ')
  }

  const postLines = [
    heading,
    ''
  ]

  if (latestScoreLine) {
    postLines.push(latestScoreLine, '')
  }

  postLines.push(
    `${homeName} ${home.goals}-${String(home.points).padStart(2, '0')}`,
    `${awayName} ${away.goals}-${String(away.points).padStart(2, '0')}`,
    '',
    'Follow live:',
'https://matchcentre.ballinamoreseanoheslinsgaa.com/live',
'',
'@LeitrimGAA'
  )

  const postText = postLines.join('\n')

  const xIntent =
    `https://twitter.com/intent/tweet?text=${encodeURIComponent(postText)}`

  const opened = window.open(xIntent, '_blank', 'noopener,noreferrer')

  if (!opened) {
    window.location.href = xIntent
  }
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
    upcomingFixture={upcomingFixture}
    onResetUpcomingFixture={resetUpcomingFixture}
  />
)
  return <main className={displayMode ? 'display-page' : ''}>

  {!displayMode && showFloatingScore && (
  <div
    style={{
      position: 'fixed',
      top: `${floatingScoreTop}px`,
      zIndex: 1400,
      right: 0,
      width: '100%',
      boxSizing: 'border-box',
      zIndex: 1600,
      display: 'grid',
      gridTemplateColumns: '1fr auto 1fr',
      alignItems: 'center',
      gap: '12px',
      padding: '10px 16px',
      marginBottom: '10px',
      background: '#111a16',
      borderBottom: '1px solid #30493d'
    }}
  >
   <div style={{ textAlign: 'left', fontWeight: 700, fontSize: '14px' }}>
      {homeName}{' '}
      <span style={{ fontSize: '18px' }}>
        {home.goals}-{String(home.points).padStart(2, '0')}
      </span>
    </div>

    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '12px', opacity: 0.7 }}>
        {period}
      </div>
      <div style={{ fontSize: '20px', fontWeight: 800 }}>
        {clock}
      </div>
    </div>

    <div style={{ textAlign: 'right', fontWeight: 700, fontSize: '14px' }}>
      <span style={{ fontSize: '18px' }}>
        {away.goals}-{String(away.points).padStart(2, '0')}
      </span>{' '}
      {awayName}
    </div>
  </div>
)}
      
    <section className="scoreboard-card">
      <div className="topbar">
        <img className="crest-small" src="/soh-crest.png" alt="SOH crest" />
        <div className="match-status"><strong>{period}</strong><span>{setup.competition || 'SOH MATCH CENTRE'}</span></div>
        <div className="clock">{clock}</div>
      </div>
      {(setup.venue || setup.date || setup.throwIn || setup.referee) && (
  <div
  className="match-meta"
  style={{
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: '6px 12px'
  }}
>
  {setup.venue && <span>{setup.venue}</span>}
  {setup.date && <span>{formatDate(setup.date)}</span>}
  {setup.throwIn && <span>{setup.throwIn.slice(0, 5)} throw-in</span>}
  {setup.referee && <span>Referee: {setup.referee}</span>}
</div>
)}
      <div className="teams" ref={controllerScoreRef}>
        <TeamPanel name={homeName} team={home} total={total(home)} crest={homeCrest} />
        <div className="divider">V</div>
        <TeamPanel name={awayName} team={away} total={total(away)} crest={awayCrest} />
      </div>
      {!displayMode && <>
       {matchId && (
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
)}

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

<button
  onClick={sendScoreUpdate}
  disabled={sendingScoreUpdate}
  className="primary"
>
  {sendingScoreUpdate ? 'Sending…' : '📣 Send Score Update'}
</button>

<button
  onClick={postScoreToX}
  disabled={!matchId}
  style={{
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px'
  }}
>
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="currentColor"
  >
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>

  Post Score to X
</button>

<button
  onClick={() => {

    setManualUpdateText('')
    setManualUpdateOpen(true)
  }}
>
  ✍️ Add Match Update
</button>

  <button onClick={resetMatch} className="danger">
    Reset
  </button>

</div>
{(period === 'FULL TIME' || period === 'AET') && (
  <div className="control-card" style={{ marginTop: '16px' }}>
    <h3>Match Summary</h3>

    <p style={{ color: '#b9c7be', lineHeight: 1.5 }}>
      Review and edit this before it appears in the public match report.
    </p>

    <textarea
      value={matchSummary}
      onChange={(event) => setMatchSummary(event.target.value)}
      placeholder="Enter the match summary..."
      rows={7}
      style={{
        width: '100%',
        boxSizing: 'border-box',
        padding: '14px',
        borderRadius: '12px',
        fontSize: '16px',
        lineHeight: 1.5,
        marginBottom: '12px'
      }}
    />

    <button
      type="button"
      className="primary"
      onClick={saveMatchSummary}
      disabled={savingMatchSummary}
    >
      {savingMatchSummary ? 'Saving…' : 'Save Match Summary'}
    </button>
  </div>
)}

{matchEvents.length > 0 && (
{matchEvents.length > 0 && (
  <div className="control-card">
    <h3>Recent Events</h3>

    {matchEvents
      .slice(0, showAllEvents ? undefined : 4)
      .map(event => (

      <div key={event.id} className="button-row compact">
        <span>
  {event.event_type === 'manual_update' ? (
  <>
    ✍️ {event.notes || 'Match update'} · {event.match_minute}
  </>
) : event.event_type === 'substitution' ? (
  <>
      🔄 {event.player_off?.name || 'Unknown'} OFF →{' '}
      {event.player_on?.name || 'Unknown'} ON · {event.match_minute}
    </>
  ) : (
    <>
      {event.event_type === 'goal'
        ? '🥅'
        : event.event_type === 'point'
          ? '⚪'
          : event.event_type === 'two_pointer'
            ? '🟧'
            : event.event_type === 'black_card'
  ? '⬛'
  : event.event_type === 'yellow_card'
    ? '🟨'
    : '🟥'}{' '}

      {event.players?.name || event.teams?.name || 'Team'} ·{' '}

      {event.event_type === 'goal'
        ? 'Goal'
        : event.event_type === 'point'
          ? 'Point'
          : event.event_type === 'two_pointer'
            ? '2PT'
            : event.event_type === 'black_card'
  ? 'Black Card'
  : event.event_type === 'yellow_card'
    ? 'Yellow Card'
    : 'Red Card'}{' '}

      · {event.match_minute}
    </>
  )}
</span>

        <button
  style={{
    width: 'auto',
    padding: '8px 12px',
    fontSize: '14px',
    marginLeft: 'auto'
  }}
  onClick={() => removeMatchEvent(event)}
>
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
  style={{
    display: 'block',
    width: 'auto',
    margin: '16px 0 0 auto',
    padding: '10px 14px',
    fontSize: '14px',
    opacity: 0.8
  }}
  onClick={() => setDisplayMode(v => !v)}
>
  {displayMode ? 'Exit Display Mode' : 'Open Display Mode'}
</button>
</section>
{manualUpdateOpen && (
  <div
    style={{
      position: 'fixed',
      inset: 0,
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0, 0, 0, 0.65)',
      padding: '16px'
    }}
  >
    <div
      style={{
        width: '100%',
        maxWidth: '500px',
        background: '#14231d',
        borderRadius: '20px',
        padding: '24px'
      }}
    >
      <h2>Add Match Update</h2>

<div
  style={{
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '8px',
    marginBottom: '12px'
  }}
>
  <button
    type="button"
    onClick={() => selectMatchUpdatePreset('Injury stoppage')}
  >
    Injury Stoppage
  </button>

  <button
    type="button"
    onClick={() => selectMatchUpdatePreset('Play resumes')}
  >
    Play Resumes
  </button>

  <button
  type="button"
  onClick={() => selectMatchUpdatePreset(`Wide for ${homeName}`)}
>
  Wide - {homeName}
</button>

<button
  type="button"
  onClick={() => selectMatchUpdatePreset(`Wide for ${awayName}`)}
>
  Wide - {awayName}
</button>

<button
  type="button"
  onClick={() => selectMatchUpdatePreset(`Free awarded to ${homeName}`)}
>
  Free - {homeName}
</button>

<button
  type="button"
  onClick={() => selectMatchUpdatePreset(`Free awarded to ${awayName}`)}
>
  Free - {awayName}
</button>
</div>

<textarea
        placeholder="Type match update..."
        value={manualUpdateText}
        onChange={(e) => setManualUpdateText(e.target.value)}
        rows={4}
        style={{
          width: '100%',
          padding: '14px',
          borderRadius: '12px',
          marginBottom: '12px',
          fontSize: '16px'
        }}
      />

        <button
  type="button"
  disabled={!manualUpdateText.trim()}
  onClick={async () => {
    let updateMatchId = matchId

    if (!updateMatchId) {
      updateMatchId = await ensureMatchRecord()
      if (!updateMatchId) return
    }

    const isPreMatch = period === 'PRE-MATCH'

    const { error } = await supabase
      .from('match_events')
      .insert({
        match_id: updateMatchId,
        team_id: null,
        player_id: null,
        event_type: 'manual_update',
        score_type: null,
        match_minute: isPreMatch
          ? null
          : Math.floor(displaySeconds / 60),
        clock_seconds: isPreMatch ? 0 : displaySeconds,
        notes: manualUpdateText.trim()
      })

    if (error) {
      console.error('Error saving match update:', error)
      alert(`Match update error: ${error.message}`)
      return
    }

    loadMatchEvents(updateMatchId)
    setManualUpdateOpen(false)
    setManualUpdateText('')
  }}
>
  Post Update
</button>

      <button
        type="button"
        onClick={() => {
          setManualUpdateOpen(false)
          setManualUpdateText('')
        }}
      >
        Cancel
      </button>
    </div>
  </div>
)}
  {scorerPicker && (
  <div
  className="scorer-picker"
  style={{
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    display: 'flex',
   alignItems: 'center',
justifyContent: 'center',
    background: '#111a16',
    padding: '16px'
  }}
>
    <div
  className="scorer-picker-card"
  style={{
  width: '100%',
  maxWidth: '500px',
  maxHeight: '70vh',
  overflowY: 'auto',
  borderRadius: '20px',
  padding: '24px',
  marginBottom: '0',
 background: '#14231d',
  transform: 'translateY(18vh)'
}}
>
      <h2>
  {scorerPicker.type === 'substitution'
    ? scorerPicker.substitutionStep === 'off'
      ? 'Player Going Off'
      : 'Player Coming On'
    : scorerPicker.type === 'goals'
      ? 'Goal Scorer'
      : scorerPicker.type === 'two_pointer'
        ? '2-Point Scorer'
        : scorerPicker.type === 'yellow_card'
          ? 'Yellow Card'
         : scorerPicker.type === 'red_card'
  ? 'Red Card'
  : scorerPicker.type === 'black_card'
    ? 'Black Card'
    : 'Point Scorer'}
</h2>

      <p>{scorerPicker.teamName}</p>
  {['goals', 'points', 'two_pointer'].includes(scorerPicker.type) && (
  <div style={{ margin: '16px 0 20px' }}>
    <div
      style={{
        marginBottom: '9px',
        color: '#f4c430',
        fontSize: '14px',
        fontWeight: '900'
      }}
    >
      SCORE FROM
    </div>

    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: '8px'
      }}
    >
      {(
        scorerPicker.type === 'goals'
          ? [
              { value: 'play', label: 'From Play' },
              { value: 'penalty', label: 'Penalty' }
            ]
          : scorerPicker.type === 'points'
            ? [
                { value: 'play', label: 'From Play' },
                { value: 'free', label: 'Free' },
                { value: '45', label: '45' },
                { value: 'mark', label: 'Mark' }
              ]
            : [
                { value: 'play', label: 'From Play' },
                { value: 'free', label: 'Free' },
                { value: 'mark', label: 'Mark' }
              ]
      ).map(option => (
        <button
          key={option.value}
          type="button"
          onClick={() =>
            setScorerPicker(current => ({
              ...current,
              scoreType: option.value
            }))
          }
          style={{
            padding: '11px 8px',
            borderRadius: '12px',
            border:
              scorerPicker.scoreType === option.value
                ? '2px solid #f4c430'
                : '1px solid #52645b',
            background:
              scorerPicker.scoreType === option.value
                ? '#20563c'
                : '#10251a',
            color: '#ffffff',
            fontWeight: '800'
          }}
        >
          {scorerPicker.scoreType === option.value ? '✓ ' : ''}
          {option.label}
        </button>
      ))}
    </div>
  </div>
)}
<button
  type="button"
  style={{
    width: '100%',
    marginBottom: '12px',
    background: 'transparent',
    color: '#ffffff',
    border: '1px solid #6b7a73',
    borderRadius: '14px',
    padding: '14px'
  }}
  onClick={async () => {

    if (scorerPicker.type === 'substitution') {

      if (scorerPicker.substitutionStep === 'off') {
        setScorerPicker({
          ...scorerPicker,
          substitutionStep: 'on',
          playerOff: null
        })

        return
      }

      if (scorerPicker.substitutionStep === 'on') {
        const teamId =
          scorerPicker.side === 'home'
            ? (setup.sohSide === 'home' ? 1 : Number(setup.oppositionTeamId))
            : (setup.sohSide === 'away' ? 1 : Number(setup.oppositionTeamId))

        const { error } = await supabase
          .from('match_events')
          .insert({
            match_id: matchId,
            team_id: teamId,
            player_id: null,
            player_off_id: scorerPicker.playerOff?.id || null,
            player_on_id: null,
            event_type: 'substitution',
            score_type: scorerPicker.scoreType || null,
            match_minute: Math.floor(displaySeconds / 60),
            clock_seconds: displaySeconds
          })

        if (error) {
          console.error('Error saving unknown substitution:', error)
          alert('Could not save substitution to database.')
          return
        }

        loadMatchEvents(matchId)
        setScorerPicker(null)
        return
      }

      return
    }

    const { error } = await supabase
      .from('match_events')
      .insert({
        match_id: matchId,
        team_id:
          scorerPicker.side === 'home'
            ? (setup.sohSide === 'home' ? 1 : Number(setup.oppositionTeamId))
            : (setup.sohSide === 'away' ? 1 : Number(setup.oppositionTeamId)),
        player_id: null,
        event_type:
          scorerPicker.type === 'goals'
            ? 'goal'
            : scorerPicker.type === 'two_pointer'
              ? 'two_pointer'
              : scorerPicker.type === 'yellow_card'
                ? 'yellow_card'
                : scorerPicker.type === 'red_card'
  ? 'red_card'
  : scorerPicker.type === 'black_card'
    ? 'black_card'
    : 'point',
        score_type: scorerPicker.scoreType || null,
        match_minute: Math.floor(displaySeconds / 60),
        clock_seconds: displaySeconds
      })

    if (error) {
      console.error('Error saving unknown event:', error)
      alert('Could not save event to database.')
      return
    }

    loadMatchEvents(matchId)

    if (
  scorerPicker.type !== 'black_card' &&
  scorerPicker.type !== 'yellow_card' &&
  scorerPicker.type !== 'red_card'
) {
      changeScore(
        scorerPicker.side,
        scorerPicker.type === 'two_pointer' ? 'points' : scorerPicker.type,
        scorerPicker.type === 'two_pointer' ? 2 : 1
      )
    }

    setScorerPicker(null)
  }}
>
  ? Unknown / Team Only
</button>

<div
  className="player-picker-buttons"
  style={{
    maxHeight: '30vh',
    overflowY: 'auto',
    paddingRight: '4px'
  }}
>

  {scorerPicker.players.map(player => (
    <button
  key={player.id}
  type="button"
  style={{
    background: '#24382f',
    color: '#ffffff',
    border: '1px solid #30493d',
    borderRadius: '14px'
  }}
     onClick={async () => {

  console.log('SCORER:', player)

  if (
    scorerPicker.type === 'substitution' &&
    scorerPicker.substitutionStep === 'off'
  ) {
    setScorerPicker({
      ...scorerPicker,
      substitutionStep: 'on',
      playerOff: player
    })

    return
  }

  if (
  scorerPicker.type === 'substitution' &&
  scorerPicker.substitutionStep === 'on'
) {
  const { error } = await supabase
    .from('match_events')
    .insert({
      match_id: matchId,
      team_id: player.team_id,
      player_id: null,
      player_off_id: scorerPicker.playerOff?.id || null,
      player_on_id: player.id,
      event_type: 'substitution',
      score_type: scorerPicker.scoreType || null,
      match_minute: Math.floor(displaySeconds / 60),
      clock_seconds: displaySeconds
    })

  if (error) {
    console.error('Error saving substitution:', error)
    alert('Could not save substitution to database.')
    return
  }

  console.log('SUBSTITUTION SAVED')

  loadMatchEvents(matchId)
  setScorerPicker(null)
  return
}

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
  : scorerPicker.type === 'black_card'
    ? 'black_card'
    : 'point',
    score_type: scorerPicker.scoreType || null,
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
  scorerPicker.type === 'black_card' ||
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
      {player.jersey_number ? `${player.jersey_number}. ` : ''}
      {player.name}
    </button>
  ))}

 <button
  type="button"
  style={{
    background: 'transparent',
    color: '#ffffff',
    border: '1px solid #3aaa68',
    borderRadius: '14px'
  }}
  onClick={() => {
    setAddingPlayer(true)
    setNewPlayerName('')
    setNewPlayerNumber('')
  }}
>
  ➕ Add New Player
</button>

</div>

  {addingPlayer && (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      marginTop: '12px'
    }}
  >
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

      <button
  style={{
    marginTop: '12px'
  }}
  onClick={() => setScorerPicker(null)}
>
  Cancel
</button>
    </div>
  </div>
)}
  </main>
}
function Setup({
  setup,
  setSetup,
  teams,
  teamsLoading,
  teamsError,
  onStart,
  onPublishFixture,
  existingMatch,
  onResumeMatch,
  onResetExistingMatch,
  onResetUpcomingFixture,
  upcomingFixture
}) {
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

        <button
  className="start-setup"
  onClick={() => onResumeMatch()}
>
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

if (upcomingFixture) {
  return (
    <main className="setup-page">
      <section className="setup-card">

        <div className="setup-brand">
          <img src="/soh-crest.png" alt="SOH crest" />
          <div>
            <p>SEÁN O'HESLIN'S GAA</p>
            <h1>Match Centre</h1>
          </div>
        </div>

        <div className="setup-heading">
          <span>UPCOMING FIXTURE</span>
          <h2>{upcomingFixture.opposition}</h2>
          <p>
            {upcomingFixture.competition || 'Upcoming Match'}
          </p>
        </div>

        <div
          style={{
            textAlign: 'center',
            marginBottom: '20px',
            lineHeight: 1.8
          }}
        >
          {upcomingFixture.match_date && (
            <div>{formatDate(upcomingFixture.match_date)}</div>
          )}

          {upcomingFixture.throw_in && (
            <div>
              Throw-in: {upcomingFixture.throw_in.slice(0, 5)}
            </div>
          )}

          {upcomingFixture.venue && (
            <div>📍 {upcomingFixture.venue}</div>
          )}

          {upcomingFixture.referee && (
            <div>Referee: {upcomingFixture.referee}</div>
          )}
        </div>

        <button
          className="start-setup"
          onClick={() => {
            setSetup(s => ({
              ...s,
              opposition: upcomingFixture.opposition || '',
              oppositionTeamId: upcomingFixture.opposition_team_id || '',
              oppositionCrest: upcomingFixture.opposition_crest || '',
              competition: upcomingFixture.competition || '',
              venue: upcomingFixture.venue || '',
              referee: upcomingFixture.referee || '',
              date: upcomingFixture.match_date || '',
              throwIn: upcomingFixture.throw_in || '',
              sohSide: upcomingFixture.soh_side || 'home'
            }))

            onStart()
          }}
        >
          Continue to Scoreboard →
        </button>
            
<button
  className="start-setup"
  onClick={onResetUpcomingFixture}
  style={{
    marginTop: '12px',
    background: '#8b1e1e'
  }}
>
  Reset Fixture
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

      <div
  className="button-row"
  style={{
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '8px'
  }}
>
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

  <div
  className="button-row compact"
  style={{
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '8px',
    marginTop: '8px'
  }}
>
  <button onClick={() => onChange('black_card', 1)}>
    ⬛ Black Card
  </button>

  <button onClick={() => onChange('yellow_card', 1)}>
    🟨 Yellow Card
  </button>

  <button onClick={() => onChange('red_card', 1)}>
    🟥 Red Card
  </button>

  <button
    style={{ gridColumn: '1 / -1' }}
    onClick={() => onChange('substitution', 1)}
  >
    🔄 Substitution
  </button>
</div>

</div>
  )
}
