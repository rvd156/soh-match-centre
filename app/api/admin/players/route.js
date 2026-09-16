import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
const reply = (body, status = 200) => Response.json(body, { status })

async function adminDb(request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  const secretKey = process.env.SUPABASE_SECRET_KEY
  if (!url || !publicKey || !secretKey) return { error: reply({ error: 'Player management is not configured.' }, 503) }
  const header = request.headers.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) return { error: reply({ error: 'Not authorized.' }, 401) }
  const auth = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: userData } = await auth.auth.getUser(token)
  if (!userData?.user) return { error: reply({ error: 'Not authorized.' }, 401) }
  const db = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: admin } = await db.from('admin_users').select('user_id').eq('user_id', userData.user.id).maybeSingle()
  if (!admin) return { error: reply({ error: 'Admin access is required.' }, 403) }
  return { db }
}

export async function GET(request) {
  const access = await adminDb(request)
  if (access.error) return access.error
  const [{ data: teams, error: teamError }, { data: players, error: playerError }] = await Promise.all([
    access.db.from('teams').select('id, name').order('name'),
    access.db.from('players').select('id, team_id, name, jersey_number').order('name')
  ])
  if (teamError || playerError) return reply({ error: 'Could not load players.' }, 503)
  return reply({ teams: teams || [], players: players || [] })
}

export async function PATCH(request) {
  const access = await adminDb(request)
  if (access.error) return access.error
  let body
  try { body = await request.json() } catch { return reply({ error: 'Invalid request.' }, 400) }
  const id = Number(body?.id)
  const name = typeof body?.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : ''
  const jersey = body?.jerseyNumber === '' || body?.jerseyNumber == null ? null : Number(body.jerseyNumber)
  if (!Number.isSafeInteger(id) || id < 1 || !name || name.length > 100 || (jersey !== null && (!Number.isInteger(jersey) || jersey < 1 || jersey > 99))) {
    return reply({ error: 'Enter a valid name and jersey number.' }, 400)
  }
  const { data, error } = await access.db.from('players').update({ name, jersey_number: jersey }).eq('id', id)
    .select('id, team_id, name, jersey_number').single()
  if (error) return reply({ error: `Could not update player: ${error.message}` }, 503)
  return reply({ player: data })
}

export async function DELETE(request) {
  const access = await adminDb(request)
  if (access.error) return access.error
  const id = Number(new URL(request.url).searchParams.get('id'))
  if (!Number.isSafeInteger(id) || id < 1) return reply({ error: 'Invalid player.' }, 400)
  const columns = ['player_id', 'player_off_id', 'player_on_id']
  for (const column of columns) {
    const { count, error } = await access.db.from('match_events').select('id', { count: 'exact', head: true }).eq(column, id)
    if (error) return reply({ error: 'Could not check the player history.' }, 503)
    if (count) return reply({ error: 'This player has match history and cannot be deleted. Edit the name instead.' }, 409)
  }
  const { error } = await access.db.from('players').delete().eq('id', id)
  if (error) return reply({ error: `Could not delete player: ${error.message}` }, 503)
  return reply({ deleted: true })
}
