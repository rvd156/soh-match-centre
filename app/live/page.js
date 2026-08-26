'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function LiveMatchPage() {
  const [match, setMatch] = useState(null)
  const [homeTeam, setHomeTeam] = useState(null)
  const [awayTeam, setAwayTeam] = useState(null)
  const [loading, setLoading] = useState(true)
  const [liveSeconds, setLiveSeconds] = useState(0)

  async function loadLatestMatch() {
    const { data: matchData, error: matchError } = await supabase
      .from('matches')
      .select('*')
      .order('id', { ascending: false })
      .limit(1)
      .single()

    if (matchError) {
      console.error('Error loading live match:', matchError)
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
    setLoading(false)
  }

  useEffect(() => {
    loadLatestMatch()

    const interval = setInterval(() => {
      loadLatestMatch()
    }, 5000)

    return () => clearInterval(interval)
  }, [])
  useEffect(() => {
  if (!match) return

  const updateLiveClock = () => {
    const baseSeconds = match.clock_seconds || 0

    if (!match.clock_started_at) {
      setLiveSeconds(baseSeconds)
      return
    }

    const startedAt = new Date(match.clock_started_at).getTime()
    const elapsed = Math.max(
      0,
      Math.floor((Date.now() - startedAt) / 1000)
    )

    setLiveSeconds(baseSeconds + elapsed)
  }

  updateLiveClock()

  const interval = setInterval(updateLiveClock, 1000)

  return () => clearInterval(interval)
}, [match?.clock_seconds, match?.clock_started_at])

  function formatClock(seconds = 0) {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  function formatStatus(status = '') {
    return status.replaceAll('_', ' ').toUpperCase()
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
        <div style={styles.message}>No match available.</div>
      </main>
    )
  }

  const homeTotal = match.home_goals * 3 + match.home_points
  const awayTotal = match.away_goals * 3 + match.away_points

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

        <div style={styles.liveBar}>
          <span style={styles.liveDot}></span>
          {match.status === 'full_time' ? 'FULL TIME' : 'LIVE'}
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

  liveDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#f4c430'
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
