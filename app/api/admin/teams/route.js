import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const reply = (body, status = 200) => Response.json(body, { status })

async function adminDb(request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  const secretKey = process.env.SUPABASE_SECRET_KEY

  if (!url || !publicKey || !secretKey) {
    return { error: reply({ error: 'Team management is not configured.' }, 503) }
  }

  const header = request.headers.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) return { error: reply({ error: 'Not authorized.' }, 401) }

  const auth = createClient(url, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
  const { data: userData } = await auth.auth.getUser(token)
  if (!userData?.user) return { error: reply({ error: 'Not authorized.' }, 401) }

  const db = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
  const { data: admin } = await db
    .from('admin_users')
    .select('user_id')
    .eq('user_id', userData.user.id)
    .maybeSingle()

  if (!admin) return { error: reply({ error: 'Admin access is required.' }, 403) }
  return { db }
}

function defaultShortName(name) {
  return name
    .replace(/\b(GAA|CLG)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 30)
}

export async function POST(request) {
  const access = await adminDb(request)
  if (access.error) return access.error

  let body
  try {
    body = await request.json()
  } catch {
    return reply({ error: 'Invalid request.' }, 400)
  }

  const name = typeof body?.name === 'string'
    ? body.name.trim().replace(/\s+/g, ' ')
    : ''

  if (name.length < 2 || name.length > 100) {
    return reply({ error: 'Enter a team name between 2 and 100 characters.' }, 400)
  }

  const { data: existing, error: lookupError } = await access.db
    .from('teams')
    .select('id, name, short_name, crest_url, active')
    .ilike('name', name)
    .limit(1)
    .maybeSingle()

  if (lookupError) return reply({ error: `Could not check the team list: ${lookupError.message}` }, 503)

  if (existing) {
    if (!existing.active) {
      const { data: reactivated, error: reactivateError } = await access.db
        .from('teams')
        .update({ active: true })
        .eq('id', existing.id)
        .select('id, name, short_name, crest_url')
        .single()

      if (reactivateError) return reply({ error: `Could not reactivate the team: ${reactivateError.message}` }, 503)
      return reply({ team: reactivated, existing: true })
    }

    return reply({
      team: {
        id: existing.id,
        name: existing.name,
        short_name: existing.short_name,
        crest_url: existing.crest_url
      },
      existing: true
    })
  }

  const { data: team, error } = await access.db
    .from('teams')
    .insert({
      name,
      short_name: defaultShortName(name),
      crest_url: null,
      is_soh: false,
      active: true
    })
    .select('id, name, short_name, crest_url')
    .single()

  if (error) return reply({ error: `Could not add the team: ${error.message}` }, 503)
  return reply({ team }, 201)
}
