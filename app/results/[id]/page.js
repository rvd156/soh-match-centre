'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '../../../lib/supabase'

function related(value) {
  return Array.isArray(value) ? value[0] : value
}

function formatDate(value) {
  if (!value) return ''
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('en-IE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date(year, month - 1, day))
}

function eventIcon(type) {
  return {
    goal: '🟩',
    point: '⬜',
    two_pointer: '🟧',
    black_card: '⬛',
    yellow_card: '🟨',
    red_card: '🟥',
    substitution: '🔄',
    manual_update: '✍️'
  }[type] || '•'
}

function eventDescription(event) {
  const player = related(event.players)?.name
  const team = related(event.teams)?.name
  const playerOff = related(event.player_off)?.name
  const playerOn = related(event.player_on)?.name

  if (event.event_type === 'manual_update') {
    return event.notes || 'Match update'
  }

  if (event.event_type === 'substitution') {
    if (playerOff && playerOn) return `${playerOff} off · ${playerOn} on`
    if (playerOff) return `${playerOff} off`
    if (playerOn) return `${playerOn} on`
    return 'Substitution'
  }

  const labels = {
    goal: 'Goal',
    point: 'Point',
    two_pointer: 'Two-pointer',
    black_card: 'Black card',
    yellow_card: 'Yellow card',
    red_card: 'Red card'
  }

  const detail = [player || team || 'Team', labels[event.event_type] || 'Match event']

  if (['goal', 'point', 'two_pointer'].includes(event.event_type) && event.score_type) {
    const scoreTypes = { play: 'from play', free: 'free', '45': "45", '50': "50" }
    if (scoreTypes[event.score_type]) detail.push(scoreTypes[event.score_type])
  }

  return detail.join(' · ')
}

export default function MatchReportPage() {
  const params = useParams()
  const matchId = params?.id
  const [match, setMatch] = useState(null)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!matchId) return
    let cancelled = false

    async function loadReport() {
      const [matchResult, eventResult] = await Promise.all([
        supabase
          .from('matches')
          .select(`
            id,
            competition,
            venue,
            referee,
            match_date,
            status,
            home_goals,
            home_points,
            away_goals,
            away_points,
            home_team:teams!matches_home_team_id_fkey (id, name, crest_url),
            away_team:teams!matches_away_team_id_fkey (id, name, crest_url)
          `)
          .eq('id', matchId)
          .eq('result_published', true)
          .in('status', ['full_time', 'after_extra_time'])
          .maybeSingle(),
        supabase
          .from('match_events')
          .select(`
            id,
            event_type,
            score_type,
            match_minute,
            clock_seconds,
            notes,
            team_id,
            players!match_events_player_id_fkey (name),
            player_off:players!match_events_player_off_id_fkey (name),
            player_on:players!match_events_player_on_id_fkey (name),
            teams (name)
          `)
          .eq('match_id', matchId)
          .in('event_type', [
            'goal',
            'point',
            'two_pointer',
            'black_card',
            'yellow_card',
            'red_card',
            'substitution',
            'manual_update'
          ])
          .order('clock_seconds', { ascending: true })
          .order('id', { ascending: true })
      ])

      if (cancelled) return

      if (matchResult.error || !matchResult.data) {
        console.error('Unable to load match report:', matchResult.error)
        setError('This match report is not available.')
      } else {
        setMatch(matchResult.data)
        if (eventResult.error) {
          console.error('Unable to load match events:', eventResult.error)
        } else {
          setEvents(eventResult.data || [])
        }
      }

      setLoading(false)
    }

    loadReport()
    return () => { cancelled = true }
  }, [matchId])

  if (loading) {
    return <main style={styles.page}><div style={styles.message}>Loading match report…</div></main>
  }

  if (error || !match) {
    return (
      <main style={styles.page}>
        <div style={styles.container}>
          <a href="/results" style={styles.backLink}>← Previous Results</a>
          <div style={styles.message}>{error}</div>
        </div>
      </main>
    )
  }

  const home = related(match.home_team)
  const away = related(match.away_team)
  const homeTotal = Number(match.home_goals) * 3 + Number(match.home_points)
  const awayTotal = Number(match.away_goals) * 3 + Number(match.away_points)

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <a href="/results" style={styles.backLink}>← Previous Results</a>

        <header style={styles.header}>
          <span style={styles.finalBadge}>
            🏁 {match.status === 'after_extra_time' ? 'FINAL RESULT · AET' : 'FINAL RESULT'}
          </span>
          {match.competition && <h1 style={styles.competition}>{match.competition}</h1>}
          <div style={styles.date}>{formatDate(match.match_date)}</div>
          {(match.venue || match.referee) && (
            <div style={styles.meta}>
              {[match.venue, match.referee ? `Referee: ${match.referee}` : ''].filter(Boolean).join(' · ')}
            </div>
          )}
        </header>

        <section style={styles.scoreCard} aria-label="Final score">
          <div style={styles.team}>
            {home?.crest_url && <img src={home.crest_url} alt="" style={styles.crest} />}
            <div style={styles.teamName}>{home?.name || 'Home'}</div>
            <div style={styles.score}>{match.home_goals}-{String(match.home_points).padStart(2, '0')}</div>
            <div style={styles.total}>{homeTotal} pts</div>
          </div>
          <div style={styles.versus}>V</div>
          <div style={styles.team}>
            {away?.crest_url && <img src={away.crest_url} alt="" style={styles.crest} />}
            <div style={styles.teamName}>{away?.name || 'Away'}</div>
            <div style={styles.score}>{match.away_goals}-{String(match.away_points).padStart(2, '0')}</div>
            <div style={styles.total}>{awayTotal} pts</div>
          </div>
        </section>

        <section style={styles.timelineSection}>
          <h2 style={styles.timelineTitle}>MATCH ACTION</h2>
          {events.length === 0 ? (
            <div style={styles.message}>No match events were recorded.</div>
          ) : (
            <div style={styles.timeline}>
              {events.map(event => (
                <article key={event.id} style={styles.eventRow}>
                  <div style={styles.minute}>{Number(event.match_minute || 0)}′</div>
                  <div style={styles.icon}>{eventIcon(event.event_type)}</div>
                  <div>
                    <div style={styles.eventText}>{eventDescription(event)}</div>
                    {event.event_type !== 'manual_update' && related(event.teams)?.name && (
                      <div style={styles.eventTeam}>{related(event.teams).name}</div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

const styles = {
  page: { minHeight: '100vh', background: '#061a12', color: '#fff', padding: '22px 16px 50px' },
  container: { width: '100%', maxWidth: '760px', margin: '0 auto' },
  backLink: { display: 'inline-block', color: '#f4c430', fontSize: '18px', fontWeight: '900', lineHeight: 1.2, textDecoration: 'none', padding: '12px 4px', marginBottom: '20px' },
  header: { textAlign: 'center', marginBottom: '20px' },
  finalBadge: { display: 'inline-block', borderRadius: '999px', background: '#174e35', color: '#f4c430', padding: '9px 14px', fontSize: '13px', fontWeight: '900', letterSpacing: '1px' },
  competition: { color: '#f4c430', fontSize: 'clamp(18px, 5vw, 25px)', lineHeight: 1.3, margin: '16px 0 8px' },
  date: { color: '#fff', fontSize: '15px', fontWeight: '800' },
  meta: { color: '#aebdb3', fontSize: '13px', fontWeight: '700', lineHeight: 1.5, marginTop: '7px' },
  scoreCard: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 26px minmax(0, 1fr)', alignItems: 'center', gap: '8px', border: '1px solid #1c4932', borderRadius: '20px', background: '#0b281c', padding: '22px 14px' },
  team: { minWidth: 0, textAlign: 'center' },
  crest: { width: '68px', height: '68px', objectFit: 'contain', marginBottom: '8px' },
  teamName: { minHeight: '42px', display: 'grid', placeItems: 'center', fontSize: '15px', lineHeight: 1.25, fontWeight: '850' },
  score: { fontSize: 'clamp(32px, 10vw, 52px)', lineHeight: 1, fontWeight: '900', marginTop: '10px' },
  total: { color: '#f4c430', fontSize: '14px', fontWeight: '850', marginTop: '7px' },
  versus: { color: '#f4c430', fontSize: '20px', fontWeight: '900', textAlign: 'center' },
  timelineSection: { marginTop: '28px' },
  timelineTitle: { color: '#f4c430', fontSize: '15px', fontWeight: '900', letterSpacing: '1.5px', textAlign: 'center', margin: '0 0 14px' },
  timeline: { overflow: 'hidden', border: '1px solid #1c4932', borderRadius: '18px', background: '#0b281c' },
  eventRow: { display: 'grid', gridTemplateColumns: '42px 30px 1fr', alignItems: 'start', gap: '8px', padding: '14px 12px', borderBottom: '1px solid #1c4932' },
  minute: { color: '#f4c430', fontSize: '14px', fontWeight: '900', textAlign: 'right' },
  icon: { fontSize: '16px', textAlign: 'center' },
  eventText: { color: '#fff', fontSize: '14px', fontWeight: '800', lineHeight: 1.4 },
  eventTeam: { color: '#aebdb3', fontSize: '12px', fontWeight: '700', marginTop: '3px' },
  message: { border: '1px solid #1c4932', borderRadius: '16px', background: '#0b281c', color: '#c4d0c8', padding: '28px 18px', textAlign: 'center', fontWeight: '700' }
}
