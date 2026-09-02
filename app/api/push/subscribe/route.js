import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

function reply(body, status = 200) {
  return Response.json(body, { status })
}

export async function POST(request) {
  // Accept browser requests from this website.
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return reply({ error: 'Request not allowed.' }, 403)
  }

  let subscription

  try {
    const body = await request.text()

    if (body.length > 4096) {
      return reply({ error: 'Subscription is too large.' }, 413)
    }

    subscription = JSON.parse(body)
  } catch {
    return reply({ error: 'Invalid subscription.' }, 400)
  }

  const endpoint = subscription?.endpoint
  const p256dh = subscription?.keys?.p256dh
  const auth = subscription?.keys?.auth

  if (
    typeof endpoint !== 'string' ||
    endpoint.length > 2048 ||
    typeof p256dh !== 'string' ||
    !/^[A-Za-z0-9_-]{87}$/.test(p256dh) ||
    typeof auth !== 'string' ||
    !/^[A-Za-z0-9_-]{22}$/.test(auth)
  ) {
    return reply({ error: 'Invalid subscription details.' }, 400)
  }

  // Only accept recognised browser push services.
  try {
    const url = new URL(endpoint)
    const allowedHosts = [
      'fcm.googleapis.com',
      'updates.push.services.mozilla.com',
      'web.push.apple.com'
    ]

    if (
      url.protocol !== 'https:' ||
      !allowedHosts.includes(url.hostname) ||
      url.username ||
      url.password ||
      url.port ||
      url.hash
    ) {
      return reply({ error: 'Unsupported push service.' }, 400)
    }
  } catch {
    return reply({ error: 'Invalid push address.' }, 400)
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY

  if (!supabaseUrl || !secretKey) {
    return reply({ error: 'Notification setup is incomplete.' }, 503)
  }

  try {
    const supabaseAdmin = createClient(supabaseUrl, secretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    })

    const { error } = await supabaseAdmin
      .from('push_subscriptions')
      .upsert(
        { endpoint, p256dh, auth },
        { onConflict: 'endpoint' }
      )

    if (error) {
      console.error('Push subscription save failed:', error.code)
      return reply({ error: 'Unable to save subscription.' }, 500)
    }

    return reply({ success: true })
  } catch {
    return reply({ error: 'Unable to save subscription.' }, 500)
  }
}
