import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

function reply(body, status = 200) {
  return Response.json(body, { status })
}

export async function GET(request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  const secretKey = process.env.SUPABASE_SECRET_KEY

  if (!url || !publicKey || !secretKey) {
    return reply({ error: 'Insights setup is incomplete.' }, 503)
  }

  const authorization = request.headers.get('authorization') || ''
  const accessToken = authorization.startsWith('Bearer ')
    ? authorization.slice(7).trim()
    : ''
  if (!accessToken) return reply({ error: 'Not authorized.' }, 401)

  const authClient = createClient(url, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
  const { data: userData, error: userError } = await authClient.auth.getUser(accessToken)
  if (userError || !userData?.user) return reply({ error: 'Not authorized.' }, 401)

  const db = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
  const { data: admin, error: adminError } = await db
    .from('admin_users')
    .select('user_id')
    .eq('user_id', userData.user.id)
    .maybeSingle()

  if (adminError) return reply({ error: 'Could not check admin access.' }, 503)
  if (!admin) return reply({ error: 'Admin access is required.' }, 403)

  const { count, error } = await db
    .from('push_subscriptions')
    .select('endpoint', { count: 'exact', head: true })

  if (error) return reply({ error: 'Could not load notification subscribers.' }, 503)

  return reply({ notificationDevices: count || 0 })
}
