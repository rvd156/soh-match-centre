import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

function reply(body, status = 200) {
  return Response.json(body, { status })
}

export async function POST(request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  const secretKey = process.env.SUPABASE_SECRET_KEY
  if (!url || !publicKey || !secretKey) return reply({ error: 'Correction setup is incomplete.' }, 503)

  const authorization = request.headers.get('authorization') || ''
  const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!accessToken) return reply({ error: 'Not authorized.' }, 401)

  const authClient = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: userData, error: userError } = await authClient.auth.getUser(accessToken)
  if (userError || !userData?.user) return reply({ error: 'Not authorized.' }, 401)

  const db = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: admin, error: adminError } = await db.from('admin_users')
    .select('user_id').eq('user_id', userData.user.id).maybeSingle()
  if (adminError) return reply({ error: 'Could not check admin access.' }, 503)
  if (!admin) return reply({ error: 'Admin access is required.' }, 403)

  let body
  try { body = await request.json() } catch { return reply({ error: 'Invalid request.' }, 400) }
  const eventId = Number(body?.eventId)
  const playerId = Number(body?.playerId)
  if (!Number.isSafeInteger(eventId) || eventId < 1 || !Number.isSafeInteger(playerId) || playerId < 1) {
    return reply({ error: 'Invalid event or player.' }, 400)
  }

  const { data: event, error: eventError } = await db.from('match_events')
    .select('id, match_id, team_id, player_id, event_type, match_minute').eq('id', eventId).maybeSingle()
  if (eventError) return reply({ error: 'Could not load the scoring event.' }, 503)
  if (!event || !['goal', 'point', 'two_pointer'].includes(event.event_type)) {
    return reply({ error: 'Scoring event not found.' }, 404)
  }

  const [{ data: match }, { data: player, error: playerError }] = await Promise.all([
    db.from('matches').select('id, status, result_published').eq('id', event.match_id).maybeSingle().then(result => result),
    db.from('players').select('id, team_id, name').eq('id', playerId).maybeSingle()
  ])
  if (playerError) return reply({ error: 'Could not load the selected player.' }, 503)
  if (!match?.result_published || !['full_time', 'after_extra_time'].includes(match.status)) {
    return reply({ error: 'Only completed published matches can be corrected here.' }, 400)
  }
  if (!player || String(player.team_id) !== String(event.team_id)) {
    return reply({ error: 'The selected player does not belong to the scoring team.' }, 400)
  }

  const { error: updateError } = await db.from('match_events').update({ player_id: playerId }).eq('id', eventId)
  if (updateError) return reply({ error: 'Could not update the scorer.' }, 503)

  const { error: activityError } = await db.from('admin_activity_log').insert({
    match_id: event.match_id,
    match_event_id: event.id,
    admin_user_id: userData.user.id,
    action: 'corrected',
    event_type: event.event_type,
    details: {
      team_id: event.team_id,
      previous_player_id: event.player_id,
      player_id: playerId,
      match_minute: event.match_minute
    }
  })
  if (activityError) console.error('Unable to record scorer correction:', activityError)

  return reply({ updated: true, player: { id: player.id, name: player.name } })
}
