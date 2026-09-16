'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

function related(value) {
  return Array.isArray(value) ? value[0] : value
}

function formatDate(value) {
  if (!value) return ''
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('en-IE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date(year, month - 1, day))
}

function gaaScore(goals, points) {
  const safeGoals = Number(goals) || 0
  const safePoints = Number(points) || 0
  return `${safeGoals}-${String(safePoints).padStart(2, '0')}`
}

export default function ControlMatchReportsPage() {
  const [matches, setMatches] = useState([])
  const [drafts, setDrafts] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState(null)
  const [generatingId, setGeneratingId] = useState(null)
  const [corrections, setCorrections] = useState({})
  const [loadingCorrectionsId, setLoadingCorrectionsId] = useState(null)
  const [savingEventId, setSavingEventId] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadMatches() {
      const { data, error: loadError } = await supabase
        .from('matches')
        .select(`
          id,
          competition,
          match_date,
          status,
          match_summary,
          home_team_id,
          away_team_id,
          home_goals,
          home_points,
          away_goals,
          away_points,
          created_at,
          home_team:teams!matches_home_team_id_fkey (name),
          away_team:teams!matches_away_team_id_fkey (name)
        `)
        .eq('result_published', true)
        .in('status', ['full_time', 'after_extra_time'])
        .order('match_date', { ascending: false })
        .order('created_at', { ascending: false })

      if (cancelled) return

      if (loadError) {
        console.error('Unable to load match reports:', loadError)
        setError('Match reports could not be loaded.')
      } else {
        const loadedMatches = data || []
        setMatches(loadedMatches)
        setDrafts(Object.fromEntries(
          loadedMatches.map(match => [match.id, match.match_summary || ''])
        ))
      }

      setLoading(false)
    }

    loadMatches()
    return () => { cancelled = true }
  }, [])

  async function generateSummary(matchId) {
    if (generatingId || savingId) return
    setGeneratingId(matchId)

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData?.session?.access_token

      if (!accessToken) {
        alert('Your admin session has expired. Please sign in again.')
        return
      }

      const response = await fetch('/api/match-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ matchId })
      })
      const result = await response.json()

      if (!response.ok || !result.summary) {
        alert(result.error || 'Could not generate the match summary.')
        return
      }

      setDrafts(current => ({ ...current, [matchId]: result.summary }))
    } catch (generateError) {
      console.error('Unable to generate match summary:', generateError)
      alert('Could not generate the match summary.')
    } finally {
      setGeneratingId(null)
    }
  }

  async function saveSummary(matchId) {
    if (savingId || generatingId) return
    setSavingId(matchId)

    const summary = (drafts[matchId] || '').trim()
    const { error: saveError } = await supabase
      .from('matches')
      .update({ match_summary: summary || null })
      .eq('id', matchId)

    setSavingId(null)

    if (saveError) {
      console.error('Unable to save match summary:', saveError)
      alert(`Could not save match summary: ${saveError.message}`)
      return
    }

    setMatches(current => current.map(match =>
      match.id === matchId ? { ...match, match_summary: summary } : match
    ))
    alert('Match summary saved.')
  }


  async function toggleCorrections(match) {
    if (corrections[match.id]) {
      setCorrections(current => ({ ...current, [match.id]: null }))
      return
    }
    setLoadingCorrectionsId(match.id)
    const [{ data: events, error: eventsError }, { data: players, error: playersError }] = await Promise.all([
      supabase.from('match_events').select(`
        id, team_id, player_id, event_type, score_type, match_minute,
        players!match_events_player_id_fkey (name)
      `).eq('match_id', match.id).in('event_type', ['goal', 'point', 'two_pointer']).order('clock_seconds', { ascending: false }),
      supabase.from('players').select('id, team_id, name, jersey_number')
        .in('team_id', [match.home_team_id, match.away_team_id])
        .order('jersey_number', { ascending: true })
        .order('name', { ascending: true })
    ])
    setLoadingCorrectionsId(null)
    if (eventsError || playersError) {
      alert('Could not load the scoring events for this match.')
      return
    }
    setCorrections(current => ({ ...current, [match.id]: { events: events || [], players: players || [] } }))
  }

  async function changeScorer(matchId, eventId, playerId) {
    if (!playerId || savingEventId) return
    setSavingEventId(eventId)
    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData?.session?.access_token
    if (!accessToken) {
      setSavingEventId(null)
      alert('Your admin session has expired. Please sign in again.')
      return
    }
    const response = await fetch('/api/admin/correct-scorer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ eventId, playerId: Number(playerId) })
    })
    const result = await response.json()
    setSavingEventId(null)
    if (!response.ok) {
      alert(`Could not update the scorer: ${result.error || 'Unknown error.'}`)
      return
    }
    setCorrections(current => ({
      ...current,
      [matchId]: {
        ...current[matchId],
        events: current[matchId].events.map(event =>
          event.id === eventId ? { ...event, player_id: Number(playerId) } : event
        )
      }
    }))
    alert('Scorer corrected. The public match report has been updated.')
  }

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <div style={styles.topLinks}>
          <a href="/control" style={styles.backLink}>← Control Panel</a>
          <a href="/results" style={styles.publicLink}>View public results</a>
        </div>

        <header style={styles.header}>
          <div style={styles.eyebrow}>SOH CONTROL PANEL</div>
          <h1 style={styles.title}>Match Reports</h1>
          <p style={styles.intro}>
            Generate, review and correct summaries for published results.
          </p>
        </header>

        {loading && <div style={styles.message}>Loading match reports…</div>}
        {!loading && error && <div style={styles.error}>{error}</div>}
        {!loading && !error && matches.length === 0 && (
          <div style={styles.message}>No published match reports are available.</div>
        )}

        <div style={styles.list}>
          {matches.map(match => {
            const home = related(match.home_team)?.name || 'Home'
            const away = related(match.away_team)?.name || 'Away'
            const isGenerating = generatingId === match.id
            const isSaving = savingId === match.id

            return (
              <section key={match.id} style={styles.card}>
                <div style={styles.cardTop}>
                  <div>
                    <div style={styles.date}>{formatDate(match.match_date)}</div>
                    <h2 style={styles.competition}>
                      {match.competition || 'Match Report'}
                    </h2>
                  </div>
                  <span style={styles.badge}>
                    {match.status === 'after_extra_time' ? 'FINAL · AET' : 'FINAL'}
                  </span>
                </div>

                <div style={styles.score}>
                  {home} {gaaScore(match.home_goals, match.home_points)}
                  <span style={styles.separator}> — </span>
                  {away} {gaaScore(match.away_goals, match.away_points)}
                </div>

                <label style={styles.label} htmlFor={`summary-${match.id}`}>
                  Match summary
                </label>
                <textarea
                  id={`summary-${match.id}`}
                  value={drafts[match.id] || ''}
                  onChange={event => setDrafts(current => ({
                    ...current,
                    [match.id]: event.target.value
                  }))}
                  rows={7}
                  placeholder="No summary has been saved yet."
                  style={styles.textarea}
                />

                <div style={styles.actions}>
                  <button
                    type="button"
                    onClick={() => generateSummary(match.id)}
                    disabled={Boolean(generatingId || savingId)}
                    style={{ ...styles.button, ...styles.generateButton }}
                  >
                    {isGenerating ? 'Generating…' : '✨ Generate Summary'}
                  </button>
                  <button
                    type="button"
                    onClick={() => saveSummary(match.id)}
                    disabled={Boolean(generatingId || savingId)}
                    style={{ ...styles.button, ...styles.saveButton }}
                  >
                    {isSaving ? 'Saving…' : 'Save Summary'}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => toggleCorrections(match)}
                  disabled={loadingCorrectionsId === match.id}
                  style={{ ...styles.button, ...styles.correctionButton }}
                >
                  {loadingCorrectionsId === match.id
                    ? 'Loading scores…'
                    : corrections[match.id] ? 'Close Score Corrections' : 'Correct a Scorer'}
                </button>

                {corrections[match.id] && (
                  <div style={styles.correctionsPanel}>
                    <h3 style={styles.correctionsTitle}>Scoring events</h3>
                    <p style={styles.correctionsHelp}>Choose the correct player. This will not alter the final score.</p>
                    {corrections[match.id].events.map(event => {
                      const teamPlayers = corrections[match.id].players.filter(player =>
                        String(player.team_id) === String(event.team_id)
                      )
                      const label = event.event_type === 'goal' ? 'Goal' : event.event_type === 'two_pointer' ? '2PT' : 'Point'
                      return (
                        <label key={event.id} style={styles.eventCorrection}>
                          <span><strong>{event.match_minute}′ · {label}</strong></span>
                          <select
                            value={event.player_id || ''}
                            disabled={savingEventId === event.id}
                            onChange={change => changeScorer(match.id, event.id, change.target.value)}
                            style={styles.select}
                          >
                            <option value="">Select scorer…</option>
                            {teamPlayers.map(player => (
                              <option key={player.id} value={player.id}>
                                {player.jersey_number ? `${player.jersey_number}. ` : ''}{player.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      )
                    })}
                    {corrections[match.id].events.length === 0 && <div>No scoring events were recorded.</div>}
                  </div>
                )}

                <a href={`/results/${match.id}`} style={styles.reportLink}>
                  Open public match report →
                </a>
              </section>
            )
          })}
        </div>
      </div>
    </main>
  )
}

const styles = {
  page: { minHeight: '100vh', background: '#061a12', color: '#fff', padding: '26px 16px 60px' },
  container: { width: '100%', maxWidth: '760px', margin: '0 auto' },
  topLinks: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', marginBottom: '24px' },
  backLink: { color: '#f4c430', fontSize: '16px', fontWeight: '900', textDecoration: 'none' },
  publicLink: { color: '#c8d3cc', fontSize: '14px', fontWeight: '800', textDecoration: 'none', textAlign: 'right' },
  header: { marginBottom: '26px' },
  eyebrow: { color: '#f4c430', fontSize: '13px', fontWeight: '900', letterSpacing: '1.5px' },
  title: { margin: '5px 0 8px', fontSize: 'clamp(30px, 8vw, 44px)' },
  intro: { margin: 0, color: '#b9c7be', fontSize: '15px', lineHeight: 1.5 },
  list: { display: 'grid', gap: '20px' },
  card: { border: '1px solid #1c4932', borderRadius: '20px', background: '#0b281c', padding: '20px 16px' },
  cardTop: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' },
  date: { color: '#b9c7be', fontSize: '13px', fontWeight: '750' },
  competition: { margin: '5px 0 0', fontSize: '18px', lineHeight: 1.3 },
  badge: { flexShrink: 0, borderRadius: '999px', background: '#174e35', color: '#f4c430', padding: '7px 10px', fontSize: '11px', fontWeight: '900', letterSpacing: '0.6px' },
  score: { color: '#fff', fontSize: '17px', fontWeight: '900', lineHeight: 1.5, margin: '18px 0' },
  separator: { color: '#f4c430' },
  label: { display: 'block', color: '#f4c430', fontSize: '14px', fontWeight: '900', marginBottom: '8px' },
  textarea: { display: 'block', width: '100%', boxSizing: 'border-box', border: '1px solid #52645b', borderRadius: '13px', background: '#10251a', color: '#fff', padding: '14px', fontSize: '16px', lineHeight: 1.55, resize: 'vertical' },
  actions: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px', marginTop: '12px' },
  button: { border: 0, borderRadius: '13px', padding: '14px 12px', fontSize: '15px', fontWeight: '900', cursor: 'pointer' },
  generateButton: { background: '#f4c430', color: '#071a12' },
  saveButton: { background: '#24a861', color: '#fff' },
  correctionButton: { width: '100%', marginTop: '14px', background: '#24382f', color: '#fff', border: '1px solid #52645b' },
  correctionsPanel: { marginTop: '12px', padding: '14px', border: '1px solid #52645b', borderRadius: '13px', background: '#10251a' },
  correctionsTitle: { margin: '0 0 4px', color: '#f4c430', fontSize: '17px' },
  correctionsHelp: { margin: '0 0 12px', color: '#b9c7be', fontSize: '13px', lineHeight: 1.4 },
  eventCorrection: { display: 'grid', gridTemplateColumns: '100px minmax(0, 1fr)', gap: '10px', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid #294537' },
  select: { width: '100%', padding: '10px', borderRadius: '9px', background: '#fff', color: '#111', fontSize: '15px' },
  reportLink: { display: 'inline-block', color: '#f4c430', fontSize: '14px', fontWeight: '900', textDecoration: 'none', marginTop: '16px' },
  message: { border: '1px solid #1c4932', borderRadius: '16px', background: '#0b281c', color: '#c4d0c8', padding: '28px 18px', textAlign: 'center', fontWeight: '700' },
  error: { border: '1px solid #7e3535', borderRadius: '16px', background: '#371919', color: '#ffd0d0', padding: '22px 18px', textAlign: 'center', fontWeight: '700' }
}
