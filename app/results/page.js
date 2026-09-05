'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

function formatDate(value) {
  if (!value) return ''

  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('en-IE', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date(year, month - 1, day))
}

function teamRecord(value) {
  return Array.isArray(value) ? value[0] : value
}

export default function ResultsPage() {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadResults() {
      const { data, error: loadError } = await supabase
        .from('matches')
        .select(`
          id,
          competition,
          venue,
          match_date,
          status,
          home_goals,
          home_points,
          away_goals,
          away_points,
          created_at,
          home_team:teams!matches_home_team_id_fkey (
            name,
            crest_url
          ),
          away_team:teams!matches_away_team_id_fkey (
            name,
            crest_url
          )
        `)
        .in('status', ['full_time', 'after_extra_time'])
        .eq('result_published', true)
        .order('match_date', { ascending: false })
        .order('created_at', { ascending: false })

      if (cancelled) return

      if (loadError) {
        console.error('Unable to load previous results:', loadError)
        setError('Previous results could not be loaded. Please try again.')
      } else {
        setResults(data || [])
      }

      setLoading(false)
    }

    loadResults()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <a href="/live" style={styles.backLink}>← Live Match</a>

        <div style={styles.brand}>
          <img
            src="/soh-crest.png"
            alt="Ballinamore SOH crest"
            style={styles.logo}
          />
          <div>
            <div style={styles.clubName}>SEÁN O'HESLIN'S</div>
            <h1 style={styles.title}>Previous Results</h1>
          </div>
        </div>
      </header>

      <section style={styles.content}>
        {loading && (
          <div style={styles.message}>Loading previous results…</div>
        )}

        {!loading && error && (
          <div style={{ ...styles.message, color: '#ffb4b4' }}>{error}</div>
        )}

        {!loading && !error && results.length === 0 && (
          <div style={styles.message}>
            Completed match results will appear here.
          </div>
        )}

        {!loading && !error && results.map(result => {
          const homeTeam = teamRecord(result.home_team)
          const awayTeam = teamRecord(result.away_team)
          const homeTotal = (Number(result.home_goals) * 3) + Number(result.home_points)
          const awayTotal = (Number(result.away_goals) * 3) + Number(result.away_points)

          return (
            <a
  key={result.id}
  href={`/results/${result.id}`}
  style={styles.card}
>
              <div style={styles.cardTop}>
                <span style={styles.finalBadge}>
                  {result.status === 'after_extra_time' ? 'FINAL · AET' : 'FINAL'}
                </span>
                <span style={styles.date}>{formatDate(result.match_date)}</span>
              </div>

              {result.competition && (
                <h2 style={styles.competition}>{result.competition}</h2>
              )}

              <div style={styles.teams}>
                <div style={styles.team}>
                  {homeTeam?.crest_url && (
                    <img src={homeTeam.crest_url} alt="" style={styles.teamCrest} />
                  )}
                  <div style={styles.teamName}>{homeTeam?.name || 'Home'}</div>
                  <div style={styles.score}>
                    {result.home_goals}-{String(result.home_points).padStart(2, '0')}
                  </div>
                  <div style={styles.total}>{homeTotal} pts</div>
                </div>

                <div style={styles.versus}>V</div>

                <div style={styles.team}>
                  {awayTeam?.crest_url && (
                    <img src={awayTeam.crest_url} alt="" style={styles.teamCrest} />
                  )}
                  <div style={styles.teamName}>{awayTeam?.name || 'Away'}</div>
                  <div style={styles.score}>
                    {result.away_goals}-{String(result.away_points).padStart(2, '0')}
                  </div>
                  <div style={styles.total}>{awayTotal} pts</div>
                </div>
              </div>

              {(result.venue || result.match_date) && (
                <div style={styles.details}>
                  {[result.venue, formatDate(result.match_date)].filter(Boolean).join(' · ')}
                </div>
              )}

<div style={styles.reportLink}>
  View match report <span aria-hidden="true">→</span>
</div>
            </a>
          )
        })}
      </section>
    </main>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#061a12',
    color: '#ffffff',
    padding: '22px 16px 50px'
  },
  header: {
    width: '100%',
    maxWidth: '760px',
    margin: '0 auto 26px'
  },
  backLink: {
  display: 'inline-block',
  color: '#f4c430',
  fontSize: '18px',
  fontWeight: '900',
  lineHeight: 1.2,
  textDecoration: 'none',
  padding: '12px 4px',
  marginBottom: '22px'
},
  brand: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px'
  },
  logo: {
    width: '66px',
    height: '66px',
    objectFit: 'contain'
  },
  clubName: {
    color: '#f4c430',
    fontSize: '13px',
    fontWeight: '900',
    letterSpacing: '2px'
  },
  title: {
    margin: '4px 0 0',
    fontSize: 'clamp(26px, 7vw, 38px)',
    lineHeight: 1,
    textTransform: 'uppercase'
  },
  content: {
    width: '100%',
    maxWidth: '760px',
    margin: '0 auto',
    display: 'grid',
    gap: '18px'
  },
  message: {
    border: '1px solid #1c4932',
    borderRadius: '16px',
    background: '#0b281c',
    color: '#c4d0c8',
    padding: '28px 18px',
    textAlign: 'center',
    fontWeight: '700'
  },
  card: {
    border: '1px solid #1c4932',
    borderRadius: '18px',
    background: '#0b281c',
    padding: '18px 16px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.16)',
    display: 'block',
    color: 'inherit',
    textDecoration: 'none',
  },
  cardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '12px'
  },
  finalBadge: {
    display: 'inline-block',
    borderRadius: '999px',
    background: '#174e35',
    color: '#f4c430',
    padding: '6px 10px',
    fontSize: '12px',
    fontWeight: '900',
    letterSpacing: '1px'
  },
  date: {
    color: '#c4d0c8',
    fontSize: '12px',
    fontWeight: '700',
    textAlign: 'right'
  },
  competition: {
    color: '#ffffff',
    fontSize: '17px',
    lineHeight: 1.35,
    textAlign: 'center',
    margin: '0 0 18px'
  },
  teams: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 24px minmax(0, 1fr)',
    alignItems: 'center',
    gap: '8px'
  },
  team: {
    minWidth: 0,
    textAlign: 'center'
  },
  teamCrest: {
    width: '58px',
    height: '58px',
    objectFit: 'contain',
    marginBottom: '7px'
  },
  teamName: {
    minHeight: '42px',
    display: 'grid',
    placeItems: 'center',
    fontSize: '15px',
    lineHeight: 1.25,
    fontWeight: '800'
  },
  score: {
    color: '#ffffff',
    fontSize: 'clamp(30px, 9vw, 48px)',
    lineHeight: 1,
    fontWeight: '900',
    marginTop: '8px'
  },
  total: {
    color: '#f4c430',
    fontSize: '13px',
    fontWeight: '800',
    marginTop: '6px'
  },
  versus: {
    color: '#f4c430',
    fontWeight: '900',
    textAlign: 'center'
  },
  details: {
    borderTop: '1px solid #1c4932',
    color: '#aebdb3',
    fontSize: '12px',
    fontWeight: '700',
    textAlign: 'center',
    marginTop: '18px',
    paddingTop: '13px'
  },
reportLink: {
  color: '#f4c430',
  fontSize: '15px',
  fontWeight: '900',
  textAlign: 'center',
  marginTop: '14px',
  padding: '12px 8px 2px'
}
}
