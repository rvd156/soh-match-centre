'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

const emptyTeam = { goals: 0, points: 0 }

export default function Home() {
  const [homeName, setHomeName] = useState('SOH')
  const [awayName, setAwayName] = useState('Opposition')
  const [home, setHome] = useState(emptyTeam)
  const [away, setAway] = useState(emptyTeam)
  const [seconds, setSeconds] = useState(0)
  const [running, setRunning] = useState(false)
  const [period, setPeriod] = useState('PRE-MATCH')
  const [displayMode, setDisplayMode] = useState(false)
  const intervalRef = useRef(null)

  useEffect(() => {
    const saved = localStorage.getItem('soh-scoreboard-state')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setHomeName(parsed.homeName ?? 'SOH')
        setAwayName(parsed.awayName ?? 'Opposition')
        setHome(parsed.home ?? emptyTeam)
        setAway(parsed.away ?? emptyTeam)
        setSeconds(parsed.seconds ?? 0)
        setPeriod(parsed.period ?? 'PRE-MATCH')
      } catch {}
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('soh-scoreboard-state', JSON.stringify({ homeName, awayName, home, away, seconds, period }))
  }, [homeName, awayName, home, away, seconds, period])

  useEffect(() => {
    if (!running) return
    intervalRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(intervalRef.current)
  }, [running])

  const total = (team) => team.goals * 3 + team.points
  const clock = useMemo(() => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }, [seconds])

  function changeScore(side, type, delta) {
    const setter = side === 'home' ? setHome : setAway
    setter((prev) => ({ ...prev, [type]: Math.max(0, prev[type] + delta) }))
  }

  function startMatch() {
    if (period === 'PRE-MATCH') setPeriod('FIRST HALF')
    setRunning(true)
  }

  function halfTime() {
    setRunning(false)
    setPeriod('HALF TIME')
  }

  function secondHalf() {
    setPeriod('SECOND HALF')
    setRunning(true)
  }

  function fullTime() {
    setRunning(false)
    setPeriod('FULL TIME')
  }

  function resetMatch() {
    if (!window.confirm('Reset the entire match?')) return
    setHome(emptyTeam)
    setAway(emptyTeam)
    setSeconds(0)
    setRunning(false)
    setPeriod('PRE-MATCH')
  }

  return (
    <main className={displayMode ? 'display-page' : ''}>
      <section className="scoreboard-card">
        <div className="topbar">
          <div className="brand-mark">SOH</div>
          <div className="match-status">{period}</div>
          <div className="clock">{clock}</div>
        </div>

        <div className="teams">
          <TeamPanel name={homeName} setName={setHomeName} team={home} total={total(home)} locked={displayMode} />
          <div className="divider">V</div>
          <TeamPanel name={awayName} setName={setAwayName} team={away} total={total(away)} locked={displayMode} />
        </div>

        {!displayMode && (
          <div className="admin-grid">
            <ScoreControls label={homeName} onChange={(type, delta) => changeScore('home', type, delta)} />
            <ScoreControls label={awayName} onChange={(type, delta) => changeScore('away', type, delta)} />
          </div>
        )}

        {!displayMode && (
          <div className="match-controls">
            <button onClick={startMatch} className="primary">{running ? 'Running' : period === 'PRE-MATCH' ? 'Start Match' : 'Resume'}</button>
            <button onClick={() => setRunning(false)}>Pause</button>
            <button onClick={halfTime}>Half Time</button>
            <button onClick={secondHalf}>Start 2nd Half</button>
            <button onClick={fullTime}>Full Time</button>
            <button onClick={resetMatch} className="danger">Reset</button>
          </div>
        )}

        <button className="display-toggle" onClick={() => setDisplayMode((v) => !v)}>
          {displayMode ? 'Exit Display Mode' : 'Open Display Mode'}
        </button>
      </section>
    </main>
  )
}

function TeamPanel({ name, setName, team, total, locked }) {
  return (
    <div className="team-panel">
      {locked ? (
        <h2>{name}</h2>
      ) : (
        <input className="team-name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Team name" />
      )}
      <div className="gaa-score">{team.goals}-{String(team.points).padStart(2, '0')}</div>
      <div className="points-total">{total} pts</div>
    </div>
  )
}

function ScoreControls({ label, onChange }) {
  return (
    <div className="control-card">
      <h3>{label}</h3>
      <div className="button-row">
        <button className="score-btn goal" onClick={() => onChange('goals', 1)}>+ Goal</button>
        <button className="score-btn point" onClick={() => onChange('points', 1)}>+ Point</button>
      </div>
      <div className="button-row compact">
        <button onClick={() => onChange('goals', -1)}>- Goal</button>
        <button onClick={() => onChange('points', -1)}>- Point</button>
      </div>
    </div>
  )
}
