import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { createHash, timingSafeEqual } from 'node:crypto'

export const runtime = 'nodejs'
export const maxDuration = 60

const allowedEvents = new Set([
  'goal',
  'point',
  'two_pointer',
  'substitution',
  'yellow_card',
  'black_card',
  'red_card'
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
  if (result.error) throw new Error('Database operation failed.')
  return result.data
}

function pause(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
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

  const removedEvent = payload?.old_record

  if (
    payload?.type !== 'DELETE' ||
    payload?.schema !== 'public' ||
    payload?.table !== 'match_events' ||
    !allowedEvents.has(removedEvent?.event_type)
  ) {
    return reply({ ignored: true })
  }

  const rawEventId = removedEvent.id
  const rawMatchId = removedEvent.match_id
  const rawTeamId = removedEvent.team_id

  if (
    !['string', 'number'].includes(typeof rawEventId) ||
    !/^\d{1,20}$/.test(String(rawEventId)) ||
    !['string', 'number'].includes(typeof rawMatchId) ||
    !/^\d{1,20}$/.test(String(rawMatchId)) ||
    !['string', 'number'].includes(typeof rawTeamId) ||
    !/^\d{1,20}$/.test(String(rawTeamId))
  ) {
    return reply({ error: 'Invalid removed score.' }, 400)
  }

  const eventId = String(rawEventId)
  const matchId = String(rawMatchId)
  const teamId = String(rawTeamId)
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

    const isScoreEvent = ['goal', 'point', 'two_pointer']
      .includes(removedEvent.event_type)

    // The controller updates the match immediately after deleting a score.
    // Allow that update to finish before reading the corrected score.
    if (isScoreEvent) await pause(1500)

    const match = await requireResult(
      db.from('matches')
        .select(`
          id, active, home_team_id, away_team_id,
          home_goals, home_points, away_goals, away_points
        `)
        .eq('id', matchId)
        .maybeSingle()
    )

    if (
      !match?.active ||
      ![String(match.home_team_id), String(match.away_team_id)].includes(teamId)
    ) {
      return reply({ ignored: true, reason: 'No matching active fixture.' })
    }

    const teams = await requireResult(
      db.from('teams')
        .select('id, name')
        .in('id', [match.home_team_id, match.away_team_id])
    )

    const homeName = (teams?.find(team =>
      String(team.id) === String(match.home_team_id))?.name || 'Home').slice(0, 100)
    const awayName = (teams?.find(team =>
      String(team.id) === String(match.away_team_id))?.name || 'Away').slice(0, 100)
    const scoringTeamName = (teams?.find(team =>
      String(team.id) === teamId)?.name || 'Team').slice(0, 100)

    const minute = removedEvent.match_minute == null
      ? null
      : Number(removedEvent.match_minute)
    const minuteText = Number.isFinite(minute) && minute >= 0
      ? `${minute} min`
      : null

    let title
    let body

    if (isScoreEvent) {
      const titleLabels = {
        goal: `GOAL DISALLOWED — ${scoringTeamName}`,
        two_pointer: `TWO-POINTER DISALLOWED — ${scoringTeamName}`,
        point: `SCORE CORRECTION — ${scoringTeamName}`
      }

      title = titleLabels[removedEvent.event_type]
      body = [
        'Score corrected',
        `${homeName} ${match.home_goals}-${String(match.home_points).padStart(2, '0')}`,
        `${awayName} ${match.away_goals}-${String(match.away_points).padStart(2, '0')}`
      ].join('\n')
    } else {
      const playerIds = [
        removedEvent.player_id,
        removedEvent.player_off_id,
        removedEvent.player_on_id
      ].filter(value => value != null)

      const players = playerIds.length
        ? await requireResult(
            db.from('players').select('id, name').in('id', playerIds)
          )
        : []
      const playerName = id => players?.find(player =>
        String(player.id) === String(id))?.name?.slice(0, 100)

      const cardDetails = {
        yellow_card: { symbol: '🟨', label: 'YELLOW CARD' },
        black_card: { symbol: '⬛', label: 'BLACK CARD' },
        red_card: { symbol: '🟥', label: 'RED CARD' }
      }

      if (removedEvent.event_type === 'substitution') {
        title = `🔄 SUBSTITUTION CORRECTION — ${scoringTeamName}`
        body = [
          `${playerName(removedEvent.player_off_id) || 'Player'} off → ${playerName(removedEvent.player_on_id) || 'Player'} on removed`,
          minuteText
        ].filter(Boolean).join(' · ')
      } else {
        const card = cardDetails[removedEvent.event_type]
        title = `${card.symbol} ${card.label} CORRECTION — ${scoringTeamName}`
        body = [
          `${playerName(removedEvent.player_id) || 'Player'} — card removed`,
          minuteText
        ].filter(Boolean).join(' · ')
      }
    }

    const notification = JSON.stringify({
      title,
      body,
      tag: `score-correction-${eventId}`,
      url: '/live'
    })

    async function sendOne(subscription) {
      const token = await requireResult(db.rpc('claim_push_correction_delivery', {
        p_event_id: eventId,
        p_endpoint: subscription.endpoint
      }))

      if (!token) {
        counts.skipped += 1
        return
      }

      async function recordStatus(status, lastError = null) {
        const rows = await requireResult(
          db.from('push_correction_deliveries')
            .update({
              status,
              locked_until: null,
              claim_token: null,
              sent_at: status === 'sent' ? new Date().toISOString() : null,
              last_error: lastError,
              updated_at: new Date().toISOString()
            })
            .eq('event_id', eventId)
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

      let pushError
      try {
        await webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth }
        }, notification, {
          vapidDetails: {
            subject: 'https://matchcentre.ballinamoreseanoheslinsgaa.com',
            publicKey,
            privateKey
          },
          TTL: 60,
          urgency: 'high',
          timeout: 10000,
          topic: createHash('sha256')
            .update(`correction-${eventId}`)
            .digest('hex')
            .slice(0, 32)
        })
      } catch (error) {
        pushError = error
      }

      if (!pushError) {
        await recordStatus('sent')
        counts.sent += 1
      } else if ([404, 410].includes(pushError.statusCode)) {
        await recordStatus('expired', `Push service ${pushError.statusCode}`)
        counts.expired += 1
      } else {
        await recordStatus(
          'failed',
          pushError.statusCode ? `Push service ${pushError.statusCode}` : 'Send failed.'
        )
        counts.failed += 1
      }
    }

    const preferenceColumn = removedEvent.event_type === 'goal'
      ? 'notify_goals'
      : removedEvent.event_type === 'two_pointer'
        ? 'notify_two_pointers'
        : removedEvent.event_type === 'point'
          ? 'notify_points'
          : removedEvent.event_type === 'substitution'
            ? 'notify_substitutions'
            : removedEvent.event_type === 'yellow_card'
              ? 'notify_yellow_cards'
              : removedEvent.event_type === 'black_card'
                ? 'notify_black_cards'
                : 'notify_red_cards'

    let cursor = null
    while (true) {
      if (Date.now() - startedAt > 35000) {
        return reply({ ...counts, retryNeeded: true }, 503)
      }

      let query = db.from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq(preferenceColumn, true)
        .order('endpoint', { ascending: true })
        .limit(100)

      if (cursor) query = query.gt('endpoint', cursor)
      const subscriptions = await requireResult(query)
      if (!subscriptions?.length) break

      await requireResult(db.from('push_correction_deliveries').upsert(
        subscriptions.map(subscription => ({
          event_id: eventId,
          endpoint: subscription.endpoint
        })),
        { onConflict: 'event_id,endpoint', ignoreDuplicates: true }
      ))

      for (let index = 0; index < subscriptions.length; index += 10) {
        if (Date.now() - startedAt > 35000) {
          return reply({ ...counts, retryNeeded: true }, 503)
        }

        const results = await Promise.allSettled(
          subscriptions.slice(index, index + 10).map(sendOne)
        )
        counts.failed += results.filter(result => result.status === 'rejected').length
      }

      cursor = subscriptions[subscriptions.length - 1].endpoint
      if (subscriptions.length < 100) break
    }

    return reply(
      { ...counts, retryNeeded: counts.failed > 0 },
      counts.failed ? 503 : 200
    )
  } catch {
    console.error('Score correction push processing failed.')
    return reply({
      error: 'Unable to process score correction alerts.',
      retryNeeded: true
    }, 503)
  }
}
