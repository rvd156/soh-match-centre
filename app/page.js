'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
const emptyTeam = { goals: 0, points: 0 }
const defaultSetup = { opposition: '', oppositionTeamId: '', oppositionCrest: '', competition: '', venue: '', date: '', throwIn: '', halfLength: '30', sohSide: 'home' }

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
const [matchId, setMatchId] = useState(null)
  
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
  const homeCrest = sohIsHome ? '/soh-crest.png' : setup.oppositionCrest
  const awayCrest = sohIsHome ? setup.oppositionCrest : '/soh-crest.png'

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
  async function startMatch() {
  if (period === 'PRE-MATCH' && !matchId) {
    const homeTeamId =
      setup.sohSide === 'home' ? 1 : Number(setup.oppositionTeamId)

    const awayTeamId =
      setup.sohSide === 'away' ? 1 : Number(setup.oppositionTeamId)

    const { data, error } = await supabase
      .from('matches')
      .insert({
        home_team_id: homeTeamId,
        away_team_id: awayTeamId,
        competition: setup.competition || null,
        venue: setup.venue || null,
        match_date: setup.date || null,
        throw_in: setup.throwIn || null,
        half_length: Number(setup.halfLength),
        status: 'first_half',
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
    setMatchId(data.id)
  }

  if (period === 'PRE-MATCH') setPeriod('FIRST HALF')

if (matchId) {
  const { error } = await supabase
    .from('matches')
    .update({
      clock_started_at: new Date().toISOString()
    })
    .eq('id', matchId)

  if (error) console.error('Error resuming match clock:', error)
}

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

  const { error } = await supabase
    .from('upcoming_fixtures')
    .insert({
      opposition: setup.opposition,
      opposition_team_id: setup.oppositionTeamId || null,
      competition: setup.competition || null,
      venue: setup.venue || null,
      match_date: setup.date,
      throw_in: setup.throwIn,
      soh_side: setup.sohSide,
      opposition_crest: setup.oppositionCrest || null
    })

  if (error) {
    console.error('Error publishing upcoming fixture:', error)
    alert('Could not publish fixture.')
    return
  }

  alert('Upcoming fixture published!')
}
  function resetMatch(){
    if(!window.confirm('Reset this match and return to match setup?')) return
    setHome(emptyTeam); setAway(emptyTeam); setSeconds(0); setRunning(false); setPeriod('PRE-MATCH'); setSetupComplete(false); setDisplayMode(false); setMatchId(null)
  }

  if (!setupComplete) return <Setup setup={setup} setSetup={setSetup} teams={teams} teamsLoading={teamsLoading} teamsError={teamsError} onStart={() => setup.opposition.trim() && setSetupComplete(true)} onPublishFixture={publishUpcomingFixture} />
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
          <button onClick={startMatch} className="primary">{running?'Running':period==='PRE-MATCH'?'Start Match':'Resume'}</button>
          <button onClick={pauseMatch}>Pause</button><button onClick={halfTime}>Half Time</button>
          <button onClick={secondHalf}>Start 2nd Half</button>
<button onClick={fullTime}>Full Time</button>
<button onClick={startExtraTime}>Start Extra Time</button>
<button onClick={extraTimeHalfTime}>ET Half Time</button>
<button onClick={secondHalfExtraTime}>Start ET 2nd Half</button>
<button onClick={extraTimeFullTime}>ET Full Time</button>
<button onClick={resetMatch} className="danger">Reset</button>
        </div>
      </>}
      <button className="display-toggle" onClick={()=>setDisplayMode(v=>!v)}>{displayMode?'Exit Display Mode':'Open Display Mode'}</button>
    </section>
  {scorerPicker && (
  <div className="scorer-picker">
    <div className="scorer-picker-card">
      <h2>
        {scorerPicker.type === 'goals' ? 'Goal Scorer' : 'Point Scorer'}
      </h2>

      <p>{scorerPicker.teamName}</p>

      <select
        defaultValue=""
        onChange={async (e) => {
          if (!e.target.value) return

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
    event_type: scorerPicker.type === 'goals' ? 'goal' : 'point',
score_type: 'play',
    match_minute: Math.floor(seconds / 60),
    clock_seconds: seconds
  })

if (error) {
  console.error('Error saving score event:', error)
  alert('Could not save scorer to database.')
  return
}

console.log('SCORE EVENT SAVED')

changeScore(scorerPicker.side, scorerPicker.type, 1)
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
      </select>

      <button onClick={() => setScorerPicker(null)}>
        Cancel
      </button>
    </div>
  </div>
)}
  </main>
}

function Setup({setup,setSetup,teams,teamsLoading,teamsError,onStart,onPublishFixture}){
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
  return <main className="setup-page"><section className="setup-card">
    <div className="setup-brand"><img src="/soh-crest.png" alt="SOH crest"/><div><p>SEÁN O'HESLIN'S GAA</p><h1>Match Centre</h1></div></div>
    <div className="setup-heading"><span>NEW MATCH</span><h2>Match Setup</h2><p>Enter the match details before throw-in.</p></div>
    <div className="team-setup-row">
     <div className="crest-preview-card soh-crest-card"><span>SOH</span><img src="https://fmbvqrjkyiuacymhulql.supabase.co/storage/v1/object/public/club-crests/SOH%20Logo.png" alt="SOH crest"/></div>
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
    <button className="start-setup" disabled={!setup.opposition.trim()} onClick={onStart}>Continue to Scoreboard →</button>
  </section></main>
}

function TeamPanel({name,team,total,crest}){return <div className="team-panel">{crest&&<img className="team-crest" src={crest} alt={`${name} crest`}/>}<h2>{name}</h2><div className="gaa-score">{team.goals}-{String(team.points).padStart(2,'0')}</div><div className="points-total">{total} pts</div></div>}
function ScoreControls({label,onChange}){return <div className="control-card"><h3>{label}</h3><div className="button-row"><button className="score-btn goal" onClick={()=>onChange('goals',1)}>+ Goal</button><button className="score-btn point" onClick={()=>onChange('points',1)}>+ Point</button></div><div className="button-row compact"><button onClick={()=>onChange('goals',-1)}>- Goal</button><button onClick={()=>onChange('points',-1)}>- Point</button></div></div>}
