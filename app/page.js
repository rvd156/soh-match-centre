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
      .select('id, name, short_name')
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
    intervalRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
    return () => clearInterval(intervalRef.current)
  }, [running])

  const clock = useMemo(() => `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`, [seconds])
  const total = t => t.goals * 3 + t.points
  const sohIsHome = setup.sohSide === 'home'
  const homeName = sohIsHome ? 'SOH' : (setup.opposition || 'Opposition')
  const awayName = sohIsHome ? (setup.opposition || 'Opposition') : 'SOH'
  const homeCrest = sohIsHome ? '/soh-crest.png' : setup.oppositionCrest
  const awayCrest = sohIsHome ? setup.oppositionCrest : '/soh-crest.png'

  function changeScore(side, type, delta) {
    const setter = side === 'home' ? setHome : setAway
    setter(prev => ({ ...prev, [type]: Math.max(0, prev[type] + delta) }))
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
        status: 'FIRST HALF',
        home_goals: 0,
        home_points: 0,
        away_goals: 0,
        away_points: 0,
        clock_seconds: 0
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
  setRunning(true)
}
  function halfTime(){ setRunning(false); setPeriod('HALF TIME') }
  function secondHalf(){ setPeriod('SECOND HALF'); setRunning(true) }
  function fullTime(){ setRunning(false); setPeriod('FULL TIME') }
  function resetMatch(){
    if(!window.confirm('Reset this match and return to match setup?')) return
    setHome(emptyTeam); setAway(emptyTeam); setSeconds(0); setRunning(false); setPeriod('PRE-MATCH'); setSetupComplete(false); setDisplayMode(false); setMatchId(null)
  }

  if (!setupComplete) return <Setup setup={setup} setSetup={setSetup} teams={teams} teamsLoading={teamsLoading} teamsError={teamsError} onStart={() => setup.opposition.trim() && setSetupComplete(true)} />
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
          <button onClick={()=>setRunning(false)}>Pause</button><button onClick={halfTime}>Half Time</button>
          <button onClick={secondHalf}>Start 2nd Half</button><button onClick={fullTime}>Full Time</button><button onClick={resetMatch} className="danger">Reset</button>
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
        onChange={(e) => {
          if (!e.target.value) return

          const player = scorerPicker.players.find(
  p => String(p.id) === String(e.target.value)
)
if (!player) return
          console.log('SCORER:', player)
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

function Setup({setup,setSetup,teams,teamsLoading,teamsError,onStart}){
  const update = (key,value) => setSetup(s=>({...s,[key]:value}))
  function uploadCrest(event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return alert('Please choose an image file.')

    const reader = new FileReader()
    reader.onload = () => {
      const image = new Image()
      image.onload = () => {
        // Resize large uploads so they remain quick to save/load on a phone.
        const maxSize = 900
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height))
        const width = Math.max(1, Math.round(image.width * scale))
        const height = Math.max(1, Math.round(image.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(image, 0, 0, width, height)

        const imgData = ctx.getImageData(0, 0, width, height)
        const data = imgData.data

        // Estimate the uploaded image's outer background from its corners.
        const sample = (x, y) => {
          const i = (y * width + x) * 4
          return [data[i], data[i+1], data[i+2]]
        }
        const corners = [sample(0,0), sample(width-1,0), sample(0,height-1), sample(width-1,height-1)]
        const bg = [0,1,2].map(c => Math.round(corners.reduce((sum,p)=>sum+p[c],0)/4))
        const tolerance = 38
        const similar = (x, y) => {
          const i = (y * width + x) * 4
          const dr = data[i]-bg[0], dg=data[i+1]-bg[1], db=data[i+2]-bg[2]
          return Math.sqrt(dr*dr + dg*dg + db*db) <= tolerance
        }

        // Flood-fill only pixels connected to an outside edge. This avoids
        // deleting white/grey details enclosed inside a club crest.
        const seen = new Uint8Array(width * height)
        const queue = []
        let head = 0
        const add = (x,y) => {
          const n = y * width + x
          if (!seen[n] && similar(x,y)) { seen[n] = 1; queue.push([x,y]) }
        }
        for (let x=0; x<width; x++) { add(x,0); add(x,height-1) }
        for (let y=0; y<height; y++) { add(0,y); add(width-1,y) }

        while (head < queue.length) {
          const [x,y] = queue[head++]
          const i = (y * width + x) * 4
          data[i+3] = 0
          if (x>0) add(x-1,y)
          if (x<width-1) add(x+1,y)
          if (y>0) add(x,y-1)
          if (y<height-1) add(x,y+1)
        }

        ctx.putImageData(imgData, 0, 0)
        update('oppositionCrest', canvas.toDataURL('image/png'))
      }
      image.src = reader.result
    }
    reader.readAsDataURL(file)
  }
  return <main className="setup-page"><section className="setup-card">
    <div className="setup-brand"><img src="/soh-crest.png" alt="SOH crest"/><div><p>SEÁN O'HESLIN'S GAA</p><h1>Match Centre</h1></div></div>
    <div className="setup-heading"><span>NEW MATCH</span><h2>Match Setup</h2><p>Enter the match details before throw-in.</p></div>
    <div className="team-setup-row">
      <div className="crest-preview-card"><span>SOH</span><img src="/soh-crest.png" alt="SOH crest"/></div>
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
    oppositionTeamId: team ? team.id : ''
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
    <button className="start-setup" disabled={!setup.opposition.trim()} onClick={onStart}>Continue to Scoreboard →</button>
  </section></main>
}

function TeamPanel({name,team,total,crest}){return <div className="team-panel">{crest&&<img className="team-crest" src={crest} alt={`${name} crest`}/>}<h2>{name}</h2><div className="gaa-score">{team.goals}-{String(team.points).padStart(2,'0')}</div><div className="points-total">{total} pts</div></div>}
function ScoreControls({label,onChange}){return <div className="control-card"><h3>{label}</h3><div className="button-row"><button className="score-btn goal" onClick={()=>onChange('goals',1)}>+ Goal</button><button className="score-btn point" onClick={()=>onChange('points',1)}>+ Point</button></div><div className="button-row compact"><button onClick={()=>onChange('goals',-1)}>- Goal</button><button onClick={()=>onChange('points',-1)}>- Point</button></div></div>}
