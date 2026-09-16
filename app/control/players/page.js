'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'

export default function PlayerManagementPage() {
  const [teams, setTeams] = useState([])
  const [players, setPlayers] = useState([])
  const [teamId, setTeamId] = useState('1')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function request(path = '', options = {}) {
    const { data } = await supabase.auth.getSession()
    const token = data?.session?.access_token
    const response = await fetch(`/api/admin/players${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) },
      cache: 'no-store'
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Player request failed.')
    return result
  }

  useEffect(() => {
    request().then(result => { setTeams(result.teams); setPlayers(result.players) })
      .catch(loadError => setError(loadError.message))
  }, [])

  const visible = useMemo(() => players.filter(player =>
    String(player.team_id) === String(teamId) && player.name.toLowerCase().includes(search.trim().toLowerCase())
  ).sort((a, b) => (a.jersey_number || 999) - (b.jersey_number || 999) || a.name.localeCompare(b.name)), [players, teamId, search])

  const duplicateIds = useMemo(() => {
    const groups = new Map()
    players.forEach(player => {
      const key = `${player.team_id}:${player.name.toLowerCase().replace(/[^a-z0-9]/g, '')}`
      groups.set(key, [...(groups.get(key) || []), player.id])
    })
    return new Set([...groups.values()].filter(ids => ids.length > 1).flat())
  }, [players])

  async function save() {
    setBusy(true)
    try {
      const result = await request('', { method: 'PATCH', body: JSON.stringify({ id: editing.id, name: editing.name, jerseyNumber: editing.jersey_number ?? '' }) })
      setPlayers(current => current.map(player => player.id === result.player.id ? result.player : player))
      setEditing(null)
    } catch (saveError) { alert(saveError.message) } finally { setBusy(false) }
  }

  async function remove(player) {
    if (!confirm(`Delete ${player.name}? Only unused duplicate records can be deleted.`)) return
    setBusy(true)
    try {
      await request(`?id=${player.id}`, { method: 'DELETE' })
      setPlayers(current => current.filter(item => item.id !== player.id))
    } catch (deleteError) { alert(deleteError.message) } finally { setBusy(false) }
  }

  return <main style={styles.page}><div style={styles.container}>
    <a href="/control" style={styles.back}>← Control Panel</a>
    <h1 style={styles.title}>Player Management</h1>
    <p style={styles.intro}>Correct player names and jersey numbers. Players already used in matches can be edited safely.</p>
    {error && <div style={styles.error}>{error}</div>}
    <div style={styles.filters}>
      <select value={teamId} onChange={event => setTeamId(event.target.value)} style={styles.input}>
        {teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
      </select>
      <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search players…" style={styles.input} />
    </div>
    <div style={styles.list}>{visible.map(player => <div key={player.id} style={styles.card}>
      {editing?.id === player.id ? <>
        <input value={editing.name} onChange={event => setEditing({ ...editing, name: event.target.value })} style={styles.input} />
        <input type="number" min="1" max="99" value={editing.jersey_number ?? ''} onChange={event => setEditing({ ...editing, jersey_number: event.target.value })} placeholder="Jersey" style={styles.input} />
        <div style={styles.actions}><button disabled={busy} onClick={save} style={styles.save}>Save</button><button onClick={() => setEditing(null)} style={styles.cancel}>Cancel</button></div>
      </> : <>
        <div><strong style={styles.name}>{player.jersey_number ? `${player.jersey_number}. ` : ''}{player.name}</strong>{duplicateIds.has(player.id) && <span style={styles.duplicate}>Possible duplicate</span>}</div>
        <div style={styles.actions}><button onClick={() => setEditing({ ...player })} style={styles.edit}>Edit</button>{duplicateIds.has(player.id) && <button onClick={() => remove(player)} style={styles.delete}>Delete unused</button>}</div>
      </>}
    </div>)}</div>
  </div></main>
}

const styles = {
  page: { minHeight: '100vh', background: '#061a12', color: '#fff', padding: '28px 16px 60px' }, container: { maxWidth: '720px', margin: '0 auto' },
  back: { color: '#f4c430', fontWeight: 900, textDecoration: 'none' }, title: { margin: '24px 0 8px', fontSize: 'clamp(30px,8vw,44px)' }, intro: { color: '#b9c7be', lineHeight: 1.5 },
  filters: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '10px', margin: '22px 0' }, input: { width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: '10px', fontSize: '16px' },
  list: { display: 'grid', gap: '10px' }, card: { padding: '14px', border: '1px solid #1c4932', borderRadius: '14px', background: '#0b281c', display: 'grid', gap: '10px' }, name: { fontSize: '17px' },
  duplicate: { display: 'inline-block', marginLeft: '9px', color: '#fbbf24', fontSize: '12px', fontWeight: 900 }, actions: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  edit: { background: '#174e35', color: '#fff', border: 0, borderRadius: '8px', padding: '9px 14px', fontWeight: 800 }, delete: { background: '#7f1d1d', color: '#fff', border: 0, borderRadius: '8px', padding: '9px 14px', fontWeight: 800 },
  save: { background: '#24a861', color: '#fff', border: 0, borderRadius: '8px', padding: '10px 18px', fontWeight: 900 }, cancel: { background: '#33463d', color: '#fff', border: 0, borderRadius: '8px', padding: '10px 18px', fontWeight: 800 }, error: { background: '#7f1d1d', padding: '12px', borderRadius: '10px' }
}
