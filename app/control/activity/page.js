'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

const eventNames = {
  goal: 'Goal',
  point: 'Point',
  two_pointer: 'Two-pointer',
  yellow_card: 'Yellow card',
  black_card: 'Black card',
  red_card: 'Red card',
  substitution: 'Substitution',
  manual_update: 'Match update'
}

const actionNames = {
  created: 'recorded',
  updated: 'updated',
  corrected: 'corrected',
  deleted: 'removed'
}

function describe(entry) {
  const label = eventNames[entry.event_type] || 'Match event'
  const minute = entry.details?.match_minute ?? entry.details?.after?.match_minute
  return `${actionNames[entry.action] || entry.action} ${label}${minute != null ? ` at ${minute}'` : ''}`
}

export default function AdminActivityPage() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadActivity = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      if (!token) throw new Error('Your admin session has expired.')

      const response = await fetch('/api/admin/activity', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not load admin activity.')
      setEntries(result.entries || [])
    } catch (loadError) {
      setError(loadError.message || 'Could not load admin activity.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadActivity() }, [loadActivity])

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <div style={styles.headingRow}>
          <div>
            <a href="/control" style={styles.back}>← Control Panel</a>
            <h1 style={styles.title}>ADMIN ACTIVITY</h1>
            <p style={styles.intro}>The latest scores, cards, substitutions and corrections entered by administrators.</p>
          </div>
          <button type="button" onClick={loadActivity} disabled={loading} style={styles.refresh}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {error && <div style={styles.error}>{error}</div>}
        {!loading && !error && entries.length === 0 && (
          <div style={styles.empty}>No activity has been recorded yet.</div>
        )}

        <div style={styles.list}>
          {entries.map(entry => (
            <article key={entry.id} style={styles.entry}>
              <div style={styles.entryTop}>
                <strong style={styles.actor}>{entry.actor}</strong>
                <time style={styles.time} dateTime={entry.created_at}>
                  {new Intl.DateTimeFormat('en-IE', {
                    dateStyle: 'medium', timeStyle: 'short'
                  }).format(new Date(entry.created_at))}
                </time>
              </div>
              <div style={styles.description}>{describe(entry)}</div>
              <div style={styles.match}>Match #{entry.match_id}</div>
            </article>
          ))}
        </div>
      </div>
    </main>
  )
}

const styles = {
  page: { minHeight: '100vh', background: '#061a12', color: '#ffffff', padding: '28px 16px 60px' },
  container: { width: '100%', maxWidth: '760px', margin: '0 auto' },
  headingRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: '18px', marginBottom: '22px' },
  back: { color: '#f4c430', textDecoration: 'none', fontWeight: '800', fontSize: '14px' },
  title: { color: '#f4c430', margin: '12px 0 6px', fontSize: '28px' },
  intro: { color: '#b9c7be', margin: 0, lineHeight: 1.45, fontSize: '14px' },
  refresh: { background: '#178a4a', color: '#ffffff', border: '1px solid #21a65c', borderRadius: '9px', padding: '10px 14px', fontWeight: '800', cursor: 'pointer' },
  list: { display: 'grid', gap: '10px' },
  entry: { background: '#0d281c', border: '1px solid #1c4932', borderRadius: '12px', padding: '14px' },
  entryTop: { display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'baseline' },
  actor: { color: '#f4c430', overflowWrap: 'anywhere' },
  time: { color: '#93a69a', fontSize: '12px', whiteSpace: 'nowrap' },
  description: { marginTop: '7px', fontWeight: '800' },
  match: { color: '#93a69a', fontSize: '12px', marginTop: '5px' },
  error: { background: '#4a1717', border: '1px solid #dc2626', borderRadius: '10px', padding: '14px', lineHeight: 1.5 },
  empty: { background: '#0d281c', border: '1px solid #1c4932', borderRadius: '10px', padding: '20px', color: '#b9c7be', textAlign: 'center' }
}

