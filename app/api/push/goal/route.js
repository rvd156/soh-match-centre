import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { createHash, timingSafeEqual } from 'node:crypto'

export const runtime = 'nodejs'
export const maxDuration = 60

const allowedScoreEvents = new Set([
  'goal',
  'point',
  'two_pointer',
  'manual_update',
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
    payload?.table !== 'match_events' ||
    !allowedScoreEvents.has(payload?.record?.event_type)
  ) {
    return reply({ ignored: true })
  }

  const rawId = payload.record.id
  if (
    !['string', 'number'].includes(typeof rawId) ||
    !/^[A-Za-z0-9-]{1,100}$/.test(String(rawId))
  ) {
    return reply({ error: 'Invalid event ID.' }, 400)
  }

  const eventId = String(rawId)
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

    // Read the saved record, rather than trusting names in the request.
    const goal = await requireResult(
      db.from('match_events')
        .select(`
          id, match_id, team_id, event_type, score_type, match_minute, notes, created_at,
          players!match_events_player_id_fkey (name),
          player_off:players!match_events_player_off_id_fkey (name),
          player_on:players!match_events_player_on_id_fkey (name),
          teams (name)
        `)
        .eq('id', eventId)
        .maybeSingle()
    )

    if (!goal || !allowedScoreEvents.has(goal.event_type)) {
      return reply({ ignored: true })
    }

    const age = Date.now() - Date.parse(goal.created_at)
    if (!Number.isFinite(age) || age < -60000 || age > 300000) {
      return reply({ ignored: true, reason: 'Goal is outside the alert window.' })
    }

    const match = await requireResult(
      db.from('matches')
        .select(`
          id, active, home_team_id, away_team_id,
          home_goals, home_points, away_goals, away_points
        `)
        .eq('id', goal.match_id)
        .maybeSingle()
    )

    const scoringEvent = goal.event_type !== 'manual_update'
    const validScoringTeam = [String(match?.home_team_id), String(match?.away_team_id)]
      .includes(String(goal.team_id))

    if (!match?.active || (scoringEvent && !validScoringTeam)) {
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
    const scoringTeam = Array.isArray(goal.teams) ? goal.teams[0] : goal.teams
    const player = Array.isArray(goal.players) ? goal.players[0] : goal.players
    const playerOff = Array.isArray(goal.player_off) ? goal.player_off[0] : goal.player_off
    const playerOn = Array.isArray(goal.player_on) ? goal.player_on[0] : goal.player_on
    const teamName = (scoringTeam?.name || 'Team').slice(0, 100)
    const scorerName = player?.name?.slice(0, 100)
    const minute = goal.match_minute == null ? null : Number(goal.match_minute)
    const scoreLabels = {
      goal: 'GOAL',
      point: 'POINT',
      two_pointer: 'TWO-POINTER'
    }
    const scoreSourceLabels = {
  play: 'From play',
  free: 'Free',
  '45': '45',
  '50': '50',
  penalty: 'Penalty',
  mark: 'Mark',
  sideline: 'Sideline'
}
const scoreSource = scoreSourceLabels[goal.score_type] || null
    const cardDetails = {
      yellow_card: { symbol: '🟨', label: 'YELLOW CARD' },
      black_card: { symbol: '⬛', label: 'BLACK CARD' },
      red_card: { symbol: '🟥', label: 'RED CARD' }
    }

    let title
    let body

    if (goal.event_type === 'manual_update') {
      const updateText = typeof goal.notes === 'string'
        ? goal.notes.trim().slice(0, 240)
        : ''
      if (!updateText) return reply({ ignored: true })

      title = Number.isFinite(minute) && minute >= 0
        ? `MATCH UPDATE · ${minute} min`
        : 'MATCH UPDATE'
      body = updateText
    } else if (goal.event_type === 'substitution') {
      title = `🔄 SUBSTITUTION — ${teamName}`
      body = [
        `${playerOn?.name?.slice(0, 100) || 'Player'} on`,
        `${playerOff?.name?.slice(0, 100) || 'Player'} off`,
        Number.isFinite(minute) && minute >= 0 ? `${minute} min` : null
      ].filter(Boolean).join(' · ')
    } else if (cardDetails[goal.event_type]) {
      const card = cardDetails[goal.event_type]
      title = `${card.symbol} ${card.label} — ${teamName}`
      body = [
        scorerName || teamName,
        Number.isFinite(minute) && minute >= 0 ? `${minute} min` : null
      ].filter(Boolean).join(' · ')
    } else {
      const scorerLine = [
  scorerName || `${scoreLabels[goal.event_type]} for ${teamName}`,
  scoreSource,
  Number.isFinite(minute) && minute >= 0 ? `${minute} min` : null
].filter(Boolean).join(' · ')
      title = `${scoreLabels[goal.event_type]} — ${teamName}`
      body = [
        scorerLine,
        `${homeName} ${match.home_goals}-${String(match.home_points).padStart(2, '0')}`,
        `${awayName} ${match.away_goals}-${String(match.away_points).padStart(2, '0')}`
      ].join('\n')
    }

    const notification = JSON.stringify({
      title,
      body,
      tag: `${goal.event_type}-${eventId}`,
      url: '/live'
    })

    async function sendOne(subscription) {
      const token = await requireResult(db.rpc('claim_push_goal_delivery', {
        p_event_id: eventId,
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
          topic: createHash('sha256').update(eventId).digest('hex').slice(0, 32)
        })
      } catch (error) {
        pushError = error
      }

      if (!pushError) {
        // "sent" means accepted by the push service, not proof of display.
        await recordStatus('sent')
        counts.sent += 1
      } else if ([404, 410].includes(pushError.statusCode)) {
        await recordStatus('expired', `Push service ${pushError.statusCode}`)
        counts.expired += 1
      } else {
        await recordStatus('failed',
          pushError.statusCode ? `Push service ${pushError.statusCode}` : 'Send failed.')
        counts.failed += 1
      }
    }

    // Keyset pagination avoids omitting subscribers beyond the first page.
    let cursor = null
    while (true) {
      if (Date.now() - startedAt > 35000) {
        return reply({ ...counts, retryNeeded: true }, 503)
      }

      let query = db.from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq(
          goal.event_type === 'goal'
            ? 'notify_goals'
            : goal.event_type === 'two_pointer'
              ? 'notify_two_pointers'
              : goal.event_type === 'point'
                ? 'notify_points'
                : goal.event_type === 'substitution'
                  ? 'notify_substitutions'
                  : goal.event_type === 'yellow_card'
                    ? 'notify_yellow_cards'
                    : goal.event_type === 'black_card'
                      ? 'notify_black_cards'
                      : goal.event_type === 'red_card'
                        ? 'notify_red_cards'
                        : 'notify_match_updates',
          true
        )
        .lte('created_at', goal.created_at)
        .order('endpoint', { ascending: true })
        .limit(100)
      if (cursor) query = query.gt('endpoint', cursor)
      const subscriptions = await requireResult(query)
      if (!subscriptions?.length) break

      await requireResult(db.from('push_goal_deliveries').upsert(
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

    return reply({ ...counts, retryNeeded: counts.failed > 0 }, counts.failed ? 503 : 200)
  } catch {
    console.error('Score push processing failed.')
    return reply({ error: 'Unable to process score alerts.', retryNeeded: true }, 503)
  }
}
