'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

const emptyTeam = { goals: 0, points: 0 }
const defaultSetup = { opposition: '', oppositionCrest: '', competition: '', venue: '', date: '', throwIn: '', halfLength: '30', sohSide: 'home' }

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
  const intervalRef = useRef(null)

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
  function startMatch(){ if(period==='PRE-MATCH') setPeriod('FIRST HALF'); setRunning(true) }
  function halfTime(){ setRunning(false); setPeriod('HALF TIME') }
  function secondHalf(){ setPeriod('SECOND HALF'); setRunning(true) }
  function fullTime(){ setRunning(false); setPeriod('FULL TIME') }
  function resetMatch(){
    if(!window.confirm('Reset this match and return to match setup?')) return
    setHome(emptyTeam); setAway(emptyTeam); setSeconds(0); setRunning(false); setPeriod('PRE-MATCH'); setSetupComplete(false); setDisplayMode(false)
  }

  if (!setupComplete) return <Setup setup={setup} setSetup={setSetup} onStart={() => setup.opposition.trim() && setSetupComplete(true)} />

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
          <ScoreControls label={homeName} onChange={(t,d)=>changeScore('home',t,d)} />
          <ScoreControls label={awayName} onChange={(t,d)=>changeScore('away',t,d)} />
        </div>
        <div className="match-controls">
          <button onClick={startMatch} className="primary">{running?'Running':period==='PRE-MATCH'?'Start Match':'Resume'}</button>
          <button onClick={()=>setRunning(false)}>Pause</button><button onClick={halfTime}>Half Time</button>
          <button onClick={secondHalf}>Start 2nd Half</button><button onClick={fullTime}>Full Time</button><button onClick={resetMatch} className="danger">Reset</button>
        </div>
      </>}
      <button className="display-toggle" onClick={()=>setDisplayMode(v=>!v)}>{displayMode?'Exit Display Mode':'Open Display Mode'}</button>
    </section>
  </main>
}

function Setup({setup,setSetup,onStart}){
  const update = (key,value) => setSetup(s=>({...s,[key]:value}))
  function uploadCrest(event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return alert('Please choose an image file.')
    const reader = new FileReader()
    reader.onload = () => update('oppositionCrest', reader.result)
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
      <label className="field"><span>Opposition *</span><input autoFocus placeholder="e.g. Mohill" value={setup.opposition} onChange={e=>update('opposition',e.target.value)}/></label>
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
