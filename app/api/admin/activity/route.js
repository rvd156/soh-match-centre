import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

function reply(body, status = 200) {
  return Response.json(body, { status })
}

export async function GET(request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  const secretKey = process.env.SUPABASE_SECRET_KEY
  if (!url || !publicKey || !secretKey) return reply({ error: 'Activity log setup is incomplete.' }, 503)

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

  const { data: entries, error: entriesError } = await db
    .from('admin_activity_log')
    .select('id, match_id, match_event_id, admin_user_id, action, event_type, details, created_at')
    .order('created_at', { ascending: false })
    .limit(150)

  if (entriesError) {
    if (entriesError.code === '42P01') {
      return reply({ error: 'Run the admin activity log SQL in Supabase first.' }, 503)
    }
    return reply({ error: 'Could not load admin activity.' }, 503)
  }

  const actorIds = [...new Set((entries || []).map(entry => entry.admin_user_id))]
  const actorPairs = await Promise.all(actorIds.map(async id => {
    const { data } = await db.auth.admin.getUserById(id)
    const user = data?.user
    return [id, user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || 'Admin']
  }))
  const actorNames = Object.fromEntries(actorPairs)

  return reply({
    entries: (entries || []).map(entry => ({
      ...entry,
      actor: actorNames[entry.admin_user_id] || 'Admin'
    }))
  })
}

