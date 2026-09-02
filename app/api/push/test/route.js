import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { createHash, timingSafeEqual } from 'node:crypto'

export const runtime = 'nodejs'

function reply(body, status = 200) {
  return Response.json(body, { status })
}

function hash(value) {
  return createHash('sha256').update(value).digest()
}

export async function POST(request) {
  const sendSecret = process.env.PUSH_SEND_SECRET?.trim()

  if (!sendSecret) {
    return reply({ error: 'Test sender is not configured.' }, 503)
  }

  const authorization = request.headers.get('authorization') || ''

  if (
    !timingSafeEqual(
      hash(authorization),
      hash(`Bearer ${sendSecret}`)
    )
  ) {
    return reply({ error: 'Incorrect sending secret.' }, 401)
  }

  let endpoint

  try {
    const body = await request.text()

    if (body.length > 4096) {
      return reply({ error: 'Request is too large.' }, 413)
    }

    endpoint = JSON.parse(body)?.endpoint

    if (typeof endpoint !== 'string' || endpoint.length > 2048) {
      return reply({ error: 'Invalid browser subscription.' }, 400)
    }

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
    return reply({ error: 'Invalid request.' }, 400)
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim()

  if (!supabaseUrl || !secretKey || !publicKey || !privateKey) {
    return reply({ error: 'Notification setup is incomplete.' }, 503)
  }

  try {
    const supabaseAdmin = createClient(supabaseUrl, secretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    })

    const { data: subscription, error } = await supabaseAdmin
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('endpoint', endpoint)
      .maybeSingle()

    if (error) {
      return reply({ error: 'Unable to load subscription.' }, 500)
    }

    if (!subscription) {
      return reply({
        error: 'Register this browser on the live page first.'
      }, 404)
    }

    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth
        }
      },
      JSON.stringify({
        title: 'SOH Match Centre',
        body: 'Test notification — your browser received it!'
      }),
      {
        vapidDetails: {
          subject: 'https://soh-match-centre.vercel.app',
          publicKey,
          privateKey
        },
        TTL: 60,
        urgency: 'high',
        timeout: 10000
      }
    )

    return reply({
      success: true,
      message: 'Test accepted by the push service. Check your notifications.'
    })
  } catch (error) {
    const status = error?.statusCode

    console.error('Test push failed:', status || 'send-error')

    if (status === 404 || status === 410) {
      return reply({
        error: 'This subscription has expired. It needs to be renewed.'
      }, 410)
    }

    return reply({
      error: 'Test could not be sent.',
      pushStatus: status || null
    }, 502)
  }
}
