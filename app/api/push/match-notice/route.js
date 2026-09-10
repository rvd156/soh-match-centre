import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { createHash } from 'node:crypto'

export const runtime = 'nodejs'
export const maxDuration = 60

const allowedHosts = new Set([
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com'
])

function reply(body, status = 200) {
  return Response.json(body, { status })
}

function supportedEndpoint(endpoint) {
  try {
    const url = new URL(endpoint)
    return url.protocol === 'https:' && allowedHosts.has(url.hostname) &&
      !url.username && !url.password && !url.port && !url.hash
  } catch {
    return false
  }
}

async function requireResult(query) {
  const result = await query
  if (result.error) throw new Error(`Database ${result.error.code}: ${result.error.message}`)
  return result.data
}

export async function POST(request) {
  const startedAt = Date.now()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  const secretKey = process.env.SUPABASE_SECRET_KEY
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY?.trim()

  if (!url || !publicKey || !secretKey || !vapidPublicKey || !vapidPrivateKey) {
    return reply({ error: 'Notification setup is incomplete.' }, 503)
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

  let body
  try {
    const rawBody = await request.text()
    if (rawBody.length > 4096) return reply({ error: 'Request too large.' }, 413)
    body = JSON.parse(rawBody)
  } catch {
    return reply({ error: 'Invalid request.' }, 400)
  }

  const matchId = Number(body?.matchId)
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  const noticeId = typeof body?.noticeId === 'string' ? body.noticeId.trim() : ''
  if (!Number.isSafeInteger(matchId) || matchId < 1) return reply({ error: 'Invalid match.' }, 400)
  if (!title || title.length > 60) return reply({ error: 'Enter a title of 60 characters or fewer.' }, 400)
  if (!message || message.length > 220) return reply({ error: 'Enter a message of 220 characters or fewer.' }, 400)
  if (!/^[a-f0-9-]{20,50}$/i.test(noticeId)) return reply({ error: 'Invalid notification request.' }, 400)

  const db = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })

  try {
    const isAdmin = await requireResult(
      db.from('admin_users').select('user_id').eq('user_id', userData.user.id).maybeSingle()
    )
    if (!isAdmin) return reply({ error: 'Admin access is required.' }, 403)

    const match = await requireResult(
      db.from('matches').select('id, active, notifications_enabled').eq('id', matchId).maybeSingle()
    )
    if (!match?.active) return reply({ error: 'This match is no longer active.' }, 409)
    if (match.notifications_enabled === false) {
      return reply({ error: 'Test Mode is on. No notification was sent.' }, 409)
    }

    const deliveryId = `notice:${noticeId}`
    const audienceCutoff = new Date().toISOString()
    const notification = JSON.stringify({
      title,
      body: message,
      tag: `match-notice-${noticeId}`,
      url: '/live'
    })
    const counts = { sent: 0, skipped: 0, expired: 0, failed: 0 }

    async function sendOne(subscription) {
      const token = await requireResult(db.rpc('claim_push_goal_delivery', {
        p_event_id: deliveryId,
        p_endpoint: subscription.endpoint
      }))
      if (!token) {
        counts.skipped += 1
        return
      }

      async function recordStatus(status, lastError = null) {
        await requireResult(
          db.from('push_goal_deliveries')
            .update({
              status,
              locked_until: null,
              claim_token: null,
              sent_at: status === 'sent' ? new Date().toISOString() : null,
              last_error: lastError
            })
            .eq('event_id', deliveryId)
            .eq('endpoint', subscription.endpoint)
            .eq('claim_token', token)
        )
      }

      if (!supportedEndpoint(subscription.endpoint)) {
        await recordStatus('expired', 'Unsupported push service.')
        counts.expired += 1
        return
      }

      try {
        await webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth }
        }, notification, {
          vapidDetails: {
            subject: 'https://matchcentre.ballinamoreseanoheslinsgaa.com',
            publicKey: vapidPublicKey,
            privateKey: vapidPrivateKey
          },
          TTL: 3600,
          urgency: 'normal',
          timeout: 10000,
          topic: createHash('sha256').update(deliveryId).digest('hex').slice(0, 32)
        })
        await recordStatus('sent')
        counts.sent += 1
      } catch (error) {
        if ([404, 410].includes(error?.statusCode)) {
          await recordStatus('expired', `Push service ${error.statusCode}`)
          counts.expired += 1
        } else {
          await recordStatus('failed', error?.statusCode ? `Push service ${error.statusCode}` : 'Send failed.')
          counts.failed += 1
        }
      }
    }

    let cursor = null
    while (true) {
      if (Date.now() - startedAt > 35000) {
        return reply({ ...counts, retryNeeded: true }, 503)
      }
      let query = db.from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq('notify_manual_updates', true)
        .lte('created_at', audienceCutoff)
        .order('endpoint', { ascending: true })
        .limit(100)
      if (cursor) query = query.gt('endpoint', cursor)
      const subscriptions = await requireResult(query)
      if (!subscriptions?.length) break

      await requireResult(db.from('push_goal_deliveries').upsert(
        subscriptions.map(subscription => ({ event_id: deliveryId, endpoint: subscription.endpoint })),
        { onConflict: 'event_id,endpoint', ignoreDuplicates: true }
      ))

      for (let index = 0; index < subscriptions.length; index += 10) {
        const results = await Promise.allSettled(subscriptions.slice(index, index + 10).map(sendOne))
        counts.failed += results.filter(result => result.status === 'rejected').length
      }
      cursor = subscriptions[subscriptions.length - 1].endpoint
      if (subscriptions.length < 100) break
    }

    return reply({ ...counts, retryNeeded: counts.failed > 0 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to send the match notice.'
    console.error('Match notice failed:', message)
    return reply({ error: message }, 503)
  }
}
