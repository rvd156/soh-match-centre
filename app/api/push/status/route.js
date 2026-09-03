import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { createHash, timingSafeEqual } from 'node:crypto'

export const runtime = 'nodejs'
export const maxDuration = 60

const allowedStatuses = new Set([
  'half_time',
  'second_half',
  'full_time',
  'extra_time',
  'extra_time_half_time',
  'extra_time_second_half',
  'after_extra_time'
])

const allowedHosts = new Set([
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com'
])

function reply(body, status = 200) {
  return Response.json(body, { status })
}

function hash(value) {
  return createHash('sha256').update(value).digest()
}

function supportedEndpoint(endpoint) {
  try {
    const url = new URL(endpoint)
    return url.protocol === 'https:' &&
      allowedHosts.has(url.hostname) &&
      !url.username && !url.password && !url.port && !url.hash
  } catch {
    return false
  }
}

async function requireResult(query) {
  const result = await query
  if (result.error) {
    throw new Error(`Database ${result.error.code}: ${result.error.message}`)
  }
  return result.data
}

export async function POST(request) {
  const startedAt = Date.now()
  const sendSecret = process.env.PUSH_SEND_SECRET?.trim()
  if (!sendSecret) return reply({ error: 'Sender not configured.' }, 503)

  const authorization = request.headers.get('authorization') || ''
  if (!timingSafeEqual(hash(authorization), hash(`Bearer ${sendSecret}`))) {
    return reply({ error: 'Not authorized.' }, 401)
  }

  let payload
  try {
    const text = await request.text()
    if (text.length > 16384) return reply({ error: 'Request too large.' }, 413)
    payload = JSON.parse(text)
  } catch {
    return reply({ error: 'Invalid request.' }, 400)
  }

  if (
    payload?.type !== 'INSERT' ||
    payload?.schema !== 'public' ||
    payload?.table !== 'match_status_events' ||
    !allowedStatuses.has(payload?.record?.status)
  ) {
    return reply({ ignored: true })
  }

  const rawId = payload.record.id
  if (
    !['string', 'number'].includes(typeof rawId) ||
    !/^\d{1,20}$/.test(String(rawId))
  ) {
    return reply({ error: 'Invalid status-event ID.' }, 400)
  }

  const statusEventId = String(rawId)
  const deliveryId = `status:${statusEventId}`
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim()

  if (!url || !secretKey || !publicKey || !privateKey) {
    return reply({ error: 'Notification setup is incomplete.' }, 503)
  }

  const counts = { sent: 0, skipped: 0, expired: 0, failed: 0 }

  try {
    const db = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })

    // Trust the database record, rather than names or scores in the webhook body.
    const statusEvent = await requireResult(
      db.from('match_status_events')
        .select('*')
        .eq('id', statusEventId)
        .maybeSingle()
    )

    if (!statusEvent || !allowedStatuses.has(statusEvent.status)) {
      return reply({ ignored: true })
    }

    const age = Date.now() - Date.parse(statusEvent.created_at)
    if (!Number.isFinite(age) || age < -60000 || age > 300000) {
      return reply({ ignored: true, reason: 'Status is outside the alert window.' })
    }

    const teams = await requireResult(
      db.from('teams')
        .select('id, name')
        .in('id', [statusEvent.home_team_id, statusEvent.away_team_id])
    )
    const homeName = (teams?.find(team =>
      String(team.id) === String(statusEvent.home_team_id))?.name || 'Home').slice(0, 100)
    const awayName = (teams?.find(team =>
      String(team.id) === String(statusEvent.away_team_id))?.name || 'Away').slice(0, 100)

    const titles = {
      half_time: 'HALF TIME',
      second_half: 'SECOND HALF UNDERWAY',
      full_time: 'FULL TIME',
      extra_time: 'EXTRA TIME UNDERWAY',
      extra_time_half_time: 'EXTRA-TIME HALF TIME',
      extra_time_second_half: 'SECOND HALF OF EXTRA TIME UNDERWAY',
      after_extra_time: 'FULL TIME — AET'
    }

    const body = [
      `${homeName} ${statusEvent.home_goals}-${String(statusEvent.home_points).padStart(2, '0')}`,
      `${awayName} ${statusEvent.away_goals}-${String(statusEvent.away_points).padStart(2, '0')}`
    ].join('\n')
    const notification = JSON.stringify({
      title: titles[statusEvent.status],
      body,
      tag: `match-${statusEvent.match_id}-${statusEvent.status}`,
      url: '/live'
    })

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
        const rows = await requireResult(
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
            .select('event_id')
        )
        if (!rows?.length) throw new Error('Delivery claim no longer owned.')
      }

      if (!supportedEndpoint(subscription.endpoint)) {
        await recordStatus('expired', 'Unsupported push service.')
        counts.expired += 1
        return
      }

      let pushError = null
      try {
        await webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth }
        }, notification, {
          vapidDetails: {
            subject: 'https://soh-match-centre.vercel.app',
            publicKey,
            privateKey
          },
          TTL: 60,
          urgency: 'high',
          timeout: 10000,
          topic: createHash('sha256').update(deliveryId).digest('hex').slice(0, 32)
        })
      } catch (error) {
        pushError = error
      }

      if (!pushError) {
        await recordStatus('sent')
        counts.sent += 1
      } else {
        if ([404, 410].includes(pushError?.statusCode)) {
          await recordStatus('expired', `Push service ${pushError.statusCode}`)
          counts.expired += 1
        } else {
          await recordStatus('failed',
            pushError?.statusCode ? `Push service ${pushError.statusCode}` : 'Send failed.')
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
        .eq('notify_match_milestones', true)
        .lte('created_at', statusEvent.created_at)
        .order('endpoint', { ascending: true })
        .limit(100)
      if (cursor) query = query.gt('endpoint', cursor)
      const subscriptions = await requireResult(query)
      if (!subscriptions?.length) break

      await requireResult(db.from('push_goal_deliveries').upsert(
        subscriptions.map(subscription => ({
          event_id: deliveryId,
          endpoint: subscription.endpoint
        })),
        { onConflict: 'event_id,endpoint', ignoreDuplicates: true }
      ))

      for (let index = 0; index < subscriptions.length; index += 10) {
        const results = await Promise.allSettled(
          subscriptions.slice(index, index + 10).map(sendOne)
        )
        counts.failed += results.filter(result => result.status === 'rejected').length
      }

      cursor = subscriptions[subscriptions.length - 1].endpoint
      if (subscriptions.length < 100) break
    }

    return reply({ ...counts, retryNeeded: counts.failed > 0 }, counts.failed ? 503 : 200)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to process status alerts.'
    console.error('Status push processing failed:', message)
    return reply({ error: message, retryNeeded: true }, 503)
  }
}
